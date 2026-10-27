# Parent Atlas Directory-Analysis Readiness

**Audit date:** 2026-10-27

**Scope:** Repository source inspection, existing fixture tests, a direct read-only HTTP request to the existing 8095 parser, and PostgreSQL repeatable-read/read-only inspections. No Graphify refresh, database/cache/projection write, model run, or GPU execution was performed.

## Executive result

The repository already contains substantial building blocks for directory-first, symbol-aware analysis. A single synthetic test joins Svelte parsing, TypeScript language-service symbol resolution, UTF-16-to-UTF-8 byte conversion, revision-bound LSP identity enrichment, a review-only feature proposal, hydration/instruction assembly, prefill identity, and a local cold-artifact reload. This is meaningful fixture integration—not a live user-query or canonical packet-to-ACE proof.

The first end-to-end blocker remains canonical packet identity for the current admitted source. The source binding and Graphify execution membership are independently evidenced. A legacy packet row has the matching source digest, but its canonical source reference is prefix-stripped and its workspace revision is stale (`e24bb…` rather than admitted `c636…`); a second ACE-prefixed row has no source/workspace revisions. The matching packet has 18 lineage rows, all marked source-revision `PROVEN`, but none of the 18 backing chunk rows carries workspace revision, source revision, representation revision, or lineage checksum. A separate apply receipt reports 16,151 packet updates for the older `e24bb…` workspace/execution; it does not qualify this packet for `c636…`. The `c636…` repair manifest is a 279-entry plan, not an apply receipt. The existing fixture still supplies placeholder `fixture:packet:component` and injected resolver callbacks. Do not mint or persist a key from the Graphify `repo:root` partition without an accepted canonical repository-scope owner.

## Evidence matrix

| Stage | Existing owner/evidence | What it proves | What remains unproven |
|---|---|---|---|
| Directory/source inventory | Graphify source selection and packet-admission manifests; current execution census in `openspec/changes/atlas-directory-first-analysis-v1/tasks.md` | A selected source cohort and snapshot membership can be audited | Fresh directory discovery wired to the SvelteKit recommendation/query caller |
| Svelte/CST parsing | `packages/parent-atlas/test/svelte-typescript-symbol-smoke.test.mjs`; live `http://127.0.0.1:8095/ast/chunk` | Admitted snapshot bytes for `sveltekit-frontend/src/routes/register/+page.svelte` match its current binding; 8095 echoed exact source/workspace revisions and returned 11 clean chunks with valid byte spans | Parser is proven for this admitted source, but canonical packet/chunk identity remains blocked |
| LSP coordinates and symbols | `lspRangeToUtf8ByteRange`, `enrichLspTargetIdentityV1`; fixture includes `λ😀` before the call; live 8095 AST bytes feed a test-injected symbol lookup | Fixture UTF-16 coordinates map to exact UTF-8 bytes; live parser evidence can be checked against a fixture symbol range | Live VS Code/LSP server and production symbol-registry lookup on the admitted source |
| Feature/domain taxonomy | `buildLabelFeatureV1`, `buildLabelProposalsV1`, `domain-taxonomy.ts`, `.okf/domains/atlas-domain-taxonomy.yaml` and registered schema | Deterministic fixture feature output; proposals remain `REVIEW_REQUIRED` and non-canonical | Full `.okf` semantic crosswalk, OAK-backed term resolution, and source-grounded production fanout |
| Packet identity | `packet-key-v2.ts`, `packet-key-resolution-v2.ts`; focused suites pass 21/21; live readback in the cited receipt | Pure key recipe and stored-key/alias resolution behavior; a legacy packet row matches source digest only | Approved canonical repository-scope mapping and a packet row matching exact canonical source and admitted workspace revision |
| Graph/recommendation | Graph, ontology, and candidate-feature owners/tests exist; current ledger records execution membership and source census | Component/fixture surfaces and source-cohort evidence | A qualified graph snapshot and caller-to-recommendation lineage with exact packet/source revisions |
| Retrieval and ACE | SearchRuntime, ContextManifest admission/bridge, prompt-plan and readback owners/tests exist | Isolated contracts and fixture behaviors | One real query through normalized/fused candidates to an admitted `ContextManifest` with exact identity/readback |
| Prefill/cache | `contextual-prefill-fabric.ts`, `prefill-cache-runtime.ts`; smoke fixture clears a local `Map` and reloads a serialized record | Deterministic cache identity/checksum verification in memory | Actual Valkey/BitFrost cold→warm→evict→artifact reload on a live ContextManifest and approved model/tokenizer recipe |
| GPU/tensor | `python/atlas_compute/cutile_kv_block_swap.py` and `python/atlas_corpus_lib/` contain experimental CUDA/cuDF/tile helpers | Source and fixture contracts only | Authorized GPU execution, CPU-oracle parity on the qualified cohort, resource measurements, and justified performance gain |
| Events/transport | OpenSpec task 4.1 keeps Kafka separate as an optional PostgreSQL WAL/outbox projection; Arrow/DuckDB helpers exist | Future adapter direction and local artifact contracts | Qualified DAG trace and idempotent event identity/replay proof; Kafka remains deferred |

## Focused test run

Command: `$env:ATLAS_8095_FIXTURE_URL='http://127.0.0.1:8095'; $env:ATLAS_8095_WORKSPACE_REVISION='sha256:c63620c45fca8a3f2b3f17a45876925b7c978d4330bff273821de0d51d29a55c'; node --test ./test/svelte-typescript-symbol-smoke.test.mjs` from `packages/parent-atlas`.

Observed: 4 passed, 0 failed, 0 skipped. The live Svelte case used admitted workspace revision `c63620c4…` and source `sha256:7272442b…`; it checked the real `+page.svelte` source (12,388 bytes), 11 returned chunks, and byte/line-column span agreement. A separate direct POST of the same snapshot bytes returned `COMPLETE`/`CLEAN`, echoed both revisions, and passed span bounds. Read-only PostgreSQL binding readback found exactly one matching workspace row. The packet/chunk readback found one source-digest packet with stale workspace revision, 18/18 source-revision lineage labels, and 0/18 fully revision-qualified backing chunks. Receipt: `.tmp/atlas/source-to-packet-register-page-live-snapshot-readonly-20261027-v2.json`. The synthetic cross-file flow still injects packet identity, symbol registry, taxonomy, model/tokenizer labels, and artifact store; it is not an end-to-end production lineage proof.

The live sidecar `/health` returned 200 and reported Python 3.13.15, Tree-sitter/chunker/ast-grep available, and `torch:false`, `cugraph:false`, `cuvs:false`, `cupy:false`. This parser service is not running inside the audited NVIDIA/Python 3.14 environment and did not execute GPU code. Receipt: `.tmp/atlas/parent-atlas-live-8095-svelte-symbol-receipt-20261027-v1.json`.

Separate focused packet key/resolution test run: 21 passed, 0 failed. This does not promote identity or prove a live packet mapping.

## Retrieval boundary review

Static inspection of `packet-dense-search.ts` found that the request's workspace revision is optional, and the packet/chunk lineage selector validates packet-to-source-binding revisions but does not compare `codebase_chunk_index.workspace_revision`, `source_revision`, `representation_revision`, or `lineage_binding_checksum`. The Stage 3 join-back compares packet rows with the Stage 1 candidate, not with those chunk-row fields. This code inspection is not proof that an unqualified hit reached a live caller, but it means the current retrieval implementation cannot supply the missing chunk-row proof for this admitted source. The live register-page readback independently found 0/18 linked chunk rows with those fields. Do not change dense behavior under the existing revision-backfill deferral; require an owner-reviewed shadow comparison before changing this boundary.

## Repository/tooling notes

- OpenWiki retrieval tools were unavailable. The repository `openwiki/quickstart.md` points to architecture, glossary, workflow, and validation pages; source/tests remain the authority for this audit.
- `python/atlas_corpus_lib/pyproject.toml` declares Pydantic 2.13.x; several corpus contracts use it. This is a package-level schema/validation dependency, not evidence of a live extraction pipeline.
- The bounded search found LangChain references in documentation/taxonomy context, but no DeepAgents runtime owner in the inspected analysis packages. Do not introduce either as a parallel analysis authority without a separate owner decision.
- Current OpenSpec status and read-only receipt counts are in the owner ledger. A single completion percentage would conflate historical phases, fixture tests, live services, and admission gates, so none is calculated here.

## First blocker and next proof

**First blocker:** exact canonical packet identity and revision-qualified chunk admission. Fresh readback for the register page finds a source-digest match under a legacy packet key, but its canonical source ref drops the repository prefix and its workspace revision is superseded; the second legacy packet candidate lacks revisions. The 18 linked chunk rows lack workspace/source/representation revisions and lineage checksums. Both V2 identity registry relations are absent. The admitted source binding and parser response do not confer packet authority.

**Next bounded proof:** resolve and document the canonical repository-scope/packet-key owner; then independently read back one packet row bound to the current source and workspace revisions and establish chunk-row revision qualification. Only after that should the synthetic flow be adapted to consume the canonical source/symbol/feature/packet evidence, followed by live 8095 and real SearchRuntime→ACE→prefill readback. Keep database, Neo4j, cache, Qdrant, Kafka, and GPU writes/execution gated.

**State:** live parser/Svelte span proof passed against exact admitted snapshot bytes and current source binding; synthetic fixture integration present; live vertical lineage `BLOCKED` at canonical packet identity and chunk revision admission; full objective remains open.
