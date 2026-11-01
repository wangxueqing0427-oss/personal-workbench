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
      try {
        const p = require('playwright');
        const edge = process.platform === 'win32' && suite.engine === 'chromium';
        if (!edge && !fs.existsSync(p[suite.engine].executablePath())) throw Error('Browser binary unavailable');
        row.playwright = require('playwright/package.json').version;
      } catch { row.reason = 'Existing Playwright/browser unavailable; no download attempted'; summary.results.push(row); continue; }
    }
    row.attempts = 1;
    const result = cp.spawnSync(process.execPath, [row.script], { cwd: work, env: { ...env, WB_BROWSER: suite.engine === 'webkit' ? 'webkit' : 'chromium' }, encoding: 'utf8', timeout: 180000, maxBuffer: 10e6 });
    fs.writeFileSync(path.join(directory, 'stdout.log'), redact(result.stdout || '', runDir));
    fs.writeFileSync(path.join(directory, 'stderr.log'), redact(result.stderr || '', runDir));
    row.exitCode = result.status;
    row.status = result.status === 0 ? 'PASS' : result.status === 2 ? 'BLOCKED' : 'FAIL';
    if (result.error) row.reason = result.error.code === 'ETIMEDOUT' ? 'Bounded suite timeout' : 'Suite execution error';
    if (suite.result) {
      const file = path.join(work, 'v2', suite.result);
      if (!fs.existsSync(file)) { row.status = result.status === 0 ? 'FAIL' : row.status; row.reportMissing = true; }
      else {
        const data = JSON.parse(fs.readFileSync(file, 'utf8'));
        fs.writeFileSync(path.join(directory, 'result.json'), redact(JSON.stringify(data, null, 2), runDir));
        row.evidence = name + '/result.json'; row.summary = data.summary || { assertions: data.coreAssertions };
        if (data.summary?.failed || data.failed || data.status === 'FAIL') row.status = 'FAIL';
        if (row.status !== 'FAIL' && (data.summary?.blocked || data.blocked || data.status === 'BLOCKED')) row.status = 'BLOCKED';
      }
    } else {
      const lines = (result.stdout || '').split(/\r?\n/).filter(x => x.startsWith('{'));
      const reports = lines.map(x => { try { return JSON.parse(x); } catch { return null; } }).filter(Boolean);
      row.summary = { assertions: reports.reduce((n, x) => n + (x.assertions || 0), 0), viewportReports: reports.length };
      if (reports.length !== 2 && row.status === 'PASS') { row.status = 'FAIL'; row.reason = 'Expected both existing viewport reports'; }
    }
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
main().catch(() => { console.error(JSON.stringify({ status: 'BLOCKED', reason: 'Isolated runner could not safely start or finish; no deployment attempted' })); process.exitCode = 2; });
