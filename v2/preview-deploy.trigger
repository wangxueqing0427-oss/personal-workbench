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
