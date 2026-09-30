/**
 * Phase 6 hardening oracles.
 *
 * Inline `node -e` gates with regex/quotes fail for the wrong reason (a
 * SyntaxError looks identical to a real defect). Every structural assertion
 * for this phase lives here and is invoked as:
 *
 *   npx tsx --tsconfig tsconfig.test.json scripts/check-phase6-gates.ts <id>
 *
 * `id` is a named check, not a live re-read of the operator's database.
 * Later leaves must not edit this file (plan D17). Missing product files
 * fail() until their owner leaf lands — only `probe` and `freeze` pass on
 * an empty product tree; `no-new-runtime-dep` also passes while package.json
 * is unchanged.
 */
import { createHash } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';
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

function requireFiles(files: string[]): void {
  for (const f of files) {
    if (!existsSync(p(f))) fail(`missing ${f}`);
  }
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

function calleeText(node: ts.CallExpression | ts.NewExpression, sf: ts.SourceFile): string {
  return node.expression.getText(sf);
}

function objectPropString(obj: ts.ObjectLiteralExpression, name: string, sf: ts.SourceFile): string | undefined {
  for (const prop of obj.properties) {
    if (!ts.isPropertyAssignment(prop)) continue;
    if (prop.name.getText(sf) !== name) continue;
    const init = prop.initializer;
    if (ts.isStringLiteral(init) || ts.isNoSubstitutionTemplateLiteral(init)) return init.text;
    if (ts.isNumericLiteral(init)) return init.text;
    if (ts.isPrefixUnaryExpression(init) || ts.isIdentifier(init) || ts.isPropertyAccessExpression(init)) {
      return init.getText(sf);
    }
  }
  return undefined;
}

function objectHasKey(obj: ts.ObjectLiteralExpression, name: string, sf: ts.SourceFile): boolean {
  return obj.properties.some((prop) => {
    if (ts.isPropertyAssignment(prop) || ts.isShorthandPropertyAssignment(prop) || ts.isMethodDeclaration(prop)) {
      return prop.name.getText(sf) === name;
    }
    return false;
  });
}

function isSuccessFalseLiteral(expr: ts.Expression, sf: ts.SourceFile): boolean {
  if (!ts.isObjectLiteralExpression(expr)) return false;
  const value = objectPropString(expr, 'success', sf);
  return value === 'false' || expr.properties.some((prop) => {
    if (!ts.isPropertyAssignment(prop) || prop.name.getText(sf) !== 'success') return false;
    return prop.initializer.kind === ts.SyntaxKind.FalseKeyword;
  });
}

function hasNamedImport(sf: ts.SourceFile, moduleName: string, names: string[]): boolean {
  const found = new Set<string>();
  collect(sf, (node) => {
    if (!ts.isImportDeclaration(node)) return;
    if (!node.moduleSpecifier || !ts.isStringLiteral(node.moduleSpecifier)) return;
    if (node.moduleSpecifier.text !== moduleName) return;
    const clause = node.importClause;
    if (!clause?.namedBindings || !ts.isNamedImports(clause.namedBindings)) return;
    for (const el of clause.namedBindings.elements) found.add(el.name.text);
  });
  return names.every((n) => found.has(n));
}

/* ------------------------------------------------------------------ probe -- */

function probe(): void {
  const file = p('artifacts', 'ops-probe.example.json');
  if (!existsSync(file)) fail('missing artifacts/ops-probe.example.json');
  const artifact = JSON.parse(readFileSync(file, 'utf8')) as {
    generatedAt?: string;
    healthLevels?: string[];
    dockerHealthLevel?: string;
    stall?: { status?: string; idleMsGreaterThan?: string };
    skipReasons?: string[];
    faults?: string[];
    timeoutRetryable?: boolean;
  };
  if (artifact.generatedAt !== '1970-01-01T00:00:00.000Z') {
    fail(`generatedAt is not the pinned stamp: ${artifact.generatedAt}`);
  }
  const levels = artifact.healthLevels ?? [];
  if (levels.join(',') !== 'live,ready,ops') {
    fail(`healthLevels are ${JSON.stringify(levels)}, expected live,ready,ops`);
  }
  if (artifact.dockerHealthLevel !== 'live') {
    fail(`dockerHealthLevel is ${artifact.dockerHealthLevel}, expected live`);
  }
  if (artifact.stall?.status !== 'running') fail('stall.status is not running');
  if (artifact.stall?.idleMsGreaterThan !== 'JOB_STALL_MS') {
    fail('stall.idleMsGreaterThan is not JOB_STALL_MS');
  }
  const skips = artifact.skipReasons ?? [];
  for (const reason of ['holiday', 'weekend', 'empty-universe']) {
    if (!skips.includes(reason)) fail(`skipReasons omit ${reason}`);
  }
  const faults = artifact.faults ?? [];
  if (!faults.includes('stockbit-timeout') || !faults.includes('stockbit-429')) {
    fail(`faults are ${JSON.stringify(faults)}`);
  }
  if (faults.includes('stockbit-hang')) fail('the probe artifact names stockbit-hang');
  if (artifact.timeoutRetryable !== false) fail('timeoutRetryable must be false');
  ok('ops-probe-ok');
}

function freeze(): void {
  const evaluate = p('lib', 'playbook', 'evaluate.ts');
  const pathOutcome = p('lib', 'playbook', 'path-outcome.ts');
  if (!existsSync(evaluate)) fail('missing lib/playbook/evaluate.ts');
  if (!existsSync(pathOutcome)) fail('missing lib/playbook/path-outcome.ts');
  const got = sha256(evaluate);
  if (got !== EVALUATE_SHA) {
    fail(`lib/playbook/evaluate.ts changed (sha256 ${got}, expected ${EVALUATE_SHA})`);
  }
  const pathGot = sha256(pathOutcome);
  if (pathGot !== PATH_OUTCOME_SHA) {
    fail(`lib/playbook/path-outcome.ts changed (sha256 ${pathGot}, expected ${PATH_OUTCOME_SHA})`);
  }
  console.log('evaluate-frozen-ok');
  console.log('path-outcome-frozen-ok');
}

function noNewRuntimeDep(): void {
  const pkg = JSON.parse(read('package.json')) as { dependencies?: Record<string, string> };
  const deps = Object.keys(pkg.dependencies ?? {}).sort();
  if (JSON.stringify(deps) !== JSON.stringify(EXPECTED_DEPS)) {
    fail(`dependencies changed: ${JSON.stringify(deps)}`);
  }
  if (!deps.includes('node-cron')) fail('node-cron was removed from dependencies');
  ok('no-new-runtime-dep-ok');
}

/* -------------------------------------------------------------- health HTTP -- */

function healthLiveDefault(): void {
  requireFiles(['app/api/health/route.ts', 'proxy.ts']);
  const route = read('app/api/health/route.ts');
  const proxy = read('proxy.ts');
  if (!/\/api\/health/.test(proxy)) fail('proxy.ts PUBLIC_PATHS does not include /api/health');
  const proxySf = sourceFile('proxy.ts');
  let publicHasHealth = false;
  collect(proxySf, (node) => {
    if (!ts.isStringLiteral(node) && !ts.isNoSubstitutionTemplateLiteral(node)) return;
    if (node.text === '/api/health') publicHasHealth = true;
  });
  if (!publicHasHealth) fail('PUBLIC_PATHS has no string literal /api/health (comment-only tokens fail)');
  if (!/force-dynamic/.test(route)) fail('health route is not force-dynamic');
  const sf = sourceFile('app/api/health/route.ts');
  let defaultLive = false;
  let invalid400 = false;
  collect(sf, (node) => {
    if (ts.isBinaryExpression(node) && node.operatorToken.kind === ts.SyntaxKind.QuestionQuestionToken) {
      const right = node.right.getText(sf).replace(/['"]/g, '');
      if (right === 'live') defaultLive = true;
    }
    if (ts.isCallExpression(node) && calleeText(node, sf).includes('searchParams.get')) {
      const arg = node.arguments[0];
      if (arg && (ts.isStringLiteral(arg) || ts.isNoSubstitutionTemplateLiteral(arg)) && arg.text === 'level') {
        // get('level') exists; defaulting is checked via ?? 'live' above
      }
    }
    if (ts.isCallExpression(node)) {
      const args = node.arguments;
      if (args.length >= 2 && ts.isObjectLiteralExpression(args[1])) {
        const status = objectPropString(args[1], 'status', sf);
        if (status === '400') invalid400 = true;
      }
    }
  });
  if (!defaultLive) fail('missing level does not default to live');
  if (!invalid400) fail('invalid level is not HTTP 400');
  if (/STOCKBIT_JWT|AUTH_SECRET|POSTGRES_PASSWORD|eyJ[A-Za-z0-9_-]{10,}/.test(route)) {
    fail('health route mentions a credential');
  }
  if (/\bemiten\b/i.test(route)) fail('health route mentions emiten');
  ok('health-live-default-ok');
}

function workersStartedAfterConstruct(): void {
  requireFiles(['lib/queue.ts']);
  const sf = sourceFile('lib/queue.ts');
  const workerNews: number[] = [];
  const trueAssigns: number[] = [];
  let hasGetWorkerStatus = false;
  let hasReset = false;
  let hasStartPromise = false;
  collect(sf, (node) => {
    if (ts.isNewExpression(node)) {
      const name = calleeText(node, sf);
      if (name === 'Worker' || name === 'WorkerImpl' || name === 'WorkerCtor') {
        workerNews.push(node.getStart(sf));
      }
    }
    if (
      ts.isBinaryExpression(node) &&
      node.operatorToken.kind === ts.SyntaxKind.EqualsToken &&
      node.left.getText(sf) === 'workersStarted' &&
      node.right.kind === ts.SyntaxKind.TrueKeyword
    ) {
      trueAssigns.push(node.getStart(sf));
    }
    if (ts.isFunctionDeclaration(node) && node.name?.text === 'getWorkerStatus') hasGetWorkerStatus = true;
    if (
      ts.isFunctionDeclaration(node) &&
      node.name?.text === '__resetWorkerStatusForTests'
    ) {
      hasReset = true;
    }
    if (ts.isVariableDeclaration(node) && ts.isIdentifier(node.name) && node.name.text === 'startPromise') {
      hasStartPromise = true;
    }
  });
  if (workerNews.length < 3) fail(`expected three Worker constructors, found ${workerNews.length}`);
  const lastWorker = Math.max(...workerNews);
  if (trueAssigns.length === 0) fail('workersStarted is never set true');
  if (trueAssigns.some((pos) => pos < lastWorker)) {
    fail('workersStarted=true is assigned before the last Worker constructor');
  }
  if (!hasGetWorkerStatus) fail('getWorkerStatus is not a function declaration');
  if (!hasReset) fail('__resetWorkerStatusForTests is missing');
  if (!hasStartPromise) fail('startPromise in-flight guard is missing');
  const src = read('lib/queue.ts');
  if (!/schedulerOk/.test(src)) fail('getWorkerStatus does not expose schedulerOk');
  if (!/Promise\.allSettled/.test(src)) fail('partial-construct close() is not awaited via Promise.allSettled');
  ok('workers-started-after-construct-ok');
}

function watchlistWorkerThrowsOnFailure(): void {
  requireFiles(['lib/queue.ts']);
  const sf = sourceFile('lib/queue.ts');
  let throws = false;
  collect(sf, (node) => {
    if (!ts.isThrowStatement(node)) return;
    const expr = node.expression;
    if (!ts.isNewExpression(expr)) return;
    const arg = expr.arguments?.[0];
    if (arg && (ts.isStringLiteral(arg) || ts.isNoSubstitutionTemplateLiteral(arg)) && arg.text === 'watchlist-job-failed') {
      throws = true;
    }
  });
  if (!throws) fail('queue.ts has no ThrowStatement with string literal watchlist-job-failed');
  const src = read('lib/queue.ts');
  if (!/await runWatchlistAnalysis\(\)/.test(src)) {
    fail('watchlist worker does not await runWatchlistAnalysis()');
  }
  if (!/!out\.success/.test(src) && !/out\.success === false/.test(src)) {
    fail('watchlist worker does not inspect out.success');
  }
  ok('watchlist-worker-throws-on-failure-ok');
}

function healthNever5xx(): void {
  requireFiles(['app/api/health/route.ts']);
  const sf = sourceFile('app/api/health/route.ts');
  const src = read('app/api/health/route.ts');
  collect(sf, (node) => {
    if (!ts.isCallExpression(node) || node.arguments.length < 2) return;
    const opts = node.arguments[1];
    if (!ts.isObjectLiteralExpression(opts)) return;
    const status = objectPropString(opts, 'status', sf);
    if (!status) return;
    const n = Number(status);
    if (Number.isFinite(n) && n >= 500) {
      fail(`health route returns HTTP ${n}`);
    }
  });
  if (/status:\s*50[0-9]/.test(src)) fail('health route source contains an HTTP 5xx status literal');
  let watchlistScan = false;
  collect(sf, (node) => {
    if (!ts.isCallExpression(node)) return;
    if (calleeText(node, sf) !== 'getBackgroundJobLogs') return;
    const arg = node.arguments[0];
    if (!arg || !ts.isObjectLiteralExpression(arg)) return;
    const jobName = objectPropString(arg, 'jobName', sf);
    const status = objectPropString(arg, 'status', sf);
    if (jobName === 'analyze-watchlist' && status === 'running') watchlistScan = true;
  });
  if (!watchlistScan) {
    fail('ops stall scan does not call getBackgroundJobLogs({ jobName: analyze-watchlist, status: running })');
  }
  if (!/try/.test(src) || !/catch/.test(src)) fail('health route has no top-level try/catch');
  ok('health-never-5xx-ok');
}

/* -------------------------------------------------------------- limiter -- */

function timeoutNotRetryable(): void {
  requireFiles(['lib/stockbit-limiter.ts']);
  const sf = sourceFile('lib/stockbit-limiter.ts');
  let hasClass = false;
  collect(sf, (node) => {
    if (ts.isClassDeclaration(node) && node.name?.text === 'StockbitTimeoutError') hasClass = true;
  });
  if (!hasClass) fail('StockbitTimeoutError class is missing (body + imports without the class is TS2304)');
  if (!hasNamedImport(sf, './ops/constants', ['resolveStockbitTimeoutMs'])) {
    fail('stockbit-limiter.ts does not import resolveStockbitTimeoutMs from ./ops/constants');
  }
  if (!hasNamedImport(sf, './faults', ['activeFaults', 'consumeFault'])) {
    fail('stockbit-limiter.ts does not import activeFaults, consumeFault from ./faults');
  }
  const src = read('lib/stockbit-limiter.ts');
  if (!/timeoutMs\?:\s*number/.test(src)) fail('StockbitFetchDeps has no timeoutMs?: number');
  if (/AbortSignal\.any\s*\(/.test(src)) fail('stockbitFetch uses AbortSignal.any as the compose path');
  if (/AbortSignal\.timeout\s*\(/.test(src)) fail('stockbitFetch uses AbortSignal.timeout as the compose path');
  if (!/function withDeadline/.test(src) && !/async function withDeadline/.test(src)) {
    fail('withDeadline helper is missing');
  }
  if (!/timedOut/.test(src)) fail('timedOut flag is missing');
  if (!/removeEventListener/.test(src)) fail('abort listener is not removed');
  ok('timeout-not-retryable-ok');
}

function timeoutAbortDistinguished(): void {
  requireFiles(['lib/stockbit-limiter.ts']);
  const src = read('lib/stockbit-limiter.ts');
  if (!/init\.signal\?\.aborted/.test(src) && !/init\.signal && init\.signal\.aborted/.test(src)) {
    fail('pre-aborted init.signal is not short-circuited before the race');
  }
  if (!/The operation was aborted/.test(src)) {
    fail('pre-abort does not throw a named AbortError');
  }
  if (!/removeEventListener/.test(src)) fail('onAbort is not removed in finally');
  ok('timeout-abort-distinguished-ok');
}

function faultsProdOff(): void {
  requireFiles(['lib/faults.ts']);
  const src = read('lib/faults.ts');
  if (/stockbit-hang/.test(src)) fail('lib/faults.ts names stockbit-hang');
  if (!/SAHAMOLOGY_FAULT_ALLOW/.test(src)) fail('faults do not honour SAHAMOLOGY_FAULT_ALLOW');
  if (!/NODE_ENV/.test(src)) fail('faults do not read NODE_ENV');
  if (!/stockbit-timeout/.test(src) || !/stockbit-429/.test(src)) {
    fail('fault names stockbit-timeout / stockbit-429 are missing');
  }
  const sf = sourceFile('lib/faults.ts');
  const exports = new Set<string>();
  collect(sf, (node) => {
    if (ts.isFunctionDeclaration(node) && node.name && node.modifiers?.some((m) => m.kind === ts.SyntaxKind.ExportKeyword)) {
      exports.add(node.name.text);
    }
    if (
      ts.isVariableStatement(node) &&
      node.modifiers?.some((m) => m.kind === ts.SyntaxKind.ExportKeyword)
    ) {
      for (const d of node.declarationList.declarations) {
        if (ts.isIdentifier(d.name)) exports.add(d.name.text);
      }
    }
  });
  for (const name of ['activeFaults', 'consumeFault', 'resetFaults']) {
    if (!exports.has(name) && !src.includes(`export function ${name}`) && !src.includes(`export function ${name}(`)) {
      fail(`lib/faults.ts does not export ${name}`);
    }
  }
  ok('faults-prod-off-ok');
}

/* -------------------------------------------------------------- holiday -- */

function callPositions(sf: ts.SourceFile, name: string): ts.CallExpression[] {
  const out: ts.CallExpression[] = [];
  collect(sf, (node) => {
    if (ts.isCallExpression(node) && calleeText(node, sf) === name) out.push(node);
  });
  return out;
}

function holidayBeforeFetch(): void {
  requireFiles(['lib/jobs/run-watchlist-analysis.ts']);
  const rel = 'lib/jobs/run-watchlist-analysis.ts';
  const sf = sourceFile(rel);
  const fetches = callPositions(sf, 'fetchWatchlist');
  if (fetches.length === 0) fail('no fetchWatchlist CallExpression (import identifiers do not count)');
  const firstFetch = fetches[0]!;
  const creates = callPositions(sf, 'createBackgroundJobLog');
  if (creates.length !== 1) {
    fail(`expected exactly one createBackgroundJobLog CallExpression, found ${creates.length}`);
  }
  if (creates[0]!.getStart(sf) >= firstFetch.getStart(sf)) {
    fail('createBackgroundJobLog CallExpression does not precede first fetchWatchlist');
  }
  const appends = callPositions(sf, 'appendBackgroundJobLogEntry');
  if (appends.length === 0) fail('no appendBackgroundJobLogEntry CallExpression');
  if (appends[0]!.getStart(sf) >= firstFetch.getStart(sf)) {
    fail('first appendBackgroundJobLogEntry CallExpression does not precede first fetchWatchlist (C37)');
  }

  let skipReturn: ts.ReturnStatement | undefined;
  collect(sf, (node) => {
    if (!ts.isIfStatement(node)) return;
    const cond = node.expression.getText(sf);
    if (!/calendar\.kind/.test(cond) || !/skip/.test(cond)) return;
    const visit = (n: ts.Node): void => {
      if (ts.isReturnStatement(n) && !skipReturn) skipReturn = n;
      ts.forEachChild(n, visit);
    };
    visit(node);
  });
  if (!skipReturn) fail('skip if (calendar.kind === skip) has no return');
  if (skipReturn.getEnd() >= firstFetch.getStart(sf)) {
    fail('skip return end position is not before first fetchWatchlist CallExpression');
  }

  const macros = callPositions(sf, 'captureMacro');
  if (macros.length === 0) fail('no captureMacro CallExpression');
  const capture = macros[0]!;
  const before = appends.filter((a) => a.getEnd() <= capture.getStart(sf));
  const after = appends.filter((a) => a.getStart(sf) >= capture.getEnd());
  if (before.length === 0) fail('no appendBackgroundJobLogEntry before captureMacro.getStart()');
  if (after.length === 0) fail('no appendBackgroundJobLogEntry after captureMacro.getEnd()');
  const nearestBefore = before.reduce((best, cur) => (cur.getStart(sf) > best.getStart(sf) ? cur : best));
  const nearestAfter = after.reduce((best, cur) => (cur.getStart(sf) < best.getStart(sf) ? cur : best));
  const beforeGap = capture.getStart(sf) - nearestBefore.getEnd();
  const afterGap = nearestAfter.getStart(sf) - capture.getEnd();
  if (beforeGap > 2000) {
    fail(`nearest append before captureMacro is ${beforeGap} chars away (need ≤ 2000)`);
  }
  if (afterGap > 2000) {
    fail(`nearest append after captureMacro is ${afterGap} chars away (need ≤ 2000)`);
  }
  const beforeArg = nearestBefore.arguments[1];
  const afterArg = nearestAfter.arguments[1];
  if (!beforeArg || !ts.isObjectLiteralExpression(beforeArg) || objectPropString(beforeArg, 'message', sf) !== 'macro capture starting') {
    fail("nearest append before captureMacro does not include message: 'macro capture starting'");
  }
  if (!afterArg || !ts.isObjectLiteralExpression(afterArg) || objectPropString(afterArg, 'message', sf) !== 'macro capture done') {
    fail("nearest append after captureMacro does not include message: 'macro capture done'");
  }

  let emptyUniverseMeta = false;
  collect(sf, (node) => {
    if (!ts.isCallExpression(node) || calleeText(node, sf) !== 'updateBackgroundJobLog') return;
    for (const arg of node.arguments) {
      if (!ts.isObjectLiteralExpression(arg)) continue;
      const meta = arg.properties.find((prop) => ts.isPropertyAssignment(prop) && prop.name.getText(sf) === 'metadata');
      if (!meta || !ts.isPropertyAssignment(meta) || !ts.isObjectLiteralExpression(meta.initializer)) continue;
      const skip = objectPropString(meta.initializer, 'skip_reason', sf);
      if (skip === 'empty-universe' && objectHasKey(meta.initializer, 'universe_count', sf)) {
        emptyUniverseMeta = true;
      }
    }
  });
  if (!emptyUniverseMeta) {
    fail('empty-universe updateBackgroundJobLog metadata lacks skip_reason empty-universe and universe_count');
  }

  let createCatchReturnsFalse = false;
  collect(sf, (node) => {
    if (!ts.isTryStatement(node) || !node.catchClause) return;
    const tryText = node.tryBlock.getText(sf);
    if (!tryText.includes('createBackgroundJobLog')) return;
    const visit = (n: ts.Node): void => {
      if (ts.isReturnStatement(n) && n.expression && isSuccessFalseLiteral(n.expression, sf)) {
        createCatchReturnsFalse = true;
      }
      ts.forEachChild(n, visit);
    };
    visit(node.catchClause);
  });
  if (!createCatchReturnsFalse) {
    fail('createBackgroundJobLog CatchClause does not return { success:false }');
  }

  const src = read(rel);
  if (!/isIdxSession:\s*!isWeekend\(today\)\s*&&\s*!isIdxHoliday\(today\)/.test(src)) {
    fail('isIdxSession initializer is not !isWeekend(today) && !isIdxHoliday(today)');
  }
  ok('holiday-before-fetch-ok');
}

/* -------------------------------------------------------------- docker -- */

function composeServiceBlock(text: string, name: string): string | undefined {
  const lines = text.split(/\r?\n/);
  let inServices = false;
  let capturing = false;
  const out: string[] = [];
  for (const line of lines) {
    if (/^services:\s*(#.*)?$/.test(line)) {
      inServices = true;
      continue;
    }
    if (inServices && /^[A-Za-z0-9_-]+:/.test(line)) {
      inServices = false;
      capturing = false;
    }
    if (inServices && new RegExp(`^  ${name}:\\s*(#.*)?$`).test(line)) {
      capturing = true;
      continue;
    }
    if (capturing) {
      if (/^ {2}[A-Za-z0-9_-]+:/.test(line)) break;
      if (/^[A-Za-z0-9_-]+:/.test(line)) break;
      out.push(line);
    }
  }
  return out.length ? out.join('\n') : undefined;
}

function healthcheckTestFromService(block: string | undefined): string | undefined {
  if (!block) return undefined;
  const m = block.match(/^\s+healthcheck:\s*$/m);
  if (!m) return undefined;
  const testLine = block.split(/\r?\n/).find((line) => /^\s+test:\s*/.test(line));
  if (!testLine) return undefined;
  return testLine.replace(/^\s+test:\s*/, '').trim();
}

function healthcheckLive(): void {
  requireFiles(['Dockerfile', 'docker-compose.yml', 'scripts/health-probe.mjs']);
  const docker = read('Dockerfile');
  const compose = read('docker-compose.yml');
  const probe = read('scripts/health-probe.mjs');
  if (!/^HEALTHCHECK\b[^\n]*\bnode\s+scripts\/health-probe\.mjs\b/m.test(docker)) {
    fail('Dockerfile has no one-line HEALTHCHECK CMD node scripts/health-probe.mjs');
  }
  if (docker.includes('node -e') || compose.includes('node -e')) {
    fail('Dockerfile or compose contains node -e');
  }
  const appBlock = composeServiceBlock(compose, 'app');
  const appTest = healthcheckTestFromService(appBlock);
  if (!appTest || !appTest.includes('scripts/health-probe.mjs')) {
    fail('services.app.healthcheck.test does not contain scripts/health-probe.mjs');
  }
  if (!probe.includes('level=live')) fail('health-probe.mjs does not contain level=live');
  if (probe.includes('level=ops') || probe.includes('level=ready')) {
    fail('health-probe.mjs mentions level=ops or level=ready');
  }
  if (!probe.includes('r.ok ? 0 : 1')) fail('health-probe.mjs does not exit r.ok ? 0 : 1');
  ok('healthcheck-live-ok');
}

/* -------------------------------------------------------------- pill -- */

function pillWatchlistJobname(): void {
  requireFiles(['app/components/JobStatusIndicator.tsx']);
  const sf = sourceFile('app/components/JobStatusIndicator.tsx');
  let found = false;
  collect(sf, (node) => {
    if (ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node) || ts.isTemplateExpression(node)) {
      const text = node.getText(sf);
      if (text.includes('jobName=analyze-watchlist')) found = true;
    }
  });
  if (!found) fail('JobStatusIndicator fetch URL has no jobName=analyze-watchlist string (comment-only fails)');
  ok('pill-watchlist-jobname-ok');
}

function pillTransportState(): void {
  requireFiles(['app/components/JobStatusIndicator.tsx', 'app/api/job-logs/route.ts']);
  const sf = sourceFile('app/components/JobStatusIndicator.tsx');
  let hasAlias = false;
  let hasUnavailableCopy = false;
  let unavailableGuardPos = Number.POSITIVE_INFINITY;
  let latestLogNullPos = Number.POSITIVE_INFINITY;
  collect(sf, (node) => {
    if (ts.isTypeAliasDeclaration(node) && node.name.text === 'TransportState') hasAlias = true;
    if (
      (ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node) || ts.isJsxText(node)) &&
      node.getText(sf).includes('Status unavailable')
    ) {
      hasUnavailableCopy = true;
    }
    if (ts.isBinaryExpression(node) && /transport/.test(node.getText(sf)) && /unavailable/.test(node.getText(sf))) {
      unavailableGuardPos = Math.min(unavailableGuardPos, node.getStart(sf));
    }
    if (ts.isPrefixUnaryExpression(node) && node.getText(sf).replace(/\s/g, '') === '!latestLog') {
      latestLogNullPos = Math.min(latestLogNullPos, node.getStart(sf));
    }
  });
  if (!hasAlias) fail('JobStatusIndicator has no TypeAliasDeclaration named TransportState');
  if (!hasUnavailableCopy) fail("JobStatusIndicator has no JSX/string 'Status unavailable'");
  if (!Number.isFinite(unavailableGuardPos) || unavailableGuardPos === Number.POSITIVE_INFINITY) {
    fail('no transport === unavailable guard');
  }
  if (!Number.isFinite(latestLogNullPos) || latestLogNullPos === Number.POSITIVE_INFINITY) {
    fail('no !latestLog guard');
  }
  if (unavailableGuardPos >= latestLogNullPos) {
    fail('unavailable guard does not precede if (!latestLog) return null');
  }

  const logsSf = sourceFile('app/api/job-logs/route.ts');
  const successReturns: ts.ObjectLiteralExpression[] = [];
  collect(logsSf, (node) => {
    if (!ts.isReturnStatement(node) || !node.expression || !ts.isCallExpression(node.expression)) return;
    const arg = node.expression.arguments[0];
    if (!arg || !ts.isObjectLiteralExpression(arg)) return;
    if (
      arg.properties.some((prop) => {
        if (!ts.isPropertyAssignment(prop) || prop.name.getText(logsSf) !== 'success') return false;
        return prop.initializer.kind === ts.SyntaxKind.TrueKeyword;
      })
    ) {
      successReturns.push(arg);
    }
  });
  if (successReturns.length < 2) {
    fail(`job-logs route has ${successReturns.length} success:true returns, expected both latest and list branches`);
  }
  for (const obj of successReturns) {
    if (!objectHasKey(obj, 'checkedAt', logsSf)) {
      fail('a success:true job-logs return is missing checkedAt');
    }
  }
  ok('pill-transport-state-ok');
}

function morningClosed(): void {
  requireFiles(['lib/desk/assemble.ts', 'lib/desk/assemble.test.ts', 'app/components/MorningCard.tsx', 'app/api/desk/route.ts']);
  const assemble = read('lib/desk/assemble.ts');
  if (!/marketClosed/.test(assemble)) fail('assemble.ts has no marketClosed');
  if (!/wallDate\?:\s*string/.test(assemble)) fail('AssembleInput.wallDate?: string is missing');
  const tests = read('lib/desk/assemble.test.ts');
  if (!/marketClosed/.test(tests) || !/holiday/.test(tests)) {
    fail('assemble.test.ts does not assert holiday marketClosed');
  }
  const card = read('app/components/MorningCard.tsx');
  if (!/marketClosed/.test(card)) fail('MorningCard does not read marketClosed');
  if (!/universeSource === 'none'/.test(card) && !/universeSource === "none"/.test(card)) {
    fail('MorningCard does not render the empty-watchlist line');
  }
  const route = read('app/api/desk/route.ts');
  if (!/jakartaYmd/.test(route) || !/wallDate/.test(route)) {
    fail('desk route does not pass wallDate: jakartaYmd(new Date())');
  }
  ok('morning-closed-ok');
}

/* ---------------------------------------------------------------- docs -- */

function docsEnv(): void {
  requireFiles(['.env.example']);
  const text = read('.env.example');
  if (!/STOCKBIT_TIMEOUT_MS/.test(text)) fail('.env.example does not document STOCKBIT_TIMEOUT_MS');
  if (!/SAHAMOLOGY_FAULT_ALLOW/.test(text)) fail('.env.example does not document SAHAMOLOGY_FAULT_ALLOW');
  if (!/SAHAMOLOGY_FAULT/.test(text)) fail('.env.example does not document SAHAMOLOGY_FAULT');
  if (/^SAHAMOLOGY_FAULT_ALLOW=1\s*$/m.test(text)) {
    fail('.env.example sets SAHAMOLOGY_FAULT_ALLOW=1');
  }
  const allow = assignmentValue(text, 'SAHAMOLOGY_FAULT_ALLOW');
  if (allow === '1') fail('.env.example assigns SAHAMOLOGY_FAULT_ALLOW=1');
  for (const key of ['PLAYBOOK_G5_PROFILE', 'PLAYBOOK_G7_PROFILE']) {
    const declared = assignmentValue(text, key);
    if (declared !== undefined && declared !== 'off') {
      fail(`the documented default in .env.example is not off: ${key}=${declared}`);
    }
  }
  const g1 = assignmentValue(text, 'PLAYBOOK_G1_PROFILE');
  if (g1 !== undefined && g1 !== 'phase-1') {
    fail(`the documented G1 default is not phase-1: ${g1}`);
  }
  ok('docs-env-ok');
}

function docsHonest(): void {
  requireFiles(['CHANGELOG.md', 'README.md', 'docs/SELF_HOSTED.md', 'docs/CHECKPOINT.md']);
  const files = ['CHANGELOG.md', 'README.md', 'docs/SELF_HOSTED.md'];
  for (const f of files) {
    const text = read(f);
    if (!/Phase 6/.test(text)) fail(`${f} has no Phase 6 note`);
    if (!/capture-complete/.test(text)) fail(`${f} does not say capture-complete`);
    if (!/live/.test(text.toLowerCase()) || !/health/i.test(text)) {
      fail(`${f} does not document live health`);
    }
  }
  const changelog = read('CHANGELOG.md');
  if (!/Phase 6 ships process health, weekday holiday no-ops, and fail-closed Stockbit deadlines/.test(changelog)) {
    fail('CHANGELOG is missing the required Phase 6 first sentence');
  }
  if (!/No gate is armed/.test(changelog) && !/no gate is armed/i.test(changelog)) {
    fail('CHANGELOG does not say no gate is armed');
  }
  const self = read('docs/SELF_HOSTED.md');
  if (!/HEALTHCHECK/.test(self) || !/level=live/.test(self)) {
    fail('SELF_HOSTED does not document live-only HEALTHCHECK');
  }
  if (!/unless-stopped/.test(self) && !/State\.Health/.test(self)) {
    fail('SELF_HOSTED does not document the migrate restart loop');
  }
  const checkpoint = read('docs/CHECKPOINT.md');
  if (!/Phase 6/.test(checkpoint) && !/\/api\/health/.test(checkpoint)) {
    fail('CHECKPOINT does not mention Phase 6 health');
  }
  ok('docs-honest-ok');
}

const gates: Record<string, () => void> = {
  probe,
  freeze,
  'health-live-default': healthLiveDefault,
  'workers-started-after-construct': workersStartedAfterConstruct,
  'timeout-not-retryable': timeoutNotRetryable,
  'holiday-before-fetch': holidayBeforeFetch,
  'healthcheck-live': healthcheckLive,
  'faults-prod-off': faultsProdOff,
  'no-new-runtime-dep': noNewRuntimeDep,
  'watchlist-worker-throws-on-failure': watchlistWorkerThrowsOnFailure,
  'health-never-5xx': healthNever5xx,
  'timeout-abort-distinguished': timeoutAbortDistinguished,
  'pill-watchlist-jobname': pillWatchlistJobname,
  'pill-transport-state': pillTransportState,
  'docs-env': docsEnv,
  'docs-honest': docsHonest,
  'morning-closed': morningClosed,
};

const which = process.argv[2];
if (!which) {
  console.error(`usage: npx tsx scripts/check-phase6-gates.ts <${Object.keys(gates).join('|')}>`);
  process.exit(2);
}
const fn = gates[which];
if (!fn) {
  console.error(`unknown gate ${which}`);
  process.exit(2);
}
fn();
