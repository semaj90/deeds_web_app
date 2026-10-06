# Domain Classification and Agentic Retrieval Alignment V1

- status: DESIGN_ALIGNMENT / NON-AUTHORITY
- owner: existing Parent Atlas classification, retrieval, ontology, and external-doc owners
- purpose: align classification, ontology links, vector/graph features, MCP tool plans, and synthesis without creating a second identity or retrieval owner
- canonicalAuthority: false

## 1. Separate the things that are currently easy to conflate

| Concept | Unit | Meaning | Must not become |
| --- | --- | --- | --- |
| `domain_class` | source/document/chunk | Multi-label area of the code or documentation | packet identity, authorization, or a retrieval vote |
| query intent | request | What the user wants done and which retrieval needs are likely | source taxonomy or executor selection by itself |
| `feature_id` | stable feature/concept | Product or capability such as `feature:auth:session` | a file path or classifier output |
| ontology tuple | typed relationship with evidence | A revision-qualified relation between canonical entities | a linked-list encoding or inferred identity |
| representation | vector/model output | A derived view such as `semantic_768` or a latent projection | canonical source truth |
| topology/cluster | projection assignment | Rebuildable routing/diversity metadata | an identity or independent search vote |
| execution lane | implementation | PostgreSQL, Qdrant, graph, CPU, GPU, MCP executor | user intent or evidence authority |

Use canonical joins, not a chained pseudo-linked-list such as `packet_key -> source_ref -> feature_id -> som_cell -> qdrant_point_id`. Those values have different owners and cardinalities. Connect them with typed, revisioned relationships and preserve each identifier's namespace. A Qdrant point ID, tree-node ID, SOM cell, cluster ID, centroid cache key, and CandidateOrdinal are never aliases for `packet_key`.

### Revision dimensions (independent, never inferred from one another)

| Revision | Identifies | Must bind / be issued by | Does not prove |
| --- | --- | --- | --- |
| `sourceRevision` | One exact source artifact version (for code, the admitted source bytes/digest under the source-binding owner; for external docs, the page/content evidence revision) | Existing canonical source or document-coordinate owner; retain the revision scheme and namespace | Workspace snapshot membership, packet/chunk binding, or any derived representation |
| `workspaceRevision` | One exact repository/workspace snapshot or workspace-source binding frame | Existing workspace revision/binding owner | That every source or chunk is present, admitted, or unchanged; never substitute it for `sourceRevision` |
| `representationRevision` | One derived representation artifact/population produced from identified input under an exact recipe | Representation producer, bound to input identity/revision, model/config/recipe and output checksum | Identity merely from dimension/model nickname, or equivalence between different recipes |
| `producerRevision` | The implementation/configuration revision that performed a derivation | The producer owner (code/build plus material configuration); not a caller-supplied label | Source, workspace, graph, or representation revision by itself |

Related but distinct: `graphRevision` identifies a frozen relationship kernel/snapshot; `evidenceRevision` identifies a grounded evidence coordinate/content claim; external-document `productVersion` describes the upstream product release. A missing required revision stays null/unqualified; do not synthesize a fallback such as `semantic_768@v1` or derive a workspace revision from a path, timestamp, or graph node.

## 2. Domain taxonomy proposal (not yet the runtime enum)

The requested top-level taxonomy is a proposed `domain_class` vocabulary. It does not replace the current `parent-atlas-domain-taxonomy-v1` labels (`auth`, `ui`, `retrieval`, `network`, `database`, `cache`, `agent`, `graph`, `ml`) or the distinct `QueryClassificationV2` intent vocabulary. In particular, `frontend -> ui` is a known legacy alias, but collapsing `backend`, `compiler`, `gpu`, or `documentation` into a legacy label is lossy. Do not change stored labels or classifier schemas until a versioned migration/compatibility decision is made.

| Proposed class | Positive evidence examples | Boundary / negative rule |
| --- | --- | --- |
| `frontend` | Svelte components, routes, browser state, accessibility | API route implementation can also be `backend`; a UI that calls search is not itself `retrieval` by default |
| `backend` | server routes, services, authorization, transactions | Use a second class only when the source has a real cross-domain responsibility |
| `retrieval` | query planning, lexical/dense search, fusion, reranking, candidate promotion | A vector database client alone does not prove retrieval ownership |
| `graph` | typed edges, graph projections, traversal, community algorithms | A tree-shaped JSON document is not necessarily a graph subsystem |
| `cache` | Valkey/Redis/Bifrost keys, TTL, invalidation, cache policy | Cache residency is not canonical evidence |
| `agent` | bounded agent loop, orchestration, tool proposal/dispatch | A prompt or tool schema alone does not prove autonomous execution |
| `compiler` | parser/compiler, AST/CST, symbol/type/reference analysis | Keep NLP labels distinct from parser observations |
| `gpu` | CUDA, RAPIDS, cuVS/cuGraph/cuML, TensorRT, kernels | Mark only when the source owns GPU execution or a measured GPU adapter |
| `documentation` | docs corpus, external-doc acquisition, generated references | External docs remain noncanonical until the external-doc admission owner accepts them |
| `infrastructure` | container/runtime/deployment/observability/configuration | Do not infer this class only from a dependency name |

Classification is multi-label and evidence-backed. An implementation may have one primary and bounded secondary classes. Keep `feature_id` (for example `feature:auth:session`) and finer tags separate from `domain_class`. Every learned label is a proposal with classifier family/revision, confidence/calibration state, and evidence refs. A missing or ambiguous label remains `unknown`/unclassified; do not force a class to make a route execute.

If “DeepSeek-like” means using a capable language model to classify a request/source, treat that model as one classifier proposal backend: request a constrained taxonomy ID, bounded probabilities, and evidence references; validate the response; compare it against reviewed labels and deterministic features. The model name (including a DeepSeek family name) does not define the ontology, grant a class, or select/authorize an MCP mutation. A DeepSeek/Ornith/EmbeddingGemma model or QLoRA adapter is selected only by an immutable model/adapter revision and measured evaluation, not by a mutable alias.

### Existing implementation boundary

- Source taxonomy owner: `sveltekit-frontend/src/lib/server/atlas/domain-taxonomy.ts`.
- Request-intent owner: `sveltekit-frontend/src/lib/server/atlas/neural-routing/query-classification-v2.ts`.
- Reduction planner: `reduction-router-v1.ts`; it plans bounded operations and is not itself an executor.
- Ontology relationship shape: `contracts/ontology-linked-tuple-v1.ts`.
- This proposal is a design crosswalk only. It does not add a new Zod runtime contract or rewrite those owners.

## 3. Classifier and ranking stages

Keep three decisions separate:

1. **Route the request.** Existing query classification estimates domain/operation/retrieval needs and budgets. Deterministic path/symbol/AST evidence is preferred for code tasks. A CPU rules baseline may be followed by Naive Bayes, logistic regression, or XGBoost only when each model has a frozen label set, feature revision, train/eval split, calibration report, and model checksum. EmbeddingGemma classification embeddings are auxiliary model inputs, not source embeddings and not identity.
2. **Retrieve candidates.** Exact identity/FTS, semantic `content` (the Qdrant projection of canonical `semantic_768`), AST/symbol, and graph lanes may run in parallel under their existing executors. Normalize and deduplicate by canonical identity/revision, then let the one SearchRuntime fusion owner combine lane scores (for example RRF). Multiple executors within one logical lane do not receive multiple votes.
3. **Rerank and promote.** A bounded reranker or classifier feature can reorder the fused candidates; it does not supply an additional independent retrieval vote. Promotion requires a canonical packet/source resolver and exact source/workspace revision evidence. Only promoted evidence enters ContextManifest/PromptPlan and then synthesis.

Naive Bayes, logistic regression, and XGBoost are alternative classifier/reranker families, not three sequential truth sources. A GNN is an optional graph-derived scoring model, not a substitute for graph lineage. PCA/SVD and RFF are deterministic or fitted geometry transforms with their own input digest and revision; they reduce/expand features but cannot supply missing source provenance. KMeans and SOM 20x20 assignments are revisioned descriptive features for diversification/residency, never identity. Keep CPU control-plane work (parsing, metadata, rules, small classifiers, validation) distinct from optional GPU numerical work (large matrix products, ANN, clustering, graph kernels). The GPU executor is replaceable and cannot write canonical identity.

## 4. Ontology-linked evidence, not a linked list

Reuse `ontology-linked-tuple.v1` and its current persistence/read owners. The logical relationship is a typed edge/hyperedge between canonical entities, with provenance:

```text
(packet_key, source_ref, source_revision, workspace_revision)
    -- IMPLEMENTS / USES / DEPENDS_ON / GOVERNS / VALIDATES -->
(feature_id or ontology concept ID)
```

Each edge needs a stable tuple identity, relation, evidence reference/span, producer/revision, and confidence/status allowed by its existing schema. For a “Pokédex” source registry, compose existing packet/source/symbol/feature owners into a read model: canonical entity + current revision + structural observations + semantic/graph/projection references + producer receipts. Do not create another all-purpose source authority table just to collect pointers.

## 5. Representation and model terminology

The candidate autoencoder contract is `semantic_768 -> ae_hidden_512 -> latent_256 -> learned latent_128`; `latent_64` is a normalized prefix derived from `latent_128`. `topology_4d` is a separate revisioned projection from `latent_256`. RFF, KMeans/SOM labels, signatures, and graph community/PageRank data are other separately revisioned derived features. Training stays blocked until semantic writer/model/tokenizer and exact training-input cohort lineage are proven; these names do not authorize training or Qdrant writes.

PCA/SVD and the AE MLP are external feature transforms. They do not change Ornith's attention layers. MHA is multi-head attention; MLA is a model-internal latent-attention/KV parameterization. Neither Atlas latent vectors nor ContextManifest make the running model an MLA model. TurboQuant and RotorQuant are quantization challengers whose exact active runtime must be proven; ordinary GGUF Q4 weights or `q8_0` KV are not proof of those specialized formats. “Trigram” lexical search (for example `pg_trgm`) is different from an Engram neural memory module. BitFrost is an external cache/residency policy, not model memory or a KV store.

GraphRAG/HyperGraphRAG are retrieval-expansion strategies over derived graph evidence: ordinary graph neighborhoods can express pairwise edges; hyperedges can bind a bounded set of evidence-qualified entities. Neither should add a second retrieval vote for the same logical lane. Expand only after first-pass candidates, with hop/node/time budgets, canonical identity normalization, and citations back to source spans. A routing LUT may cheaply map reviewed intent/features to eligible read tools; the lookup result remains a plan and must pass the normal tool allow-list and input-schema checks.

QLoRA is another independent lane: a domain adapter may be trained only from reviewed, provenance-bound examples and an immutable base model/tokenizer revision; it needs held-out evaluation, replay, merge/promotion receipt, and rollback identity. Classifier labels generated by the same model are not ground truth. AlphaGo/AlphaEvolve are useful *control-loop analogies*: propose bounded retrieval/tool/ranking alternatives, score them with deterministic evaluators and replay, retain measured survivors. They do not grant a model authority to edit code, schema, weights, caches, or canonical stores.

## 6. Qdrant projection and cache alignment

Current repository contract maps logical `semantic_768` to Qdrant named vector `content`; inspect the current collection contract before any projection change. Do not rename it to `semantic_768` by assumption. The local LangChain corpus is not an admitted Qdrant corpus. Existing Qdrant point payloads are replace-style upserts: a future writer must preserve every configured named vector and the complete validated payload or target a separately versioned collection. Do not upsert partial vectors or unproven RFF/KMeans/SOM tags.

The candidate latent family and `topology_4d` require per-row canonical packet/source/workspace identity, source and input digests, immutable producer/model/tokenizer/checkpoint/representation revisions, and deterministic readback. Current admission still has independent semantic/latent/ordinal/projection/BitFrost/ACE gates; this design document closes none of them. Redis/Valkey centroid keys are disposable derived-cache keys and must include the producer/representation revision. Cache hit, TTL, and PageRank success do not promote evidence.

## 7. Documentation acquisition, indexing, and retrieval

Use the existing LangChain corpus owner rather than pushing every reference through a second crawler:

- Discovery/acquisition contract: `docs/.okf/topics/langchain/corpus.json` and `scripts/atlas/fetch-langchain-doc-corpus-v1.mjs`.
- Python run retained: `.tmp/atlas/langchain-doc-corpus-v1/20260926T232349097Z`.
- Current local viewer pointer: `docs/.okf/topics/langchain/viewer-snapshot.json` selects a separate Python/TypeScript/OpenWiki artifact run at `.tmp/atlas/langchain-doc-corpus-v1/20260930T183106601Z`.
- Read-only local viewer: `readLocalChunkSnapshotPageV1()` verifies the pointer, receipt, and chunk digest and returns `LOCAL_UNADMITTED` evidence. It is not an MCP production search tool or canonical-doc admission.
- Existing KB MCP registry now exposes `docs.search_langchain_local_snapshot` over this viewer with an optional language filter. It is substring/lexical lookup only, remains `LOCAL_UNADMITTED`, and does not establish dense retrieval or a production external-doc caller.
- Separate OpenWiki/OKF dev crawler: `scripts/docs-atlas/crawl-okf-dev-docs.mts` uses Firecrawl when configured, then BeautifulSoup, then plain-fetch fallback. The LangChain fetcher currently uses direct official Markdown and has its own declared fallbacks disabled; do not report that existing LangChain corpus as Firecrawl/BeautifulSoup-acquired.
- External docs become canonical only through the existing external-doc/PostgreSQL admission and readback owners. `docs/.okf` and the local chunk viewer are navigation/artifact layers.

The saved Python run describes 87 discovered URLs, 86 fetched pages, one failed page, 1,548 chunks, 79 scope-admitted pages and 7 redirect-scope rejections. The separate TypeScript/OpenWiki run describes 178 discovered URLs, 174 fetched pages, four conserved failures, six redirect-scope rejections, and 2,907 unique local chunks (`typescript`/`mixed`). A local checksum-verified `tool calling` query returned 5 of 31 substring matches. These are local artifact/lexical proofs only; they do not prove semantic ranking, current upstream freshness, Qdrant/Valkey population, or canonical doc admission.

For MCP, the intended sequence is: user query -> bounded query classification -> allow-listed read-only retrieval tools -> canonical identity/revision normalization -> single fusion/rerank -> exact source/URL evidence promotion -> ContextManifest/PromptPlan -> typed, bounded MCP tool call or synthesis. Zod validation and capability/authorization checks are required at the tool boundary. A classifier decides *which read lane to ask*; it never authorizes writes. Raw MCP search hits must not be sent directly to Ornith.

## 8. Worked query: “find which directory handles authentication sessions”

1. Query intent is `find`; source-domain hints include `auth`, `backend`, and possibly `frontend`; evidence can disambiguate. This is not a requirement to query every class.
2. Run exact/lexical search over names and route/symbol metadata, plus semantic `content` search for paraphrases, plus AST/import/call evidence. Ask graph traversal for a small bounded neighborhood only if initial evidence needs ownership/call-chain expansion.
3. Resolve every candidate to canonical packet/source/revision. Use source-parent/module ancestry or an explicit directory relationship to determine the owning directory. A filename embedding alone cannot establish its parent; use the canonical source relation or verified structure.
4. Fuse/deduplicate once, rerank a bounded set, and promote exact definitions/callers with source spans. An ontology tuple such as `session-route --USES--> session-store` can explain the relationship if that tuple has revision-bound evidence.
5. Return a concise answer with directory, exact source refs/revisions, and citations in ContextManifest. MCP may fetch only bounded referenced evidence; the model cannot invent the directory from a cluster, centroid, summary, or label.

## 9. Readback SQL naming note

The reported `filekind does not exist` error is consistent with PostgreSQL identifier folding: a CTE column declared as quoted `"fileKind"` retains case, while unquoted `fileKind` is parsed as lowercase `filekind`. This is a readback-query defect, not evidence of failed extraction writes. Prefer snake_case aliases (`file_id`, `source_ref`, `source_revision`, `file_kind`) throughout the CTE; otherwise quote the mixed-case alias consistently. No persistent SQL file containing that alias was found during this review, so do not claim a source patch was made or infer data damage.

## 10. Sequenced implementation gates

1. Version the proposed domain crosswalk against the existing runtime taxonomy and query-intent schema; decide whether a compatible alias layer or v2 migration is needed before adding labels.
2. Continue the existing semantic-writer lineage and Graphify baseline reconciliation gates; do not run AE training or bulk semantic embedding while provenance is open.
3. Keep the verified LangChain snapshot as a noncanonical local reference. If freshness is needed, use the bounded official-doc fetcher into a new artifact run, then validate the fetch/chunk receipts; preserve the prior snapshot.
4. Prove the existing external-doc admission path for a small reviewed page set and PostgreSQL readback before any vector projection.
5. Add/enable an MCP read-only search tool only through the existing tool registry, with Zod schema, fixed limits, evidence refs and revision checks. It must not issue writes.
6. Measure lexical/semantic/AST/graph lane contribution and one fusion owner on a frozen query set; only then evaluate classifier, reranker, QLoRA, GPU, cache, or topology challengers.
7. Close independent admission predicates with their own receipts. No single taxonomy, classifier, local docs corpus, model, or cache hit makes projection admission PASS.

### Current status from this review

- Proposed ten-class taxonomy: documented, not a runtime schema change.
- Existing LangChain reference artifacts: Python snapshot retained; TypeScript/OpenWiki snapshot checksum verified and locally searchable through the KB MCP tool, both noncanonical.
- Canonical external-doc admission / Qdrant upsert / Valkey cache / production MCP tool caller: not proven by this review; none was written.
- Graphify SQL alias diagnosis: explained; no checked-in query owner found to patch.
