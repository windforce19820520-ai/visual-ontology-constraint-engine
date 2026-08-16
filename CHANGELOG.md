# Changelog

## 0.1.0-rc.3

This release candidate repairs the Cosplay signature-prop fidelity path reported in issue #19 and keeps the repair inside the existing declarative and deterministic boundaries:

- expands the data-only Cosplay ScenarioPack with explicit signature-prop ontology paths, source-isolation policies, required detail dependencies, prompt coverage, and separate semantic-review criteria;
- makes required signature-prop references fail closed when the effective reference budget cannot retain them, while optional pose references remain omittable with a reason;
- keeps evaluation in `needs_review` for unadjudicated semantic `fail` or `uncertain` findings and rejects human decisions bound to a different execution run;
- binds generated CaseSpec roots to the exact loaded ScenarioPack version instead of a CLI hard-coded fixture version; and
- adds deterministic regression coverage for the evaluation, ScenarioPack, and reference-budget behavior plus an RC.3 compatibility snapshot.

Standard CI, examples, release-candidate checks, and public acceptance remain offline and Mock-only. Preparing this candidate does not publish packages, create a tag or GitHub Release, call a paid Provider, or claim production readiness.

## 0.1.0-rc.2

This maintenance release candidate adds no runtime features. It validates and exposes the release-engineering path added after RC.1:

- tokenless npm Trusted Publishing through GitHub Actions OIDC for all four public packages;
- npm provenance generation for packages published from the public GitHub repository;
- publication of the exact release-candidate tarballs that passed clean-consumer and checksum verification;
- a public `v0.1 stabilization` milestone and tracker for known limitations, feedback, and stable-release gates; and
- an RC.2 compatibility snapshot with the same candidate public surface as RC.1.

Standard CI, examples, and public acceptance remain offline and Mock-only. This release does not call a paid Provider and does not claim production readiness.

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
