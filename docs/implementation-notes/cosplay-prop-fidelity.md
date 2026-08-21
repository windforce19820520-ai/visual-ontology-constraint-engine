# Cosplay signature-prop fidelity repair

Issue [#19](https://github.com/windforce19820520-ai/visual-ontology-constraint-engine/issues/19) reported insufficient prop detail fidelity with the Cosplay ScenarioPack on `v0.1.0-rc.2` and Seedream.

## Confirmed root cause

The `v0.1.0-rc.2` fixture modeled identity, hair, wardrobe, and a generic hand-resource conflict, but did not carry a character's signature prop through explicit ontology paths, source-binding policies, reference-budget acceptance, prompt coverage, and separate semantic-review criteria. The prior credentialed M9 cosplay smoke also instructed Seedream to ignore weapons, so that smoke could not establish weapon-fidelity capability.

This repair treats the confirmed defect as ScenarioPack and evaluation coverage. It does not attribute the original report to Seedream without a sanitized trace showing that the complete VOCE path was present.

## Declarative ScenarioPack changes

The Cosplay fixture now declares:

- separate `person.identity` and character-fidelity paths;
- `character.hair`, `character.costume`, and `character.accessories`; the real-person reference remains authoritative for existing makeup, eye color, and facial styling;
- `character.signatureProps.primary` paths for type, silhouette, proportion, color scheme, material, signature details, hand assignment, and visibility;
- source-isolation policies that exclude the character face from real-person identity and exclude the real person's original costume and props from character fidelity;
- identity, costume, and signature-prop semantic-review criteria; and
- a required parent/detail dependency for signature-prop details.

The data remains in the ScenarioPack. Core does not import the pack, compare its ID, or branch on a scenario name.

## Deterministic acceptance

The offline fixture proves that:

- identity and character-design references remain ahead of optional pose input;
- a required signature-prop detail reference is selected before a preferred pose reference under a three-reference budget;
- a two-reference budget blocks explicitly instead of silently omitting the required signature prop;
- selected references retain their source-binding IDs;
- signature-prop constraints are represented in Prompt IR coverage; and
- ScenarioPack review templates produce separate identity, costume, and signature-prop findings.

`EvaluationReport` now conservatively remains `needs_review` when an unadjudicated semantic proposal contains `fail` or `uncertain` findings. This does not rewrite technical execution as failed. A separate human `accepted` or `waived` decision may adjudicate the proposal.

## Provider boundary

The local M9 smoke definition no longer excludes weapons and now requests the visible signature weapon's type, primary silhouette, color scheme, scale, major details, hand assignment, and presence. This change is covered only by offline source validation in standard development. No paid Provider call is performed by this repair, and no new Seedream fidelity claim is made until a separately authorized smoke test succeeds.
