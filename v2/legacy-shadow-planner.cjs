'use strict';
/**
 * SYNTHETIC-ONLY, in-memory legacy shadow planner.
 * No localStorage / IndexedDB / network / file system / Cloudflare access.
 * No production write path. This is NOT a finished V1 -> V2 migrator.
 */
const {inventory,fingerprint,verifyExactShadow}=require('./release-readiness-audit.cjs');
const crypto=require('node:crypto');
const sha=bytes=>crypto.createHash('sha256').update(bytes).digest('hex');
const clone=value=>structuredClone(value);
const finiteString=value=>String(value??'').trim();
function planLegacyShadow(source,originalBytesById,convert,options){
  if(options?.syntheticOnly!==true||options?.origin!=='synthetic-ci')
    throw Error('NOT_PUBLIC_OR_PRODUCTION:仅可在隔离合成测试区运行');
  if(typeof convert!=='function')throw Error('旧版转换器不存在');
  const audit=inventory(source,originalBytesById);
  if(audit.errors.length)throw Error('LEGACY_SOURCE_INVALID:'+audit.errors.join(','));
  const sourceHash=audit.snapshotHash,sourceCopy=clone(source);
  const converted=clone(convert(clone(source)));
  const old=[...(source.contractProjectsV138||[]),...(source.businessProjectsV140||[])];
  const ids=old.map(p=>p.id);
  if(converted.projects?.length!==ids.length||new Set(converted.projects.map(p=>p.id)).size!==ids.length||
    ids.some(id=>!converted.projects.find(p=>p.id===id)))
    throw Error('MIGRATED_PROJECT_IDS_INCOMPLETE');
  for(const oldProject of old){
    const p=converted.projects.find(p=>p.id===oldProject.id);
    const originalAction=source.contractActionsV139?.[oldProject.sourceKey||oldProject.id]||{};
    const legacyFiles=source.projectFilesV150?.[oldProject.id]||[];
    if(!p||p.name!==oldProject.name||p.nextAction!==(originalAction.nextAction||'')||
      p.timeline.length!==(originalAction.timeline||[]).length||
      JSON.stringify(p.fileIds)!==JSON.stringify(legacyFiles))
      throw Error('MIGRATED_PROJECT_MISMATCH:'+oldProject.id);
    // Preserve V1-specific business metadata not modeled in V2 fields.
    p.legacyFields=clone(oldProject);
    p.legacyAction=clone(originalAction);
  }
  const shadowFiles={},fileMeta=[];
  const linkedBy=new Map();
  for(const [projectId,ids] of Object.entries(source.projectFilesV150||{}))
    for(const id of ids){
      const list=linkedBy.get(id)||[];
      list.push(projectId);linkedBy.set(id,list);
    }
  for(const item of source.inbox||[]){
    if(!item?.id)throw Error('INBOX_ID_INVALID');
    const linked=linkedBy.get(item.id)||[];
    if(linked.length>1)throw Error('SHARED_FILE_REF_NEEDS_MANUAL_MAPPING:'+item.id);
    const bytes=originalBytesById[item.id];
    if(item.originalStored===true||bytes||linked.length){
      if(!bytes)throw Error('INBOX_ORIGINAL_MISSING:'+item.id);
      shadowFiles[item.id]=Buffer.from(bytes);
      fileMeta.push({id:item.id,name:finiteString(item.name)||'合成旧原件',
        size:bytes.byteLength,type:finiteString(item.type),createdOn:item.createdAt||'',
        projectId:linked[0]||'',legacySource:'V1 originalStoreV151',
        sha256:sha(bytes),legacyRecord:clone(item)});
    }
  }
  converted.files=fileMeta;
  // Old inbox entries may be files, messages, or unstructured AI notes.
  // All source objects are preserved unchanged in legacyArchiveRaw; only
  // unlinked text-only entries are optionally surfaced as new inbox notes.
  const noteIds=new Set((converted.notes||[]).map(n=>n.id));
  for(const item of source.inbox||[]){
    if(!finiteString(item.text)&&!finiteString(item.summary))continue;
    if(noteIds.has(item.id))throw Error('DUPLICATE_INBOX_NOTE_ID:'+item.id);
    converted.notes.push({id:item.id,progress:finiteString(item.text||item.summary),
      projectId:'',fileId:shadowFiles[item.id]?item.id:undefined,
      savedOn:item.createdAt||'',disposition:'收件箱',source:'V1 inbox shadow',
      legacyRecord:clone(item)});
    noteIds.add(item.id);
  }
  // This is intentionally an extra, lossless archive, not a claim that V2
  // screens/logic fully support all V1 modules. Do not delete any raw data.
  converted.legacyArchiveRaw=clone(source);
  converted.legacySnapshotHash=sourceHash;
  converted.legacyOriginalHashes=clone(audit.originalHashes);
  converted.legacyMigrationStatus='SHADOW_ONLY_REVIEW_REQUIRED';
  if(fingerprint(source)!==sourceHash)throw Error('SOURCE_CHANGED_DURING_SHADOW');
  const recheck=verifyExactShadow(source,originalBytesById,converted.legacyArchiveRaw,shadowFiles);
  for(const [id,hex] of Object.entries(audit.originalHashes)){
    if(!shadowFiles[id]||sha(shadowFiles[id])!==hex)throw Error('ORIGINAL_SHA_MISMATCH:'+id);
  }
  return {candidate:converted,originals:shadowFiles,inventory:audit,
    sourceUnchanged:fingerprint(source)===sourceHash,
    originalBytesVerified:recheck.verified,
    productionReady:false};
}
module.exports={planLegacyShadow};
