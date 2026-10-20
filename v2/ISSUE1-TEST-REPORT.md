# Issue #1 — V2.0 staging regression and iPhone handoff

Date: 2026-10-21 (Asia/Shanghai). This report supersedes older all-pass summaries for this issue. Production approval is not requested or implied.

## Result

- 451 assertions passed across the final completed suites; 0 failed assertions in those completed suites.
- One additional suite is **blocked**, not passed: Windows Playwright WebKit persistent-profile offline restart fails during database initialization with `UnknownError: Unable to open database file on disk` (`test-offline.cjs`, configuration step). Edge persistent restart passed. WebKit ephemeral-context business, backup, merge, original download and real HTTPS backend tests passed. Physical iPhone Safari/PWA offline restart remains unverified. This is not an unconditional all-tests-pass release.
- No access to the iPhone private IndexedDB or its historical six records was obtained. The six-local/34-cloud case is an independent synthetic capture-replay test, not evidence about the actual phone.
- The shared staging dataset remains revision 9, 34 records, with unchanged encrypted-envelope hash and two original-file hashes. All regression writes use independent authenticated UUID namespaces. No production API calls or production deployment were made.

## Source and deployment provenance

| Item | Verified value |
| --- | --- |
| Repository | `wangxueqing0427-oss/personal-workbench` |
| Isolated branch | `dev/issue-1-staging-regression` |
| Draft PR target | `dev/v2-p0-data-safety` (not `main`) |
| Original local fix | `dbf545158aac12115d8c61712d2bb9c249257889` |
| Main at inspection | `c3d9ebec26b94ef056eaad649447b3ad2dba31bc` |
| Published staging source | `f6d43d4b6f36e49d1363f610d6d376571858ec0a` |
| Active staging Worker version | `feeb3fe2-ea69-4905-adf8-b962a3e27e15` |
| Published Worker bundle SHA-256 | `93360ceadef8a98e3644ce86ce8f8fdf5afb2a08cd3eb271409730bffc83d168` |
| HTTPS entry | https://personal-workbench-v2-staging.wangxueqing0427.workers.dev/business.html |

`dbf5451` was a local, unpushed ancestor, not a commit in another repository. Before changes, all 14 served source assets matched that commit after newline normalization. The original Worker bundle was reproduced byte-identically: `c86da20320ad9a7d9c48608a8b4a99ad0d5a0411a0bed9bf11de9185ee06d79b`. The old active version was `3a119144-7d98-4226-8127-a478cdf35031`.

The final staging build includes 14 source assets plus `build-info.json`. The builder refuses uncommitted changes in its public-source/Worker/config allowlist. The final audit verifies all served source hashes against the published commit and build manifest. A separate local Wrangler dry-run reproduced the final deployed Worker bundle hash. Report-only commits after the published source do not imply another deployment.

Service Worker uses a new versioned application cache and network-first application requests. Neither existing caches nor localStorage/IndexedDB are cleared. Actual iPhone update delivery still requires opening the HTTPS entry online; an already running offline old tab cannot be claimed to have updated.

## Changes made

1. Preserve legacy Blob/File originals without migration; new file writes use a checked ArrayBuffer envelope. Reconstruct and hash-check a File on read. Read/pack originals before opening write transactions. A read failure blocks the merge before writes; transaction failures reject only after abort/rollback.
2. Preserve both sides and archives during explicit conflict resolution. Repeated conflict confirmation is rejected. Existing compare-and-swap protection remains in place; no force-overwrite path was added.
3. Isolated backup restore stores the validated encoded representation in a separate database, avoiding native Blob persistence problems in the Windows WebKit port. Old Blob backups remain supported and were exercised with Edge; WebKit fixtures use the new byte representation, not a claim of legacy native-Blob persistence on that port.
4. Add a read-only local inspection action, with original lengths/hashes and queue/revision information. Clarify that `已同步 · 0项` means no pending local queue entries, not proof every record from every device is present.
5. Add commit-addressed staging provenance, read-only encrypted rollback capture, independent real-backend regression, original download and phone-width checks.
6. Add short-lived signed HttpOnly/Secure/SameSite test-scope cookies for browser automation. These select a dedicated UUID namespace but do not replace authentication. Invalid scope cookies fail closed; successful scoped responses identify their namespace. This fixes unreliable Playwright WebKit request-header routing in the test harness, not by disabling authentication or changing shared data.

## Test matrix (latest completed runs)

| Suite | Passed | Status / evidence |
| --- | ---: | --- |
| Edge backup/isolated recovery, desktop + 390px | 56 | `test-safety.cjs`, 28 per viewport |
| Edge P1 business UI, desktop + 390px | 70 | `phase2-test-results.json` |
| Edge persistent offline/restart/recovery | 25 | `offline-test-results.json` |
| Worker auth/CAS/chunks/session isolation simulation | 42 | `test-staging.cjs`, Node SQLite simulation |
| Isolated HTTP backend | 18 | `sync-http-results.json` |
| WebKit backup/isolated recovery, desktop + 390px | 56 | Byte-envelope fixtures; 28 per viewport |
| WebKit P1 business UI, desktop + 390px | 70 | `phase2-webkit-results.json` |
| First-device capture replay, original I/O/transaction fault injection | 18 | `first-device-results.json`, shared cloud writes 0 |
| Actual Cloudflare isolated backend + Edge | 48 | `issue1-remote-results.json` |
| Actual Cloudflare isolated backend + WebKit | 48 | `issue1-remote-results.json` |
| Windows WebKit persistent-profile offline/restart | — | **Blocked** at database initialization; not included in pass count |

Real-backend tests cover unauthorized reads, lost final acknowledgement after server commit, safe retry without revision growth, different A/B hospitals/projects/notes/histories/files, UI-confirmed merge, both histories and links retained, original SHA verification, three concurrent stale duplicate manifests rejected, repeat local merge rejected, image preview, read-only inspection, isolated backup restoration, and five navigation routes at 320/375/390/430px without document overflow.

The existing two shared `.bin` originals were read only, copied into a fresh nonconfigured browser, downloaded and compared byte-for-byte by SHA. They are **not actual image files**. Image preview was separately exercised using two valid synthetic PNG originals, each padded to 512 KiB, in fresh isolated test namespaces.

Offline Edge tests cover closed-browser restart while disconnected, retained jobs and originals, reconnection, interruption/resume, lost replies, large/multiple attachments (largest 2 MiB), quota fault, conflict archives and repeat-request protection. They do not prove real iOS background execution; mobile operating systems can suspend the app.

## Shared-data integrity and rollback evidence

Before and after cloud revision: **9**. Before and after record count: **34**.

Encrypted envelope SHA-256:

`c1045bbf50eb2b33c19dd927c9f55aea23d85876ab5ad8763e256882f6615ee3`

| Original ID | Bytes | Before/after SHA-256 |
| --- | ---: | --- |
| `f402a10c-5f64-4051-8fb9-78f057183d61` | 524288 | `afeaa3a39f2cedf8cc1844c06d2f2fd5cf016ce968f33ccbb31c364ce7e89e71` |
| `647db2da-bf1f-4416-827c-151d0eb36462` | 524288 | `afeaa3a39f2cedf8cc1844c06d2f2fd5cf016ce968f33ccbb31c364ce7e89e71` |

Historical revision 8→9 added three hospitals and three projects; originals and prior records were retained. Available snapshots do not identify a specific device/user click as the writer. No claim is made that the phone's previous failed attempt never changed its private local store; that store is inaccessible to this automation.

Private rollback evidence is retained only under ignored `v2/.tools/issue1/`: encrypted snapshots, deployment/settings metadata and served assets. Public sanitized before/final audits contain hashes and counts only. Secrets, raw account metadata and decrypted datasets are excluded from Git.

Do not blindly roll browser code back to a legacy reader after new byte-envelope writes. Any rollback must retain the compatible file reader, validate a complete backup and test restoration in isolation. No rollback or shared-data restoration was performed automatically.

## Isolation and repository safety

- Target is only `personal-workbench-v2-staging`, with ASSETS, TEST_SYNC SQLite Durable Object, `TEST_ENVIRONMENT=synthetic-only`, `TEST_DATASET=mobile-20261016` and independent TEST_TOKEN.
- No production DB, bucket, route or production key is bound. No paid plan or resource upgrade was requested. The existing approved Workers Free setup was reused; this report does not claim a billing invoice was independently inspected.
- Before the final report commit, 11 branch commits / 54 changed paths were inspected: only `v2/*` and root `.gitignore`. Current test token/key and recognizable GitHub/private-key patterns were absent from the reviewed diffs. Ignored credentials/build/runtime folders are not staged. This bounded scan is not a guarantee against every possible sensitive string.
- No `main` merge, production publication or true-business-data import was performed. Only the explicitly approved isolated branch push and Draft PR are authorized.

## Reproduction

Use the project's Node runtime and Playwright dependency; set `PLAYWRIGHT_BROWSERS_PATH` to the ignored downloaded browser directory before WebKit runs. `WB_BROWSER=webkit` selects WebKit for local suites. Do not copy secrets into commands, reports or Git.

```text
node v2/test-safety.cjs
node v2/test-phase2.cjs
node v2/test-offline.cjs
node v2/test-staging.cjs
node v2/test-sync-http.cjs
MERGE_CAPTURE_REPLAY=1 node v2/test-first-device.cjs
node v2/test-issue1-remote.cjs
ISSUE1_REFERENCE=f6d43d4 ISSUE1_AUDIT_LABEL=final node v2/issue1-audit.cjs
```

Environment assignments above are descriptive; use PowerShell `$env:...` on Windows. Remote tests require the existing ignored synthetic identity; read-only audit additionally requires the approved Wrangler OAuth configuration. Never point these tests at a production URL. Remote regression enforces a fresh empty UUID scope before writes and checks that shared revision/hash are unchanged afterwards.

## One final physical iPhone session (three actions)

1. Open the staging HTTPS entry online, then “更多 → 查看同步队列 / 核对冲突 → 本机只读核验（不写数据）”. Check the old local records and readable-original count; this action does not merge, reset or upload. If a record is missing, stop before confirming any merge.
2. Open the hospital/project history and “文件与拍照”; inspect the retained records and download an original. Existing `.bin` fixtures download rather than display as photos. If a conflict is present, review both sides and explicitly confirm only after the read-only check; `已同步 · 0项` alone is insufficient evidence of completeness.
3. Using synthetic content only, add a short offline note, close/reopen the Safari/PWA app, confirm it remains, reconnect, and confirm the pending queue drains without a new conflict. This is the outstanding real-iOS persistence check, not developer debugging delegated to the user.

Keep Issue #1 and the PR open/draft until physical iPhone results and the Windows WebKit persistent-profile limitation have been reviewed. No production readiness claim is made.
