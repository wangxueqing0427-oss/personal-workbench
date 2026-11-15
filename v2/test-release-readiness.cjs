'use strict';
/**
 * Production readiness gate is intentionally RED/BLOCKED for promotion,
 * while this *test of the blocker* should be green. Never read actual
 * mobile V1 data, modify main, make HTTP calls or run a migration.
 */
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');
const {inventory,verifyExactShadow,fingerprint}=require('./release-readiness-audit.cjs');
let passed=0;
const check=(condition,why)=>{assert.ok(condition,why);passed++;console.log('PASS: '+why);};
const bytes=Buffer.from('SYNTHETIC_WORKBENCH_ORIGINAL_BYTES_2026_11_15');
const legacy={
  contractProjectsV138:[{id:'synthetic-contract-1',sourceKey:'synthetic-contract-1',hospital:'示例甲医院',name:'合成CT维保',
    device:'CT设备',status:'待核对',contractAmount:2000,receivedAmount:600,unpaidAmount:1400,contractNumber:'SYNTH-001'}],
  businessProjectsV140:[{id:'synthetic-business-1',hospital:'示例乙医院',name:'合成放疗维修',description:'维修演示'}],
  contractActionsV139:{
    'synthetic-contract-1':{currentStatus:'等待对方',nextAction:'催对方确认报价',followupDate:'2026-11-20',
      timeline:[{id:'synthetic-progress-1',text:'测试说明',occurredOn:'2026-11-15'}]}
  },
  inbox:[{id:'synthetic-original-1',name:'SYNTHETIC.txt',size:bytes.length,originalStored:true,status:'待AI整理',
    summary:'附件原件必须保留'}],
  projectFilesV150:{'synthetic-contract-1':['synthetic-original-1']},
  tasks:[{id:'synthetic-task-1',title:'必须保留的原任务'}],
  notes:[{id:'synthetic-note-1',text:'必须保留的原笔记'}],
  finance:[{id:'synthetic-money-1',amount:100}],
  opportunities:[{id:'synthetic-opp-1',title:'必须保留的商机'}]
};
const originals={'synthetic-original-1':bytes};
const pristine=structuredClone(legacy),pristineHash=fingerprint(legacy);
const inspect=inventory(legacy,originals);
check(inspect.verdict==='BLOCKED_NOT_FOR_PRODUCTION','candidate is hard-blocked from production even with complete synthetic originals');
check(inspect.errors.length===0,'synthetic baseline metadata and original bytes are internally coherent');
check(inspect.originalFileCount===1&&inspect.originalByteCount===bytes.length&&inspect.originalHashes['synthetic-original-1'].length===64,
  'original binary manifest verifies count, size and SHA256');
check(inspect.kindCounts.contracts===1&&inspect.kindCounts.business===1&&inspect.kindCounts.inbox===1&&inspect.kindCounts.projectFileReferences===1,
  'contract, business, inbox and project attachment reference counts are inventoried');
check(['notes','tasks','finance','opportunities'].every(x=>inspect.blockers.includes('LEGACY_SECTION_UNMAPPED:'+x)),
  'non-project historical notes, tasks, finance and opportunities cannot be silently dropped');
check(inspect.blockers.includes('V1_INBOX_AND_ORIGINALS_CONVERTER_INCOMPLETE')&&
  inspect.blockers.includes('MIGRATION_NOT_VERIFIED_ON_REAL_DEVICE')&&
  inspect.blockers.includes('PRODUCTION_BACKUP_AND_RESTORE_NOT_VERIFIED'),
  'no imaginary migration completion, file recovery or real device testing');
const shadow=structuredClone(legacy),shadowFiles={'synthetic-original-1':Buffer.from(bytes)};
const verified=verifyExactShadow(legacy,originals,shadow,shadowFiles);
check(verified.verified&&verified.sourceHash===pristineHash&&verified.fileCount===1&&verified.fileBytes===bytes.length,
  'separate synthetic shadow matches source metadata and original bytes exactly');
const corrupt=structuredClone(legacy);corrupt.notes[0].text='TAMPERED';
assert.throws(()=>verifyExactShadow(legacy,originals,corrupt,shadowFiles),/SHADOW_STATE_MISMATCH/);
check(true,'shadow with changed historical note is rejected before replacement');
const corruptFiles={'synthetic-original-1':Buffer.from(bytes)};corruptFiles['synthetic-original-1'][0]^=1;
assert.throws(()=>verifyExactShadow(legacy,originals,shadow,corruptFiles),/SHADOW_FILE_BYTES_MISMATCH/);
check(true,'single-byte original file corruption blocks shadow approval');
assert.throws(()=>verifyExactShadow(legacy,originals,shadow,{}),/SHADOW_FILE_CATALOG_MISMATCH/);
check(true,'missing original file cannot be treated as recoverable data');
const brokenSource=structuredClone(legacy);brokenSource.projectFilesV150['synthetic-contract-1'].push('missing-original');
const brokenAudit=inventory(brokenSource,originals);
check(brokenAudit.errors.includes('PROJECT_FILE_MISSING_INBOX_METADATA')&&brokenAudit.errors.includes('LINKED_ORIGINAL_MISSING'),
  'dangling project-to-file references stop promotion');
const lostBytes=inventory(legacy,{});
check(lostBytes.errors.includes('ORIGINAL_BYTES_UNAVAILABLE')&&lostBytes.errors.includes('LINKED_ORIGINAL_MISSING'),
  'an original marked stored but inaccessible on this device is a release blocker');
const wrongBytes=inventory(legacy,{'synthetic-original-1':bytes.subarray(0,-1)});
check(wrongBytes.errors.includes('ORIGINAL_SIZE_MISMATCH'),'original length mismatch blocks migration');
const duplicate=structuredClone(legacy);duplicate.businessProjectsV140[0].id='synthetic-contract-1';
check(inventory(duplicate,originals).errors.includes('DUPLICATE_PROJECT_ID'),
  'legacy duplicate project identities cannot be overwritten');
const wrongRef=structuredClone(legacy);wrongRef.projectFilesV150['not-a-project']=['synthetic-original-1'];
check(inventory(wrongRef,originals).errors.includes('PROJECT_FILE_UNKNOWN_PROJECT'),
  'orphan project attachment mapping is surfaced as a blocker');
const fullCore=fs.readFileSync(path.join(__dirname,'business-core.js'),'utf8');
const sandbox={crypto:require('node:crypto').webcrypto,structuredClone,console};
vm.createContext(sandbox);vm.runInContext(fullCore,sandbox,{filename:'business-core.js',timeout:1000});
const converted=sandbox.WorkbenchBusiness.fromLegacy(pristine);
check(converted.projects.length===2&&converted.hospitals.length===2,
  'existing partial legacy converter maps synthetic contract and business projects');
check(converted.notes.length===0&&converted.files.length===0&&converted.projects[0].fileIds.length===1,
  'release audit proves current project-only converter cannot preserve inbox and original-file records');
check(converted.projects[0].financials.contractAmount===2000&&converted.projects[0].financials.unpaidAmount===1400,
  'historical financial amounts are visible in partial conversion but not yet full migration');
check(fingerprint(legacy)===pristineHash&&JSON.stringify(legacy)===JSON.stringify(pristine)&&
  Buffer.compare(originals['synthetic-original-1'],bytes)===0,
  'all audit operations are pure: source JSON and original file bytes are unchanged');
const productionGate={
  label:'BLOCKED_NOT_FOR_PRODUCTION',syntheticSourceOnly:true,originalSourceTouched:false,
  scope:'V1.5.7 real device and original DB NOT opened',
  blockers:inspect.blockers,assertions:passed,failures:0
};
assert.notEqual(productionGate.label,'READY');
console.log('RELEASE_READINESS_GUARD_PASS '+JSON.stringify(productionGate));
