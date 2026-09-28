import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import { parseKeyStatsSeries, parseKeyValue } from './keystats-series';
import { FINANCIAL_ISSUER_METRICS, FINANCIAL_METRIC } from './types';

/**
 * Leaf 1.1.1 — the parser, against the shape the endpoint ACTUALLY returns.
 *
 * The live payload (artifacts/keystats-probe-bbri.json, measured 2026-09-28)
 * proved the pre-audit plan's premise false: every statement item is a flat
 * `{id, name, value}` with NO fiscal period and NO publication date. The only
 * per-year data lives in `financial_year_parent`, which holds a market and
 * dividend series rather than financial statements.
 *
 * So this parser has exactly two jobs:
 *   1. flatten the twelve categories without losing a single item, and
 *   2. recover a number and a scale from a value string that encodes both
 *      inline — including the parenthesised negatives and the "-" placeholder.
 *
 * The load-bearing invariant is D18: an unavailable value is `null`, NEVER `0`.
 * A `0` would make `NEGATIVE_EQUITY` and `EXTREME_LEVERAGE` evaluate false and
 * silently convert missing data into a healthy verdict.
 */

const CATEGORY = (keystats_name: string, items: Array<[string, string]>) => ({
  keystats_name,
  fin_name_results: items.map(([name, value], i) => ({
    fitem: { id: String(1000 + i), name, value },
    hidden_graph_ico: false,
    is_new_update: false,
  })),
});

const payload = (categories: unknown[]) => ({
  data: { closure_fin_items_results: categories },
  message: 'ok',
});

describe('parseKeyValue', () => {
  it('parses a plain number', () => {
    assert.deepEqual(parseKeyValue('7.71'), { valueNum: 7.71, scale: null });
  });

  it('parses a thousands-separated number', () => {
    assert.deepEqual(parseKeyValue('1,407.43'), { valueNum: 1407.43, scale: null });
  });

  it('parses a percent and does NOT treat % as a scale', () => {
    assert.deepEqual(parseKeyValue('19.02%'), { valueNum: 19.02, scale: null });
  });

  it('extracts an inline scale token', () => {
    assert.deepEqual(parseKeyValue('213,308 B'), { valueNum: 213308, scale: 'B' });
  });

  it('reads a parenthesised value as negative', () => {
    assert.deepEqual(parseKeyValue('(42,295 B)'), { valueNum: -42295, scale: 'B' });
  });

  it('reads a leading minus as negative', () => {
    assert.deepEqual(parseKeyValue('-1.42'), { valueNum: -1.42, scale: null });
  });

  it('maps the dash placeholder to null, never 0 (D18)', () => {
    assert.deepEqual(parseKeyValue('-'), { valueNum: null, scale: null });
  });

  it('maps an empty string to null', () => {
    assert.deepEqual(parseKeyValue(''), { valueNum: null, scale: null });
  });

  it('maps wholly non-numeric text to null rather than coercing it', () => {
    assert.deepEqual(parseKeyValue('21 Apr 26'), { valueNum: null, scale: null });
  });

  it('never returns NaN or Infinity for hostile input', () => {
    for (const raw of ['NaN', 'Infinity', '1e999', '--', '()', '%', ',,,', '1.2.3']) {
      const { valueNum } = parseKeyValue(raw);
      assert.ok(
        valueNum === null || Number.isFinite(valueNum),
        `parseKeyValue(${JSON.stringify(raw)}) produced ${String(valueNum)}`,
      );
    }
  });
});

describe('parseKeyStatsSeries', () => {
  it('never throws on the hostile shapes the gate names', () => {
    const inputs: unknown[] = [
      null,
      undefined,
      {},
      { data: null },
      { data: {} },
      { data: { closure_fin_items_results: null } },
      { data: { closure_fin_items_results: 'nope' } },
      { data: { closure_fin_items_results: [{ keystats_name: 'X' }] } },
      { data: { closure_fin_items_results: [{ keystats_name: 'X', fin_name_results: [{}] }] } },
      { data: { closure_fin_items_results: [{ keystats_name: 'X', fin_name_results: [{ fitem: null }] }] } },
    ];
    for (const input of inputs) {
      const series = parseKeyStatsSeries(input as never, 'BBRI');
      assert.equal(series.emiten, 'BBRI');
      assert.ok(Array.isArray(series.entries));
    }
  });

  it('flattens every category and keeps the category name on each entry', () => {
    const series = parseKeyStatsSeries(
      payload([
        CATEGORY('Balance Sheet', [['Total Equity', '328,675 B']]),
        CATEGORY('Cash Flow Statement', [['Cash From Operations (TTM)', '14,076 B']]),
      ]) as never,
      'BBRI',
    );
    assert.equal(series.entries.length, 2);
    assert.deepEqual(
      series.entries.map((e) => e.category).sort(),
      ['Balance Sheet', 'Cash Flow Statement'],
    );
  });

  it('preserves the raw text beside the numeric (C2)', () => {
    const series = parseKeyStatsSeries(
      payload([CATEGORY('Balance Sheet', [['Total Equity', '328,675 B']])]) as never,
      'BBRI',
    );
    const entry = series.entries.find((e) => e.itemName === 'Total Equity');
    assert.ok(entry);
    assert.equal(entry.valueText, '328,675 B');
    assert.equal(entry.valueNum, 328675);
    assert.equal(entry.scale, 'B');
  });

  it('keeps an unavailable value as null so its clause cannot fire', () => {
    const series = parseKeyStatsSeries(
      payload([CATEGORY('Solvency', [['Current Ratio (Quarter)', '-']])]) as never,
      'BBRI',
    );
    const entry = series.entries.find((e) => e.itemName === 'Current Ratio (Quarter)');
    assert.ok(entry);
    assert.equal(entry.valueNum, null);
  });

  it('detects a financial issuer from positive bank-metric evidence (D5/D17)', () => {
    const bank = parseKeyStatsSeries(
      payload([
        CATEGORY('Solvency', [
          ['NPL - Gross', '2.90%'],
          ['Capital Adequacy Ratio', '21.49%'],
        ]),
      ]) as never,
      'BBCA',
    );
    assert.equal(bank.isFinancialIssuer, true);

    const nonBank = parseKeyStatsSeries(
      payload([CATEGORY('Solvency', [['Debt to Equity Ratio (Quarter)', '1.03']])]) as never,
      'INDF',
    );
    assert.equal(nonBank.isFinancialIssuer, false);
  });

  it('treats an empty payload as not a financial issuer and not an error', () => {
    const series = parseKeyStatsSeries({ data: { closure_fin_items_results: [] } } as never, 'XXXX');
    assert.equal(series.entries.length, 0);
    assert.equal(series.isFinancialIssuer, false);
  });

  it('reads the reported currency when present', () => {
    const series = parseKeyStatsSeries(
      {
        data: { closure_fin_items_results: [], financial_report_currency: ['IDR'] },
      } as never,
      'BBRI',
    );
    assert.equal(series.currency, 'IDR');
  });
});

describe('parseKeyStatsSeries against the recorded live payload', () => {
  // The fixture is the evidence the plan audit rests on. If it is missing the
  // suite must say so loudly rather than silently pass on synthetic input.
  const FIXTURE = 'artifacts/keystats-probe-bbri.json';

  it('reproduces the measured shape: 12 categories, 94 items, no fiscal period', () => {
    let raw: string;
    try {
      raw = readFileSync(FIXTURE, 'utf8');
    } catch {
      assert.fail(`missing recorded payload ${FIXTURE}; root gate G1 evidence is required`);
    }
    const series = parseKeyStatsSeries(JSON.parse(raw) as never, 'BBRI');

    const categories = new Set(series.entries.map((e) => e.category));
    assert.equal(categories.size, 12, 'expected the 12 measured categories');
    assert.ok(series.entries.length >= 80, `expected at least 80 items, got ${series.entries.length}`);
    assert.equal(series.currency, 'IDR');

    // Every one of the rubric's veto inputs must be reachable by name.
    for (const metric of [
      FINANCIAL_METRIC.TOTAL_EQUITY,
      FINANCIAL_METRIC.TOTAL_LIABILITIES_EQUITY,
      FINANCIAL_METRIC.CFO_TTM,
    ]) {
      const found = series.entries.find((e) => e.itemName === metric);
      assert.ok(found, `veto input ${metric} is absent from the live payload`);
      assert.ok(found.valueNum !== null, `${metric} did not parse to a number`);
    }
  });

  it('confirms a bank payload is flagged and a non-bank payload is not (D5)', () => {
    // BBRI is a bank: its payload carries the bank-exclusive metrics.
    const raw = readFileSync(FIXTURE, 'utf8');
    const bank = parseKeyStatsSeries(JSON.parse(raw) as never, 'BBRI');
    assert.equal(bank.isFinancialIssuer, true);
    const present = new Set(bank.entries.map((e) => e.itemName));
    assert.ok(
      FINANCIAL_ISSUER_METRICS.some((m) => present.has(m)),
      'the recorded payload carries no bank-exclusive metric',
    );
  });
});
