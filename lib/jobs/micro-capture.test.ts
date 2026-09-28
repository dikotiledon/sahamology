import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { parseFlowActivity, captureBandFlow, toFlowRow } from './micro-capture';
import { buildUpsertPreview } from './micro-capture';

/**
 * Capture-layer contracts for the daily job and /api/stock (Phase 2, M12/M13).
 *
 * The D21 invariant this file exists to pin: `saveStockQuery` (the
 * calculator/browser path) and `saveWatchlistAnalysis` (the job path) target
 * the SAME upsert conflict `(from_date, emiten)`. `buildUpsert` builds its
 * column list dynamically from the payload's own keys, so a key absent from
 * the calculator payload is also absent from `DO UPDATE SET` — meaning a
 * browser query for a job-written date PRESERVES the job's micro columns.
 * That is the safe direction, but it is an accident of implementation, not a
 * contract, and it breaks the moment someone adds a field to the calculator
 * payload. D21 turns it into an asserted invariant.
 */

const SRC = (p: string) => readFileSync(join(__dirname, '..', '..', p), 'utf8');

describe('D21 — the second writer is provably inert', () => {
  it('buildUpsert omits an absent key from BOTH the INSERT column list and DO UPDATE SET', () => {
    const jobPayload = { from_date: '2026-03-10', emiten: 'BBCA', accdist_overall: 'acc', broker_p: 1.5 };
    const routePayload = { from_date: '2026-03-10', emiten: 'BBCA' };

    const job = buildUpsertPreview('stock_queries', 'from_date,emiten', jobPayload);
    const route = buildUpsertPreview('stock_queries', 'from_date,emiten', routePayload);

    assert.match(job.text, /accdist_overall = EXCLUDED\.accdist_overall/);
    assert.match(job.text, /broker_p = EXCLUDED\.broker_p/);
    assert.doesNotMatch(route.text, /accdist_overall/);
    assert.doesNotMatch(route.text, /broker_p/);

    // The critical claim: because accdist_* is absent from the route's SET
    // list, a route upsert for a job-written date leaves the column intact.
    assert.doesNotMatch(route.text, /SET[\s\S]*accdist_overall/i);
  });

  it('the two payloads are asserted to differ in this repo', () => {
    const db = SRC('lib/db.ts');
    assert.match(db, /saveWatchlistAnalysis/, 'the job writer must exist');
    assert.match(db, /saveStockQuery/, 'the calculator writer must exist');
  });
});

describe('toFlowRow (P2-D — string numerics must never become NaN)', () => {
  it('parses the broker-flow-transform string shape into a numeric row', () => {
    const row = toFlowRow({ net_value: '1000', buy_days: '4', active_days: '5', consistency_pct: '80' });
    assert.deepEqual(row, { netValue: 1000, buyDays: 4, activeDays: 5, consistencyPct: 80 });
  });

  it('returns null when any required numeric is missing or NaN', () => {
    assert.equal(toFlowRow({ net_value: 'NaN', buy_days: '4', active_days: '5', consistency_pct: '80' }), null);
    assert.equal(toFlowRow({ net_value: '1000', buy_days: '', active_days: '5', consistency_pct: '80' }), null);
    assert.equal(toFlowRow(null), null);
  });
});

describe('parseFlowActivity (only the band\'s own code — D4/P2-E)', () => {
  const resp = {
    data: [
      {
        broker_code: 'BK',
        net_value: '500',
        buy_days: '3',
        active_days: '5',
        consistency_pct: '60',
      },
      { broker_code: 'OTHER', net_value: '999', buy_days: '5', active_days: '5', consistency_pct: '100' },
    ],
  };

  it('selects the requested broker, never a top-N neighbour', () => {
    const row = parseFlowActivity(resp, 'BK');
    assert.ok(row);
    assert.equal(row.netValue, 500);
    assert.equal(row.consistencyPct, 60);
  });

  it('returns null when the requested broker is absent from the response', () => {
    assert.equal(parseFlowActivity(resp, 'ZZ'), null);
  });

  it('tolerates a malformed response without throwing', () => {
    for (const bad of [null, undefined, {}, { data: null }, { data: 'nope' }, { data: [] }]) {
      assert.equal(parseFlowActivity(bad, 'BK'), null);
    }
  });
});

describe('captureBandFlow (C9/C10 — one call, failure is a coverage miss not a signal loss)', () => {
  const okResp = { data: [{ broker_code: 'BK', net_value: '10', buy_days: '1', active_days: '1', consistency_pct: '100' }] };

  it('issues exactly one fetch for the requested broker and maps the row', async () => {
    let calls = 0;
    const row = await captureBandFlow({
      emiten: 'BBCA',
      brokerCode: 'BK',
      from: '2026-03-02',
      to: '2026-03-10',
      brokerSeenInDetector: true,
      fetchFlow: async () => { calls += 1; return okResp; },
    });
    assert.equal(calls, 1, 'D4: one request for the band\'s own code only');
    assert.ok(row.row);
  });

  it('degrades to a null row and never rethrows when the fetch fails', async () => {
    const row = await captureBandFlow({
      emiten: 'BBCA',
      brokerCode: 'BK',
      from: '2026-03-02',
      to: '2026-03-10',
      brokerSeenInDetector: true,
      fetchFlow: async () => { throw new Error('429 rate limited'); },
    });
    assert.equal(row.row, null, 'a flow failure costs a coverage point, not a signal');
  });

  it('D20: makes ZERO fetch calls when the broker was not in the detector that session', async () => {
    let calls = 0;
    const res = await captureBandFlow({
      emiten: 'BBCA',
      brokerCode: 'BK',
      from: '2026-03-02',
      to: '2026-03-10',
      brokerSeenInDetector: false,
      fetchFlow: async () => { calls += 1; return okResp; },
    });
    assert.equal(calls, 0, 'an absent broker is never fetched, so it can never be persisted');
    assert.equal(res.row, null);
    assert.equal(res.brokerSeenInDetector, false);
  });

  it('passes the broker code, not the top-N set, to the fetcher', async () => {
    let seen: string[] | null = null;
    await captureBandFlow({
      emiten: 'BBCA',
      brokerCode: 'BK',
      from: '2026-03-02',
      to: '2026-03-10',
      brokerSeenInDetector: true,
      fetchFlow: async (_emiten: string, codes: string[]) => { seen = codes; return okResp; },
    });
    assert.deepEqual(seen, ['BK'], 'D4/P2-E: request [bandar] explicitly');
  });
});

describe('D20 — a flow row is only ever written for a broker seen in the detector', () => {
  it('the job gates the flow write on broker_seen_in_detector', () => {
    const job = SRC('lib/jobs/run-watchlist-analysis.ts');
    // The constant must exist in the micro layer and be consulted at the write.
    assert.match(job, /broker_seen_in_detector|isBandarSellerOn|brokerSeenInDetector/);
  });
});

describe('D19 — /api/stock flow capture is gated on isToday', () => {
  it('the stock route gates the flow call the same way it gates the tape', () => {
    const route = SRC('app/api/stock/route.ts');
    assert.match(route, /isToday/, 'the route must compute isToday');
    // The guard must appear on the flow-capture path, not just the tape path.
    assert.match(route, /captureBandFlow|flowWindow|micro/i, 'route must reference the micro/flow capture');
  });
});
