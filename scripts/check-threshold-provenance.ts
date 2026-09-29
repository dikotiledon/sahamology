/**
 * node-1.2 G2 — no threshold constant is frozen without measured provenance.
 *
 * The gate that this replaces was an inline `node -e` and it failed twice for
 * reasons that had nothing to do with the code:
 *
 *   1. It required `measuredFrom` to appear AFTER the clause name on the same
 *      line. The real file has `{ bound: null, measuredFrom: null, direction: 1 }`
 *      — the field IS there, but the assertion was written backwards, so it
 *      could only ever fail on correct code.
 *   2. The replacement still failed, because the slice bound was
 *      `indexOf('\n};')` inside a single-quoted shell string, where `\n`
 *      survives as a literal backslash-n rather than a newline. Inline
 *      `node -e` with a regex and a quote character is exactly the combination
 *      the skill warns about; a file is the fix, not another escape.
 *
 * What is actually being asserted:
 *
 *   - every clause in the frozen vocabulary has a bound entry,
 *   - each entry carries a `measuredFrom` field, so a bound can always be
 *     traced to the study that produced it, and
 *   - a clause with `bound: null` also has `measuredFrom: null`. This is the
 *     load-bearing one: the correlation study armed 0 of 3 clauses, so an
 *     entry claiming a frozen bound or a provenance string while the study
 *     reports no candidate is precisely the "armed-looking hollow clause"
 *     this phase is supposed to prevent.
 *
 * The classifier is parsed, not grepped, so a clause mentioned in a comment or
 * a doc comment cannot satisfy the check.
 */

import { readFileSync } from 'node:fs';
import ts from 'typescript';

const fail = (message: string): never => {
  console.error(message);
  process.exit(1);
};

/** Fail loudly on absence, and hand TypeScript a value it can narrow to. */
function requireDefined<T>(value: T | undefined | null, message: string): NonNullable<T> {
  if (value === undefined || value === null) fail(message);
  return value as NonNullable<T>;
}

const CLAUSES = ['USD_IDR_DETERIORATING', 'IHSG_BROAD_WEAKNESS', 'SECTOR_COMMODITY_ADVERSE'] as const;

const source = readFileSync('lib/macro/classifier.ts', 'utf8');
const sf = ts.createSourceFile('classifier.ts', source, ts.ScriptTarget.Latest, true);

let declaration: ts.VariableStatement | undefined;
const visit = (node: ts.Node): void => {
  if (
    ts.isVariableStatement(node) &&
    node.declarationList.declarations.some((d) => ts.isIdentifier(d.name) && d.name.text === 'REGIME_THRESHOLD')
  ) {
    declaration = node;
  }
  ts.forEachChild(node, visit);
};
visit(sf);

const found = requireDefined(declaration, 'no REGIME_THRESHOLD block — the thresholds are not frozen at all');
const text = found.getText(sf);

for (const clause of CLAUSES) {
  // The clause's own object literal, taken from the parsed declaration.
  const body = clauseBody(text, clause);

  if (!/measuredFrom/.test(body)) fail(`clause ${clause} has no measuredFrom field`);
  if (!/bound\s*:/.test(body)) fail(`clause ${clause} has no bound field`);

  const boundNull = /bound\s*:\s*null/.test(body);
  const fromNull = /measuredFrom\s*:\s*null/.test(body);
  if (boundNull !== fromNull) {
    fail(
      `clause ${clause} is inconsistent: ` +
        (boundNull
          ? 'the bound is null but a measuredFrom provenance is claimed'
          : 'a bound is frozen without a measuredFrom provenance'),
    );
  }
}

// A frozen bound must name a provenance that actually exists, and the study
// artifact is the only thing allowed to have armed one. `bound: null` is NOT a
// frozen bound: `(?!null)` alone would match it, which is how this check first
// failed on correct code.
const frozen = CLAUSES.filter((c) => /bound\s*:\s*(?!null\b)[-\d.]/.test(clauseBody(text, c)));
if (frozen.length > 0) {
  const study = readFileSync('artifacts/macro-correlation.json', 'utf8');
  for (const clause of frozen) {
    const from = /measuredFrom\s*:\s*['"]([^'"]+)['"]/.exec(clauseBody(text, clause))?.[1] ?? '';
    if (from === '') fail(`clause ${clause} freezes a bound with an empty measuredFrom`);
    if (!study.includes(from)) fail(`clause ${clause} cites provenance ${from}, absent from the study artifact`);
  }
}

/** One clause's object-literal body, taken from the parsed declaration text. */
function clauseBody(text: string, clause: string): string {
  const match = new RegExp(`${clause}\\s*:\\s*\\{([^}]*)\\}`).exec(text);
  return requireDefined(match, `clause ${clause} has no bound entry`)[1];
}

console.log('threshold-provenance-ok');
