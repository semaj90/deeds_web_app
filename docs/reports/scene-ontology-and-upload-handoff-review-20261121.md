# Scene Ontology and Upload Handoff Review

Date: 2026-11-21  
OpenSpec change: `crime-scene-reconstruction`  
Scope: read-only source audit plus task-ledger update. No case data, database, object store, feature gate, or runtime service was changed.

## Findings

- `sveltekit-frontend/src/lib/splat/scene-ontology/scene-ontology-catalog-v1.json` declares schema `parent-atlas.scene-ontology.catalog.v1`, namespace `pa`, and status `PROPOSED_SCENE_VOCABULARY_NOT_CANONICAL`. It contains 506 concepts split across tiers 0/1/2 as 12/54/440 and 28 relation-type definitions. Its note explicitly says labels are authoring concepts, not evidence facts.
- The ontology is a semantic catalog, not a mesh list. Existing separate owners include `scene-primitive-registry-v1.ts`, `scene-prefab-registry-v1.ts`, `scene-modular-p0-recipes-v1.ts`, `scene-ontology-linked-tuples-v1.ts`, and `scene-catalog-pack-v1.ts`. The tuple bridge validates scope, source bindings and relation kinds; it exposes a `Uint16` ordinal LUT. Modular P0 recipe tests check recipe-to-concept links. There is no reviewed allowlist mapping every *renderable* concept to a recipe, nor a single canonical, fast runtime index. Nonvisual concepts should remain metadata and relations.
- The kernel naming collision described in an older ledger entry is resolved in source. Reconstruction exports `GeometryKernelV1` and `createGeometryKernelV1`; splat exports `SplatGeometryKernelV1` and `createTypeScriptGeometryKernelV1`. The domains remain separate. Four focused suites passed: ontology 16, modular P0 recipes 5, reconstruction kernel 10, splat kernel 3 (34 total).
- Upload UI coverage and Set the Scene coverage are separate. `tests/e2e/evidence-upload-scene-placement.spec.ts` covers uploaded exhibit navigation and deliberate marker placement. `tests/e2e/set-the-scene-workflow.spec.ts` covers builder handoff, proposal review and preview from a direct scene URL using configured case fixtures. No one test currently proves newly uploaded evidence flowing through assistant handoff, proposal review and visible scene preview. It also remains important to assert upload alone does not enqueue a generation job and cross-case reuse is denied.
- TRELLIS is represented by an optional enum value only. The current compiler does not invoke it. TRELLIS.2 can be planned as a separate, bounded generator for irregular derived assets after runtime availability, terms/rights, data handling, model revision, resource bounds and output validation are established. It is not needed for deterministic procedural rooms, buildings or city assemblies and cannot establish evidence, identity, layout truth or event truth.
- Retrieval discovery returned `canonicalAuthority:false`, `proofUsable:false`, and `MISSING_SOURCE_REVISION`; those results were not used as proof. Conclusions above follow the checked-in source and tests.

## Progress

`openspec instructions apply --change crime-scene-reconstruction --json` reported 58 of 260 checklist items complete (22.3%). That is the exact broad OpenSpec checkbox ratio, not an end-to-end completion percentage. The lane percentages in `openspec/changes/crime-scene-reconstruction/tasks.md` are separate estimates: ontology/catalog 40%, who/what/why/how prompt-to-plan 35%, upload-to-scene preview 60%, SPZ fixture rendering 50%, derived registry/memory optimization 15%.

## Verification

- `npm exec vitest run src/lib/splat/scene-ontology/scene-ontology.spec.ts src/lib/reconstruction/scene-modular-p0-recipes-v1.spec.ts src/lib/reconstruction/geometry-kernel-v1.spec.ts src/lib/splat/geometry-kernel-v1.spec.ts --pool=threads --maxWorkers=1 --minWorkers=1 --no-file-parallelism` — PASS, 4 files / 34 tests.
- `openspec validate crime-scene-reconstruction --strict` — PASS, `Change 'crime-scene-reconstruction' is valid`.
- `git diff --check` — exit 0. Git emitted only existing LF-to-CRLF working-copy notices.
- Playwright, `npm run check:native`, live PostgreSQL, SeaweedFS and Docker were not run for this documentation-ledger update.

## Next work

1. Add an authorized-fixture Playwright test for upload → evidence selection → assistant Set the Scene → proposal review → rendered preview, including no-job-on-upload and cross-case denial assertions.
2. Review and version an ontology-to-recipe allowlist for renderable concepts only, without promoting the proposed catalog automatically.
3. Qualify TRELLIS.2 as an optional irregular-asset generation lane, keeping output derived and reviewed.
4. Build a deterministic revision-keyed registry projection from existing catalog, recipe, prefab and tuple owners.
5. Benchmark lookup, streaming and decode before adding bitset, nibble, SIMD, WASM or N-API paths. Keep EmbeddingGemma/MRL as retrieval representations only.

## Required execution fields

- `likely_cause`: Prior ledger claims were stale or conflated semantic vocabulary, geometry recipes and separate upload/scene E2E coverage.
- `evidence`: Catalog JSON; ontology/recipe/kernel modules and four focused suites; upload placement and Set the Scene Playwright specs; OpenSpec apply progress JSON.
- `patch_targets`: `openspec/changes/crime-scene-reconstruction/tasks.md`; `docs/reports/scene-ontology-and-upload-handoff-review-20261121.md`.
- `safe_next_command`: `npm exec playwright test tests/e2e/evidence-upload-scene-placement.spec.ts tests/e2e/set-the-scene-workflow.spec.ts -- --list` (non-mutating discovery; execution still requires configured authorized fixture IDs).
- `smoke_command`: `npm exec vitest run src/lib/splat/scene-ontology/scene-ontology.spec.ts src/lib/reconstruction/scene-modular-p0-recipes-v1.spec.ts src/lib/reconstruction/geometry-kernel-v1.spec.ts src/lib/splat/geometry-kernel-v1.spec.ts --pool=threads --maxWorkers=1 --minWorkers=1 --no-file-parallelism`.
- `report_path`: `docs/reports/scene-ontology-and-upload-handoff-review-20261121.md`.

## GAN validation addendum

Repository revision at inspection: `8944ad488490555a22068b40253dee5d3898994c`; worktree was dirty, so this revision identifies HEAD only, not all inspected bytes. Current source still has separate reconstruction/splat kernels. A source scan found imports only in each kernel's own spec; this supports distinct names but does not prove a production caller. The naming collision is corrected in source; production kernel integration remains incomplete.

| Capability | CREATED | WIRED | PROVEN | DONE |
|---|---|---|---|---|
| Ontology/tuple vocabulary | PASS | PARTIAL | PARTIAL (structural and selected recipe tests) | NO |
| Kernel naming / production integration | PASS, exports are distinct | NO production caller; only the specs import these modules | PARTIAL, names differ and module tests pass | NO under strict GAN rule because WIRED is absent |
| Uploaded evidence through assistant handoff to rendered preview | PASS | PARTIAL; separate upload/placement and builder paths | PARTIAL; separate specs and unit tests only | NO |
| Authorized scene save/readback/reopen | PASS, existing owners and gated UI | PARTIAL | NOT PROVEN | NO |
| TRELLIS.2 generator | PARTIAL, optional enum/reference | NO | NOT PROVEN | NO |

### Exact verification for this addendum

Command:

```text
npm exec vitest run src/lib/splat/scene-ontology/scene-ontology.spec.ts src/lib/reconstruction/set-the-scene-workflow-v1.spec.ts --pool=threads --maxWorkers=1 --minWorkers=1 --no-file-parallelism
```

Observed output:

```text
✓ src/lib/splat/scene-ontology/scene-ontology.spec.ts (16 tests) 24ms
✓ src/lib/reconstruction/set-the-scene-workflow-v1.spec.ts (8 tests) 34ms
Test Files  2 passed (2)
Tests       24 passed (24)
Duration    5.02s
```

Adversarial cases in that run: `prevents prompt planner from minting evidence-backed source bindings`; the tuple validator rejects evidence not in the authorized evidence set; the Set the Scene handoff rejects a different case ID, empty membership and duplicate evidence IDs. These are unit tests and do not establish live route authorization.

Hook command:

```powershell
$payload = '{"tool_input":{"file_path":"C:/Users/james/Videos/deeds-web-app/openspec/changes/crime-scene-reconstruction/tasks.md"}}'; $payload | node .claude/hooks/gan-validation-gate.mjs
```

Observed output (exit 0):

```json
{"hookSpecificOutput":{"hookEventName":"PostToolUse","additionalContext":"GAN validation gate: C:/Users/james/Videos/deeds-web-app/openspec/changes/crime-scene-reconstruction/tasks.md changed.\nBefore marking any item DONE or checking it [x], run the gan-validation skill:\n  CREATED = file exists · WIRED = production path calls it · PROVEN = live evidence · DONE = wired + proven + accepted.\nCite for each claim: exact command, exact output, report path, and the task ID with its change (change#Lnn).\nExistence alone is not DONE. Leave the item open if no live evidence exists."}}
```

The hook was manually invoked with the same JSON shape its PostToolUse handler consumes. It is advisory: it emitted its reminder and did not block or validate the task update. The OpenSpec change remains 58/260 complete (22.3%); this report and the ledger make no DONE promotion for the incomplete reconstruction path. Strict validation and `git diff --check` are rerun after the addendum.
