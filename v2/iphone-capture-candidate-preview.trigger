Reviewed V2 iPhone camera and voice candidate.
Source SHA: c1cee1695a2bc492c0156d7ff9e8a74bdd6d33cd
Release ID: 2675f00b5c574ee6820b8f27e49e4f035ace44a1f74ae1d873c8f3bb9eabc03b
Upstream CI: 44518343354 (Chromium + WebKit success, 31 assertions each).
Deploy only the existing personal-workbench-v2-encrypted-candidate Worker if every scope, previous-release and free-plan guard passes.
Never deploy to main, V1.5.7 or production; keep productionReady=false and productionDeployAllowed=false.
