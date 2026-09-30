/**
 * Phase 5 ranked-desk oracles.
 *
 * Inline `node -e` gates with regex/quotes fail for the wrong reason (a
 * SyntaxError looks identical to a real defect). Every structural assertion
 * for this phase lives here and is invoked as:
 *
 *   npx tsx --tsconfig tsconfig.test.json scripts/check-phase5-gates.ts <id>
 *
 * `id` is a named check, not a live re-read of the operator's database.
 */
import { createHash } from 'node:crypto';
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import ts from 'typescript';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const p = (...s: string[]): string => resolve(ROOT, ...s);

const EVALUATE_SHA = '6db6a513a1a5cf5861441ceb9661d8603a677a321d70e20db0ae7a811f192ad2';
const PATH_OUTCOME_SHA = '307452fe9028fd9d23e5525e3c5f853a7caed8410b54009c66ad4d5b2fdccf67';

const EXPECTED_DEPS = [
  '@google/genai',
  'bullmq',
  'html-to-image',
  'html2canvas',
  'ioredis',
  'jspdf',
  'jspdf-autotable',
  'lucide-react',
  'mime',
  'next',
  'node-cron',
  'pg',
  'playwright',
  'playwright-extra',
  'puppeteer-extra-plugin-stealth',
  'react',
  'react-dom',
  'recharts',
];

function fail(message: string): never {
  console.error(message);
  process.exit(1);
  throw new Error(message);
}

const ok = (token: string): void => console.log(token);

const sha256 = (file: string): string =>
  createHash('sha256').update(readFileSync(file)).digest('hex');

const read = (rel: string): string => readFileSync(p(rel), 'utf8');

function walk(dir: string, pred: (name: string) => boolean): string[] {
  return readdirSync(dir).flatMap((entry) => {
    if (['node_modules', '.git', '.next', 'artifacts'].includes(entry)) return [];
    const full = `${dir}/${entry}`;
    if (statSync(full).isDirectory()) return walk(full, pred);
    return pred(entry) ? [full] : [];
  });
}

function assignmentValue(text: string, name: string): string | undefined {
  const m = text.match(new RegExp(`^\\s*${name}\\s*=\\s*(\\S+)\\s*$`, 'm'));
  return m?.[1];
}

function sourceFile(rel: string): ts.SourceFile {
  return ts.createSourceFile(rel, read(rel), ts.ScriptTarget.Latest, true);
}

function collect(node: ts.Node, onNode: (n: ts.Node) => void): void {
  onNode(node);
  ts.forEachChild(node, (child) => collect(child, onNode));
}

function functionBody(rel: string, name: string): string {
  const sf = sourceFile(rel);
  let found: ts.FunctionDeclaration | ts.FunctionExpression | ts.MethodDeclaration | undefined;
  collect(sf, (node) => {
    if (ts.isFunctionDeclaration(node) && node.name?.text === name) found = node;
    if (
      ts.isVariableDeclaration(node) &&
      ts.isIdentifier(node.name) &&
      node.name.text === name &&
      node.initializer &&
      (ts.isFunctionExpression(node.initializer) || ts.isArrowFunction(node.initializer))
    ) {
      found = node.initializer as unknown as ts.FunctionDeclaration;
    }
  });
  if (!found) fail(`${rel} has no function ${name}`);
  return found.getText(sf);
}

function objectLiteralNamed(rel: string, name: string): string {
  const sf = sourceFile(rel);
  let text: string | undefined;
  collect(sf, (node) => {
    if (
      ts.isVariableDeclaration(node) &&
      ts.isIdentifier(node.name) &&
      node.name.text === name &&
      node.initializer &&
      ts.isObjectLiteralExpression(node.initializer)
    ) {
      text = node.initializer.getText(sf);
    }
    if (
      ts.isVariableDeclaration(node) &&
      ts.isIdentifier(node.name) &&
      node.name.text === name &&
      node.initializer &&
      ts.isAsExpression(node.initializer) &&
      ts.isObjectLiteralExpression(node.initializer.expression)
    ) {
      text = node.initializer.expression.getText(sf);
    }
  });
  if (!text) fail(`${rel} has no object literal named ${name}`);
  return text;
}

function requireFiles(files: string[]): void {
  for (const f of files) {
    if (!existsSync(p(f))) fail(`missing ${f}`);
  }
}

/* ------------------------------------------------------------------ probe -- */

function probe(): void {
  const file = p('artifacts', 'desk-probe.example.json');
  if (!existsSync(file)) fail('missing artifacts/desk-probe.example.json');
  const artifact = JSON.parse(readFileSync(file, 'utf8')) as {
    generatedAt?: string;
    ranking?: { keys?: string[]; stanceTier?: Record<string, number>; persistenceInComparator?: boolean };
    journal?: { columns?: string[]; forbiddenColumns?: string[]; outcomeType?: string; unscored?: unknown };
    scorer?: { function?: string; module?: string; forwardWindow?: string };
    skipped?: Array<{ symbol?: string; reason?: string }>;
    rows?: Array<{ stance?: string }>;
  };

  if (artifact.generatedAt !== '1970-01-01T00:00:00.000Z') {
    fail(`generatedAt is not the pinned stamp: ${artifact.generatedAt}`);
  }
  const keys = artifact.ranking?.keys ?? [];
  if (keys[0] !== 'stance' || keys[1] !== 'rr') {
    fail(`ranking keys are ${JSON.stringify(keys)}, expected stance then rr`);
  }
  const tier = artifact.ranking?.stanceTier ?? {};
  const expectedTier = { ENTER: 0, WAIT: 1, TAKE_PROFIT: 2, INVALIDATED: 3, AVOID: 4 };
  for (const [stance, rank] of Object.entries(expectedTier)) {
    if (tier[stance] !== rank) fail(`stance tier ${stance} is ${tier[stance]}, expected ${rank}`);
  }
  if (artifact.ranking?.persistenceInComparator !== false) {
    fail('persistence must be excluded from the comparator in the fixture');
  }
  const columns = artifact.journal?.columns ?? [];
  for (const col of ['outcome', 'r_multiple', 'stance', 'rr', 'gates']) {
    if (!columns.includes(col)) fail(`journal columns omit ${col}`);
  }
  if (artifact.journal?.forbiddenColumns?.includes('card') !== true) {
    fail('the fixture does not record that card is a forbidden journal column');
  }
  if (artifact.journal?.outcomeType !== 'PathExit') fail('outcomeType is not PathExit');
  if (artifact.journal?.unscored !== null) fail('unscored is not JSON null');
  if (artifact.scorer?.function !== 'scorePath') fail('the fixture does not name scorePath');
  if (artifact.scorer?.module !== 'lib/playbook/path-outcome.ts') {
    fail('the fixture does not name the canonical scorer module');
  }
  if (artifact.scorer?.forwardWindow !== 'date > as_of') {
    fail('the fixture does not pin the strict forward window');
  }
  const usd = (artifact.skipped ?? []).find((s) => s.symbol === 'USDIDR');
  if (!usd) fail('USDIDR is not recorded as skipped');
  if (usd.reason !== 'non-idx') fail(`USDIDR skip reason is ${usd.reason}, not non-idx`);
  const stances = new Set((artifact.rows ?? []).map((r) => r.stance));
  for (const stance of ['ENTER', 'WAIT', 'TAKE_PROFIT', 'INVALIDATED', 'AVOID']) {
    if (!stances.has(stance)) fail(`the fixture has no ${stance} row`);
  }
  ok('desk-probe-ok');
}

function probeNoSecret(): void {
  const t = read('artifacts/desk-probe.example.json');
  if (/eyJ[A-Za-z0-9_-]{10,}/.test(t)) fail('the probe artifact contains a JWT-like string');
  if (/authorization/i.test(t)) fail('the probe artifact mentions an authorization header');
  if (/STOCKBIT_JWT|AUTH_SECRET|POSTGRES_PASSWORD/i.test(t)) {
    fail('the probe artifact mentions a credential name');
  }
  ok('probe-no-secret-ok');
}

/* ---------------------------------------------------------------- ranking -- */

function rankingFrozen(): void {
  requireFiles(['lib/desk/ranking.ts', 'lib/desk/ranking.test.ts']);
  const src = read('lib/desk/ranking.ts');
  const literal = objectLiteralNamed('lib/desk/ranking.ts', 'STANCE_TIER');
  const expected: Record<string, number> = {
    ENTER: 0,
    WAIT: 1,
    TAKE_PROFIT: 2,
    INVALIDATED: 3,
    AVOID: 4,
  };
  for (const [stance, rank] of Object.entries(expected)) {
    const re = new RegExp(`${stance}\\s*:\\s*${rank}\\b`);
    if (!re.test(literal)) fail(`STANCE_TIER.${stance} is not ${rank}`);
  }
  if (!/export function compareDeskRows/.test(src)) fail('compareDeskRows is not exported');
  if (!/export function rankDeskRows/.test(src)) fail('rankDeskRows is not exported');
  if (/persistence/i.test(src) && /STANCE_TIER|compareDeskRows/.test(src.split('persistence')[0] ?? '')) {
    // persistence may appear in a comment forbidding it; a sort-key use is the defect.
  }
  const compare = functionBody('lib/desk/ranking.ts', 'compareDeskRows');
  if (/persistence/i.test(compare)) fail('compareDeskRows reads persistence — it is display-only');
  if (!/localeCompare/.test(compare)) fail('compareDeskRows has no emiten localeCompare tie-break');
  if (!/asOf/.test(compare)) fail('compareDeskRows has no asOf tie-break');
  ok('ranking-frozen-ok');
}

function rankingNullRr(): void {
  requireFiles(['lib/desk/ranking.ts']);
  const compare = functionBody('lib/desk/ranking.ts', 'compareDeskRows');
  if (!/Number\.isFinite/.test(compare)) fail('compareDeskRows does not treat non-finite rr as null-like');
  if (!/rr/.test(compare)) fail('compareDeskRows never reads rr');
  ok('ranking-null-rr-ok');
}

function rankingNoNan(): void {
  requireFiles(['lib/desk/ranking.ts', 'lib/desk/ranking.test.ts']);
  const testSrc = read('lib/desk/ranking.test.ts');
  if (!/NaN/.test(testSrc)) fail('ranking tests never assert the comparator against NaN');
  ok('ranking-nan-test-ok');
}

function rankingClosedOut(): void {
  requireFiles(['lib/desk/ranking.test.ts']);
  const testSrc = read('lib/desk/ranking.test.ts');
  if (!/TAKE_PROFIT/.test(testSrc)) fail('ranking tests never mention TAKE_PROFIT');
  if (!/INVALIDATED/.test(testSrc)) fail('ranking tests never mention INVALIDATED');
  if (!/AVOID/.test(testSrc)) fail('ranking tests never mention AVOID');
  ok('ranking-closed-out-ok');
}

/* ----------------------------------------------------------------- explain -- */

function explainUniverse(): void {
  requireFiles(['lib/desk/assemble.ts', 'lib/desk/assemble.test.ts']);
  const src = read('lib/desk/assemble.ts');
  if (!/resolveEmitensToAnalyze/.test(src)) {
    fail('assemble.ts does not call resolveEmitensToAnalyze');
  }
  if (/isIdxEmiten|NON_IDX_CODES/.test(src)) {
    fail('assemble.ts reimplements a second non-IDX filter');
  }
  ok('desk-universe-ok');
}

function explainSkipped(): void {
  requireFiles(['lib/desk/assemble.test.ts']);
  const testSrc = read('lib/desk/assemble.test.ts');
  if (!/USDIDR/.test(testSrc)) fail('assemble tests never mention USDIDR');
  if (!/non-idx/.test(testSrc)) fail('assemble tests never assert the non-idx skip reason');
  ok('desk-skipped-ok');
}

function explainUnexplained(): void {
  requireFiles(['lib/desk/explain.ts', 'lib/desk/explain.test.ts']);
  const src = read('lib/desk/explain.ts');
  if (!/unexplained/.test(src)) fail('explain.ts has no unexplained predicate');
  if (!/DEFECT/.test(src)) fail('explain.ts has no DEFECT explanation for unexplained rows');
  if (!/TAKE_PROFIT/.test(src)) {
    fail('explain.ts does not exclude TAKE_PROFIT from unexplained');
  }
  const testSrc = read('lib/desk/explain.test.ts');
  if (!/failedGates/.test(testSrc)) fail('explain tests never mention failedGates');
  if (!/unexplained/.test(testSrc)) fail('explain tests never assert unexplained');
  if (!/TAKE_PROFIT with empty failedGates is explained/.test(testSrc)) {
    fail('explain tests never pin TAKE_PROFIT as explained');
  }
  ok('desk-unexplained-ok');
}

function explainNextAction(): void {
  requireFiles(['lib/desk/next-action.ts']);
  const src = read('lib/desk/next-action.ts');
  if (!/do-nothing/.test(src)) fail('next-action.ts has no do-nothing kind');
  if (!/manage/.test(src)) fail('next-action.ts has no manage kind');
  if (!/TAKE_PROFIT/.test(src)) fail('next-action.ts does not special-case TAKE_PROFIT');
  ok('desk-next-action-ok');
}

function explainAvoidFilter(): void {
  requireFiles(['lib/desk/assemble.ts', 'lib/desk/assemble.test.ts']);
  const src = read('lib/desk/assemble.ts');
  if (!/export function visibleDeskRows/.test(src)) {
    fail('assemble.ts does not export visibleDeskRows');
  }
  if (!/stance !== 'AVOID'/.test(src)) {
    fail('visibleDeskRows does not hide AVOID when the toggle is off');
  }
  const testSrc = read('lib/desk/assemble.test.ts');
  if (!/visibleDeskRows hides AVOID by default/.test(testSrc)) {
    fail('assemble tests never pin AVOID default-hidden');
  }
  if (!/TAKE_PROFIT/.test(testSrc)) {
    fail('assemble tests never keep TAKE_PROFIT visible beside the AVOID filter');
  }
  ok('desk-avoid-filter-ok');
}

/* ----------------------------------------------------------------- outcome -- */

function outcomeCanonical(): void {
  requireFiles(['lib/desk/outcome.ts']);
  const src = read('lib/desk/outcome.ts');
  if (!src.includes('../playbook/path-outcome')) {
    fail("outcome.ts does not import scorePath from '../playbook/path-outcome'");
  }
  if (/function scorePath/.test(src)) fail('outcome.ts reimplements scorePath');
  ok('outcome-canonical-ok');
}

function outcomePathExit(): void {
  requireFiles(['lib/desk/outcome.ts', 'lib/desk/outcome.test.ts']);
  const src = read('lib/desk/outcome.ts');
  if (!/PathExit/.test(src)) fail('outcome.ts never names PathExit');
  const testSrc = read('lib/desk/outcome.test.ts');
  for (const exit of ['invalidation', 'max', 'r1', 'expiry']) {
    if (!testSrc.includes(`'${exit}'`) && !testSrc.includes(`"${exit}"`)) {
      fail(`outcome tests never mention PathExit ${exit}`);
    }
  }
  ok('outcome-pathexit-ok');
}

function outcomeEligibility(): void {
  requireFiles(['lib/desk/outcome.ts', 'lib/desk/outcome.test.ts']);
  const src = read('lib/desk/outcome.ts');
  if (!/isCompleteHorizon/.test(src)) fail('outcome.ts does not call isCompleteHorizon');
  if (!/horizonSessions/.test(src)) fail('outcome.ts does not window bars via horizonSessions');
  if (!/ENTER/.test(src)) fail('outcome.ts does not gate on ENTER');
  const testSrc = read('lib/desk/outcome.test.ts');
  if (!/WAIT/.test(testSrc) && !/AVOID/.test(testSrc)) {
    fail('outcome tests never assert a non-ENTER row is ineligible');
  }
  ok('outcome-eligibility-ok');
}

function outcomeCoerce(): void {
  requireFiles(['lib/desk/numbers.ts', 'lib/desk/numbers.test.ts']);
  const src = read('lib/desk/numbers.ts');
  if (!/export function toFiniteNumber/.test(src)) fail('toFiniteNumber is missing');
  if (!/export function roundRMultiple/.test(src)) fail('roundRMultiple is missing');
  const testSrc = read('lib/desk/numbers.test.ts');
  if (!/1100/.test(testSrc) || !/950/.test(testSrc)) {
    fail('numbers tests never pin the string-NUMERIC false-stop fixture');
  }
  ok('outcome-coerce-ok');
}

/* ---------------------------------------------------------------- backfill -- */

function backfillNull(): void {
  requireFiles(['scripts/backfill-journal-outcomes.ts', 'lib/db.ts']);
  const script = read('scripts/backfill-journal-outcomes.ts');
  if (script.includes("'unscored'") || script.includes('"unscored"')) {
    fail('the backfill writes the invented token unscored');
  }
  if (/r_multiple\s*=\s*0\b/.test(script) || /rMultiple:\s*0\b/.test(script)) {
    fail('the backfill writes a 0 r_multiple sentinel');
  }
  const db = read('lib/db.ts');
  const update = functionBody('lib/db.ts', 'updateDecisionJournalOutcome');
  if (!/outcome IS NULL/.test(update)) fail('updateDecisionJournalOutcome is not gated on outcome IS NULL');
  if (!/RETURNING/.test(update)) fail('updateDecisionJournalOutcome has no RETURNING clause');
  if (!/listUnscoredEnterJournal/.test(db)) fail('listUnscoredEnterJournal is missing');
  if (!/listDecisionJournalByDate/.test(db)) fail('listDecisionJournalByDate is missing');
  void script;
  ok('backfill-null-ok');
}

function backfillIdempotent(): void {
  requireFiles(['scripts/backfill-journal-outcomes.test.ts']);
  const testSrc = read('scripts/backfill-journal-outcomes.test.ts');
  if (!/IS NULL/.test(testSrc) && !/already scored/.test(testSrc) && !/idempotent/.test(testSrc)) {
    fail('backfill tests never assert idempotence');
  }
  ok('backfill-idempotent-ok');
}

function backfillRound(): void {
  requireFiles(['lib/desk/numbers.ts', 'scripts/backfill-journal-outcomes.ts']);
  const numbers = read('lib/desk/numbers.ts');
  if (!/toFixed\(\s*4\s*\)/.test(numbers)) fail('roundRMultiple is not four decimal places');
  const script = read('scripts/backfill-journal-outcomes.ts');
  if (!/roundRMultiple/.test(script)) fail('the backfill does not call roundRMultiple');
  if (!/updateDecisionJournalOutcome/.test(script)) fail('the backfill never calls the outcome updater');
  ok('backfill-round-ok');
}

function backfillHorizon(): void {
  requireFiles(['scripts/backfill-journal-outcomes.ts']);
  const script = read('scripts/backfill-journal-outcomes.ts');
  if (!/isCompleteHorizon/.test(script)) fail('the backfill does not call isCompleteHorizon');
  if (!/date > as_of|date > asOf|> as_of|> asOf/.test(script)) {
    fail('the backfill does not filter date > as_of');
  }
  ok('backfill-horizon-ok');
}

function packageBackfillScript(): void {
  const pkg = JSON.parse(read('package.json')) as { scripts?: Record<string, string> };
  const cmd = pkg.scripts?.['backfill:outcomes'];
  if (!cmd) fail('package.json has no backfill:outcomes script');
  if (!/backfill-journal-outcomes\.ts/.test(cmd)) {
    fail('backfill:outcomes does not invoke scripts/backfill-journal-outcomes.ts');
  }
  ok('package-backfill-ok');
}

/* -------------------------------------------------------------------- job -- */

function jobFlatten(): void {
  requireFiles(['lib/jobs/run-watchlist-analysis.ts', 'lib/jobs/journal-write.test.ts']);
  const src = read('lib/jobs/run-watchlist-analysis.ts');
  if (!/buildJournalPayload/.test(src)) fail('the job never calls buildJournalPayload');
  const sf = sourceFile('lib/jobs/run-watchlist-analysis.ts');
  let cardKeyOnSave = false;
  collect(sf, (node) => {
    if (!ts.isCallExpression(node)) return;
    const callee = node.expression.getText(sf);
    if (callee !== 'saveDecisionJournal') return;
    const arg = node.arguments[0];
    if (!arg) return;
    const text = arg.getText(sf);
    if (/\bcard\s*:/.test(text) && !/buildJournalPayload/.test(text)) cardKeyOnSave = true;
    if (ts.isObjectLiteralExpression(arg)) {
      for (const prop of arg.properties) {
        if (ts.isPropertyAssignment(prop) && prop.name.getText(sf) === 'card') cardKeyOnSave = true;
        if (ts.isShorthandPropertyAssignment(prop) && prop.name.text === 'card') cardKeyOnSave = true;
      }
    }
  });
  if (cardKeyOnSave) fail('saveDecisionJournal is still passed a card key');
  ok('job-flatten-ok');
}

function jobJournalError(): void {
  requireFiles(['lib/jobs/run-watchlist-analysis.ts']);
  const src = read('lib/jobs/run-watchlist-analysis.ts');
  if (!/Failed to journal decision card/.test(src)) {
    fail('the job does not log a journal-specific error');
  }
  const journalCatch = src.slice(src.indexOf('Failed to journal decision card'));
  if (!/errors\.push/.test(journalCatch.slice(0, 800))) {
    fail('the journal catch does not push onto errors[]');
  }
  const saveAt = src.indexOf('await saveDecisionJournal');
  const catchAt = src.indexOf('catch (journalError)');
  const outerCatchAt = src.indexOf('} catch (error)', catchAt);
  if (saveAt < 0 || catchAt < 0 || outerCatchAt < 0) {
    fail('cannot locate the journal try/catch around saveDecisionJournal');
  }
  if (/results\.push/.test(src.slice(catchAt, outerCatchAt))) {
    fail('journal catch still counts the emiten as success');
  }
  if (!/results\.push/.test(src.slice(saveAt, catchAt))) {
    fail('a saved journal does not count the emiten as success');
  }
  ok('job-journal-error-ok');
}

function jobBoundary(): void {
  requireFiles(['lib/jobs/run-watchlist-analysis.ts']);
  const src = read('lib/jobs/run-watchlist-analysis.ts');
  for (const token of [
    'getTokenStatus',
    'classifyFundamentals',
    'classifyRegime',
    'openCard',
    'g1Profile',
    'g5Profile',
    'g7Profile',
    'isWeekend',
    'isIdxHoliday',
  ]) {
    if (!src.includes(token)) fail(`the job playbook boundary never mentions ${token}`);
  }
  ok('job-boundary-ok');
}

function jobGuard(): void {
  requireFiles(['lib/jobs/run-watchlist-analysis.ts']);
  const src = read('lib/jobs/run-watchlist-analysis.ts');
  if (/proceeding without the guard/.test(src)) {
    fail('the capture guard still proceeds on a history lookup failure');
  }
  ok('job-guard-ok');
}

function jobUniverse(): void {
  requireFiles(['lib/jobs/run-price-history-backfill.ts', 'lib/jobs/run-price-history-backfill.test.ts']);
  const src = read('lib/jobs/run-price-history-backfill.ts');
  if (!/resolveEmitensToAnalyze/.test(src)) {
    fail('price-history backfill does not use resolveEmitensToAnalyze');
  }
  const testSrc = read('lib/jobs/run-price-history-backfill.test.ts');
  if (!/USDIDR/.test(testSrc)) fail('price-history backfill tests never mention USDIDR');
  ok('job-universe-ok');
}

/* ----------------------------------------------------------------- surface -- */

function surfaceMorning(): void {
  requireFiles(['app/components/MorningCard.tsx', 'lib/desk/assemble.ts']);
  const ui = read('app/components/MorningCard.tsx');
  if (!/enterCount|ENTER/.test(ui)) fail('MorningCard never shows ENTER count');
  if (!/waitCount|WAIT/.test(ui)) fail('MorningCard never shows WAIT count');
  if (!/card\.skipped/.test(ui) || !/non-IDX/.test(ui)) {
    fail('MorningCard never surfaces skipped non-IDX names');
  }
  ok('surface-morning-ok');
}

function surfaceReasons(): void {
  requireFiles(['app/components/DecisionCard.tsx', 'app/components/RankedDeskTable.tsx']);
  const card = read('app/components/DecisionCard.tsx');
  if (/Gate gagal: \{card\.failedGates\.join/.test(card)) {
    fail('DecisionCard still renders failed-gate ids only');
  }
  if (!/g\.reason/.test(card) && !/gate\.reason/.test(card)) {
    fail('DecisionCard never renders a gate reason');
  }
  const table = read('app/components/RankedDeskTable.tsx');
  if (!/unexplained/.test(table)) fail('RankedDeskTable never surfaces unexplained');
  if (!/<details/.test(table) || !/item\.reason/.test(table)) {
    fail('RankedDeskTable does not expand stored gate reasons');
  }
  if (/desk-reasons-details[^>]+\bopen\b/.test(table)) {
    fail('Gate tertahan details default-open, clipping Outcome at 1280');
  }
  if (
    /explanations\.length === 1/.test(table) &&
    /explanations\[0\]\?\.reason/.test(table) &&
    /desk-reasons/.test(table)
  ) {
    fail('single-gate rows duplicate the reason in summary and list');
  }
  const css = read('app/globals.css');
  if (!/\.desk-reasons-details[\s\S]{0,240}max-width/.test(css)) {
    fail('Gate tertahan details have no max-width cap');
  }
  ok('surface-reasons-ok');
}

function surfaceAvoidToggle(): void {
  requireFiles(['lib/desk/assemble.ts', 'app/components/RankedDeskTable.tsx', 'app/desk/page.tsx']);
  const assemble = read('lib/desk/assemble.ts');
  if (!/export function visibleDeskRows/.test(assemble)) {
    fail('assemble.ts does not export visibleDeskRows');
  }
  if (!/stance !== 'AVOID'/.test(assemble) && !/row\.stance !== 'AVOID'/.test(assemble)) {
    fail('visibleDeskRows does not hide AVOID when the toggle is off');
  }
  const table = read('app/components/RankedDeskTable.tsx');
  if (!/visibleDeskRows/.test(table) || !/showAvoid/.test(table)) {
    fail('RankedDeskTable does not filter AVOID through visibleDeskRows');
  }
  const page = read('app/desk/page.tsx');
  if (!/Tampilkan AVOID/.test(page)) {
    fail('desk page has no AVOID toggle');
  }
  if (!/const \[showAvoid, setShowAvoid\] = useState\(false\)/.test(page)) {
    fail('AVOID toggle is not default-off');
  }
  ok('surface-avoid-toggle-ok');
}

function surfaceApi(): void {
  requireFiles(['app/api/desk/route.ts']);
  const src = read('app/api/desk/route.ts');
  if (!/getSession/.test(src)) fail('/api/desk never calls getSession');
  if (!/Unauthorized/.test(src)) fail('/api/desk has no Unauthorized branch');
  if (/data\.data\.result/.test(src)) fail('/api/desk copies the watchlist double envelope');
  if (!/morningCard/.test(src) || !/deskRows/.test(src) || !/skipped/.test(src)) {
    fail('/api/desk is missing morningCard, deskRows, or skipped');
  }
  if (/evaluatePlaybook|fetchMarketDetector|stockbitFetch/.test(src)) {
    fail('/api/desk re-evaluates or calls the vendor');
  }
  if (!/sessionDateJakarta/.test(src)) {
    fail('/api/desk does not default date to sessionDateJakarta');
  }
  const page = read('app/desk/page.tsx');
  if (!/sessionDateJakarta/.test(page)) {
    fail('desk page does not default the date picker to sessionDateJakarta');
  }
  ok('surface-api-ok');
}

function surfaceNavRr(): void {
  requireFiles(['app/components/Navbar.tsx', 'app/components/RankedDeskTable.tsx']);
  const nav = read('app/components/Navbar.tsx');
  const deskLinks = nav.match(/href=["']\/desk["']/g) ?? [];
  if (deskLinks.length < 2) fail('Navbar does not link /desk on both desktop and mobile');
  const table = read('app/components/RankedDeskTable.tsx');
  if (!/—/.test(table) && !/'—'/.test(table) && !/"—"/.test(table)) {
    fail('RankedDeskTable never renders an em-dash for null rr');
  }
  ok('surface-nav-rr-ok');
}

function surfaceCalculator(): void {
  requireFiles(['app/components/Calculator.tsx']);
  const src = read('app/components/Calculator.tsx');
  if (/\.catch\(\(\)\s*=>\s*\{\s*\}\)/.test(src)) {
    fail('Calculator still swallows the journal POST with an empty catch');
  }
  if (!/journalError|journal error|Gagal menyimpan jurnal|journal gagal/i.test(src)) {
    fail('Calculator has no operator-visible journal failure notice');
  }
  ok('surface-calculator-ok');
}

/* ------------------------------------------------------------------- docs -- */

function docsEnv(): void {
  requireFiles(['.env.example']);
  const env = read('.env.example');
  if (!/backfill:outcomes/.test(env) && !/backfill-journal-outcomes/.test(env)) {
    fail('.env.example does not document npm run backfill:outcomes');
  }
  if (!/\/desk/.test(env) && !/ranked desk/i.test(env) && !/decision_journal/.test(env)) {
    fail('.env.example does not mention the desk');
  }
  for (const name of ['PLAYBOOK_G1_PROFILE', 'PLAYBOOK_G5_PROFILE', 'PLAYBOOK_G7_PROFILE']) {
    const declared = assignmentValue(env, name);
    if (declared === undefined) continue;
    if (name === 'PLAYBOOK_G1_PROFILE' && declared !== 'phase-1') {
      fail(`.env.example assigns ${name}=${declared}`);
    }
    if (name !== 'PLAYBOOK_G1_PROFILE' && declared !== 'off') {
      fail(`.env.example assigns ${name}=${declared}`);
    }
  }
  ok('docs-env-ok');
}

function docsHonest(): void {
  requireFiles(['CHANGELOG.md', 'README.md', 'docs/SELF_HOSTED.md']);
  for (const f of ['CHANGELOG.md', 'README.md', 'docs/SELF_HOSTED.md']) {
    const text = read(f);
    if (!/Phase 5/.test(text)) fail(`${f} never mentions Phase 5`);
    const i = text.indexOf('Phase 5');
    const head = text.slice(i, i + 800);
    if (!/capture-complete|capture complete/i.test(head)) {
      fail(`${f} Phase 5 note does not state capture-complete near its first line`);
    }
    if (!/VERDICT_UNREACHABLE/.test(head) && !/VERDICT_UNREACHABLE/.test(text)) {
      fail(`${f} never states VERDICT_UNREACHABLE`);
    }
    if (/Phase 5[^\n]{0,80}validated|validated[^\n]{0,80}Phase 5/i.test(text)) {
      fail(`${f} calls Phase 5 validated`);
    }
  }
  ok('docs-honest-ok');
}

/* ------------------------------------------------------------------- root -- */

function rootPurity(): void {
  const pkg = JSON.parse(read('package.json')) as { dependencies?: Record<string, string> };
  const deps = Object.keys(pkg.dependencies ?? {}).sort();
  if (JSON.stringify(deps) !== JSON.stringify(EXPECTED_DEPS)) {
    fail(`dependencies changed: ${JSON.stringify(deps)}`);
  }
  const evaluate = p('lib', 'playbook', 'evaluate.ts');
  const got = sha256(evaluate);
  if (got !== EVALUATE_SHA) {
    fail(`lib/playbook/evaluate.ts changed (sha256 ${got}, expected ${EVALUATE_SHA})`);
  }
  const pathOutcome = p('lib', 'playbook', 'path-outcome.ts');
  const pathGot = sha256(pathOutcome);
  if (pathGot !== PATH_OUTCOME_SHA) {
    fail(`lib/playbook/path-outcome.ts changed (sha256 ${pathGot}, expected ${PATH_OUTCOME_SHA})`);
  }
  if (read('lib/playbook/evaluate.ts').includes('process.env')) {
    fail('the evaluator reads process.env');
  }
  ok(`purity-and-deps-ok deps=${deps.length}`);
}

function rootProfiles(): void {
  const templates = ['.env.example', '.env.local.example', 'env.example'].filter((f) => existsSync(p(f)));
  for (const name of templates) {
    const text = read(name);
    for (const key of ['PLAYBOOK_G5_PROFILE', 'PLAYBOOK_G7_PROFILE']) {
      const declared = assignmentValue(text, key);
      if (declared === undefined) continue;
      if (declared !== 'off') fail(`the documented default in ${name} is not off: ${key}=${declared}`);
    }
    const g1 = assignmentValue(text, 'PLAYBOOK_G1_PROFILE');
    if (g1 !== undefined && g1 !== 'phase-1') {
      fail(`the documented G1 default in ${name} is not phase-1: ${g1}`);
    }
  }
  const configs = [
    ...['.env', '.env.example', '.env.local.example', '.env.local'].filter((f) => existsSync(p(f))),
    ...walk(p('app'), (f) => /\.ya?ml$|\.json$/.test(f)),
  ];
  for (const file of configs) {
    const text = readFileSync(file, 'utf8');
    if (/PLAYBOOK_G5_PROFILE['"]?\s*[:=]\s*['"]?veto\b/.test(text)) {
      fail(`committed configuration selects the armed G5 profile: ${file.replace(ROOT, '.')}`);
    }
    if (/PLAYBOOK_G7_PROFILE['"]?\s*[:=]\s*['"]?veto\b/.test(text)) {
      fail(`committed configuration selects the armed G7 profile: ${file.replace(ROOT, '.')}`);
    }
    if (/PLAYBOOK_G1_PROFILE['"]?\s*[:=]\s*['"]?phase-2\b/.test(text)) {
      fail(`committed configuration selects the armed G1 profile: ${file.replace(ROOT, '.')}`);
    }
  }
  for (const name of ['docker-compose.yml', 'ecosystem.config.js']) {
    const full = p(name);
    if (!existsSync(full)) continue;
    const text = readFileSync(full, 'utf8');
    if (/PLAYBOOK_G[157]_PROFILE['"]?\s*[:=]\s*['"]?(veto|phase-2)\b/.test(text)) {
      fail(`committed configuration selects an armed profile: ${name}`);
    }
  }
  ok('profiles-unarmed-ok');
}

function rootNoSecondScorer(): void {
  const deskDir = p('lib', 'desk');
  if (!existsSync(deskDir)) fail('lib/desk does not exist — this phase produced nothing');
  for (const file of walk(deskDir, (f) => /\.ts$/.test(f))) {
    const rel = file.replace(`${ROOT}/`, '');
    if (rel.endsWith('.test.ts')) continue;
    const src = readFileSync(file, 'utf8');
    if (/function scorePath/.test(src) || /const scorePath/.test(src)) {
      fail(`second scorePath in ${rel}`);
    }
  }
  if (existsSync(p('scripts', '.g4-watch.cjs'))) {
    fail('scripts/.g4-watch.cjs is present in the working tree — it is gitignored build debris, not product source');
  }
  ok('no-second-scorer-ok');
}

function node11Interfaces(): void {
  requireFiles(['lib/desk/ranking.ts', 'lib/desk/explain.ts', 'lib/desk/assemble.ts', 'lib/desk/next-action.ts']);
  const ranking = read('lib/desk/ranking.ts');
  const explain = read('lib/desk/explain.ts');
  const assemble = read('lib/desk/assemble.ts');
  if (!/DeskRow|compareDeskRows/.test(ranking) && !/STANCE_TIER/.test(ranking)) {
    fail('ranking.ts does not export the frozen order');
  }
  if (!/unexplained/.test(explain)) fail('explain.ts does not export unexplained');
  if (!/rankDeskRows/.test(assemble) && !/compareDeskRows/.test(assemble)) {
    fail('assemble.ts does not consume the ranking comparator');
  }
  if (!/export function visibleDeskRows/.test(assemble)) {
    fail('assemble.ts does not export the AVOID display filter');
  }
  ok('node-1-1-interfaces-ok');
}

function node12Interfaces(): void {
  requireFiles(['lib/desk/outcome.ts', 'lib/desk/numbers.ts', 'lib/db.ts']);
  const outcome = read('lib/desk/outcome.ts');
  const db = read('lib/db.ts');
  if (!outcome.includes('toFiniteNumber') && !outcome.includes('./numbers')) {
    fail('outcome.ts does not consume toFiniteNumber');
  }
  if (!/listUnscoredEnterJournal/.test(db) || !/updateDecisionJournalOutcome/.test(db)) {
    fail('db accessors for outcomes are missing');
  }
  ok('node-1-2-interfaces-ok');
}

function node13Interfaces(): void {
  requireFiles(['app/api/desk/route.ts', 'app/desk/page.tsx', 'lib/jobs/run-watchlist-analysis.ts']);
  const route = read('app/api/desk/route.ts');
  const job = read('lib/jobs/run-watchlist-analysis.ts');
  if (!/listDecisionJournalByDate|assembleDesk/.test(route)) {
    fail('/api/desk does not assemble stored journal rows');
  }
  if (!/buildJournalPayload/.test(job)) fail('the job still does not flatten the journal payload');
  ok('node-1-3-interfaces-ok');
}

const gates: Record<string, () => void> = {
  probe,
  'probe-secret': probeNoSecret,
  'ranking-frozen': rankingFrozen,
  'ranking-null-rr': rankingNullRr,
  'ranking-nan': rankingNoNan,
  'ranking-closed-out': rankingClosedOut,
  'explain-universe': explainUniverse,
  'explain-skipped': explainSkipped,
  'explain-unexplained': explainUnexplained,
  'explain-next-action': explainNextAction,
  'explain-avoid-filter': explainAvoidFilter,
  'outcome-canonical': outcomeCanonical,
  'outcome-pathexit': outcomePathExit,
  'outcome-eligibility': outcomeEligibility,
  'outcome-coerce': outcomeCoerce,
  'backfill-null': backfillNull,
  'backfill-idempotent': backfillIdempotent,
  'backfill-round': backfillRound,
  'backfill-horizon': backfillHorizon,
  'package-backfill': packageBackfillScript,
  'job-flatten': jobFlatten,
  'job-journal-error': jobJournalError,
  'job-boundary': jobBoundary,
  'job-guard': jobGuard,
  'job-universe': jobUniverse,
  'surface-morning': surfaceMorning,
  'surface-reasons': surfaceReasons,
  'surface-avoid-toggle': surfaceAvoidToggle,
  'surface-api': surfaceApi,
  'surface-nav-rr': surfaceNavRr,
  'surface-calculator': surfaceCalculator,
  'docs-env': docsEnv,
  'docs-honest': docsHonest,
  purity: rootPurity,
  profiles: rootProfiles,
  'no-second-scorer': rootNoSecondScorer,
  'node-1-1': node11Interfaces,
  'node-1-2': node12Interfaces,
  'node-1-3': node13Interfaces,
};

const which = process.argv[2];
if (!which) {
  console.error(`usage: npx tsx scripts/check-phase5-gates.ts <${Object.keys(gates).join('|')}>`);
  process.exit(2);
}
const fn = gates[which];
if (!fn) {
  console.error(`unknown gate ${which}`);
  process.exit(2);
}
fn();
