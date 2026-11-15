'use strict';
/**
 * Read-only V1.5.7 migration inventory. This module accepts caller-supplied
 * SYNTHETIC/plain snapshots and file bytes only. It never opens a browser
 * database, cloud endpoint or production repository. Not an import tool.
 *
 * Known V1 sources (confirmed from app.js and app-v151t.js):
 *  localStorage["personalWorkbench"] and IndexedDB
 *  "personal-workbench-originals" / "files".
 */
const crypto=require('node:crypto');
const seen=new Set();
const sha=bytes=>crypto.createHash('sha256').update(bytes).digest('hex');
function canonical(value){
  if(value===null||typeof value!=='object')return JSON.stringify(value);
  if(Array.isArray(value))return '['+value.map(canonical).join(',')+']';
  return '{'+Object.keys(value).sort().map(k=>JSON.stringify(k)+':'+canonical(value[k])).join(',')+'}';
}
function fingerprint(value){return sha(Buffer.from(canonical(value),'utf8'));}
function ensurePlainSnapshot(snapshot){
  if(!snapshot||typeof snapshot!=='object'||Array.isArray(snapshot))throw Error('旧数据快照必须是对象');
  for(const k of ['contractProjectsV138','businessProjectsV140','inbox']){
    if(snapshot[k]!==undefined&&!Array.isArray(snapshot[k]))throw Error(k+'必须是数组');
  }
  for(const k of ['contractActionsV139','projectFilesV150']){
    if(snapshot[k]!==undefined&&(snapshot[k]===null||typeof snapshot[k]!=='object'||Array.isArray(snapshot[k])))throw Error(k+'必须是对象');
  }
}
function inventory(snapshot, originalBytesById={}){
  ensurePlainSnapshot(snapshot);
  if(!originalBytesById||typeof originalBytesById!=='object'||Array.isArray(originalBytesById))throw Error('原件清单格式错误');
  const errors=[],warnings=[],projects=[...(snapshot.contractProjectsV138||[]),...(snapshot.businessProjectsV140||[])];
  const projectIds=new Set();
  for(const p of projects){
    if(!p||typeof p.id!=='string'||!p.id||typeof p.hospital!=='string'||!p.hospital.trim()||!p.name){
      errors.push('INVALID_PROJECT');continue;
    }
    if(projectIds.has(p.id))errors.push('DUPLICATE_PROJECT_ID');
    projectIds.add(p.id);
  }
  const actionMap=snapshot.contractActionsV139||{},fileMap=snapshot.projectFilesV150||{};
  for(const key of Object.keys(actionMap)){
    if(!projects.some(p=>(p.sourceKey||p.id)===key))warnings.push('UNMATCHED_LEGACY_ACTION');
  }
  const inbox=snapshot.inbox||[],meta=new Map();
  for(const item of inbox){
    if(!item||typeof item.id!=='string'||!item.id){errors.push('INVALID_INBOX_ENTRY');continue;}
    if(meta.has(item.id))errors.push('DUPLICATE_INBOX_ID');
    meta.set(item.id,item);
  }
  const references=new Map();
  for(const [projectId,ids] of Object.entries(fileMap)){
    if(!projectIds.has(projectId))errors.push('PROJECT_FILE_UNKNOWN_PROJECT');
    if(!Array.isArray(ids)){errors.push('PROJECT_FILE_BAD_LIST');continue;}
    const inProject=new Set();
    for(const id of ids){
      if(inProject.has(id))errors.push('DUPLICATE_PROJECT_FILE');
      inProject.add(id);
      if(!meta.has(id))errors.push('PROJECT_FILE_MISSING_INBOX_METADATA');
      const ref=references.get(id)||[];ref.push(projectId);references.set(id,ref);
    }
  }
  const originalHashes={};let originalByteCount=0;
  for(const [id,bytes] of Object.entries(originalBytesById)){
    if(!Buffer.isBuffer(bytes)&&!(bytes instanceof Uint8Array)){
      errors.push('ORIGINAL_NOT_BINARY');continue;
    }
    if(!meta.has(id)){errors.push('ORIGINAL_WITHOUT_METADATA');continue;}
    const item=meta.get(id);
    if(Number.isFinite(Number(item.size))&&Number(item.size)!==bytes.byteLength)errors.push('ORIGINAL_SIZE_MISMATCH');
    originalHashes[id]=sha(bytes);originalByteCount+=bytes.byteLength;
  }
  for(const item of inbox){
    if(!item?.id)continue;
    if(item.originalStored===true&&!Object.hasOwn(originalHashes,item.id))errors.push('ORIGINAL_BYTES_UNAVAILABLE');
  }
  for(const id of references.keys())if(!Object.hasOwn(originalHashes,id))errors.push('LINKED_ORIGINAL_MISSING');
  const kindCounts={contracts:(snapshot.contractProjectsV138||[]).length,
    business:(snapshot.businessProjectsV140||[]).length,inbox:inbox.length,
    actions:Object.keys(actionMap).length,projectFileReferences:[...references.values()].reduce((n,a)=>n+a.length,0)};
  const unsupportedSections=['notes','tasks','followups','radar','finance','life','health','study','hospitals','opportunities'];
  const additional=unsupportedSections.filter(name=>
    Array.isArray(snapshot[name])?snapshot[name].length>0:
      snapshot[name]&&typeof snapshot[name]==='object'?Object.keys(snapshot[name]).length>0:
        !!snapshot[name]);
  // Review is intentionally fail-closed even when this demo snapshot happens
  // to contain only projects. fromLegacy is NOT a full production converter:
  // it drops inbox records, original bytes and broad V1 business metadata.
  const blockers=[...new Set([...errors,'MIGRATION_NOT_VERIFIED_ON_REAL_DEVICE',
    'V1_INBOX_AND_ORIGINALS_CONVERTER_INCOMPLETE',
    'PRODUCTION_BACKUP_AND_RESTORE_NOT_VERIFIED',
    'PRODUCTION_ENCRYPTION_AND_DEVICE_AUTH_NOT_READY',
    'IPHONE_SAFARI_AND_PWA_ACCEPTANCE_PENDING',
    ...additional.map(x=>'LEGACY_SECTION_UNMAPPED:'+x)])];
  return {verdict:'BLOCKED_NOT_FOR_PRODUCTION',source:'caller-supplied-read-only',
    snapshotHash:fingerprint(snapshot),kindCounts,
    originalFileCount:Object.keys(originalHashes).length,originalByteCount,
    originalHashes,errors:[...new Set(errors)],warnings:[...new Set(warnings)],
    blockers};
}
function verifyExactShadow(source,originals,shadow,shadowOriginals){
  ensurePlainSnapshot(source);ensurePlainSnapshot(shadow);
  if(fingerprint(source)!==fingerprint(shadow))throw Error('SHADOW_STATE_MISMATCH:旧数据未完全保留');
  const left=Object.keys(originals).sort(),right=Object.keys(shadowOriginals).sort();
  if(JSON.stringify(left)!==JSON.stringify(right))throw Error('SHADOW_FILE_CATALOG_MISMATCH');
  for(const id of left){
    const before=originals[id],after=shadowOriginals[id];
    if(!Buffer.isBuffer(before)&&!(before instanceof Uint8Array))throw Error('SOURCE_FILE_INVALID');
    if(!Buffer.isBuffer(after)&&!(after instanceof Uint8Array))throw Error('SHADOW_FILE_INVALID');
    if(before.byteLength!==after.byteLength||sha(before)!==sha(after))throw Error('SHADOW_FILE_BYTES_MISMATCH:'+id);
  }
  return {verified:true,sourceHash:fingerprint(source),fileCount:left.length,
    fileBytes:left.reduce((n,id)=>n+originals[id].byteLength,0)};
}
module.exports={inventory,verifyExactShadow,fingerprint};
