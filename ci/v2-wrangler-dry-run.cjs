'use strict';
const fs = require('node:fs');
const path = require('node:path');
const cp = require('node:child_process');
const crypto = require('node:crypto');
const assert = require('node:assert/strict');
const CANDIDATE = '6c70c706ce9dec666040b20c41e68b825209be9c';
const REPO = 'wangxueqing0427-oss/personal-workbench';
const root = path.resolve(__dirname, '..');
const reportDir = path.join(process.env.RUNNER_TEMP || root, 'v2-ci-report');
fs.mkdirSync(reportDir, {recursive:true});
const report = { candidateSourceCommit:CANDIDATE, workflowCommit:null, node:process.version, wrangler:'4.149.0', command:'node <tools>/wrangler/bin/wrangler.js deploy --cwd <candidate>/v2 --config wrangler.staging.jsonc --dry-run --outdir <new-package>', results:[], dryRunExitCode:null, deployed:false, cloudCredentialsUsed:false, cloudDataAccess:false, packedFiles:[] };
let temporary;
const hash = bytes => crypto.createHash('sha256').update(bytes).digest('hex');
const git = (...args) => cp.execFileSync('git', args, {cwd:root,maxBuffer:30e6}).toString().trim();
const cleanText = text => String(text || '').split(root).join('<checkout>').split(temporary || '\0').join('<temporary>').replace(/\x1b\[[0-9;]*m/g,'').replace(/[A-Za-z]:[\\/]+Users[\\/][^\s'"),;]+/g,'<private-path>').replace(/\/(?:home|Users)\/[^\s'"),;]+/g,'<runner-path>');
function check(name, fn) { try { const detail=fn();report.results.push({name,status:'PASS',...(detail?{detail}:{})}); } catch(error) {report.results.push({name,status:'FAIL',reason:cleanText(error.message)});throw error;} }
function run(label, exe, args, env, cwd, timeout=120000) {
  const r=cp.spawnSync(exe,args,{env,cwd,encoding:'utf8',timeout,maxBuffer:8e6});
  fs.writeFileSync(path.join(reportDir,label+'.log'),cleanText(r.stdout)+'\n'+cleanText(r.stderr));
  if(label==='wrangler-dry-run')report.dryRunExitCode=r.status;
  if(r.error || r.status!==0)throw Error(label+' failed; exit='+r.status+'; error='+(r.error?.code||'none'));
  return r;
}
function collect(directory) {
  return fs.readdirSync(directory,{withFileTypes:true}).flatMap(e=>{const file=path.join(directory,e.name);return e.isDirectory()?collect(file):[{file,bytes:fs.statSync(file).size,sha256:hash(fs.readFileSync(file))}];});
}
try {
  check('approved PR event, branch and exact source base',()=>{
    assert.equal(process.platform,'linux');assert.equal(process.version,'v24.22.1');assert.equal(process.env.GITHUB_EVENT_NAME,'pull_request');
    const e=JSON.parse(fs.readFileSync(process.env.GITHUB_EVENT_PATH));
    assert.equal(e.action,'opened');assert.equal(e.repository.full_name,REPO);assert.equal(e.repository.private,false);
    assert.equal(e.pull_request.head.repo.full_name,REPO);assert.equal(e.pull_request.head.ref,'ci/v2-wrangler-dry-run-20261110');assert.equal(e.pull_request.base.sha,CANDIDATE);
    report.workflowCommit=git('rev-parse','HEAD');assert.equal(report.workflowCommit,e.pull_request.head.sha);git('merge-base','--is-ancestor',CANDIDATE,'HEAD');
    const changed=git('diff','--name-only',CANDIDATE,'HEAD').split('\n').filter(Boolean);
    const approved=['.github/workflows/v2-wrangler-dry-run.yml','ci/v2-wrangler-dry-run.cjs','ci/v2-expected-build.json','ci/wrangler-deps/package.json','ci/wrangler-deps/package-lock.json','ci/README.md'];
    assert(changed.length>0&&changed.every(f=>approved.includes(f)),'Change outside approved CI-only scope');return {changed};
  });
  temporary=fs.mkdtempSync(path.join(process.env.RUNNER_TEMP,'v2-package-'));
  const source=path.join(temporary,'candidate'),tools=path.join(temporary,'tools'),profile=path.join(temporary,'profile'),output=path.join(temporary,'package');
  fs.mkdirSync(tools);fs.mkdirSync(profile);
  const env={};for(const[k,v]of Object.entries(process.env))if(/^(PATH|TMPDIR|TMP|TEMP|LANG|LC_ALL)$/i.test(k))env[k]=v;
  Object.assign(env,{HOME:profile,XDG_CONFIG_HOME:profile,CI:'true',WRANGLER_SEND_METRICS:'false',WRANGLER_DISABLE_UPDATE_CHECK:'true',npm_config_cache:path.join(temporary,'npm-cache'),npm_config_userconfig:path.join(temporary,'empty-npmrc'),npm_config_audit:'false',npm_config_fund:'false'});
  fs.writeFileSync(env.npm_config_userconfig,'');
  check('fixed dependency versions and registry integrity lock',()=>{
    for(const f of ['package.json','package-lock.json'])fs.copyFileSync(path.join(root,'ci/wrangler-deps',f),path.join(tools,f),fs.constants.COPYFILE_EXCL);
    const p=JSON.parse(fs.readFileSync(path.join(tools,'package.json'))),l=JSON.parse(fs.readFileSync(path.join(tools,'package-lock.json')));
    assert.equal(p.dependencies.wrangler,'4.149.0');assert.equal(l.packages['node_modules/wrangler'].version,'4.149.0');
    for(const[k,v]of Object.entries(l.packages).filter(([k])=>k)){assert(v.version&&v.integrity&&/^https:\/\/registry\.npmjs\.org\//.test(v.resolved),'Unpinned or non-registry dependency: '+k);}
    run('npm-ci','npm',['ci','--prefix',tools,'--ignore-scripts','--no-audit','--no-fund'],env,temporary,240000);
    assert.equal(JSON.parse(fs.readFileSync(path.join(tools,'node_modules/wrangler/package.json'))).version,'4.149.0');
  });
  check('application worktree is immutable candidate',()=>{
    git('worktree','add','--detach',source,CANDIDATE);assert.equal(cp.execFileSync('git',['rev-parse','HEAD'],{cwd:source}).toString().trim(),CANDIDATE);
    assert(!fs.existsSync(path.join(source,'v2/staging-public')),'Never overwrite existing build');
  });
  check('original candidate build and complete resource hash comparison',()=>{
    run('candidate-build',process.execPath,[path.join(source,'v2/build-staging.cjs')],env,source);
    const directory=path.join(source,'v2/staging-public'),m=JSON.parse(fs.readFileSync(path.join(directory,'build-info.json'))),expected=JSON.parse(fs.readFileSync(path.join(root,'ci/v2-expected-build.json')));
    assert.deepEqual(m,expected);assert.equal(m.sourceCommit,CANDIDATE);assert.equal(m.syntheticOnly,true);assert.equal(Object.keys(m.assets).length,18);
    const actual=collect(directory);assert.deepEqual(actual.map(x=>path.relative(directory,x.file).replaceAll('\\','/')).sort(),[...Object.keys(m.assets),'build-info.json'].sort());
    report.releaseId=m.releaseId;report.resources=Object.entries(m.assets).map(([file,item])=>{const b=fs.readFileSync(path.join(directory,file));assert.equal(b.length,item.bytes);assert.equal(hash(b),item.sha256);return {file,...item,status:'PASS'};});
    report.buildInfoSha256=hash(fs.readFileSync(path.join(directory,'build-info.json')));
    assert.equal(hash(fs.readFileSync(path.join(source,'v2/staging-worker.mjs'))),m.workerSourceSha256);assert.equal(hash(fs.readFileSync(path.join(source,'v2/wrangler.staging.jsonc'))),m.configSha256);
  });
  check('unchanged isolated bindings, compatibility and SQLite migration',()=>{
    const c=JSON.parse(fs.readFileSync(path.join(source,'v2/wrangler.staging.jsonc')));
    assert.equal(c.name,'personal-workbench-v2-staging');assert.equal(c.main,'staging-worker.mjs');assert.equal(c.compatibility_date,'2026-10-10');
    assert.deepEqual(c.assets,{directory:'./staging-public',binding:'ASSETS',html_handling:'none',run_worker_first:['/sync','/sync/*']});assert.deepEqual(c.durable_objects,{bindings:[{name:'TEST_SYNC',class_name:'TestSync'}]});
    assert.deepEqual(c.migrations,[{tag:'v2-staging-sqlite-1',new_sqlite_classes:['TestSync']}]);assert.equal(c.vars.TEST_ENVIRONMENT,'synthetic-only');
    for(const k of ['kv_namespaces','r2_buckets','queues','services','d1_databases','dispatch_namespaces','unsafe'])assert(!c[k],'Unexpected resource '+k);
    report.configuration={name:c.name,main:c.main,assets:c.assets,durable_objects:c.durable_objects,migrations:c.migrations,compatibility_date:c.compatibility_date};
  });
  const guard=path.join(temporary,'offline-guard.cjs'),networkLog=path.join(temporary,'network-blocks.jsonl');
  fs.writeFileSync(guard,"const fs=require('fs');function deny(kind){fs.appendFileSync(process.env.CI_NETWORK_AUDIT,JSON.stringify({blocked:true,kind})+'\\n');throw Object.assign(Error('Offline dry-run blocks network'),{code:'CI_OFFLINE'});}globalThis.fetch=()=>deny('fetch');for(const n of ['http','https']){require(n).request=()=>deny(n+'.request');require(n).get=()=>deny(n+'.get');}require('net').Socket.prototype.connect=function(){return deny('socket.connect');};require('tls').connect=()=>deny('tls.connect');");
  check('Wrangler dry-run packages without cloud credentials',()=>{
    const offlineEnv={...env,NODE_OPTIONS:'--require='+guard,CI_NETWORK_AUDIT:networkLog,CLOUDFLARE_API_BASE_URL:'http://127.0.0.1:9'};
    const packed=run('wrangler-dry-run',process.execPath,[path.join(tools,'node_modules/wrangler/bin/wrangler.js'),'deploy','--cwd',path.join(source,'v2'),'--config','wrangler.staging.jsonc','--dry-run','--outdir',output],offlineEnv,source);
    report.wranglerOutputChecks={assets:packed.stdout.includes('env.ASSETS'),testSync:packed.stdout.includes('env.TEST_SYNC (TestSync)'),dryRunExit:packed.stdout.includes('--dry-run: exiting now.')};
    assert(Object.values(report.wranglerOutputChecks).every(Boolean),'Wrangler did not report expected dry-run bindings/exit');
    report.networkAttemptsBlocked=fs.existsSync(networkLog)?fs.readFileSync(networkLog,'utf8').trim().split('\n').map(x=>JSON.parse(x)):[];
    report.packedFiles=collect(output).map(x=>({...x,file:path.relative(output,x.file).replaceAll('\\','/')}));assert(report.packedFiles.some(x=>/staging-worker\.(m?js)$/.test(x.file)&&x.bytes>0),'Missing worker package entry');
  });
  check('tracked candidate source unchanged and review artifacts contain no private material',()=>{
    assert.equal(cp.execFileSync('git',['status','--porcelain','--untracked-files=no'],{cwd:source}).toString().trim(),'');
    for(const f of collect(output)){const text=fs.readFileSync(f.file,'utf8');assert(!/(?:[A-Za-z]:[\\/]+Users[\\/]|\/Users\/|-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----|gh[pousr]_[A-Za-z0-9]{30,}|github_pat_[A-Za-z0-9_]{30,})/.test(text),'Private pattern in output');}
  });
} catch(error) {
  if(!report.results.some(r=>r.status==='FAIL'))report.results.push({name:'execution or report processing',status:'FAIL',reason:cleanText(error.message)});
} finally {
  report.passed=report.results.filter(r=>r.status==='PASS').length;report.failed=report.results.filter(r=>r.status==='FAIL').length;report.blocked=0;report.status=report.failed?'FAIL':'PASS';
  report.limits=['Packaging only; no deployment or cloud data verification.','Only the initial opened PR event runs; application is always the immutable approved candidate. Future workflow edits require independent review.','Reported evidence does not prove absence of unknown external independent scripts.'];
  const json=cleanText(JSON.stringify(report,null,2));fs.writeFileSync(path.join(reportDir,'report.json'),json);
  const markdown=['# V2 locked candidate packaging',`Status: ${report.status}; PASS ${report.passed} / FAIL ${report.failed} / BLOCKED ${report.blocked}`,`Application source: ${CANDIDATE}`,`Workflow source: ${report.workflowCommit}`,`Wrangler: ${report.wrangler}; dry-run exit: ${report.dryRunExitCode}`,`Release: ${report.releaseId||'NOT RUN'}`,...report.results.map(r=>`- ${r.status}: ${r.name}${r.reason?' — '+r.reason:''}`),'','```json',json,'```'].join('\n');
  fs.writeFileSync(path.join(reportDir,'report.md'),markdown);if(process.env.GITHUB_STEP_SUMMARY)fs.appendFileSync(process.env.GITHUB_STEP_SUMMARY,markdown+'\n');
  console.log(json);process.exitCode=report.failed?1:0;
}
