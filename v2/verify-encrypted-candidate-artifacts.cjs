'use strict';
/** Read-only integrity proof for the already-passed, frozen Chromium + WebKit artifacts.
 * No network, no Cloudflare access, no external dependencies.
 * Usage: node v2/verify-encrypted-candidate-artifacts.cjs chromium-dir webkit-dir
 */
const fs=require('node:fs');
const path=require('node:path');
const crypto=require('node:crypto');
const assert=require('node:assert/strict');
const SOURCE_SHA='50632b1d5da41f48719c1c9ec195d47d8be1ce9f';
const RELEASE_ID='e082be181307842397b4f8f1f3c0dfd9a0ed6b74d6e8f6e71ee0831623ae465c';
const MANIFEST_SHA='342003713d921751d23e4c92cb961f93d36bf25fce1d402ad6e947ec4ea28710';
const HEADERS_SHA='d38f47511b3b0a1952a14d39d2a555a7744991b0a2e37614b4e98f819addd5e1';
const HOST='personal-workbench-v2-encrypted-candidate.wangxueqing0427.workers.dev';
const assets=[
  'apple-touch-icon.png','business-core.js','business-ui.js','business.css',
  'business.html','candidate.webmanifest','encrypted-boot.js',
  'encrypted-store.js','icon-512.png','iphone-diagnostics.html',
  'iphone-diagnostics.js','offline-sw.js'
].sort();
const files=['_headers','build-info.json',...assets].sort();
const sha=buf=>crypto.createHash('sha256').update(buf).digest('hex');
function inspect(dir){
  assert.ok(dir&&fs.statSync(dir).isDirectory(),'artifact directory missing');
  assert.deepEqual(fs.readdirSync(dir).sort(),files,'unexpected or missing artifact asset');
  const read=name=>fs.readFileSync(path.join(dir,name));
  const manifestBytes=read('build-info.json');
  assert.equal(sha(manifestBytes),MANIFEST_SHA,'immutable build manifest digest');
  assert.equal(sha(read('_headers')),HEADERS_SHA,'immutable response headers digest');
  const manifest=JSON.parse(manifestBytes.toString('utf8'));
  assert.equal(manifest.kind,'encrypted-fresh-start-candidate');
  assert.equal(manifest.sourceCommit,SOURCE_SHA,'exact audited source commit');
  assert.equal(manifest.releaseId,RELEASE_ID,'exact audited release ID');
  assert.ok(manifest.freshEmpty===true&&manifest.legacyMigration===false,
    'must be a fresh, migration-free candidate');
  assert.ok(manifest.syntheticOnly===true&&manifest.cloudConnected===false,
    'must not connect to real cloud data');
  assert.ok(manifest.productionReady===false&&manifest.productionDeployAllowed===false&&
    manifest.isolatedTestDeployAllowed===true,'test-only deployment policy');
  assert.deepEqual(manifest.allowedHosts,
    ['localhost','127.0.0.1',HOST],'exact dedicated host whitelist');
  assert.deepEqual(Object.keys(manifest.files).sort(),assets,'exact expected manifest assets');
  const hashes={};
  for(const name of files){
    const bytes=read(name);
    hashes[name]=sha(bytes);
    if(name in manifest.files){
      const spec=manifest.files[name];
      assert.deepEqual(Object.keys(spec).sort(),['bytes','sha256']);
      assert.equal(bytes.length,spec.bytes,'size mismatch: '+name);
      assert.equal(hashes[name],spec.sha256,'digest mismatch: '+name);
    }
  }
  const headers=read('_headers').toString('utf8');
  assert.ok(headers.includes('X-Robots-Tag: noindex')&&
    headers.includes('X-Frame-Options: DENY')&&
    headers.includes('X-Content-Type-Options: nosniff')&&
    headers.includes('Permissions-Policy: camera=(self), microphone=(self)'),
    'expected isolation and media policy headers');
  const html=read('business.html').toString('utf8');
  assert.ok(html.includes('禁止录入真实医院')&&html.includes('encrypted-boot.js'),
    'candidate must expose synthetic-only warning and encrypted boot');
  return hashes;
}
function main(){
  const [chromiumDir,webkitDir]=process.argv.slice(2);
  assert.ok(chromiumDir&&webkitDir&&process.argv.length===4,
    'Expected exactly two independent artifact directories');
  const chromium=inspect(chromiumDir);
  const webkit=inspect(webkitDir);
  assert.deepEqual(chromium,webkit,'Chromium and WebKit uploaded different content');
  console.log('VERIFIED_FROZEN_DUAL_BROWSER_CANDIDATE_PASS '+JSON.stringify({
    sourceCommit:SOURCE_SHA,releaseId:RELEASE_ID,files:files.length,
    assetDigests:assets.length,syntheticOnly:true,cloudConnected:false,
    productionReady:false,productionTouched:false
  }));
}
main();
