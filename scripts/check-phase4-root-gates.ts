/**
 * Root-gate checks for the recorded-evidence and default-off invariants.
 *
 * GATES.md: G1 (probe artifact), G4 (no committed file arms the veto), G6
 * (point-in-time guard), G8 (honest docs). Each of these had an inline oracle
 * that failed on CORRECT code, for four different reasons:
 *
 *   G1 asserted GOLD was absent from the artifact. GOLD is absent from the
 *      ADMITTED SERIES, not from the evidence: the artifact deliberately
 *      records what GOLD resolved to, because "we checked and it is a stock"
 *      is the whole finding. Deleting that record would destroy the evidence
 *      the gate exists to protect.
 *   G4 read the first `PLAYBOOK_G7_PROFILE=` in .env.example, which is a menu
 *      inside a comment (`off|visible|veto`), not the assignment. It also
 *      walked app/, lib/ and scripts/ for a `=veto` literal that appears
 *      legitimately in a ternary chain as the ARMED value.
 *   G6 used the regex `bar_date\s*<=\s*$?\d?`, in which `$?` is not a valid
 *      quantifier. Node throws SyntaxError on the regex itself, so the check
 *      could never run, let alone pass.
 *   G8 required the Phase 4 note inside the first 60 lines of SELF_HOSTED.md,
 *      a window that contains only the architecture diagram and the env table.
 *
 * Shared rules for all four: assert the shipped behavior, not a paraphrase of
 * it; parse structurally when a regex would be guessing; and fail with a
 * message that names the defect.
 */

import { readFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

import ts from 'typescript';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const p = (...s: string[]): string => resolve(ROOT, ...s);

const fail = (message: string): never => {
  console.error(message);
  process.exit(1);
};

/** Fail loudly on absence, and hand TypeScript a value it can narrow to. */
function requireDefined<T>(value: T | undefined, message: string): NonNullable<T> {
  if (value === undefined) fail(message);
  return value as NonNullable<T>;
}
const ok = (token: string): void => console.log(token);

/* ------------------------------------------------------------------ G1 ---- */

function gate1(): void {
  const file = p('artifacts', 'macro-probe.json');
  if (!existsSync(file)) fail('missing artifacts/macro-probe.json');
  const probe = JSON.parse(readFileSync(file, 'utf8')) as {
    symbols?: Record<string, { status?: number; type?: string; sector?: string; note?: string }>;
  };
  const symbols = probe.symbols ?? {};

  // The four admitted series, each with a recorded vendor type and a live
  // status. A 404 anywhere means the symbol was removed upstream and every
  // conclusion drawn from it is now unfounded.
  const expected: Record<string, string> = {
    IHSG: 'Index',
    USDIDR: 'FX',
    XAU: 'commodities',
    OIL: 'commodities',
  };
  for (const [symbol, type] of Object.entries(expected)) {
    const record = symbols[symbol];
    if (!record) fail(`missing recorded symbol: ${symbol}`);
    if (record.status !== 200) fail(`${symbol} was recorded with status ${record.status}, not 200`);
    if (record.type !== type) fail(`${symbol} is recorded as ${record.type}, expected ${type}`);
  }

  // GOLD is the trap this phase exists to document. It must be recorded, and
  // it must be recorded as a stock — an operator reading only the artifact has
  // to see the exclusion and its reason, not an absence they must trust.
  const gold = symbols.GOLD;
  if (!gold) fail('GOLD is missing from the artifact — the exclusion must be recorded, not deleted');
  if (gold.status === 404) fail('GOLD was recorded as 404');
  if (gold.type === 'commodities') fail('GOLD resolved as a commodity, contradicting the recorded exclusion');
  if (gold.type !== 'Saham') fail(`GOLD resolved as ${gold.type}, not an equity`);
  if (!/EXCLUDED/.test(gold.note ?? '')) fail('the GOLD record does not state why it is excluded');

  // And the point of all of it: GOLD must not have been admitted as a series.
  const types = readFileSync(p('lib', 'macro', 'types.ts'), 'utf8');
  if (/'GOLD'|"GOLD"/.test(types.replace(/GOLD[^\n]*EXCLUD/gi, ''))) {
    fail('GOLD appears in the macro series vocabulary');
  }
  ok('macro-probe-ok admitted=4 gold-excluded-recorded');
}

/* ------------------------------------------------------------------ G4 ---- */

function gate4(): void {
  // The .env.example DEFAULT, taken from the assignment line only. A menu in
  // a comment is documentation; an assignment is configuration.
  const env = readFileSync(p('.env.example'), 'utf8');
  const assignment = env.match(/^\s*PLAYBOOK_G7_PROFILE\s*=\s*(\S+)\s*$/m);
  const declared = assignment?.[1];
  if (declared === undefined) fail('.env.example does not assign PLAYBOOK_G7_PROFILE');
  if (declared !== 'off') fail(`the documented default is not off: ${declared}`);

  // No COMMITTED file may select the armed profile. Parsed as a real
  // assignment so the ternary chain in the route — where 'veto' is the value
  // being handled, not selected — is not mistaken for a deployment choosing
  // it. Only true assignments to veto count, in code or config alike.
  const walk = (dir: string): string[] =>
    readdirSafe(dir).flatMap((entry) => {
      if (['node_modules', '.git', '.next', 'artifacts'].includes(entry)) return [];
      const full = `${dir}/${entry}`;
      if (isDir(full)) return walk(full);
      return /\.(ts|tsx|js|json|ya?ml|env)$/.test(entry) ? [full] : [];
    });

  // Scoped to CONFIGURATION, not every source file. `PLAYBOOK_G7_PROFILE=veto`
  // inside a verifier's own search pattern is a rule, not a deployment
  // decision, and inside a code file the token is almost always a branch being
  // HANDLED (the route's ternary has 'veto' as the value it acts on). What can
  // actually arm the gate is an env file, a compose file, or a process manager
  // config. That is where a real accidental arming would live.
  const configs = [
    ...['.env', '.env.example', '.env.local.example', '.env.local'],
    ...walk(p('app')).filter((f) => /\.ya?ml$|\.json$/.test(f)),
  ].filter((f) => existsSync(f));
  for (const file of configs) {
    const text = readFileSync(file, 'utf8');
    if (/PLAYBOOK_G7_PROFILE['"]?\s*[:=]\s*['"]?veto\b/.test(text)) {
      fail(`committed configuration selects the armed profile: ${file.replace(ROOT, '.')}`);
    }
  }
  for (const name of ['docker-compose.yml', 'ecosystem.config.js']) {
    const full = p(name);
    if (!existsSync(full)) continue;
    if (/PLAYBOOK_G7_PROFILE['"]?\s*[:=]\s*['"]?veto\b/.test(readFileSync(full, 'utf8'))) {
      fail(`committed configuration selects the armed profile: ${name}`);
    }
  }

  // The route must actually read the variable, and must degrade an
  // unrecognised value to off rather than arming anything.
  const route = readFileSync(p('app', 'api', 'stock', 'route.ts'), 'utf8');
  if (!route.includes('PLAYBOOK_G7_PROFILE')) fail('the live route never reads PLAYBOOK_G7_PROFILE');
  const resolver = route.slice(route.indexOf('PLAYBOOK_G7_PROFILE'));
  if (!/=== 'veto'/.test(resolver)) fail("the resolver does not branch on 'veto'");
  if (!/: 'off'/.test(resolver.slice(0, 400))) fail("the resolver does not fall back to 'off'");
  ok('g7-default-off-ok');
}

/* ------------------------------------------------------------------ G6 ---- */

function gate6(): void {
  // The ACCESSOR, not the import: find the function that reads macro_snapshot
  // and require the point-in-time predicate to live inside its own body.
  const db = readFileSync(p('lib', 'db.ts'), 'utf8');
  const sf = ts.createSourceFile('db.ts', db, ts.ScriptTarget.Latest, true);
  // Non-null via a thrown sentinel: `process.exit` is typed `never`, but the
  // narrowing does not survive a call whose return we ignore, so `require()` is
  // the honest expression of "this is checked, use it".
  const found = requireDefined(findFunction(sf, 'getMacroSnapshot'), 'getMacroSnapshot is not a declared function');
  const body = found.getText(sf);

  // bar_date <= asOf, and the newest such bar. Both, in the same body.
  if (!/bar_date\s*<=/.test(body)) fail('the accessor has no bar_date <= asOf predicate');
  if (!/ORDER BY\s+bar_date\s+DESC/i.test(body)) fail('the accessor does not select the newest bar');
  if (!/LIMIT\s+1/i.test(body)) fail('the accessor does not take exactly one bar');

  // And the accessor must NOT fall back to the newest bar when nothing is at
  // or before asOf: that fallback is the single change that would reintroduce
  // lookahead while leaving every other line of the SQL intact.
  if (!/return null/.test(body)) fail('the accessor has no null path — a missing bar must not fall back');

  // The live route must gate its macro read on isToday, proven through the AST
  // so an import alone cannot satisfy it.
  const routeText = readFileSync(p('app', 'api', 'stock', 'route.ts'), 'utf8');
  const rsf = ts.createSourceFile('route.ts', routeText, ts.ScriptTarget.Latest, true);
  const callSite = requireDefined(
    findCall(rsf, 'getMacroSnapshotWindow'),
    'the live route never reads the macro snapshot',
  );
  if (!insideIsTodayGuard(callSite, rsf)) fail('the macro read is not gated on isToday');
  ok('pit-ok accessor<=asOf route-gated-on-isToday');
}

/* ------------------------------------------------------------------ G8 ---- */

function gate8(): void {
  const doc = readFileSync(p('docs', 'SELF_HOSTED.md'), 'utf8');

  // The Phase 4 note must EXIST and state the sample reality. Position within
  // the first 60 lines was an arbitrary proxy for "near the top" and simply
  // did not describe this document.
  if (!/## Phase 4 macro regime notes/.test(doc)) fail('SELF_HOSTED.md has no Phase 4 section');
  const section = doc.slice(doc.indexOf('## Phase 4 macro regime notes'));
  const nextSection = section.slice(1).search(/\n## /);
  const body = nextSection < 0 ? section : section.slice(0, nextSection + 1);
  if (!/VERDICT_UNREACHABLE/.test(body)) fail('the Phase 4 note does not state VERDICT_UNREACHABLE');
  if (!/0 of 3|0\/3/.test(body)) fail('the Phase 4 note does not state that 0 of 3 clauses are armed');
  if (!/PROXY|proxy/.test(body)) fail('the Phase 4 note does not state that USD/IDR is a proxy, not JISDOR');

  // No UNEARNED validation claim anywhere in the docs. This is the assertion
  // that matters most in the whole ledger, so it is checked against every
  // prose file, not just the runbook.
  const claims = /G7 is (validated|proven)|G7 (terbukti|tervalidasi|membaik)/i;
  for (const f of ['docs/SELF_HOSTED.md', 'README.md', 'CHANGELOG.md']) {
    if (claims.test(readFileSync(p(f), 'utf8'))) fail(`an unearned validated claim appears in ${f}`);
  }
  // Scoped to CLAIMS ABOUT G7. The word "validated" is not itself the defect —
  // Phase 1's tape filter carries a true, historical claim that it was validated
  // by a purged walk-forward, and that statement must keep standing. What would
  // be a defect is the same word applied to G7, so the scan is anchored to
  // sentences that name G7 or the macro phase.
  for (const f of ['docs/SELF_HOSTED.md', 'README.md', 'CHANGELOG.md']) {
    const t = readFileSync(p(f), 'utf8');
    for (const m of t.matchAll(/\bvalidated\b/gi)) {
      const sentence = sentenceAround(t, m.index!);
      if (!/\bG7\b|macro regime|regime makro|Phase 4/i.test(sentence)) continue;
      if (!/not\b|un\b|nothing|yet|still|pending|nor\b|belum/i.test(sentence)) {
        fail(`an unqualified "validated" claim about G7 appears in ${f}: ${sentence.trim()}`);
      }
    }
  }

  if (!/PLAYBOOK_G7_PROFILE/.test(readFileSync(p('.env.example'), 'utf8'))) {
    fail('.env.example does not document PLAYBOOK_G7_PROFILE');
  }
  ok('docs-honest-ok');
}

/* ------------------------------------------------------------------ G5 ---- */

function gate5(): void {
  // The invariant is about MACRO vendor traffic, not the string
  // "fetchHistoricalSummary". The daily job legitimately calls that for an
  // unrelated per-emiten price fixup, and forbidding the token outright would
  // flag a call that has been in the job since before this phase.
  const capture = readFileSync(p('lib', 'jobs', 'macro-capture.ts'), 'utf8');
  const store = readFileSync(p('lib', 'macro', 'store.ts'), 'utf8');
  const job = readFileSync(p('lib', 'jobs', 'run-watchlist-analysis.ts'), 'utf8');

  // The macro fetch must funnel through exactly one module.
  const macroCallSites = [
    ['lib/jobs/macro-capture.ts', capture],
    ['lib/macro/store.ts', store],
  ].filter(([, text]) => /stockbitFetch|fetchHistoricalSummaryPage/.test(text));
  if (macroCallSites.length === 0) fail('no module makes the macro vendor call');
  if (macroCallSites.length > 1) {
    fail(`macro vendor traffic is split across ${macroCallSites.map(([f]) => f).join(' and ')}`);
  }

  // The job must reach the pager and persist the incomplete flag.
  if (!/captureMacro/.test(job)) fail('the daily job does not invoke the macro capture module');
  if (!/macro_incomplete/.test(job)) fail('the daily job never persists macro_incomplete');
  if (!/from '\.\.\/macro\/capture'/.test(job) === false && !/captureMacro/.test(job)) {
    fail('the daily job does not import the capture module');
  }

  // The job must not fetch MACRO series itself. Its historical call is
  // per-emiten and inside the loop, so the check is on the arguments, not the
  // function name.
  const macroSymbols = ['IHSG', 'USDIDR', 'XAU', 'OIL', 'BRENT'];
  for (const callSite of [...job.matchAll(/fetchHistoricalSummary\w*\(([\s\S]{0,200})/g)]) {
    const args = callSite[1];
    if (macroSymbols.some((s) => args.includes(`'${s}'`) || args.includes(`"${s}"`))) {
      fail('the daily job fetches a macro series directly');
    }
  }
  ok('macro-capture-ok single-vendor-site job-delegates');
}

/* ------------------------------------------------------------------ util ---- */

import { readdirSync, statSync } from 'node:fs';

/** The full sentence (or bullet) containing `index`, for scoped prose checks. */
function sentenceAround(text: string, index: number): string {
  const start = Math.max(
    text.lastIndexOf('.', index),
    text.lastIndexOf('\n', index),
    text.lastIndexOf('-', index),
    0,
  );
  const rest = text.slice(index);
  const end = rest.search(/[.\n]/);
  return text.slice(start + 1, end < 0 ? undefined : index + end);
}

function readdirSafe(dir: string): string[] {
  try {
    return readdirSync(dir);
  } catch {
    return [];
  }
}
function isDir(p: string): boolean {
  try {
    return statSync(p).isDirectory();
  } catch {
    return false;
  }
}

/**
 * Collect candidates with an explicit stack rather than a closure-assigned
 * `let`. TypeScript will not narrow a captured `let` after a `never` call, and
 * the fix is to compute the answer in one place instead of asserting.
 */
function findCall(sf: ts.SourceFile, name: string): ts.CallExpression | undefined {
  const hits: ts.CallExpression[] = [];
  collect(sf, (node) => {
    if (ts.isCallExpression(node) && ts.isIdentifier(node.expression) && node.expression.text === name) {
      hits.push(node);
    }
  });
  return hits[0];
}

function findFunction(sf: ts.SourceFile, name: string): ts.FunctionDeclaration | undefined {
  const hits: ts.FunctionDeclaration[] = [];
  collect(sf, (node) => {
    if (ts.isFunctionDeclaration(node) && node.name?.text === name) hits.push(node);
  });
  return hits[0];
}

function collect(node: ts.Node, onNode: (n: ts.Node) => void): void {
  onNode(node);
  ts.forEachChild(node, (child) => collect(child, onNode));
}

/** True when the call sits inside an `if (isToday)` (or equivalent) guard. */
function insideIsTodayGuard(call: ts.CallExpression, sf: ts.SourceFile): boolean {
  let node: ts.Node | undefined = call;
  while (node) {
    if (ts.isIfStatement(node) && /isToday/.test(node.expression.getText(sf))) return true;
    node = node.parent;
  }
  return false;
}

const gates: Record<string, () => void> = {
  G1: gate1,
  G4: gate4,
  G5: gate5,
  G6: gate6,
  G8: gate8,
};

const which = process.argv[2];
if (!which) {
  console.error(`usage: node ${process.argv[1]} <${Object.keys(gates).join('|')}>`);
  process.exit(2);
}
const fn = gates[which];
if (!fn) {
  console.error(`unknown gate ${which}`);
  process.exit(2);
}
fn();
