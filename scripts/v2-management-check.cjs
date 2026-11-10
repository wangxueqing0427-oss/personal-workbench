'use strict';
const fs = require('node:fs');
const path = require('node:path');
const cp = require('node:child_process');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const BASELINE = '6c70c706ce9dec666040b20c41e68b825209be9c';
const required = ['AGENTS.md', 'CURRENT.md', 'ROADMAP.md', 'docs/V2-DEVELOPMENT-OPERATING-PROTOCOL.md', 'docs/templates/V2-TASK-REPORT.md', '.github/workflows/v2-management-gate.yml', 'scripts/v2-management-check.cjs'];
const allowed = file => ['AGENTS.md', 'CURRENT.md', 'ROADMAP.md', '.github/workflows/v2-management-gate.yml', 'scripts/v2-management-check.cjs', 'scripts/v2-automation.cjs'].includes(file) || /^docs\/[A-Za-z0-9_./-]+\.md$/.test(file);
function issues(file, text) {
  const found = [];
  if (/(^|\/)(\.dev\.vars[^/]*|\.env(?:\.[^/]*)?|[^/]*\.(?:pem|pfx|p12|xlsx?|docx?|pdf|zip|sqlite|db))$/i.test(file)) found.push('sensitive-file-name');
  if (/(?:gh[pousr]_[A-Za-z0-9]{30,}|github_pat_[A-Za-z0-9_]{30,}|AKIA[A-Z0-9]{16}|-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----)/.test(text)) found.push('credential-pattern');
  if (/(?:oauth_token|refresh_token)\s*=\s*["'][^"']{20,}/.test(text)) found.push('oauth-value');
  if (/(?:[A-Za-z]:[\\/]+Users[\\/]|\/Users\/|\/home\/(?!web_user\b))[^\s'"),;]+/i.test(text)) found.push('private-absolute-path');
  return found;
}
function workflowIssues(text) {
  text = text.replace(/\r\n/g, '\n');
  const bad = [];
  // Fail closed for YAML constructs outside this deliberately narrow workflow subset.
  if (/(?:^|\s)[&*!][A-Za-z0-9_]|<<\s*:/m.test(text)) bad.push('unsupported YAML alias/tag/merge');
  if (/\bwrite(?:-all)?\b/i.test(text)) bad.push('write permission or capability');
  if (/\bsecrets\s*[.\[]/i.test(text)) bad.push('secrets access');
  for (const flag of ['pull_request_target:', 'workflow_dispatch:', 'push:', 'schedule:', 'secrets.', 'wrangler ']) if (text.includes(flag)) bad.push(flag);
  const lines = text.split(/\r?\n/);
  let inOn = false, inPermissions = false, permissionIndent = -1;
  let seenOn = 0;
  for (const line of lines) {
    if (!line.trim() || line.trimStart().startsWith('#')) continue;
    const indent = line.length - line.trimStart().length;
    if (/^on:\s*$/.test(line)) { inOn = true; seenOn++; continue; }
    if (/^["']?on["']?\s*:/.test(line) && !/^on:\s*$/.test(line)) bad.push('unsupported trigger syntax');
    if (inOn && indent === 0) inOn = false;
    if (inOn && indent <= 2 && !/^  pull_request:\s*$/.test(line)) bad.push('unapproved trigger');
    if (inPermissions && indent <= permissionIndent) inPermissions = false;
    if (/^\s*["']?permissions["']?\s*:/.test(line)) {
      if (!/^\s*permissions:\s*$/.test(line)) bad.push('unsupported permissions syntax');
      inPermissions = true; permissionIndent = indent; continue;
    }
    if (inPermissions && !/^\s+[a-z][a-z-]*:\s*(read|none)\s*$/.test(line)) bad.push('unapproved permission');
    if (/\buses["']?\s*:/.test(line) && !/^\s*-?\s*uses:\s*[A-Za-z0-9_.-]+\/[A-Za-z0-9_./-]+@[a-f0-9]{40}\s*$/.test(line)) bad.push('action not pinned to full SHA');
  }
  if (seenOn !== 1) bad.push('exactly one supported on mapping required');
  for (const flag of ['pull_request:', 'branches: [dev/v2-safe-candidate-20261028]', 'contents: read', 'persist-credentials: false', 'timeout-minutes: 10', 'actions/checkout@11bd71901bbe5b1630ceea73d27597364c9af683']) if (!text.includes(flag)) bad.push('missing ' + flag);
  return bad;
}
function selfTest() {
  const checks = [
    ['allow governance document', () => assert(allowed('docs/reports/task.md'))],
    ['reject application modification', () => assert(!allowed('v2/business-store.js'))],
    ['reject production modification', () => assert(!allowed('index.html'))],
    ['reject secret filename', () => assert(issues('v2/.dev.vars', '').length)],
    ['reject original attachment', () => assert(issues('docs/customer.pdf', '').length)],
    ['reject access credential', () => assert(issues('sample.txt', 'gh' + 'p_' + 'x'.repeat(35)).length)],
    ['reject private host path', () => assert(issues('sample.txt', 'C:' + '/Users/' + 'fixture/private').length)],
    ['reject oauth value', () => assert(issues('sample.txt', 'oauth' + '_token="' + 'x'.repeat(30) + '"').length)],
    ['accept relative synthetic path', () => assert.equal(issues('sample.txt', 'v2/.tools/synthetic').length, 0)],
    ['accept approved workflow', () => assert.equal(workflowIssues(fs.readFileSync(required[5], 'utf8')).length, 0)],
    ['reject privileged trigger', () => assert(workflowIssues(fs.readFileSync(required[5], 'utf8') + '\npull_request' + '_target:').length)],
    ['reject deployment step', () => assert(workflowIssues(fs.readFileSync(required[5], 'utf8') + '\nrun: wrangler' + ' deploy').length)],
  ];
  const workflow = fs.readFileSync(required[5], 'utf8').replace(/\r\n/g, '\n');
  for (const permission of ['actions', 'pull-requests', 'checks', 'deployments', 'packages', 'security-events']) checks.push(['reject ' + permission + ' write', () => assert(workflowIssues(workflow.replace('contents: read', permission + ': write')).length)]);
  for (const trigger of ['push', 'schedule', 'workflow_dispatch', 'pull_request_target', 'repository_dispatch']) checks.push(['reject ' + trigger, () => assert(workflowIssues(workflow.replace('  pull_request:', '  ' + trigger + ':')).length)]);
  for (const [name, from, to] of [
    ['flow permission', 'permissions:\n  contents: read', 'permissions: {actions: write}'],
    ['scalar permission', 'permissions:\n  contents: read', 'permissions: write-all'],
    ['unpinned action', '@11bd71901bbe5b1630ceea73d27597364c9af683', '@v4'],
    ['short action SHA', '@11bd71901bbe5b1630ceea73d27597364c9af683', '@11bd719'],
    ['job permission', '    runs-on:', '    permissions:\n      pull-requests: write\n    runs-on:'],
    ['bracket secrets', 'node scripts/v2-automation.cjs --profile ci-http', "echo ${{ secrets['unapproved'] }}"],
    ['single space trigger', '  pull_request:', ' schedule:'],
  ]) checks.push(['reject ' + name, () => assert(workflowIssues(workflow.replace(from,to)).length)]);
  const results = checks.map(([name, run]) => { try { run(); return { name, status: 'PASS' }; } catch { return { name, status: 'FAIL' }; } });
  const failed = results.filter(r => r.status === 'FAIL').length;
  console.log(JSON.stringify({ scope: 'management-guard-self-test', passed: results.length - failed, failed, blocked: 0, results, cloudRequests: 0 }, null, 2));
  if (failed) process.exitCode = 1;
}
function main() {
  if (process.argv.includes('--self-test')) return selfTest();
  if (!process.argv.includes('--management-only')) throw Error('Explicit --management-only required; business changes require a separate risk plan');
  const root = path.resolve(__dirname, '..');
  if (process.cwd() !== root) throw Error('Run from repository root');
  const git = (...args) => cp.execFileSync('git', ['-c', 'safe.directory=' + root.replaceAll('\\', '/'), ...args], { cwd: root, maxBuffer: 30e6 }).toString();
  const comparisonBase = process.env.WB_MANAGEMENT_BASE || BASELINE;
  if (!/^[a-f0-9]{40}$/.test(comparisonBase)) throw Error('Invalid comparison base');
  git('cat-file', '-e', BASELINE + '^{commit}');
  git('merge-base', '--is-ancestor', BASELINE, 'HEAD');
  git('merge-base', '--is-ancestor', comparisonBase, 'HEAD');
  const changed = [...new Set([...git('diff', '--name-only', comparisonBase, '--').trim().split('\n'), ...git('ls-files', '--others', '--exclude-standard').trim().split('\n')].filter(Boolean))];
  const files = [...new Set([...git('ls-files').trim().split('\n'), ...changed])].filter(Boolean);
  const results = [];
  const check = (name, ok, details) => results.push({ name, status: ok ? 'PASS' : 'FAIL', ...(details ? { details } : {}) });
  check('required management documents', required.every(f => fs.existsSync(f)));
  check('management-only change scope; production and application protected', changed.every(allowed), changed.filter(f => !allowed(f)));
  const findings = [];
  for (const file of files) {
    if (!fs.existsSync(file)) continue;
    if (fs.lstatSync(file).isSymbolicLink()) { findings.push({ file, rule: 'symlink-review-required' }); continue; }
    for (const rule of issues(file, fs.readFileSync(file, 'utf8'))) findings.push({ file, rule });
  }
  check('tracked/candidate sensitive names and patterns', findings.length === 0, findings);
  const missing = [];
  for (const file of required.filter(f => f.endsWith('.md'))) {
    if (!fs.existsSync(file)) continue;
    for (const m of fs.readFileSync(file, 'utf8').matchAll(/\]\(([^)]+)\)/g)) {
      const target = m[1].split('#')[0];
      if (target && !/^[a-z]+:/i.test(target) && !fs.existsSync(path.resolve(path.dirname(file), target))) missing.push({ file, target });
    }
  }
  check('management local links', missing.length === 0, missing);
  const workflowFindings = files.filter(f => /^\.github\/workflows\/.*\.ya?ml$/.test(f) && fs.existsSync(f)).flatMap(file => workflowIssues(fs.readFileSync(file, 'utf8')).map(rule => ({file,rule})));
  check('all workflows: non-deploying least-privilege and SHA pinned', fs.existsSync(required[5]) && workflowFindings.length === 0, workflowFindings);
  const failed = results.filter(r => r.status === 'FAIL').length;
  const inputs = Object.fromEntries(required.filter(f => fs.existsSync(f)).map(f => [f, crypto.createHash('sha256').update(fs.readFileSync(f)).digest('hex')]));
  console.log(JSON.stringify({ scope: 'management-only; not business or release acceptance', baseline: BASELINE, comparisonBase, sourceCommit: git('rev-parse', 'HEAD').trim(), passed: results.length - failed, failed, blocked: 0, results, changedFiles: changed, inputSha256: inputs, cloudRequests: 0, dataWrites: 0 }, null, 2));
  if (failed) process.exitCode = 1;
}
try { main(); } catch { console.error(JSON.stringify({ status: 'BLOCKED', reason: 'Management check could not complete; inspect local environment privately', cloudRequests: 0 })); process.exitCode = 2; }
