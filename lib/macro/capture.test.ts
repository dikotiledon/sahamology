import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import {
  daysBetween,
  fetchMacroSeriesPaged,
  planBackfillWindows,
  toMacroBar,
  MACRO_MAX_PAGES_PER_WINDOW,
  MACRO_MAX_WINDOWS,
  type MacroFetchDeps,
} from './capture';
import { MACRO_FETCH_LIMIT, MACRO_MAX_SPAN_DAYS, type HistoricalRow } from './types';

/**
 * Leaf 1.1.3 — the bounded pager.
 *
 * Everything here runs with a fake `fetchPage`: no network, no clock, no
 * database, no credentials. That is deliberate, because the two properties
 * worth testing were both learned by getting an HTTP 400 from the live vendor,
 * and re-testing them live would be slow, rate-limited, and non-deterministic.
 *
 * The properties:
 *   1. A window never exceeds the measured 365 days, because the vendor 400s
 *      on a wider one regardless of `limit` or `page`.
 *   2. A page never exceeds the measured 50, because the vendor 400s on
 *      `limit=51` rather than truncating.
 *   3. The union of the windows is exactly [from, to] — no gap, no overlap —
 *      so a multi-window backfill is not silently missing sessions.
 *   4. Termination is guaranteed three ways: a short page, a non-array page,
 *      and hard bounds. An unbounded pager is a production incident waiting
 *      for a vendor that always returns a full page.
 */

const row = (date: string, close = 100): HistoricalRow => ({ date, close, volume: 1, value: 1 });

/** A `fetchPage` that serves a fixed in-memory calendar, oldest first. */
const calendarFetch = (dates: string[], calls: Array<{ start: string; end: string; page: number }> = []) =>
  (async ({ startDate, endDate, page }: { startDate: string; endDate: string; page: number }) => {
    calls.push({ start: startDate, end: endDate, page });
    const inWindow = dates.filter((d) => d >= startDate && d <= endDate);
    const start = (page - 1) * MACRO_FETCH_LIMIT;
    return inWindow.slice(start, start + MACRO_FETCH_LIMIT).map((d) => row(d));
  }) satisfies MacroFetchDeps['fetchPage'];

describe('daysBetween', () => {
  it('counts an inclusive span', () => {
    assert.equal(daysBetween('2026-01-01', '2026-01-01'), 0);
    assert.equal(daysBetween('2026-01-01', '2026-01-11'), 10);
  });

  it('crosses a month and a year boundary', () => {
    assert.equal(daysBetween('2025-12-25', '2026-01-05'), 11);
  });
});

describe('planBackfillWindows', () => {
  it('returns one window for a span inside the cap', () => {
    const windows = planBackfillWindows('2026-01-01', '2026-03-01');
    assert.equal(windows.length, 1);
    assert.deepEqual(windows[0], { startDate: '2026-01-01', endDate: '2026-03-01' });
  });

  it('never emits a window longer than the measured cap', () => {
    const windows = planBackfillWindows('2024-01-01', '2026-09-01');
    assert.ok(windows.length > 1, 'a multi-year span must split');
    for (const w of windows) {
      assert.ok(
        daysBetween(w.startDate, w.endDate) < MACRO_MAX_SPAN_DAYS,
        `window ${w.startDate}..${w.endDate} is ${daysBetween(w.startDate, w.endDate)} days, at or over the ${MACRO_MAX_SPAN_DAYS}-day vendor cap`,
      );
    }
  });

  it('covers the whole range with no gap and no overlap', () => {
    const windows = planBackfillWindows('2024-01-01', '2026-09-01');
    // Windows are newest-first, so the boundary to check is the older
    // window's end against the newer window's start: they must be one day
    // apart, or a session is either fetched twice or skipped entirely.
    for (let i = 0; i < windows.length - 1; i += 1) {
      const newerStart = new Date(`${windows[i].startDate}T00:00:00Z`).getTime();
      const olderEnd = new Date(`${windows[i + 1].endDate}T00:00:00Z`).getTime();
      assert.equal(newerStart - olderEnd, 86_400_000, 'consecutive windows must be adjacent, not overlapping');
    }
    assert.equal(windows[0].endDate, '2026-09-01', 'the newest window must end at the requested end');
    assert.equal(windows[windows.length - 1].startDate, '2024-01-01', 'the oldest window must reach the requested start');
  });

  it('emits windows newest first so partial failure costs the oldest data', () => {
    const windows = planBackfillWindows('2024-01-01', '2026-09-01');
    assert.ok(windows[0].endDate > windows[windows.length - 1].endDate);
  });

  it('handles a single-day span', () => {
    assert.deepEqual(planBackfillWindows('2026-05-05', '2026-05-05'), [
      { startDate: '2026-05-05', endDate: '2026-05-05' },
    ]);
  });

  it('rejects an inverted range rather than looping forever', () => {
    assert.throws(() => planBackfillWindows('2026-05-05', '2026-05-01'), /after to/);
  });
});

describe('fetchMacroSeriesPaged', () => {
  it('clamps an over-limit request instead of letting the vendor 400', async () => {
    const calls: Array<{ limit: number }> = [];
    const deps: MacroFetchDeps = {
      fetchPage: async ({ limit }) => {
        calls.push({ limit });
        return [];
      },
    };
    await fetchMacroSeriesPaged('IHSG', '2026-09-01', '2026-09-05', 500, deps);
    assert.ok(calls.length > 0);
    for (const c of calls) {
      assert.equal(c.limit, MACRO_FETCH_LIMIT, 'a limit over 50 returns HTTP 400, not a truncated page');
    }
  });

  it('does not under-clamp a small request', async () => {
    const seen: number[] = [];
    const deps: MacroFetchDeps = {
      fetchPage: async ({ limit }) => {
        seen.push(limit);
        return [];
      },
    };
    await fetchMacroSeriesPaged('IHSG', '2026-09-01', '2026-09-05', 10, deps);
    assert.ok(seen.every((l) => l === 10));
  });

  it('stops on a short page', async () => {
    const dates = Array.from({ length: 60 }, (_, i) => `2026-09-${String(i + 1).padStart(2, '0')}`);
    const calls: Array<{ page: number }> = [];
    const deps: MacroFetchDeps = {
      fetchPage: async ({ page }) => {
        calls.push({ page });
        const start = (page - 1) * MACRO_FETCH_LIMIT;
        return dates.slice(start, start + MACRO_FETCH_LIMIT).map((d) => row(d));
      },
    };
    const rows = await fetchMacroSeriesPaged('IHSG', '2026-09-01', '2026-09-30', MACRO_FETCH_LIMIT, deps);
    assert.equal(rows.length, 60);
    assert.equal(calls.length, 2, '60 rows at limit 50 is a full page then a short page');
  });

  it('terminates when the vendor always returns a full page', async () => {
    let calls = 0;
    // A page of `limit` DISTINCT dates each time: `rows.length === pageSize`,
    // so the short-page stop can never fire and only the hard bound saves us.
    const fullPage = (offset: number) =>
      Array.from({ length: 2 }, (_, i) => row(`2026-09-${String(offset + i + 1).padStart(2, '0')}`));
    const deps: MacroFetchDeps = {
      fetchPage: async ({ page }) => {
        calls += 1;
        return fullPage(page * 2);
      },
    };
    const rows = await fetchMacroSeriesPaged('IHSG', '2026-09-01', '2026-09-05', 2, deps);
    // A 5-day span is a single window, so exactly the page bound fires.
    assert.equal(calls, MACRO_MAX_PAGES_PER_WINDOW, 'only the hard page bound may stop the walk');
    assert.ok(rows.length > 0);
  });

  it('terminates when a page is not an array', async () => {
    let calls = 0;
    const deps = {
      fetchPage: async () => {
        calls += 1;
        return null as unknown as HistoricalRow[];
      },
    };
    await fetchMacroSeriesPaged('IHSG', '2026-09-01', '2026-09-05', MACRO_FETCH_LIMIT, deps);
    assert.equal(calls, 1);
  });

  it('de-duplicates a session repeated across a window boundary', async () => {
    const deps: MacroFetchDeps = {
      fetchPage: async ({ startDate, endDate }) => [row(startDate), row(endDate)],
    };
    const rows = await fetchMacroSeriesPaged('USDIDR', '2024-01-01', '2026-09-01', MACRO_FETCH_LIMIT, deps);
    const dates = rows.map((r) => r.date);
    assert.equal(new Set(dates).size, dates.length, 'a repeated bar_date would fail the whole keyed insert');
  });

  it('returns rows oldest first so a baseline reads prior sessions at the tail', async () => {
    const deps: MacroFetchDeps = {
      fetchPage: async () => [row('2026-09-03', 3), row('2026-09-01', 1), row('2026-09-02', 2)],
    };
    const rows = await fetchMacroSeriesPaged('IHSG', '2026-09-01', '2026-09-03', MACRO_FETCH_LIMIT, deps);
    assert.deepEqual(rows.map((r) => r.date), ['2026-09-01', '2026-09-02', '2026-09-03']);
  });

  it('walks multiple windows and returns one flat series', async () => {
    const dates = Array.from({ length: 500 }, (_, i) => {
      const d = new Date(Date.UTC(2024, 0, 1) + i * 86_400_000);
      return d.toISOString().slice(0, 10);
    });
    const rows = await fetchMacroSeriesPaged('XAU', dates[0], dates[dates.length - 1], MACRO_FETCH_LIMIT, {
      fetchPage: calendarFetch(dates),
    });
    assert.equal(rows.length, 500, 'a 500-day calendar must survive the window split intact');
    assert.equal(rows[0].date, dates[0]);
    assert.equal(rows[rows.length - 1].date, dates[dates.length - 1]);
  });

  it('bounds the number of windows walked', async () => {
    let calls = 0;
    const deps: MacroFetchDeps = {
      fetchPage: async () => {
        calls += 1;
        return [];
      },
    };
    // A ten-year request cannot walk further back than the window bound.
    await fetchMacroSeriesPaged('IHSG', '2010-01-01', '2026-09-01', MACRO_FETCH_LIMIT, deps);
    assert.equal(calls, MACRO_MAX_WINDOWS);
  });
});

describe('toMacroBar', () => {
  const capturedAt = '2026-09-29T00:00:00.000Z';

  it('normalises a well-formed row', () => {
    assert.deepEqual(toMacroBar('XAU', row('2026-09-28', 4148.5), capturedAt), {
      symbol: 'XAU',
      barDate: '2026-09-28',
      close: 4148.5,
      volume: 1,
      value: 1,
      capturedAt,
    });
  });

  it('rejects a row with no usable close', () => {
    assert.equal(toMacroBar('XAU', { date: '2026-09-28', close: NaN, volume: 1, value: 1 }, capturedAt), null);
  });

  it('rejects a row with a malformed date', () => {
    assert.equal(toMacroBar('XAU', { date: '28-09-2026', close: 1, volume: 1, value: 1 }, capturedAt), null);
    assert.equal(toMacroBar('XAU', { date: '', close: 1, volume: 1, value: 1 }, capturedAt), null);
  });

  it('defaults absent volume and value to zero rather than NaN', () => {
    const bar = toMacroBar('IHSG', { date: '2026-09-28', close: 7500, volume: NaN, value: undefined as unknown as number }, capturedAt);
    assert.equal(bar?.volume, 0);
    assert.equal(bar?.value, 0);
  });
});
