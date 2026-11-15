'use strict';
// Fresh-start delivery checklist: independently auditable evidence is required.
// No legacy imports, production storage reads, network access, or deployment.
function evaluateFreshStart(evidence={}){
  const launchMode='FRESH_EMPTY_V2';
  const checks={
    isolatedOrigin:!!evidence.isolatedOrigin,
    noSyntheticSeed:!!evidence.noSyntheticSeed,
    fullLocalEncryption:!!evidence.fullLocalEncryption,
    verifiedBackupRestore:!!evidence.verifiedBackupRestore,
    stableDeviceAuthorization:!!evidence.stableDeviceAuthorization,
    cloudAndOfflineRecovery:!!evidence.cloudAndOfflineRecovery,
    realIPhoneAcceptance:!!evidence.realIPhoneAcceptance,
    explicitProductionApproval:!!evidence.explicitProductionApproval
  };
  const blockers=Object.entries(checks).filter(([,done])=>!done).map(([item])=>item);
  if(evidence.legacyMigrationRequested)blockers.unshift('LEGACY_MIGRATION_OUT_OF_SCOPE');
  return {launchMode,requiresLegacyMigration:false,keepsOriginalV157:true,
    existingBusinessDataImported:false,checks,
    productionReady:blockers.length===0,blockers};
}
module.exports={evaluateFreshStart};
