# Parent Atlas Contextual Engineering and Ranking Audit

**Audit date:** 2026-10-21  
**Mode:** Read-only source/caller review plus focused local tests.  
**Production status:** Component behavior is tested; an end-to-end production recommendation path is not proven.

## Summary

The listed owners are aligned as separate components: feature/ordinal bitsets, CPU compact-KNN, Top-K receipts, FM ranking, typed DAG planning, tournament/promotion contracts, and the Hermes proposal helper. Their unit tests must not be read as proof that a production request runs this complete chain.

The main integration gap is an application caller and evidence-qualified execution path. Source search found no non-test application caller for `executeHermesAgentStepV1`, `adaptRankerFromOutcomesV1`, the ordinal selector, or the compact-KNN scorer. DAG synthesis and promotion are composed inside the Hermes helper, not called by an application entrypoint. `buildAceContextPacketV1` is called by `ace-context-proposal-renderer-v1.ts`, but that function returns a pure packet descriptor; it does not prove Redis persistence, readback, or model injection.

## Stage review

| Stage | Evidence/status | Boundary |
|---|---|---|
| Feature-label and 64-bit bitset codecs | Component tests pass; codec contract exists | Not evidence of canonical taxonomy approval or live storage |
| 64-byte-padded bitset | 8/8 focused tests pass | Logical offset/padding only; not physical cache-line or N-API alignment |
| Ordinal selection + compact-KNN | 18/18 direct tests pass, including mask-before-read behavior | CPU reference only; no application/SearchRuntime importer, PostgreSQL readback, GPU transfer, or device-alignment proof |
| Top-K selection receipt | 8/8 focused tests pass | Contract behavior only; no live admitted ContextManifest/readback demonstrated |
| FM ranker and ranked-function receipt | 5/5 combined tests pass | No production ranker caller or revision-qualified outcome-training run established |
| DAG synthesis and tournament/promotion | 7/7 focused tests pass | Pure contract behavior; no production orchestration path or live sandbox tournament proven |
| Hermes adaptive helper | 6/6 focused tests pass | No application caller for `executeHermesAgentStepV1` or `adaptRankerFromOutcomesV1`; no live feedback, persistence, or agent execution proof |
| ACE/cache-tile proposal | Covered by the separate script suite | Script-level proof only; no GPU allocation, CUDA execution, or durable cache write/readback |

The 64-byte layout is a serialized logical layout. JavaScript tests do not prove physical pointer alignment. Likewise, bytea serialization, AVX2/AVX-512 availability, N-API transfer alignment, and CUDA device alignment require separate native/runtime evidence. No GPU work was run; no PostgreSQL, Valkey, Qdrant, Neo4j, or CouchDB writes were performed.

## Validation run

- `node --import tsx --test scripts/atlas/test-adaptive-dag-fetch.mjs scripts/atlas/test-hypergraph-fact-contract.mjs scripts/atlas/test-bitfrost-token-fsm.mjs scripts/atlas/test-polyglot-dag-oak-rlm.mjs scripts/atlas/test-dspy-llama-caller.mjs scripts/atlas/test-ace-gpu-tile-synthesis.mjs` — **10/10 passed** across six script files.
- From `sveltekit-frontend`, `npx vitest run --config vitest.lane-contracts.config.ts` with the ten listed owner specs — **10 files / 49 tests passed**. The directly related aligned-bitset, ordinal-selection, and compact-KNN specs account for **18/18**.
- `openspec validate parent-atlas-tensor-residency-integration --strict` — **valid**.
- No full application build, database readback, GPU/N-API test, production SearchRuntime execution, MCP invocation, or model call was run.

## Ledger update and next gate

Updated `openspec/changes/parent-atlas-tensor-residency-integration/tasks.md` with current focused-test evidence and the caller audit. The `ALIGNED-BITSET-ORDINAL-WIRE-01` item remains unchecked. The checked `HERMES-01` item is clarified as a component milestone, not a deployed autonomous pipeline.

### Follow-up caller trace (2026-10-21)

The production `SearchRuntime` has callers; the missing edge is narrower than “SearchRuntime is unwired.” `/api/search/hyperrag` constructs it with `readOnly: true`, and `searchAce` also calls it. But source search found no non-test importer for `executeSearchRuntimeTopKV1`, `buildSearchRuntimeSelectedCandidateSetV1`, or the selected-feature-row builder. The ordinal selection adapter therefore does not yet consume those production search results. Separately, `/api/ace/stream` calls `admitAceRouteCacheIdentityV1(undefined, cacheKey)` and its fail-closed path emits `ACE_CONTEXT_MANIFEST_ADMISSION_REQUIRED` and ends the stream before synthesis. That is an explicit admission blocker, not proof of successful ACE delivery.

**First divergence:** request-scoped SearchRuntime results are not bound by an application caller to the sealed ordinal map/feature snapshot and passed through the tested Top-K evidence/ContextManifest admission path. No candidate snapshot, source bytes, database state, or ContextManifest was fabricated or fetched in this follow-up. No live request or store access was performed.

**Additional prompt-boundary finding:** `/api/search/hyperrag` has a `synthesize` branch that constructs the llama-server system prompt directly from `result.packets` titles/summaries/content and derived `facts`; this source path does not call the existing ContextManifest admission/selection owner before the model request. The route is configured with `SearchRuntime` `readOnly: true`, but that does not make raw-hit prompt assembly compliant. Treat the branch as `BLOCKED_CONTEXT_MANIFEST_REQUIRED` for this architecture until it uses the admitted manifest. This is source inspection only; no model request was issued and no runtime behavior was changed.

### MCP retrieval smoke and evidence rejection (2026-10-21)

The live TRACE MCP `atlas.packet_search` call returned HTTP 200. A bounded `summary_query=HyperRAG, limit=3` returned three rows, proving tool transport and handler execution only. The result shape exposed no top-level source/workspace revision or byte-span binding. `packet:5938686cd907` for `sveltekit-frontend/src/lib/server/ace/trust-tiers.ts` carried SHA-256 `b58a5cc20733b2230a14368fe5fd95c3b66c328c660ec09af815acc2d7804f4c`; hashing the current source produced `f7c72f970d738a3802ff03852de960d5f72f7c8be1eb191d09e5d12ad4f4de74c`, a mismatch. Two other results had null digests. A source-path search hit the MCP statement timeout; `summary_query=ContextManifest retrieval` returned zero rows. MCP retrieval is therefore **transport-smoke-proven, evidence-quality/admission-blocked**. No candidate was used in a DSPy prompt, ACE packet, or Ornith request; no persistent write occurred.

The separate ACE registry tool `atlas.search` is currently a placeholder that always returns an empty candidate list. The `kb.rg_atlas_search` tool is not a safe substitute for this smoke: its implementation reads Valkey and may invoke embedding, Qdrant, and GPU lanes even when persistence is disabled. It was not called.

### Follow-up source-binding reconciliation (2026-10-21)

A bounded `BEGIN READ ONLY` PostgreSQL query found **two** `atlas_workspace_source_bindings` rows for `sveltekit-frontend/src/lib/server/ace/trust-tiers.ts`. One row binds 5,795 bytes to source digest `sha256:15c1626f0b664ea05df103a49a7ffefe10a7720fe80ba6b66118a47b603544c2` under workspace revision `sha256:322ed1a6f8ffc52576314fde9a33afd1faba015c3fc8cd60609052c5ca2dfbaf`; the other binds 5,794 bytes to `sha256:f7c72f970d738a3802ff03852de960d5f72f7c8be1eb191d09e5d12ad4fde74c` under workspace revision `sha256:e24bb97187ea6394eeba457dd849915f570045b7a1867780fdc7aa9ea62b9acc`. The current-file digest previously recorded in this report matches the latter binding, but that alone does not select an authoritative snapshot.

Exact joins on source path, workspace revision, source revision, and content digest returned **zero matching rows** in both `graphify_files` and `atlas_ast_nodes` for both bindings. Thus neither candidate has the required corroborating snapshot/AST evidence in those tables. The packet-search hit remains a retrieval candidate only: `SOURCE_BINDING_PROVEN` is **BLOCKED** (`AMBIGUOUS_SOURCE_BINDING` / missing authoritative snapshot corroboration); no immutable input manifest, diagnostic/AST replay, Arrow admission, ACE packet, ContextManifest, DSPy call, or Ornith invocation was produced. The read-only SQL transaction rolled back. No durable store was written.

### Bounded diagnostic sweep after SvelteKit type generation


### Local package-doc extraction smoke (2026-10-21)

The installed `ioredis` 5.8.2 README was used as a bounded, checksummed local documentation source; LangExtract 1.6.0 reached the live llama-server model `ornith-1.5-9b` on `:8090`. The response contained five API-symbol strings, and all five passed exact-substring validation against the pinned README excerpt. A review-only cheat-sheet proposal records source byte spans and checksums. This proves one local extraction/grounding smoke only: labels and API semantics remain model proposals, the `.d.ts` file was inventoried but not sent to the model, and the proposal was **not indexed, ACE-admitted, or injected**.

The subsequent sequential top-20 batch processed the 16 packages with pinned README + type-entry sources. **13 produced review-only proposals with at least one exact-source span; 3 returned zero extractions** (`drizzle-orm`, `fast-check`, `playwright`). No model-call failures occurred. Independent verification recomputed 54 source-file checksums and every recorded proposal byte span; there were zero mismatches. The batch does not validate the semantic correctness of model labels or establish retrieval/indexing quality.

A separate top-20 local-package source manifest pins installed README and declared type-entry checksums for **16/20** packages. Four remain gaps: `@deeds/parent-atlas` resolves outside `node_modules` and was excluded; `amqplib`, `@modelcontextprotocol/sdk`, and `minio` lack a resolved declared root type entry under the current resolver. Manifest/checksum verification covered 54 source files with zero mismatches. No network crawling or datastore writes occurred. Artifacts are under `.tmp/atlas/library-cheatsheets/20261021T201924Z-top20-package-docs/` and `.tmp/atlas/sveltekit2-docs-analysis/20261021T201821Z-ioredis-local-doc-smoke/`; this is a local package-doc namespace, **not** an official SvelteKit documentation corpus.

Focused candidate-selection, ContextManifest-admission, and AcePacketV3 bridge tests passed **26/26** (6 + 12 + 8). A separate MCP schema Vitest invocation did not complete within the bounded wait and was interrupted; it is not counted as passed. The live tool smoke is independent of that unit-test status.

Next proof should use the existing SearchRuntime and canonical ordinal/snapshot owners: establish one frozen, admitted candidate snapshot; wire the selector/scorer through the real caller; then capture independent source/revision and ContextManifest readback. Only after CPU correctness and parity gates pass should native or GPU alignment be considered. Keep the existing GPU resource-window rule in force.

```yaml
likely_cause: The recommendation components have passing local tests, but the top-level Hermes and ordinal-KNN paths lack proven application callers and end-to-end readback.
evidence:
  - Focused Vitest: 10 files, 49 tests passed; direct ordinal lane 18/18.
  - Node integration scripts: 10/10 passed.
  - Source search: no application caller found for executeHermesAgentStepV1, adaptRankerFromOutcomesV1, ordinal selection, or compact-KNN scoring.
  - Follow-up: SearchRuntime has read-only application callers, but the ordinal/Top-K adapter has no production importer; `/api/ace/stream` fail-closes before synthesis when no admitted server-owned cache identity is supplied.
  - Review finding: `/api/search/hyperrag` assembles its synthesis prompt from raw SearchRuntime hits/facts without ContextManifest admission; no synthesis call was run.
  - MCP smoke: `atlas.packet_search` returned three candidates, but the current-source digest mismatch and missing revisions/spans blocked evidence use; the exact path lookup timed out.
  - ACE contracts: selection/admission/packet bridge tests passed 26/26; no prompt injection or model invocation occurred.
patch_targets:
  - openspec/changes/parent-atlas-tensor-residency-integration/tasks.md
  - sveltekit-frontend/src/lib/server/atlas/agentic/hermes-adaptive-pipeline-v1.ts
  - sveltekit-frontend/src/lib/server/atlas/features/candidate-ordinal-bitset-selection-v1.ts
  - sveltekit-frontend/src/lib/server/atlas/retrieval/compact-knn-topk.ts
safe_next_command: Compare `/api/search/hyperrag` result identity/revision fields with `CandidateOrdinalMapV1` and `CandidateFeatureSnapshotV1`; stop if no authoritative one-to-one binding exists.
smoke_command: npx vitest run --config vitest.lane-contracts.config.ts src/lib/server/atlas/features/candidate-ordinal-bitset-selection-v1.spec.ts src/lib/server/atlas/retrieval/compact-knn-topk.spec.ts src/lib/server/atlas/tensors/aligned-bitset-blob-v1.spec.ts
report_path: docs/reports/parent-atlas-contextual-engineering-ranking-audit-20261021.md
```
