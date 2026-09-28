import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import {
  buildKeystatsSnapshotRows,
  captureFundamentals,
  toSnapshotEntries,
  type KeystatsSnapshotRow,
} from './fundamentals-capture';

/**
 * Leaf 1.1.4 — the daily fundamentals capture.
 *
 * The governing property is D11: a KeyStats failure must never cost a signal.
 * G5 fails OPEN, so a missing fundamental read downgrades a signal to
 * NOT_EVALUATED and leaves the trade decision exactly where it was. If a 429
 * here could push an emiten onto the job's error list or throw into the signal
 * loop, one transient rate limit would delete a sample from the walk-forward
 * denominator — silently, and in exactly the direction that flatters results.
 *
 * `fetchKeyStatsRaw` is injected so these tests need no network, no token and
 * no database, while still counting real calls.
 */

const okPayload = (emiten: string, items: Array<[string, string]>) => ({
  data: {
    closure_fin_items_results: items.map(([name, value], i) => ({
      keystats_name: 'cat',
      fin_name_results: [
        { fitem: { id: String(i), name, value }, hidden_graph_ico: false, is_new_update: false },
      ],
    })),
    financial_report_currency: ['IDR'],
  },
  message: 'ok',
});

describe('toSnapshotEntries', () => {
  it('maps a payload to persistable rows and carries the raw text', () => {
    const { entries: rows, currency } = toSnapshotEntries(
      okPayload('BBRI', [['Total Equity', '328,675 B']]),
      'BBRI',
    );
    assert.equal(currency, 'IDR');
    assert.equal(rows.length, 1);
    assert.equal(rows[0].itemName, 'Total Equity');
    assert.equal(rows[0].valueNum, 328675);
    assert.equal(rows[0].valueText, '328,675 B');
    assert.equal(rows[0].scale, 'B');
    // The report currency lives on the series, and reaches the row via the
    // row builder rather than on the entry itself.
    assert.equal(
      buildKeystatsSnapshotRows(rows, '2026-09-28', 'BBRI', currency)[0].currency,
      'IDR',
    );
  });

  it('keeps an unavailable value as null rather than 0', () => {
    const { entries: rows } = toSnapshotEntries(
      okPayload('X', [['Current Ratio (Quarter)', '-']]),
      'X',
    );
    assert.equal(rows[0].valueNum, null);
  });

  it('never emits a non-finite numeric (no NaN can reach a NUMERIC column)', () => {
    for (const raw of ['NaN', 'Infinity', '1e999', 'abc', '', '-']) {
      const { entries } = toSnapshotEntries(okPayload('X', [['M', raw]]), 'X');
      for (const row of entries) {
        assert.ok(
          row.valueNum === null || Number.isFinite(row.valueNum),
          `stored a non-finite value for ${JSON.stringify(raw)}`,
        );
      }
    }
  });

  it('returns no rows for a malformed payload rather than throwing', () => {
    for (const bad of [null, undefined, {}, { data: null }, { data: { closure_fin_items_results: 'x' } }]) {
      assert.doesNotThrow(() => toSnapshotEntries(bad as never, 'X'));
      assert.deepEqual(toSnapshotEntries(bad as never, 'X').entries, []);
    }
  });

  it('upper-cases the emiten for the primary key', () => {
    const { entries } = toSnapshotEntries(okPayload('bbri', [['Total Equity', '1']]), 'bbri');
    const rows = buildKeystatsSnapshotRows(entries, '2026-09-28', 'bbri');
    assert.equal(rows[0].emiten, 'BBRI');
  });
});

describe('buildKeystatsSnapshotRows', () => {
  it('produces one row per distinct item, de-duplicating repeats', () => {
    const { entries } = toSnapshotEntries(
      okPayload('X', [['Total Equity', '1'], ['Total Equity', '2']]),
      'X',
    );
    const rows = buildKeystatsSnapshotRows(entries, '2026-09-28', 'X');
    assert.equal(rows.length, 1);
    assert.equal(rows[0].asOf, '2026-09-28');
  });

  it('rejects an as_of that is not a plain calendar date', () => {
    const { entries } = toSnapshotEntries(okPayload('X', [['M', '1']]), 'X');
    assert.deepEqual(buildKeystatsSnapshotRows(entries, 'not-a-date', 'X'), []);
  });
});

describe('captureFundamentals', () => {
  it('calls the vendor exactly once and writes every row', async () => {
    let calls = 0;
    const saved: KeystatsSnapshotRow[] = [];
    const result = await captureFundamentals({
      emiten: 'BBRI',
      asOf: '2026-09-28',
      fetchKeyStatsRaw: async () => {
        calls += 1;
        return okPayload('BBRI', [['Total Equity', '328,675 B'], ['Altman Z-Score (Modified)', '0.70']]);
      },
      saveSnapshot: async (rows: KeystatsSnapshotRow[]) => {
        saved.push(...rows);
      },
    });

    assert.equal(calls, 1, 'D12: exactly one KeyStats fetch per emiten per run');
    assert.equal(saved.length, 2);
    assert.equal(result.ok, true);
    assert.equal(result.incomplete, false);
    assert.equal(result.rowCount, 2);
  });

  it('degrades a thrown fetch to incomplete WITHOUT rethrowing (D11)', async () => {
    let saved = 0;
    const result = await captureFundamentals({
      emiten: 'BBRI',
      asOf: '2026-09-28',
      fetchKeyStatsRaw: async () => {
        throw new Error('KeyStats API error: 429 Too Many Requests');
      },
      saveSnapshot: async () => {
        saved += 1;
      },
    });

    assert.equal(result.ok, false);
    assert.equal(result.incomplete, true, 'a transient failure must be flagged for repair');
    assert.equal(result.rowCount, 0);
    assert.equal(saved, 0);
  });

  it('degrades a rejected save the same way', async () => {
    const result = await captureFundamentals({
      emiten: 'BBRI',
      asOf: '2026-09-28',
      fetchKeyStatsRaw: async () => okPayload('BBRI', [['Total Equity', '1']]),
      saveSnapshot: async () => {
        throw new Error('connection terminated');
      },
    });
    assert.equal(result.ok, false);
    assert.equal(result.incomplete, true);
  });

  it('flags incomplete when the vendor returns 200 with an unusable payload', async () => {
    const result = await captureFundamentals({
      emiten: 'BBRI',
      asOf: '2026-09-28',
      fetchKeyStatsRaw: async () => ({ data: null }),
      saveSnapshot: async () => {},
    });
    // Nothing was stored, so the signal has no fundamental data and must be
    // repairable. A 200 that carried no items is a capture failure, not a
    // clean "this company has no KeyStats".
    assert.equal(result.ok, false);
    assert.equal(result.incomplete, true);
  });

  it('never throws, whatever the injected collaborators do', async () => {
    const hostile: Array<() => Promise<unknown>> = [
      async () => {
        throw new Error('boom');
      },
      async () => undefined,
    ];
    for (const fetchKeyStatsRaw of hostile) {
      await assert.doesNotReject(() =>
        captureFundamentals({
          emiten: 'X',
          asOf: '2026-09-28',
          fetchKeyStatsRaw: fetchKeyStatsRaw as never,
          saveSnapshot: async () => {},
        }),
      );
    }
  });

  it('carries the emiten through to the failure log so the row is repairable', async () => {
    const result = await captureFundamentals({
      emiten: 'tPIA',
      asOf: '2026-09-28',
      fetchKeyStatsRaw: async () => {
        throw new Error('400');
      },
      saveSnapshot: async () => {},
    });
    assert.equal(result.emiten, 'TPIA');
    assert.match(String(result.error), /400/);
  });
});
