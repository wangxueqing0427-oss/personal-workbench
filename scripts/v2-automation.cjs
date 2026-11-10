'use strict';
// Reuse committed synthetic loopback suites in a fresh workspace; never load .tools credentials.
const fs = require('node:fs');
const path = require('node:path');
const cp = require('node:child_process');
const crypto = require('node:crypto');
const root = path.resolve(__dirname, '..');
const git = (...a) => cp.execFileSync('git', ['-c', 'safe.directory=' + root.replaceAll('\\', '/'), ...a], { cwd: root, maxBuffer: 30e6 }).toString();
const sha = bytes => crypto.createHash('sha256').update(bytes).digest('hex');
const profile = process.argv[process.argv.indexOf('--profile') + 1];
const suites = {
  http: { script: 'test-sync-http.cjs', result: 'sync-http-results.json' },
  discovery: { script: 'test-remote-discovery.cjs', engine: 'chromium', result: 'remote-discovery-results.json' },
  'backup-chromium': { script: 'test-safety.cjs', engine: 'chromium' },
  'backup-webkit': { script: 'test-safety.cjs', engine: 'webkit' },
  'business-chromium': { script: 'test-phase2.cjs', engine: 'chromium', result: 'phase2-test-results.json' },
  'business-webkit': { script: 'test-phase2.cjs', engine: 'webkit', result: 'phase2-webkit-results.json' },
};
const profiles = { 'ci-http': ['http'], smoke: ['http', 'discovery', 'backup-chromium', 'backup-webkit'] };
function redact(text, runDir) {
  return text.split(root).join('<repo>').split(runDir).join('<isolated-run>')
    .replace(/[A-Za-z]:[\\/]+Users[\\/][^\s'"),;]+/gi, '<private-path>')
    .replace(/\/(?:Users|home)\/(?!web_user\b)[^\s'"),;]+/g, '<private-path>');
}
function classify(result, suite, text) {
  const fail = reason => ({ status: 'FAIL', reason });
  if (result.error || result.signal || result.status !== 0) return fail('Suite process failure, assertion or timeout');
  try {
    if (suite.result) {
      if (typeof text !== 'string') return fail('Missing report');
      const data = JSON.parse(text);
      if (!data || typeof data !== 'object' || Array.isArray(data)) return fail('Invalid report object');
      if (suite.result === 'sync-http-results.json') {
        if (data.coreAssertions !== 18 || data.productionConnected !== false || data.iphoneTested !== false || typeof data.environment !== 'string' || typeof data.findings !== 'string' || data.failed || data.blocked || (data.status && data.status !== 'PASS')) return fail('Invalid HTTP report fields');
        return { status: 'PASS', summary: { assertions: 18 } };
      }
      const n = data.summary;
      if (!n || !['passed', 'failed', 'blocked'].every(k => Number.isInteger(n[k]) && n[k] >= 0) || !Array.isArray(data.results) || data.results.length !== 12) return fail('Invalid report counts');
      if (!data.results.every(r => r && ['PASS', 'FAIL', 'BLOCKED'].includes(r.status) && ['name', 'input', 'steps', 'expected', 'actual'].every(k => typeof r[k] === 'string' && r[k].length > 0))) return fail('Invalid scenario fields');
      for (const [key, state] of [['passed', 'PASS'], ['failed', 'FAIL'], ['blocked', 'BLOCKED']]) if (n[key] !== data.results.filter(r => r.status === state).length) return fail('Inconsistent scenario counts');
      if (n.failed || n.blocked || n.passed !== 12) return fail('Incomplete or failed discovery suite');
      return { status: 'PASS', summary: n };
    }
    const rows = (result.stdout || '').split(/\r?\n/).filter(x => x.startsWith('{')).map(x => JSON.parse(x));
    if (rows.length !== 2 || !rows.every((r, i) => r.assertions === 28 && r.contracts === 99 && r.businessProjects === 11 && r.browserFlow === 'export-validate-isolated-restore-refresh passed' && r.viewport?.width === [1280, 390][i] && r.viewport?.height === [800, 844][i])) return fail('Invalid backup viewport report');
    return { status: 'PASS', summary: { assertions: 56, viewportReports: 2 } };
  } catch { return fail('Malformed report JSON'); }
}
function browserPreflight(engine, probe = () => {
  const p = require('playwright');
  if (!(process.platform === 'win32' && engine === 'chromium') && !fs.existsSync(p[engine].executablePath())) throw Object.assign(Error('Browser binary unavailable'), { code: 'WB_BROWSER_MISSING' });
  return require('playwright/package.json').version;
}) {
  try { return { status: 'READY', playwright: probe() }; }
  catch (error) {
    return error.code === 'WB_BROWSER_MISSING' || (error.code === 'MODULE_NOT_FOUND' && /playwright/.test(error.message))
      ? { status: 'BLOCKED', reason: 'Existing Playwright/browser unavailable; no download attempted' }
      : { status: 'FAIL', reason: 'Unexpected browser preflight error' };
  }
}
function selfTest() {
  const valid = JSON.stringify({ coreAssertions: 18, productionConnected: false, iphoneTested: false, environment: 'synthetic loopback', findings: 'completed' });
  const cases = [
    ['valid HTTP', {status:0}, valid, 'PASS'],
    ['assertion failure', {status:1}, valid, 'FAIL'],
    ['exit two is not environment proof', {status:2}, valid, 'FAIL'],
    ['timeout', {status:null,error:{code:'ETIMEDOUT'}}, valid, 'FAIL'],
    ['missing report', {status:0}, undefined, 'FAIL'],
    ['broken JSON', {status:0}, '{', 'FAIL'],
    ['missing fields', {status:0}, '{}', 'FAIL'],
    ['invalid count', {status:0}, valid.replace('18','0'), 'FAIL'],
    ['invalid type', {status:0}, '[]', 'FAIL'],
    ['contradictory failure', {status:0}, valid.replace('"coreAssertions"','"failed":1,"coreAssertions"'), 'FAIL'],
  ];
  const results = cases.map(([name, result, report, expected]) => ({ name, status: classify(result, suites.http, report).status === expected ? 'PASS' : 'FAIL' }));
  for (const [name, suite, result, report] of [['discovery invalid', suites.discovery, {status:0}, '{}'], ['backup malformed', suites['backup-webkit'], {status:0,stdout:'{bad'}, null]]) results.push({name,status:classify(result,suite,report).status === 'FAIL' ? 'PASS' : 'FAIL'});
  for (const [label, code, expected] of [['missing browser','WB_BROWSER_MISSING','BLOCKED'], ['missing playwright','MODULE_NOT_FOUND','BLOCKED'], ['preflight programming error','EUNEXPECTED','FAIL']]) results.push({name:label,status:browserPreflight('webkit',()=>{throw Object.assign(Error(label),{code});}).status === expected ? 'PASS' : 'FAIL'});
  console.log(JSON.stringify({results,passed:results.filter(r=>r.status==='PASS').length,failed:results.filter(r=>r.status==='FAIL').length,blocked:0},null,2));
  process.exitCode=results.some(r=>r.status==='FAIL')?1:0;
}
async function main() {
  if (process.cwd() !== root || !profiles[profile]) throw Error('Run from repository root with --profile ci-http or smoke');
  const head = git('rev-parse', 'HEAD').trim();
  git('merge-base', '--is-ancestor', '6c70c706ce9dec666040b20c41e68b825209be9c', head);
  const sourceFiles = git('ls-files', '-z', 'v2').split('\0').filter(Boolean);
  const before = Object.fromEntries(sourceFiles.map(f => [f, sha(fs.readFileSync(path.join(root, f)))]));
  const beforeStatus = git('status', '--porcelain');
  const runDir = path.join(root, '.tools', 'autonomy', crypto.randomUUID());
  fs.mkdirSync(runDir, { recursive: true });
  const summary = { sourceCommit: head, runnerSha256: sha(fs.readFileSync(__filename)), profile, syntheticOnly: true, realIphone: false, sharedCloudAccess: false, deployments: 0, results: [] };
  // Preserve platform essentials and existing browser locations, but do not inherit cloud/test credentials.
  const env = {};
  for (const [k, v] of Object.entries(process.env)) if (/^(PATH|PATHEXT|SYSTEMROOT|WINDIR|COMSPEC|TEMP|TMP|HOME|USERPROFILE|LOCALAPPDATA|APPDATA|PUBLIC|NODE_PATH|PLAYWRIGHT_BROWSERS_PATH|WB_BROWSER_CHANNEL)$/i.test(k)) env[k] = v;
  env.PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD = '1';
  for (const name of profiles[profile]) {
    const suite = suites[name], directory = path.join(runDir, name), work = path.join(directory, 'workspace');
    fs.mkdirSync(work, { recursive: true });
    for (const f of sourceFiles) {
      // Do not seed old result files: a missing new report must not look like a pass.
      if (/results\.json$|\.png$/i.test(f)) continue;
      const target = path.join(work, f); fs.mkdirSync(path.dirname(target), { recursive: true }); fs.copyFileSync(path.join(root, f), target);
    }
    const row = { name, engine: suite.engine || 'node-http', script: 'v2/' + suite.script, attempts: 0, status: 'BLOCKED' };
    if (suite.engine) {
      const preflight = browserPreflight(suite.engine);
      if (preflight.status !== 'READY') { row.status = preflight.status; row.reason = preflight.reason; summary.results.push(row); continue; }
      row.playwright = preflight.playwright;
    }
    row.attempts = 1;
    const result = cp.spawnSync(process.execPath, [row.script], { cwd: work, env: { ...env, WB_BROWSER: suite.engine === 'webkit' ? 'webkit' : 'chromium' }, encoding: 'utf8', timeout: 180000, maxBuffer: 10e6 });
    fs.writeFileSync(path.join(directory, 'stdout.log'), redact(result.stdout || '', runDir));
    fs.writeFileSync(path.join(directory, 'stderr.log'), redact(result.stderr || '', runDir));
    row.exitCode = result.status;
    let reportText;
    if (suite.result) {
      const file = path.join(work, 'v2', suite.result);
      if (fs.existsSync(file)) {
        reportText = fs.readFileSync(file, 'utf8');
        fs.writeFileSync(path.join(directory, 'result.json'), redact(reportText, runDir));
        row.evidence = name + '/result.json';
      }
    }
    Object.assign(row, classify(result, suite, reportText));
    summary.results.push(row);
    // No blind retry; Codex diagnoses actual failures before any separately recorded rerun.
  }
  summary.sourceUnchanged = Object.entries(before).every(([f, hash]) => sha(fs.readFileSync(path.join(root, f))) === hash);
  summary.gitStatusUnchanged = beforeStatus === git('status', '--porcelain');
  summary.passed = summary.results.filter(r => r.status === 'PASS').length;
  summary.failed = summary.results.filter(r => r.status === 'FAIL').length + (summary.sourceUnchanged && summary.gitStatusUnchanged ? 0 : 1);
  summary.blocked = summary.results.filter(r => r.status === 'BLOCKED').length;
  summary.status = summary.failed ? 'FAIL' : summary.blocked ? 'BLOCKED' : 'PASS';
  fs.writeFileSync(path.join(runDir, 'summary.json'), JSON.stringify(summary, null, 2));
  const markdown = ['# V2 isolated automation', `Source: ${head}`, `Profile: ${profile}`, `PASS ${summary.passed} / FAIL ${summary.failed} / BLOCKED ${summary.blocked}`, 'Synthetic local suites only; not iPhone or deployment acceptance.', ...summary.results.map(r => `- ${r.name}: ${r.status}; attempts=${r.attempts}`)].join('\n');
  fs.writeFileSync(path.join(runDir, 'summary.md'), markdown);
  if (process.env.GITHUB_STEP_SUMMARY) fs.appendFileSync(process.env.GITHUB_STEP_SUMMARY, markdown + '\n');
  console.log(JSON.stringify({ ...summary, evidenceDirectory: path.relative(root, runDir).replaceAll('\\', '/') }, null, 2));
  process.exitCode = summary.failed ? 1 : summary.blocked ? 2 : 0;
}
if (process.argv.includes('--self-test')) selfTest();
else main().catch(() => { console.error(JSON.stringify({ status: 'FAIL', reason: 'Runner/report processing failure; existing evidence preserved' })); process.exitCode = 1; });
