'use strict';
const assert=require('node:assert/strict');
const {evaluateFreshStart}=require('./fresh-start-readiness.cjs');
const fs=require('node:fs');
const path=require('node:path');
let checks=0;const check=(ok,why)=>{assert.ok(ok,why);console.log('PASS: '+why);checks++;};
const fresh=evaluateFreshStart();
check(fresh.launchMode==='FRESH_EMPTY_V2'&&fresh.requiresLegacyMigration===false &&
  fresh.keepsOriginalV157===true&&fresh.existingBusinessDataImported===false,
  'new official V2 startup explicitly does not depend on migrating V1 data');
check(fresh.blockers.includes('fullLocalEncryption')&&
  fresh.blockers.includes('verifiedBackupRestore')&&
  fresh.blockers.includes('stableDeviceAuthorization')&&
  fresh.blockers.includes('realIPhoneAcceptance'),
  'production security, recovery and hardware acceptance remain genuine blockers');
check(fresh.blockers.includes('isolatedOrigin')&&
  fresh.blockers.includes('noSyntheticSeed')&&
  fresh.blockers.includes('explicitProductionApproval'),
  'new origin, no demo seed and explicit production approval are required');
check(!fresh.blockers.some(x=>/legacy|migration|oldData/i.test(x)),
  'legacy V1 conversion, backups or comparisons are not a requirement for fresh startup');
const request=evaluateFreshStart({legacyMigrationRequested:true});
check(request.blockers[0]==='LEGACY_MIGRATION_OUT_OF_SCOPE',
  'release profile refuses unsolicited import of legacy records');
const source=fs.readFileSync(path.join(__dirname,'business-ui.js'),'utf8');
check(source.includes('if(!mayUseSyntheticDemo())return core.empty()')&&
  source.includes("document.documentElement.dataset.workbenchDataMode==='fresh-empty'"),
  'fresh launch default uses an empty schema and never seeds unapproved hospital data');
console.log('FRESH_START_RELEASE_GATE_PASS '+JSON.stringify({
  mode:fresh.launchMode,requiresLegacyMigration:fresh.requiresLegacyMigration,
  blockers:fresh.blockers,assertions:checks,productionReady:fresh.productionReady
}));
