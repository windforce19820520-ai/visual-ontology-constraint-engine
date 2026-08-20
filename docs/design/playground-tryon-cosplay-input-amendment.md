# Playground Try-On, Cosplay Accessory, and Local Validation Amendment

- **Project:** Visual Ontology & Constraint Engine (VOCE)
- **Date:** 2026-08-20
- **Status:** approved product design amendment; implementation not yet complete
- **Applies to:** the open Playground work represented by PR #32
- **Supersedes:** the fixed four-reference Try-On design, the Try-On composition selector, the explicit `Separate top + bottom` mode, and the untyped Cosplay accessory-detail input in the earlier Playground design and work order
- **Authorization boundary:** this document does not authorize a real Provider call, production deployment, secret injection, merge, tag, or release. The local ImageGen handoff described below requires a separate user request for every generation.

## 1. Product outcome

The Playground has two intentionally different experiences:

- **Virtual Try-On** changes clothing while preserving the uploaded person's identity and every clothing region the user did not replace. It does not expose the 30 visual-composition presets.
- **Cosplay** may change character design, props, accessories, pose, and camera composition. It exposes the complete 30-preset visual-composition gallery with example artwork.

The Browser declares roles and typed choices. It never asks an image model to infer which garment region or body location an uploaded reference is meant to control.

## 2. Virtual Try-On input model

### 2.1 Required and optional inputs

`person-identity` is required exactly once. At least one clothing slot is required:

| Slot | Cardinality | Meaning |
|---|---:|---|
| `garment-full-body` | 0..1 | One-piece garment or a complete outfit shown in one reference |
| `garment-top` | 0..1 | Replace the upper garment only |
| `garment-bottom` | 0..1 | Replace the lower garment only |

`garment-full-body` is mutually exclusive with `garment-top` and `garment-bottom`. `garment-top` and `garment-bottom` are independent: uploading one replaces only that region; uploading both replaces both regions. There is no `Separate top + bottom` selector or role.

When `garment-full-body` is used, the user must choose one typed category:

- `one_piece` — dress, jumpsuit, robe, or another garment whose upper and lower portions form one continuous item;
- `complete_outfit` — upper and lower garments shown together in one reference image.

The following references are optional:

| Slot | Cardinality | Effect when present | Effect when absent |
|---|---:|---|---|
| `fit-reference` | 0..1 | Adjust fit, silhouette, drape, length, and waist position only for active replacement regions | Do not add a separate fit reference |
| `footwear-detail` | 0..1 | Replace footwear | Preserve the person's footwear |
| `pose` | 0..1 | Adjust pose only | Preserve the person's pose on a best-effort basis |

### 2.2 Deterministic replacement matrix

| Uploaded garment slots | Replace | Preserve from the person image |
|---|---|---|
| top only | upper garment | identity, lower garment, footwear |
| bottom only | lower garment | identity, upper garment, footwear |
| top and bottom | upper and lower garments | identity, footwear |
| full-body `one_piece` | upper and lower garments as one continuous structure | identity, footwear |
| full-body `complete_outfit` | upper and lower garments as a coordinated outfit | identity, footwear |

If `footwear-detail` is supplied, footwear moves from the preserve set to the replace set. If `pose` is supplied, pose moves from the preserve set to the adjust set.

### 2.3 Composition behavior

Virtual Try-On does not return or display the 30-preset composition selector. It asks the compiler to preserve the source image's framing and camera relationship unless an independently approved future Try-On control is added. An API request that supplies a visual-composition preset for Try-On must block with a stable error; it must not silently ignore or apply the preset.

## 3. Ontology changes

The current coarse `wardrobe.garment` and `wardrobe.wearingEffect` paths cannot distinguish replaced and preserved regions. The Virtual Try-On ScenarioPack must introduce or activate a single canonical vocabulary for:

```text
wardrobe.replacement.scope
wardrobe.garment.structure
wardrobe.garment.sourceLayout
wardrobe.upper.category
wardrobe.upper
wardrobe.lower.category
wardrobe.lower
wardrobe.fullBody.category
wardrobe.footwear
wardrobe.fit.upper
wardrobe.fit.lower
wardrobe.fit.fullBody
```

Recommended enum values are:

```text
wardrobe.replacement.scope = upper | lower | upper_and_lower
wardrobe.garment.structure = one_piece | two_piece
wardrobe.garment.sourceLayout = single_reference | separate_references
```

The upload slot declares the controlled region, while a typed category declares the garment kind. The first public category allow-list should cover common items without asking the model to classify them:

```text
upper = t_shirt | shirt | blouse | knitwear | jacket | coat | vest | other_upper
lower = trousers | jeans | skirt | shorts | leggings | other_lower
fullBody = dress | jumpsuit | robe | complete_outfit | other_full_body
```

Category is user-declared typed metadata and becomes an ontology-backed intent. `other_*` preserves a bounded region declaration without accepting arbitrary ontology paths. A future image classifier may propose a category, but its result remains an unconfirmed suggestion until the user accepts it.

The old coarse path may remain valid for an older pack version, but the new ScenarioPack must not activate old and new synonyms together. A legacy `garment-detail` request cannot be migrated silently because its replacement region is unknown.

## 4. ScenarioPack and generic contract changes

### 4.1 Generic conditional role policy

Core must remain scenario-agnostic. The public declarative contract needs a generic way for a ScenarioPack to express:

- at-least-one role groups;
- mutually exclusive role groups;
- typed metadata required for a role;
- `activeWhen` bindings and prohibitions;
- conditional preserve/replace/adjust targets;
- deterministic validation errors and an effective-policy hash.

These capabilities belong in a versioned interpretation-scope/input-policy contribution or an equivalent generic declarative contract. Core must not compare `virtual-tryon`, `cosplay`, garment, or accessory role names.

### 4.2 Virtual Try-On ScenarioPack

The pack derives the effective policy from declared slots, not from image classification:

- a top reference is authorized only for `wardrobe.upper` and prohibited from identity, lower garment, footwear, pose, background, and style;
- a bottom reference is authorized only for `wardrobe.lower` with the symmetric prohibitions;
- a full-body reference is authorized for upper and lower regions and carries the declared structure;
- every garment reference carries a ScenarioPack-validated category compatible with its slot;
- the person reference preserves identity and only the clothing regions not replaced by active garment references;
- fit, footwear, and pose references remain isolated to their declared scopes.

Every effective role policy, input selection, target set, prohibition set, and reference order participates in deterministic hashing.

## 5. Cosplay accessory model

The generic `character.accessories` or `critical-detail` role is insufficient because the model cannot know whether a reference should become a bracelet, ring, brooch, necklace, or earring, nor where it belongs.

Cosplay therefore adds a repeatable `accessory-detail` input. Each item contains one image plus typed metadata:

```text
accessoryType
placement
side (when applicable)
```

The first public allow-list is:

| Accessory type | Allowed placement | Side choices |
|---|---|---|
| `bracelet` | wrist | left, right, both |
| `ring` | hand/finger region | left, right |
| `brooch` | chest | left, right, center |
| `necklace` | neck | center |
| `earring` | ear | left, right, both |
| `hair_accessory` | hair/head | left, right, center |

Unknown free-form ontology paths are not accepted. An `other` accessory, if offered later, must use a separately reviewed finite placement allow-list rather than arbitrary Browser text.

The ontology should represent type and attachment site separately, for example:

```text
character.accessories.items[].type
character.accessories.items[].placement
character.accessories.items[].side
character.accessories.items[].appearance
```

The actual v0.1 path shape may use stable item IDs instead of array notation, but it must preserve the same semantics. A reference mapping may reproduce appearance only for its declared accessory item and must prohibit identity, costume, unrelated accessories, pose, background, and style.

## 6. Playground experience

### 6.1 Virtual Try-On

The English UI order is:

1. `Your photo` — Required.
2. `Clothing to replace` — at least one of Full-body garment, Top, or Bottom.
3. If Full-body is used, select `One-piece garment` or `Complete outfit`.
4. `Optional references` — Fit, Footwear, and Pose.
5. Provider choice, reference-capacity status, rights confirmation, Compile, and Generate.

The page derives the readable plan from the compiled result, for example:

> Replace the top. Keep the person's identity, original bottom, and shoes.

The ordinary view contains no ontology paths, ScenarioPack validation jargon, or raw internal error codes. Those remain available only in `Developer details`.

### 6.2 Cosplay

Cosplay retains the required person and character references, repeatable supplemental references, and the complete 30-preset composition gallery with example images. `Accessory detail` opens the type and placement controls before accepting the upload. The UI shows how many reference slots remain for the selected Provider.

### 6.3 Reference capacity

Reference limits are evaluated after active roles are resolved:

- person + top or bottom = 2 required references;
- person + top + bottom = 3 required references;
- person + full-body garment = 2 required references;
- each selected fit, footwear, pose, prop, critical detail, or accessory image consumes one additional reference;
- composition presets consume zero reference slots.

When the selected Provider cannot carry all user-selected references, Generate blocks and the UI asks the user to remove a reference or choose another Provider. It never drops, merges, reclassifies, or reorders references silently.

## 7. Prompt, Provider, and evaluation behavior

The guarded prompt and accepted request must state each reference's role, authorized scope, prohibited scope, garment structure, and accessory placement. Provider adapters only map these accepted semantics to native fields. A Provider with regional editing or mask support may use an approved upper/lower/footwear mask; an adapter cannot invent a mask target that is absent from the accepted request.

Prompt-only Providers disclose that unchanged clothing-region preservation is best effort. Output evaluation records at least:

- identity preservation;
- expected upper/lower/footwear replacement;
- preservation of untouched upper/lower/footwear regions;
- one-piece continuity when declared;
- accessory type, placement, side, visibility, and appearance fidelity;
- selected Cosplay composition fidelity.

A failed or uncertain evaluation produces a visible result state. It never triggers an automatic paid retry.

## 8. Local-only ImageGen validation handoff

The single-machine Playground may expose a development-only `Export validation package` action. It exists to let the user provide the final prompt and ordered references to Codex for a separately authorized ImageGen test. It is not a production Provider, fallback, or hidden generation route.

The package contains:

```text
validation-manifest.json
final-prompt.txt
references/01-<role>.<ext>
references/02-<role>.<ext>
...
acceptance-checklist.md
```

`validation-manifest.json` records the exact accepted request hash, prompt hash, scenario, typed role metadata, ordered reference mappings, authorized/prohibited paths, selected composition for Cosplay, and expected evaluation checks. It contains no API key, authorization token, full local path, signed URL, session cookie, or unrelated upload.

The action is available only when all of the following are true:

- a development-only environment flag is enabled;
- the Host is bound to loopback;
- Compile completed and Prompt Guard accepted the exact request;
- the user explicitly requests the export;
- production builds and public deployments omit or hard-disable the route.

After export, the user manually attaches or supplies the package to Codex. Every ImageGen invocation remains a new, explicit user authorization. Standard tests and CI use fixtures and perform zero ImageGen or real Provider calls. Personal reference images and generated outputs are never committed to GitHub.

## 9. Acceptance matrix

The implementation is incomplete until deterministic tests cover:

1. person + top;
2. person + bottom;
3. person + top + bottom;
4. person + full-body `one_piece`;
5. person + full-body `complete_outfit`;
6. missing person, no garment, and full-body mixed with top/bottom all block;
7. fit, footwear, and pose remain optional and isolated;
8. Try-On rejects composition selections while Cosplay exposes all 30 presets and example artwork;
9. every allowed accessory type/placement pair compiles and invalid pairs block before Provider transport;
10. Provider reference limits block before transport with no silent omission;
11. prompt and reference mappings retain garment-region and accessory-placement isolation through Guard and materialization;
12. the local validation export is absent when disabled, contains the exact accepted prompt/order when enabled, and contains no secret or persistent URL;
13. production build and standard CI perform zero real generation calls.

## 10. Delivery sequence

1. **Contracts and ScenarioPacks:** add generic role-group/conditional-binding support, refined wardrobe and accessory vocabulary, deterministic resolution, fixtures, and compatibility tests.
2. **Compiler and prompt closure:** derive replace/preserve/adjust scopes from roles, bind accessory placement, preserve isolation through Prompt Guard and Provider materialization, and add evaluation criteria.
3. **Playground UI:** remove Try-On composition controls, implement independent garment slots and full-body exclusivity, add typed accessory controls to Cosplay, and show dynamic Provider capacity.
4. **Local validation export:** add the loopback-only export package and offline security tests. Do not add an automatic ImageGen call.

The first three steps are product behavior. The fourth is a development acceptance aid and must remain outside the production surface.
