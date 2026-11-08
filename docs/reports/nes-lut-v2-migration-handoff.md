# NES LUT v2 migration and OAK/OKF classification handoff

## Ownership retained

- `postgresql18.atlas_domain_ontology` remains the canonical ontology owner;
  `.okf/domains/atlas-domain-taxonomy.yaml` is a generated 17-ID reference snapshot,
  not the source of NES byte assignments.
- `scripts/atlas/data/nes-domain-palette-v1.json` and its Node source remain the
  active 10-domain NES palette owners. Their bytes and color values must not change.
- `scripts/atlas/data/nes-domain-palette-v2.candidate.json` is a separate,
  14-domain non-canonical candidate. The source-qualified JSON crosswalk maps
  17 ontology group IDs onto those 14 display/analysis domains; it is not
  a replacement for `docs/reports/domain-crosswalk-proposal-v1.json`, which
  concerns legacy `feature_domain.domain_class` values.
- OAK on `:8095` remains read-only proposal/evidence retrieval. No new classify
  endpoint is inferred from this migration; ast-grep/tree-sitter/LSP/rg evidence
  does not create approved domain labels.

## Proposed additions

| Group | New NES domain | Proposed byte | Proposed color |
| --- | --- | --- | --- |
| `compiler` | compiler | `0x0B` | `0x17` |
| `devops` and two children | devops | `0x0C` | `0x28` |
| `error-handling` | error-handling | `0x0D` | `0x26` |
| `test` | test | `0x0E` | `0x2B` |

Existing `0x00 = UNRESOLVED`, `0x02 = ui`, and `0x0A = general` remain stable.
The original group ID is preserved for the lossy `gpu→ml` rollup.

## PostgreSQL migration boundary

The existing `atlas_nes_lut_v1` table can hold multiple revision keys, so the
candidate inserts 14 rows with `lut_revision='atlas.nes-lut.v2-candidate'`,
`canonical=false`. No new table or index is proposed. Scratch execution is
blocked until the exact v1 byte/color pre-image has been read and compared.
The historical v1 SQL seed assigned `general=0` contrary to the v1 palette's
`general=10`. The runner can only acknowledge that one exact known discrepancy
through a separate double opt-in; it never overwrites v1 or fixes it silently.

## Classification training remains blocked

Tier A code-file gold labels and Tier B OpenSpec task labels are different
objects and cannot be merged into one training set. The 14-class minimum of
30 human-accepted examples each is 420 *for an admitted 14-class experiment*;
existing source-revision/workspace and holdout gates still apply.

## Verification status

- PASS: local pure JS/Node schema, checksum and migration guard tests.
- PASS: local Python explicit-v2-loader tests.
- NOT_RUN: real PostgreSQL scratch transaction or independent readback.
- NOT_RUN: 8095 OAK runtime, ACE, WebGPU, SvelteKit, and typecheck integration.
- NOT_RUN: production deployment, data backfill or label promotion.
