Reviewed V2 iPhone camera and voice candidate.
Source SHA: c1cee1695a2bc492c0156d7ff9e8a74bdd6d33cd
Release ID: 2675f00b5c574ee6820b8f27e49e4f035ace44a1f74ae1d873c8f3bb9eabc03b
Upstream CI: 44518343354 (Chromium + WebKit success, 31 assertions each).
Release gate now rechecks the dedicated Worker immediately before deploy and skips overwrite if this exact release is already present.
Remote smoke tests wait for the explicit camera save receipt before checking encrypted file readback.
Deploy only the existing personal-workbench-v2-encrypted-candidate Worker if every scope, previous-release and free-plan guard passes.
Never deploy to main, V1.5.7 or production; keep productionReady=false and productionDeployAllowed=false.

2026-11-22: retry bounded no-cache live verification of source c1cee1695a2bc492c0156d7ff9e8a74bdd6d33cd. Only existing isolated Worker; no production or V1 changes. Abort unless previous/target release, free-plan, scope and upstream green CI are verified.
