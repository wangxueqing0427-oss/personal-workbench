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
