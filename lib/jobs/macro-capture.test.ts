import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import { captureMacro, type MacroCaptureDeps, type MacroSnapshotRow } from './macro-capture';
import { MACRO_SERIES, type HistoricalRow, type MacroSeries } from '../macro/types';

/**
 * Leaf 1.1.4 — the daily macro capture.
 *
 * Every test here is about what does NOT happen. The happy path is trivial; the
 * properties worth defending are the ones where a bug deletes walk-forward
 * samples without producing a single visible error:
 *
 *   - a dead leg must not discard the working ones,
 *   - a failed save must be reported as a failure, not a quiet success,
 *   - nothing may throw, because the caller's error list is a denominator,
 *   - and the flag must be `macro_incomplete` alone (Phase 3 D14).
 */

const CAPTURED_AT = '2026-09-29T02:00:00.000Z';
const FROM = '2026-09-01';
const TO = '2026-09-28';

const row = (date: string, close = 100): HistoricalRow => ({ date, close, volume: 1, value: 1 });

const deps = (over: Partial<MacroCaptureDeps> = {}): MacroCaptureDeps => ({
  fetchPage: async () => [row('2026-09-28')],
  saveSnapshot: async () => undefined,
  capturedAt: CAPTURED_AT,
  from: FROM,
  to: TO,
  ...over,
});

/** Records what would have been persisted, without a database. */
const recorder = () => {
  const saved: MacroSnapshotRow[] = [];
  return { saved, save: async (rows: MacroSnapshotRow[]) => void saved.push(...rows) };
};

describe('captureMacro happy path', () => {
  it('captures every leg in the frozen set', async () => {
    const r = recorder();
    const result = await captureMacro(deps({ saveSnapshot: r.save }));

    assert.equal(result.ok, true);
    assert.equal(result.incomplete, false);
    assert.deepEqual(
      Object.keys(result.perSeries).sort(),
      [...MACRO_SERIES].sort(),
      'a leg may not be silently skipped',
    );
    for (const s of MACRO_SERIES) {
      assert.equal(result.perSeries[s].ok, true);
    }
  });

  it('never captures GOLD, even though it resolves over the same endpoint', async () => {
    const seen: MacroSeries[] = [];
    const result = await captureMacro(
      deps({
        fetchPage: async ({ symbol }) => {
          seen.push(symbol);
          return [row('2026-09-28')];
        },
      }),
    );
    assert.ok(!seen.includes('GOLD' as MacroSeries), 'GOLD is an IDX emiten, not a metal');
    assert.equal(Object.keys(result.perSeries).includes('GOLD'), false);
  });

  it('writes one row per series per session, not one per emiten', async () => {
    const r = recorder();
    const result = await captureMacro(deps({ saveSnapshot: r.save }));
    // 5 legs x 1 session = 5 rows. If this were per-emiten it would be 5 x N.
    assert.equal(result.rowCount, MACRO_SERIES.length);
    assert.equal(r.saved.length, MACRO_SERIES.length);
    assert.equal(new Set(r.saved.map((row) => row.symbol)).size, MACRO_SERIES.length);
  });

  it('stamps capture time and leaves the bar date as the vendor session', async () => {
    const r = recorder();
    await captureMacro(deps({ saveSnapshot: r.save }));
    for (const bar of r.saved) {
      assert.equal(bar.capturedAt, CAPTURED_AT);
      assert.equal(bar.barDate, '2026-09-28', 'bar_date is the session, not the capture day');
    }
  });
});

describe('captureMacro failure isolation', () => {
  it('keeps the working legs when one leg throws', async () => {
    const r = recorder();
    const result = await captureMacro(
      deps({
        saveSnapshot: r.save,
        fetchPage: async ({ symbol }) => {
          if (symbol === 'IHSG') throw new Error('vendor 500');
          return [row('2026-09-28')];
        },
      }),
    );

    assert.equal(result.ok, false);
    assert.equal(result.incomplete, true, 'a partial capture must still be repairable');
    assert.equal(result.perSeries.IHSG.ok, false);
    assert.equal(result.perSeries.IHSG.error, 'vendor 500');
    assert.equal(result.perSeries.XAU.ok, true, 'one dead leg must not discard the rest');
    // The four surviving legs are still persisted.
    assert.equal(r.saved.length, MACRO_SERIES.length - 1);
  });

  it('reports a failed save as a failure rather than a quiet success', async () => {
    const result = await captureMacro(
      deps({
        saveSnapshot: async () => {
          throw new Error('deadlock detected');
        },
      }),
    );
    assert.equal(result.ok, false, 'rows fetched but not stored is not a success');
    assert.equal(result.incomplete, true);
    assert.match(result.error ?? '', /save failed/);
  });

  it('treats an empty result as a failure, not as "nothing to report"', async () => {
    const result = await captureMacro(deps({ fetchPage: async () => [] }));
    assert.equal(result.ok, false);
    assert.equal(result.incomplete, true);
    assert.match(result.error ?? '', /no rows/);
  });

  it('never throws, whatever the dependency does', async () => {
    const hostile: MacroCaptureDeps = {
      fetchPage: async () => {
        throw new Error('network down');
      },
      saveSnapshot: async () => {
        throw new Error('also down');
      },
      capturedAt: CAPTURED_AT,
      from: FROM,
      to: TO,
    };
    // The caller's error list is a walk-forward denominator, so reaching it
    // with an exception would delete a sample silently.
    const result = await captureMacro(hostile);
    assert.equal(result.incomplete, true);
    assert.equal(result.ok, false);
  });

  it('drops an unpriceable bar instead of storing a synthetic zero', async () => {
    const r = recorder();
    await captureMacro(
      deps({
        saveSnapshot: r.save,
        fetchPage: async () => [row('2026-09-28'), { date: '2026-09-27', close: NaN, volume: 1, value: 1 }],
      }),
    );
    for (const bar of r.saved) {
      assert.equal(bar.close, 100, 'a NaN bar must not be written');
    }
  });
});

describe('captureMacro flag isolation', () => {
  it('reports only the macro flag, never another capture scope', async () => {
    // Phase 3 D14: the three flags are independent repair scopes. A macro
    // outage must not mark the micro or fundamentals repair as needed.
    const result = await captureMacro(
      deps({
        fetchPage: async () => {
          throw new Error('down');
        },
      }),
    );
    const keys = Object.keys(result).sort();
    assert.ok(!keys.some((k) => /capture_incomplete|fundamentals_incomplete/.test(k)));
    assert.ok(keys.includes('incomplete'));
  });
});
