'use strict';
// Offline review only: invokes only read-only Git subcommands, never a cloud client.
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto'),cp=require('node:child_process'),assert=require('node:assert/strict');
const BASE='6c70c706ce9dec666040b20c41e68b825209be9c',BRANCH='ci/v2-staging-release-review-20261111',DIR='ci/staging-release-review/';
const FILES=['README.md','audit.cjs','channel-lock.json','static-evidence.json','workflow-dispatch.template.yml'].map(x=>DIR+x);
const CHECKOUT='actions/checkout@11bd71901bbe5b1630ceea73d27597364c9af683',NODE='actions/setup-node@49933ea5288caeca8642d1e84afbd3f7d6820020';
const sha=b=>crypto.createHash('sha256').update(b).digest('hex');
function need(x,c){if(!x)throw Error(c);}
function checkTemplate(raw){
 const t=raw.replace(/^\uFEFF/,'').replace(/\r\n/g,'\n');
 need(!/\t|\$\{\{\s*secrets\b|CLOUDFLARE_API|GITHUB_TOKEN|id-token\s*:|\bwrite\s*$|^\s*(?:env|secrets)\s*:/im.test(t),'CREDENTIAL_OR_WRITE_PERMISSION');
 need(!/^\s*(?:push|pull_request|pull_request_target|workflow_run|schedule|repository_dispatch)\s*:/m.test(t),'AUTOMATIC_EVENT_DENIED');
 const on=t.match(/^on:\n([\s\S]*?)^permissions:/m)?.[1];
 need(on==='  workflow_dispatch:\n    inputs:\n      purpose:\n        description: Offline review only; no cloud operation\n        required: true\n        type: choice\n        options: [offline-review-only]\n','UNREVIEWED_TRIGGER_SHAPE');
 need(t.includes('permissions:\n  contents: read\njobs:'),'PERMISSIONS_NOT_MINIMAL');
 const uses=[...t.matchAll(/^\s*- uses: (.+)$/gm)].map(x=>x[1]);need(JSON.stringify(uses)===JSON.stringify([CHECKOUT,NODE]),'UNREVIEWED_ACTION_OR_FLOATING_REF');
 const runs=[...t.matchAll(/^\s*run: (.+)$/gm)].map(x=>x[1]);need(JSON.stringify(runs)===JSON.stringify(['node ci/staging-release-review/audit.cjs']),'UNREVIEWED_EXECUTION');
 need(!/\bwrangler\s+(?:deploy|publish|rollback|versions)\b|\bcurl\b|\bwget\b|\bfetch\s*\(/i.test(t),'CLOUD_EXECUTION_DENIED');
 need(t.includes('          ref: REVIEW_COMMIT_SHA_REQUIRED\n')&&t.includes('          persist-credentials: false\n'),'NO_INACTIVE_CHECKOUT_GUARD');
 need(t.includes("    if: github.repository == 'wangxueqing0427-oss/personal-workbench' && github.event_name == 'workflow_dispatch' && github.ref == 'refs/heads/"+BRANCH+"'\n"),'TARGET_OR_EVENT_NOT_LOCKED');
 need(t.includes('    runs-on: ubuntu-latest\n')&&t.includes('    timeout-minutes: 5\n')&&t.includes("          node-version: '24.22.1'\n"),'UNREVIEWED_RUNNER_OR_TOOL');
 // Admit only this audited template. This is not a general-purpose YAML security parser.
 need(sha(t)===TEMPLATE_SHA,'TEMPLATE_BYTES_NOT_REVIEWED');return true;
}
const TEMPLATE_SHA='d3e0dcce4c05052386444291b56e8aa7d53bb82919fd386a7b0c4d97bd706af4';
function git(root,args){try{return cp.execFileSync('git',['-c','safe.directory='+root,'-c','core.fsmonitor=false',...args],{cwd:root,encoding:'utf8',stdio:['ignore','pipe','pipe'],env:{...process.env,GIT_OPTIONAL_LOCKS:'0'}}).trim();}catch{throw Error('GIT_READ_FAILED');}}
function run(root,selfTest=false){
 const checks=[],add=(name,fn)=>{try{fn();checks.push({name,status:'PASS'});}catch(e){checks.push({name,status:'FAIL',reason:e.message});}};
 add('exact application commit exists',()=>need(git(root,['rev-parse',BASE+'^{commit}'])===BASE,'BASE_MISSING'));
 add('current independent branch',()=>need(git(root,['branch','--show-current'])===BRANCH,'WRONG_BRANCH'));
 add('only new allowlisted review files',()=>{const changes=git(root,['diff','--no-ext-diff','--no-textconv','--name-status',BASE,'--']).split('\n').filter(Boolean);for(const row of changes){const [status,name]=row.split('\t');need(status==='A'&&FILES.includes(name),'EXISTING_SOURCE_CHANGED');}const untracked=git(root,['ls-files','--others','--exclude-standard']).split('\n').filter(Boolean);for(const n of untracked)need(FILES.includes(n),'UNEXPECTED_UNTRACKED_FILE');for(const f of FILES){need(fs.statSync(path.join(root,f)).isFile(),'REVIEW_FILE_MISSING');need(git(root,['ls-tree',BASE,'--',f])==='','NOT_A_NEW_REVIEW_FILE');}});
 add('no installed workflow added or edited',()=>{need(!fs.existsSync(path.join(root,'.github/workflows'))||fs.readdirSync(path.join(root,'.github/workflows')).length===0,'ACTIVE_WORKFLOW_FOUND');need(git(root,['ls-tree','-r','--name-only',BASE,'--','.github/workflows'])==='','BASE_HAS_WORKFLOWS');});
 const raw=fs.readFileSync(path.join(root,DIR+'workflow-dispatch.template.yml'),'utf8');add('inactive template has no automatic trigger, credential reference or writer',()=>checkTemplate(raw));
 add('fixed staging target and default write denial',()=>{const x=JSON.parse(fs.readFileSync(path.join(root,DIR+'channel-lock.json'),'utf8').replace(/^\uFEFF/,''));need(x.repository==='wangxueqing0427-oss/personal-workbench'&&x.applicationCommit===BASE&&x.reviewBranch===BRANCH&&x.worker==='personal-workbench-v2-staging'&&x.releaseId==='bac4f438ba39183f0ea216f737cbc7c53c902e949d139b82a880c4e2ec0eba4d'&&x.protectedOldVersion==='d4c54788-0c3e-44a8-a801-2fa066dafe5b'&&x.executionEnabled===false&&x.defaultMode==='offline-review-only'&&x.separateReleaseAndRollbackApproval===true&&x.preserveLiveIOHardStop===true&&x.candidateResources===18&&x.rollbackResources===14&&x.workerSourceSha256==='592ebe372567bb8cbd85f4dc3a1678be8d9b6ac1da62522f6bbb1ed4edaab6ec'&&x.configSha256==='f3bfe906ed56df50ba30551be261785e90507ecdea1a9606343e5db162d13d7d'&&x.protectedSharedRevision===10&&x.protectedSharedPayloadHash==='dcb39f9cbd73d763e74578582e2bff6085a603880c106c8e9f9fb582036dbfa4','LOCK_CHANGED');});
 add('no private local paths or credential material in added files',()=>{for(const f of FILES){const t=fs.readFileSync(path.join(root,f),'utf8');need(!/[A-Za-z]:[\\/]Users[\\/]|\/home\/[^\s/]+\/|-----BEGIN [A-Z ]*PRIVATE KEY-----|\b(?:ghp|github_pat)_[A-Za-z0-9_]{20,}|\beyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+/.test(t),'PRIVATE_MATERIAL_FOUND');}});
 add('manual installation limitation is explicitly documented',()=>{const t=fs.readFileSync(path.join(root,DIR+'README.md'),'utf8');need(t.includes('没有可点击的手动入口')&&t.includes('不能声称当前已能人工发布')&&t.includes('单独获准'),'CLAIM_NOT_QUALIFIED');});
 const self=[];if(selfTest){const negative=(name,text)=>{try{assert.throws(()=>checkTemplate(text));self.push({name,status:'PASS'});}catch{self.push({name,status:'FAIL'});}};
  negative('reject write permission',raw.replace('contents: read','contents: write'));
  negative('reject automatic push trigger',raw.replace('  workflow_dispatch:','  push:'));
  negative('reject privileged PR event',raw.replace('  workflow_dispatch:','  pull_request_target:'));
  negative('reject credential expression',raw+'\n# $'+'{{ secrets.EXAMPLE }}\n');
  negative('reject floating Action version',raw.replace(CHECKOUT,'actions/checkout@v4'));
  negative('reject executable cloud command',raw.replace('run: node ci/staging-release-review/audit.cjs','run: wrangler deploy'));
  negative('reject removed default deny placeholder',raw.replace('REVIEW_COMMIT_SHA_REQUIRED','main'));
  negative('reject unreviewed YAML additions',raw+'\nextra: unreviewed\n');
 }
 const reviewedFiles=Object.fromEntries(FILES.filter(n=>!n.endsWith('static-evidence.json')).map(n=>{const b=fs.readFileSync(path.join(root,n));return [n,{bytes:b.length,sha256:sha(b)}];}));
 return {scope:'offline static review only; no application, bundling, restore or cloud tests',applicationCommit:BASE,reviewBranch:BRANCH,checks,selfTests:self,summary:{PASS:checks.concat(self).filter(x=>x.status==='PASS').length,FAIL:checks.concat(self).filter(x=>x.status==='FAIL').length},reviewedFiles,liveGates:[{name:'default-branch manual entry not installed',status:'BLOCKED'},{name:'exact-Worker authority and version-bound withdrawal asset proof',status:'BLOCKED'},{name:'reviewed live execution adapter',status:'BLOCKED'}],networkRequests:0,deployments:0,rollbacks:0};
}
if(require.main===module){try{const report=run(path.resolve(__dirname,'../..'),process.argv.includes('--self-test'));if(process.argv.includes('--report'))fs.writeFileSync(path.join(__dirname,'static-evidence.json'),JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify(report,null,2));process.exitCode=report.summary.FAIL?1:0;}catch(e){console.log(JSON.stringify({status:'FAIL',reason:e.message}));process.exitCode=1;}}
module.exports={checkTemplate,run};
