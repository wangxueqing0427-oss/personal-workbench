Isolated V2 preview deployment trigger
Date: 2026-11-13
Target: personal-workbench-v2-preview
Branch: dev/v2-preview-isolated-20261111
Dataset: mobile-preview-20261111 (synthetic-only)
Safeguards: main, original staging, production and real hospital records must remain untouched.
This file contains no credentials.

Follow-up preview-only correction: mobile first-paint CSS and parallel full-release verification.
Preflight: https://github.com/wangxueqing0427-oss/personal-workbench/actions/runs/43354587499
No production or staging deployment.

Follow-up preview-only clarity + post-deploy live mobile verification, 2026-11-13.
Checks: never imply offline demo is cloud-backed; verify exact deployed commit in Chromium and WebKit after publish.
Independent preflight: https://github.com/wangxueqing0427-oss/personal-workbench/actions/runs/43359895823

Synthetic-preview-only privacy QA, 2026-11-13: gated business and both backup pages; no user records, no paid services, no production modification.
Expected post-deploy tests: exact source SHA, mobile Chromium/WebKit, local-only status, opt-in salted PBKDF2 PIN screen cover, wrong/correct PIN, backup entrypoints and data preservation.

Preview-only PIN recovery hardening, 2026-11-13: user-saved one-time 128-bit recovery code, verifier-only storage, wrong-code refusal, original record preservation; tested in browser engines before accepting preview readiness.

Preview release verification gate: signed local PIN and recovery source + all 19 immutable assets verified. Latest two-engine remote smoke succeeded: https://github.com/wangxueqing0427-oss/personal-workbench/actions/runs/43363688071 . Trigger green source-pinned after-publish gate; no real data.

Solo-user mobile UX isolated preview rollout, 2026-11-13: after Chromium/WebKit search+camera+order tests 60/60 and existing encrypted-store compatibility regression 434/434, deploy only synthetic preview assets for the new hospital/project search, alias-preserving hospital rename, and one-tap order camera upload. Existing V1.5.7, original V2 staging, real user records and production main unchanged. Post-deploy source-pinned live tests must pass before acceptance. No new authentication or paid service.

Solo-user visual refresh synthetic-preview-only deploy, 2026-11-13: comfortable iPhone dashboard hero and summaries, four quick entries, hospital scan cards, prominent project next action and atomic quick follow-up/status/date/timeline editing, consumables order KPIs and photo-first entry. Confirmed Playwright Chromium/WebKit mobile UX 74/74 (run 43415383358), old encrypted-store compatibility 434/434 (run 43415747194), isolated preview preflight success (run 43415747388). Only pre-created synthetic preview Worker; never V1.5.7, original staging, production main, user data or paid resources. Must run source-pinned deployed Chromium/WebKit smoke after deploy.

Photo remark + tomorrow follow-up preview-only rollout 2026-11-13: 94/94 green mobile Chromium/WebKit localhost tests (GitHub Actions #43430112054), full encrypted-store compatibility #43429913839 and isolated preview build #43429913889 green. Only deploy to personal-workbench-v2-preview synthetic-data Worker, never V1.5.7, main, staging or real hospital files. Require post-deploy source-pinned 19 resource integrity and live Chromium+WebKit photo/remark/timeline/backup verification. No paid resources or new production credentials.

Solo-user dashboard focus lanes preview-only deploy, 2026-11-15: source-controlled frontend update only. New disjoint overdue/today/waiting/next-week priorities, overview tap-to-scroll numbers and visible overdue styling. Browser mobile synthetic regression run #43692155740 Chromium 51/51 and WebKit 51/51, encrypted storage compatibility #43692092311 both engines passed, independent 19-asset preflight #43692092287 succeeded. Ship only to personal-workbench-v2-preview synthetic Worker. After deployment require exact source SHA and live Chromium/WebKit remote smoke, including 3 new focus checks. Do not modify main, V1.5.7, prior staging, user hospital data or paid resources.


Waiting-feedback + today-completion synthetic preview rollout, 2026-11-15: source f2350965b8b14b42f7bb2ab8121b70787adda002. Existing project timeline generates last-contact date without schema migration; explicit received-feedback and completion confirmations append linked notes and do not save on cancel. Targeted real mobile Chromium 59/59 + WebKit 59/59 green (run 43697170959); isolated preview preflight succeeded (run 43697171207), old encrypted POC compatibility green (run 43697170914). Publish ONLY existing synthetic-only personal-workbench-v2-preview, then require immutable-source live Chromium/WebKit smoke and 19-resource hash match. Never V1.5.7, main, staging, real hospital data, or paid services.


2026-11-15 synthetic-only focus dates + consumables filter release. Source e4c5d94e482fa01a334ca73b4c4f171c38e4f0e4. Real Chromium/WebKit isolated mobile UI #43699876311 both 68/68 PASS, old cipher unchanged; preview static asset preflight #43699876319 SUCCESS. Date-only UTC followup labels preserve ISO values, all/uninvoiced/invoiced-unreceived consumables chips are read-only and show original project/hospital relationships. Deploy only EXISTING personal-workbench-v2-preview Worker under previously approved free-plan settings and synthetic dataset; require post-deploy Chromium/WebKit source-matched E2E and immutable-asset verification. Never touch main, original staging, V1.5.7 or genuine records, no purchases or services.


2026-11-15 order chase and verified invoice/full receipt update for SOLO user's existing synthetic-only preview. Application source f98a168211dd8cd06a7c468a6b44b44c4c4c6ce8. Local source-pinned Chromium/WebKit run 43700724376 each 81/81 PASS, including follow-up cancel (zero writes), atomic order-history/project timeline note, next-followup date, invoice number + explicit confirmation, whole-order received confirmation, sequential stage, and partial-receipt warning. Preview build dry-run 43700724364 SUCCESS; local cipher compatibility 43700724315 SUCCESS. Deploy only previously-approved existing personal-workbench-v2-preview worker, with synthetic data only and no added paid service; require immutable source SHA/20 build assets and live browser E2E before accepted. Never touch main, V1.5.7, old staging, business originals, or real users.


2026-11-15 synthetic preview ONLY: visible native rear-camera, photo-library and document upload controls, plus opt-in Chinese speech recognition with keyboard dictation fallback and 1–16 reviewed multi-hospital notes, never silent task modifications. Browser recognition may invoke vendor network services; application extraction and matching are local rules, no new paid API. Source b3f372d4388696c4ca11f8146959902680a46548. Real mobile browser CI #43702225424 Chromium 93/93 and WebKit 93/93 PASS, preview build preflight #43702225321 SUCCESS; existing crypto compatibility test #43702225350 running/pending at trigger. Deploy only pre-approved existing synthetic-only Worker personal-workbench-v2-preview. Require exact source SHA, immutable resource hash, remote Chromium+WebKit checks before claiming published success. No production/main/staging/real hospital files. Physical iPhone hardware camera and speech service must be checked by the user; do not claim simulated file inputs prove actual Safari permission behavior.


2026-11-15 synthetic-preview revalidation only. UI and browser feature source b3f372d4388696c4ca11f8146959902680a46548, verified Chromium+WebKit each 93/93 PASS (#43702225424) and preview preflight success (#43702225321), cipher compatibility success (#43702225350). First deployment #43702405020 actually deployed assets but post-deploy smoke failed on stale test expectation for old notes heading (no application crash or observed data loss). Updated remote smoke script at ce3b56e46b0fe6c30bcb14935ccb6ec20d781e6c to verify new voice-entry, multi-note review, inbox, and three native camera/gallery/file pickers. Redeploy only existing synthetic Worker to enforce exact new SHA and complete online Chromium/WebKit smoke, 20 build assets checks. No production/main/staging access, no paid provider or real input; true physical camera/voice tests require user's own iPhone.
