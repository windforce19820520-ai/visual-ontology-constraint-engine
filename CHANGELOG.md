# Changelog

## 0.1.0-rc.1

This release candidate adds M8 release-readiness gates without claiming a stable release or production readiness:

- local-tarball consumer validation for `@voce/contracts`, `@voce/core`, `@voce/testkit`, and `@voce/cli`;
- versioned candidate compatibility fixtures and deterministic renamed-third-party pack checks;
- strict package tarball allowlists, checksum verification, reproducibility checks, and a metadata-only local SBOM/license report;
- offline security regression corpus for unsafe bundle/package inputs and a static network/provider gate;
- Ubuntu/Windows Node 20 CI coverage plus a Node 22 public consumer job;
- explicit release-readiness and compatibility documentation.

No npm package has been published. There is no GitHub Release, tag, provenance statement, or production-ready claim. Real Provider smoke remains outside the default gate.
