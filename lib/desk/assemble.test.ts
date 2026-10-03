import assert from 'node:assert/strict';
import { test } from 'node:test';
import { assembleDesk, visibleDeskRows, type JournalDeskRecord } from './assemble';

const record = (over: Partial<JournalDeskRecord> & Pick<JournalDeskRecord, 'emiten' | 'stance'>): JournalDeskRecord => ({
  as_of: '2026-01-05',
  entry: 1000,
  r1: 1100,
  max: 1200,
  invalidation: 950,
  rr: 1.5,
  failed_gates: [],
  gates: [{ id: 'G0', pass: true, reason: 'ok' }],
  outcome: null,
  r_multiple: null,
  ...over,
});

test('USDIDR is skipped as non-idx and never ranks as holdable', () => {
  const desk = assembleDesk({
    asOf: '2026-01-05',
    journals: [record({ emiten: 'BBCA', stance: 'ENTER' })],
    watchlistItems: [{ symbol: 'USDIDR' }, { symbol: 'BBCA' }],
    fallbackEmitens: '',
  });
  assert.equal(desk.skipped.some((s) => s.symbol === 'USDIDR' && s.reason === 'non-idx'), true);
  assert.equal(desk.deskRows.some((r) => r.emiten === 'USDIDR'), false);
  assert.equal(desk.morningCard.universeSource, 'stockbit-watchlist');
});

test('assemble uses resolveEmitensToAnalyze — fallback fills an all-forex watchlist', () => {
  const desk = assembleDesk({
    asOf: '2026-01-05',
    journals: [record({ emiten: 'TLKM', stance: 'WAIT', failed_gates: ['G4'], gates: [{ id: 'G4', pass: false, reason: 'Tren di bawah EMA-20' }] })],
    watchlistItems: [{ symbol: 'USDIDR' }],
    fallbackEmitens: 'TLKM',
  });
  assert.equal(desk.morningCard.universeSource, 'env-fallback');
  assert.deepEqual(desk.deskRows.map((r) => r.emiten), ['TLKM']);
});

test('unexplained WAIT is rendered, not dropped', () => {
  const desk = assembleDesk({
    asOf: '2026-01-05',
    journals: [record({ emiten: 'BBRI', stance: 'WAIT', failed_gates: [] })],
    watchlistItems: [{ symbol: 'BBRI' }],
    fallbackEmitens: '',
  });
  assert.equal(desk.deskRows.length, 1);
  assert.equal(desk.deskRows[0]?.unexplained, true);
  assert.equal(desk.morningCard.unexplainedCount, 1);
});

test('non-ENTER nextAction is do-nothing except TAKE_PROFIT manage', () => {
  const desk = assembleDesk({
    asOf: '2026-01-05',
    journals: [
      record({ emiten: 'WAIT', stance: 'WAIT', failed_gates: ['G4'], gates: [{ id: 'G4', pass: false, reason: 'tape' }] }),
      record({ emiten: 'AVOI', stance: 'AVOID', failed_gates: ['G0'], gates: [{ id: 'G0', pass: false, reason: 'no bandar' }] }),
      record({ emiten: 'TAKE', stance: 'TAKE_PROFIT' }),
      record({ emiten: 'ENTR', stance: 'ENTER' }),
    ],
    watchlistItems: [{ symbol: 'WAIT' }, { symbol: 'AVOI' }, { symbol: 'TAKE' }, { symbol: 'ENTR' }],
    fallbackEmitens: '',
  });
  const by = Object.fromEntries(desk.deskRows.map((r) => [r.emiten, r.nextAction.kind]));
  assert.equal(by.WAIT, 'do-nothing');
  assert.equal(by.AVOI, 'do-nothing');
  assert.equal(by.TAKE, 'manage');
  assert.equal(by.ENTR, 'enter');
});

test('morning card counts match ranked rows and pending ENTER outcomes', () => {
  const desk = assembleDesk({
    asOf: '2026-01-05',
    journals: [
      record({ emiten: 'BBCA', stance: 'ENTER', rr: 2, outcome: null }),
      record({ emiten: 'BBRI', stance: 'ENTER', rr: 3, outcome: 'r1', r_multiple: 0.8 }),
      record({ emiten: 'TLKM', stance: 'WAIT', failed_gates: ['G4'], gates: [{ id: 'G4', pass: false, reason: 'tape' }] }),
      record({ emiten: 'GGRM', stance: 'AVOID', failed_gates: ['G0'], gates: [{ id: 'G0', pass: false, reason: 'x' }] }),
      record({ emiten: 'ASII', stance: 'TAKE_PROFIT' }),
    ],
    watchlistItems: [{ symbol: 'BBCA' }, { symbol: 'BBRI' }, { symbol: 'TLKM' }, { symbol: 'GGRM' }, { symbol: 'ASII' }],
    fallbackEmitens: '',
  });
  assert.equal(desk.morningCard.enterCount, 2);
  assert.equal(desk.morningCard.waitCount, 1);
  assert.equal(desk.morningCard.avoidCount, 1);
  assert.equal(desk.morningCard.takeProfitCount, 1);
  assert.equal(desk.morningCard.pendingOutcomeCount, 1);
  assert.deepEqual(
    desk.morningCard.topEnter.map((t: { emiten: string }) => t.emiten),
    ['BBRI', 'BBCA'],
  );
  assert.equal(desk.morningCard.topWait[0]?.blockingGate, 'G4');
  assert.equal(desk.apiEnvelopeKeys.join(','), 'date,morningCard,deskRows,skipped');
});

test('null rr stays null on the desk row for the UI em-dash contract', () => {
  const desk = assembleDesk({
    asOf: '2026-01-05',
    journals: [record({ emiten: 'NULL', stance: 'WAIT', rr: null, failed_gates: ['G2'], gates: [{ id: 'G2', pass: false, reason: 'spread' }] })],
    watchlistItems: [{ symbol: 'NULL' }],
    fallbackEmitens: '',
  });
  assert.equal(desk.deskRows[0]?.rr, null);
});

test('holiday wall keeps previous-session rank and sets marketClosed holiday', () => {
  const desk = assembleDesk({
    asOf: '2026-08-14',
    wallDate: '2026-08-17',
    journals: [
      record({ emiten: 'BBRI', as_of: '2026-08-14', stance: 'ENTER', rr: 3 }),
      record({ emiten: 'BBCA', as_of: '2026-08-14', stance: 'ENTER', rr: 2 }),
    ],
    watchlistItems: [{ symbol: 'BBRI' }, { symbol: 'BBCA' }],
    fallbackEmitens: '',
  });
  assert.equal(desk.morningCard.marketClosed?.reason, 'holiday');
  assert.equal(desk.morningCard.marketClosed?.wallDate, '2026-08-17');
  assert.deepEqual(
    desk.deskRows.map((row) => row.emiten),
    ['BBRI', 'BBCA'],
  );
  assert.equal(desk.date, '2026-08-14');
  const open = assembleDesk({
    asOf: '2026-01-05',
    journals: [record({ emiten: 'BBCA', stance: 'ENTER' })],
    watchlistItems: [{ symbol: 'BBCA' }],
    fallbackEmitens: '',
  });
  assert.equal(open.morningCard.marketClosed, null);
});

test('visibleDeskRows hides AVOID by default and keeps TAKE_PROFIT', () => {
  const desk = assembleDesk({
    asOf: '2026-01-05',
    journals: [
      record({ emiten: 'ENTR', stance: 'ENTER' }),
      record({ emiten: 'WAIT', stance: 'WAIT', failed_gates: ['G4'], gates: [{ id: 'G4', pass: false, reason: 'tape' }] }),
      record({ emiten: 'TAKE', stance: 'TAKE_PROFIT' }),
      record({ emiten: 'INVD', stance: 'INVALIDATED', failed_gates: ['G0'], gates: [{ id: 'G0', pass: false, reason: 'fixture' }] }),
      record({ emiten: 'AVOI', stance: 'AVOID', failed_gates: ['G0'], gates: [{ id: 'G0', pass: false, reason: 'no bandar' }] }),
    ],
    watchlistItems: [
      { symbol: 'ENTR' },
      { symbol: 'WAIT' },
      { symbol: 'TAKE' },
      { symbol: 'INVD' },
      { symbol: 'AVOI' },
    ],
    fallbackEmitens: '',
  });
  const hidden = visibleDeskRows(desk.deskRows, false);
  assert.deepEqual(
    hidden.map((row) => row.emiten),
    ['ENTR', 'WAIT', 'TAKE', 'INVD'],
  );
  assert.equal(hidden.some((row) => row.stance === 'AVOID'), false);
  const shown = visibleDeskRows(desk.deskRows, true);
  assert.equal(shown.some((row) => row.emiten === 'AVOI'), true);
  assert.equal(desk.morningCard.avoidCount, 1);
  assert.equal(desk.deskRows.find((row) => row.emiten === 'TAKE')?.unexplained, false);
});

test('assembleDesk filters deskRows to only emitens present in the resolved watchlist universe', () => {
  const desk = assembleDesk({
    asOf: '2026-01-05',
    journals: [
      record({ emiten: 'BBCA', stance: 'ENTER', rr: 2 }),
      record({ emiten: 'BBRI', stance: 'ENTER', rr: 3 }),
      record({ emiten: 'GOTO', stance: 'WAIT', rr: 1.2 }),
    ],
    // Only BBCA is in the configured watchlist; BBRI and GOTO were removed
    watchlistItems: [{ symbol: 'BBCA' }],
    fallbackEmitens: '',
  });

  assert.deepEqual(desk.deskRows.map((r) => r.emiten), ['BBCA']);
  assert.equal(desk.deskRows.some((r) => r.emiten === 'BBRI'), false);
  assert.equal(desk.deskRows.some((r) => r.emiten === 'GOTO'), false);
  assert.equal(desk.morningCard.enterCount, 1);
});
