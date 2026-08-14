# Changelog

## 0.1.0-rc.1

The first public release candidate packages the product-neutral OSS core extracted and generalized from earlier commercial AI content-platform R&D. It is not a stable release and is not production-ready.

Highlights:

- local-tarball consumer validation for `@voce-engine/contracts`, `@voce-engine/core`, `@voce-engine/testkit`, and `@voce-engine/cli`;
- versioned candidate compatibility fixtures and deterministic renamed-third-party pack checks;
- strict package tarball allowlists, checksum verification, reproducibility checks, and a metadata-only local SBOM/license report;
- offline security regression corpus for unsafe bundle/package inputs and a static network/provider gate;
- Ubuntu/Windows Node 20 CI coverage plus a Node 22 public consumer job;
- explicit release-readiness and compatibility documentation.
- scope cleanup that removes the concrete veImageX/background-removal adapter and transparent-cutout scenario assumptions, while retaining provider-neutral optional postprocessing contracts.
- credentialed M9 Seedream validation for the product-relevant multi-reference virtual try-on and cosplay paths, including request receipts, timings, saved results, and fail-closed parameter validation;
- a Seedream payload fix that always includes the configured model and supports the documented watermark option.

The standard development and CI gates remain offline and never require credentials or paid Provider calls. The release is distributed with the npm `next` tag and as a GitHub prerelease. It does not claim production readiness or an official artifact attestation.
