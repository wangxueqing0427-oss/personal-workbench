'use strict';
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');
const {planLegacyShadow}=require('./legacy-shadow-planner.cjs');
const {fingerprint}=require('./release-readiness-audit.cjs');
let count=0;
const check=(ok,name)=>{assert.ok(ok,name);console.log('PASS: '+name);count++;};
const example={
 contractProjectsV138:[{id:'SYNTHETIC-CONTRACT',sourceKey:'SYNTHETIC-CONTRACT',name:'合成CT维保',
 hospital:'示例甲医院',device:'合成设备A',contractNumber:'DEMO-C-1',contractAmount:100,
 receivedAmount:40,unpaidAmount:60,sourceRow:3}],
 businessProjectsV140:[{id:'SYNTHETIC-BUSINESS',name:'合成报价项目',hospital:'示例乙医院',
 description:'需保留旧业务描述',createdAt:'2026-10-10T00:00:00.000Z'}],
 contractActionsV139:{'SYNTHETIC-CONTRACT':{nextAction:'回访',currentStatus:'等待对方',
 timeline:[{id:'SYNTHETIC-PROGRESS',text:'历史跟进',occurredOn:'2026-10-15'}]}},
 projectFilesV150:{'SYNTHETIC-CONTRACT':['SYNTHETIC-FILE']},
 inbox:[{id:'SYNTHETIC-FILE',name:'original.pdf',type:'application/pdf',size:1048576,
 originalStored:true,createdAt:'2026-10-10',summary:'原件资料'}],
 tasks:[{id:'SYNTHETIC-TASK',title:'一条旧任务'}],
 notes:[{id:'SYNTHETIC-NOTE',text:'旧笔记'}],
 finance:[{id:'SYNTHETIC-FINANCE',amount:60}],
 health:[{id:'SYNTHETIC-HEALTH',note:'测试资料'}],
 hospitals:[{id:'SYNTHETIC-HOSPITAL',name:'额外医院'}]
};
const bytes=Buffer.alloc(1048576);for(let i=0;i<bytes.length;i++)bytes[i]=(i*17+(i>>4))&255;
const originals={'SYNTHETIC-FILE':bytes};
const scope={crypto:require('node:crypto').webcrypto,structuredClone,console};
vm.createContext(scope);vm.runInContext(fs.readFileSync(path.join(__dirname,'business-core.js'),'utf8'),scope);
const originalHash=fingerprint(example);
const converted=planLegacyShadow(example,originals,state=>scope.WorkbenchBusiness.fromLegacy(state),
  {syntheticOnly:true,origin:'synthetic-ci'});
check(converted.productionReady===false&&converted.candidate.legacyMigrationStatus==='SHADOW_ONLY_REVIEW_REQUIRED',
  'complete synthetic shadow is explicitly NOT production migration');
check(converted.sourceUnchanged&&converted.originalBytesVerified&&fingerprint(example)===originalHash,
  'read-only planning leaves caller legacy JSON and file bytes untouched');
check(converted.candidate.projects.length===2&&converted.candidate.hospitals.length===2,
  'project and hospital identities mapped without dropping either type');
check(converted.candidate.projects[0].legacyFields.device==='合成设备A'&&
  converted.candidate.projects[0].legacyFields.contractNumber==='DEMO-C-1'&&
  converted.candidate.projects[0].legacyAction.timeline[0].text==='历史跟进',
  'device, contract and full original action timeline retained as legacy metadata');
check(converted.candidate.files.length===1&&converted.candidate.files[0].sha256.length===64&&
  converted.originals['SYNTHETIC-FILE'].equals(bytes),
  '1MiB original is cloned byte-for-byte with an authenticated file manifest');
check(converted.candidate.projects[0].fileIds[0]==='SYNTHETIC-FILE'&&
  converted.candidate.files[0].projectId==='SYNTHETIC-CONTRACT',
  'source attachment association remains attached to correct contract');
check(converted.candidate.legacyArchiveRaw.tasks[0].title==='一条旧任务'&&
  converted.candidate.legacyArchiveRaw.health[0].note==='测试资料'&&
  converted.candidate.legacyArchiveRaw.finance[0].amount===60,
  'unmapped historical tasks, personal fields and finance survive in unmodified legacy archive');
check(converted.candidate.notes.some(n=>n.fileId==='SYNTHETIC-FILE')&&
  converted.candidate.notes.some(n=>n.source==='V1 inbox shadow'),
  'inbox summary is represented as a reviewable note linked to its original file');
const copyOfSource=structuredClone(example);copyOfSource.inbox[0].size++;
assert.throws(()=>planLegacyShadow(copyOfSource,originals,s=>scope.WorkbenchBusiness.fromLegacy(s),
  {syntheticOnly:true,origin:'synthetic-ci'}),/ORIGINAL_SIZE_MISMATCH/);
check(true,'file length disagreement aborts before a shadow is returned');
const lostOriginal={};
assert.throws(()=>planLegacyShadow(example,lostOriginal,s=>scope.WorkbenchBusiness.fromLegacy(s),
  {syntheticOnly:true,origin:'synthetic-ci'}),/ORIGINAL_BYTES_UNAVAILABLE/);
check(true,'missing V1 original bytes abort shadow construction');
const corruptedRef=structuredClone(example);corruptedRef.projectFilesV150['SYNTHETIC-CONTRACT']=['SYNTHETIC-ORPHAN'];
assert.throws(()=>planLegacyShadow(corruptedRef,originals,s=>scope.WorkbenchBusiness.fromLegacy(s),
  {syntheticOnly:true,origin:'synthetic-ci'}),/PROJECT_FILE_MISSING_INBOX_METADATA/);
check(true,'orphan legacy project-file link rejects migration');
const wrongConverter=s=>({hospitals:[],projects:[],notes:[],files:[]});
assert.throws(()=>planLegacyShadow(example,originals,wrongConverter,
  {syntheticOnly:true,origin:'synthetic-ci'}),/MIGRATED_PROJECT_IDS_INCOMPLETE/);
check(true,'lossy converter that drops any existing project is rejected');
assert.throws(()=>planLegacyShadow(example,originals,s=>scope.WorkbenchBusiness.fromLegacy(s),
  {syntheticOnly:false,origin:'production'}),/NOT_PUBLIC_OR_PRODUCTION/);
check(true,'shadow planner cannot be called with production or non-synthetic context');
const shared=structuredClone(example);shared.businessProjectsV140[0].id='SYNTHETIC-SECOND-CONTRACT';
shared.projectFilesV150['SYNTHETIC-SECOND-CONTRACT']=['SYNTHETIC-FILE'];
assert.throws(()=>planLegacyShadow(shared,originals,s=>scope.WorkbenchBusiness.fromLegacy(s),
  {syntheticOnly:true,origin:'synthetic-ci'}),/SHARED_FILE_REF_NEEDS_MANUAL_MAPPING/);
check(true,'original referenced by multiple projects is held for manual mapping rather than silently relinked');
check(Buffer.compare(bytes,originals['SYNTHETIC-FILE'])===0&&fingerprint(example)===originalHash,
  'raw 1MiB source original and source JSON still match their original fingerprints');
console.log('SYNTHETIC_LEGACY_SHADOW_PASS '+JSON.stringify({assertions:count,
  productionReady:false,sourceTouched:false,originalBytes:bytes.length,restorableRawArchive:true}));
