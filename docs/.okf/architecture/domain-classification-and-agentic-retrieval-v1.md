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

Naive Bayes, logistic regression, and XGBoost are alternative classifier/reranker families, not three sequential truth sources. A GNN is an optional graph-derived scoring model, not a substitute for graph lineage. The current deterministic CPU fixture roster includes symmetric GCN, GraphSAGE mean and max-pooling aggregation, single- and multi-head additive GAT, dynamic GATv2, GIN sum aggregation with a two-layer MLP, K-step SGC, APPNP-style prediction propagation, Chebyshev spectral convolution, a GCNII initial-residual/identity-mapping layer, relation-aware R-GCN over explicit directed relation edges, PNA with mean/max/min/std neighborhood aggregators and degree scalers, GPR-GNN polynomial propagation, MixHop channel-specific hop aggregation, and other bounded operators enumerated in the coverage matrix below. GATv2 follows [Brody et al.](https://arxiv.org/abs/2105.14491); APPNP follows [Gasteiger et al.](https://arxiv.org/abs/1810.05997); Chebyshev filtering follows [Defferrard et al.](https://arxiv.org/abs/1606.09375); GCNII follows [Chen et al.](https://arxiv.org/abs/2007.02133); R-GCN follows [Schlichtkrull et al.](https://arxiv.org/abs/1703.06103); PNA follows [Corso et al.](https://arxiv.org/abs/2004.05718); GPR-GNN follows [Chien et al.](https://arxiv.org/abs/2006.07988); and MixHop follows [Abu-El-Haija et al.](https://arxiv.org/abs/1905.00067). The typed relation labels and ordinals are included in the input checksum; the CPU/GPU implementation uses the same NetworkX topology conversion and PyTorch tensor path. NetworkX supplies the ordered topology projection while PyTorch performs tensor math on CPU or CUDA; this does not mean NetworkX itself implements learned GNN layers or that the finite roster covers every GNN family. The GNN output is a derived embedding/score, never the `.okf` 4D `topology` coordinates (`x/y/z/w`) unless a separately versioned and validated projection explicitly maps it. The `.okf` schema already explicitly keeps those topology coordinates distinct from GNN embeddings. PCA/SVD and RFF are deterministic or fitted geometry transforms with their own input digest and revision; they reduce/expand features but cannot supply missing source provenance. KMeans and SOM 20x20 assignments are revisioned descriptive features for diversification/residency, never identity. Keep CPU control-plane work (parsing, metadata, rules, small classifiers, validation) distinct from optional GPU numerical work (large matrix products, ANN, clustering, graph kernels). The GPU executor is replaceable and cannot write canonical identity.

**Graph/GPU executor boundary:** NetworkX owns deterministic CPU topology construction and oracle algorithms; `nx-cugraph`/cuGraph may accelerate only operations declared by the installed backend, with unsupported operations remaining on CPU and declared support still requiring semantic parity. PyTorch owns the shared CPU/CUDA tensor implementation for the bounded learned-GNN fixtures. cuTile is a challenger for custom dense kernels (feature transforms, reductions, scoring, and incidence-matrix products), not a replacement for cuGraph graph algorithms. Existing cuTile probes cover generic vector addition and GEMM only; they do not prove an Atlas candidate/incidence tile contract or graph-kernel parity. Candidate-feature tiles and hypergraph participant/incidence manifests are distinct revisioned inputs, and neither may be assumed admitted from a proposal or fixture. Require one immutable input/ordinal checksum, an explicit CPU oracle and tolerance, source/model/runtime revisions, resource-safe preflight, and a no-write receipt before any accelerator result is compared or consumed. RTX hardware is not itself an executor or evidence authority.

The CPU/CUDA fixture roster also includes `GPR_GNN_V1`: a feature projection followed by a bounded learned generalized-PageRank polynomial over normalized adjacency. Its coefficient vector and propagation depth are revision/checksum-bound; this is a fixture executor, not a trained or admitted Parent Atlas model. The formulation follows [Chien et al.](https://arxiv.org/abs/2006.07988).

The finite CPU/CUDA fixture roster also includes `H2GCN_CHANNEL_CONCAT_V1`, a bounded single-layer H2GCN-style operator that preserves ego, one-hop, and exact two-hop feature channels separately before projection. NetworkX supplies deterministic shortest-path neighborhoods; the node budget is part of the model checksum. This is not the full multi-layer H2GCN training architecture or a trained/admitted Parent Atlas model. The design follows [Zhu et al., NeurIPS 2020](https://arxiv.org/abs/2006.11468).

`AGNN_PROPAGATION_V1` adds a bounded attention-only propagation fixture: cosine similarity over input hidden states supplies masked self/neighborhood attention, and `agnn_beta` is model-checksum-bound in `[0,16]`. It has no intermediate dense projection, matching the paper's propagation-layer distinction. This is a single layer for CPU/CUDA operator parity, not a trained/admitted model. It follows [Thekumparampil et al., 2018](https://arxiv.org/abs/1803.03735).

`HGNN_INCIDENCE_CONV_V1` applies normalized hypergraph incidence convolution using a NetworkX bipartite node↔fact topology and the shared PyTorch CPU/CUDA tensor path. Its bounded fixture checksum-binds fact ID, participant ordinal/role, source revision, evidence references, and producer revision; the math uses unweighted membership incidence (roles remain provenance, not learned role weights). It rejects unbound participants and is not an admission or persistence path. It is a single operator fixture, not full HGNN training or a production HyperGraphRAG model.

`ARMA_RECURSIVE_V1` is a bounded single-stack ARMA-style recurrence over symmetrically normalized NetworkX adjacency. It uses a checksum-bound recurrent projection `W`, input skip projection `V`, and 1–8 recurrence steps. This is a fixed-graph CPU/CUDA operator fixture, not the full multi-stack trained ARMA architecture. Formulation basis: [Bianchi et al., 2019](https://arxiv.org/abs/1901.01343).

`LIGHTGCN_PROPAGATION_V1` performs projection-free linear propagation over symmetrically normalized NetworkX adjacency and averages the initial embedding with each of 1–8 propagated layers. The embedding width and layer count are checksum-bound; this fixture does not include user/item loss, training, or recommendation evaluation. Formulation basis: [He et al., 2020](https://arxiv.org/abs/2002.02126).

`FAGCN_FREQUENCY_ADAPTATION_V1` uses a shared feature-pair self-gate `tanh(gᵀ[hᵢ∥hⱼ])` that permits signed neighbor coefficients, degree-normalized message passing, an epsilon-scaled initial residual, and a bounded propagation depth. The gate and both projections are checksum-bound. This is a deterministic fixed-graph operator fixture, not the complete trained FAGCN model. Formulation basis: [Bo et al., 2021](https://arxiv.org/abs/2101.00797).

`GATED_GCN_EDGE_GATE_V1` is a bounded residual edge-gated convolution over explicit edge-feature vectors. Each undirected topology edge must have exactly one endpoint-ordered feature binding with source revision, evidence refs, and producer revision; those values join the input checksum. Per-layer gates combine source-node, target-node, and edge-feature logits, normalize across each target's neighbors, and weight transformed messages before the residual update. Edge features remain fixed and the operator omits batch normalization and training, so this is not a full GatedGCN reproduction. Formulation basis: [Bresson and Laurent, 2017](https://arxiv.org/abs/1711.07553) and the GatedGCN definition in [Dwivedi et al., 2023](https://www.jmlr.org/papers/v24/22-0567.html).

`MONET_GAUSSIAN_PSEUDOCOORD_V1` implements a bounded single-layer mixture-model convolution. It consumes the exact, lineage-bound edge feature vectors as pseudo-coordinates, evaluates checksum-bound diagonal Gaussian kernels, and sums each kernel's transformed neighbor messages. It omits learned pseudo-coordinate transforms, batch normalization, and training; it is a MoNet-style operator fixture, not a full model reproduction. Formulation basis: [Monti et al., CVPR 2017](https://arxiv.org/abs/1611.08402).

`ECC_EDGE_CONDITIONED_FILTER_V1` is a bounded single-layer edge-conditioned convolution. It uses the lineage-bound edge feature vector to generate a per-edge linear filter, applies that filter to the neighboring node features, and sums messages with a shared root transform. The filter generator and root matrix are checksum-bound. The fixture uses symmetric edge attributes in the undirected input graph and a single linear filter generator; it is not full ECC training or directed-edge-label support. Formulation basis: [Simonovsky and Komodakis, CVPR 2017](https://arxiv.org/abs/1704.02901).

`SAGE_LSTM_V1` completes a third bounded GraphSAGE aggregator alongside mean and max-pooling: it feeds each node's neighbors through a checksum-bound LSTM, then concatenates the final hidden state with the center feature before projection. Neighbors use ascending canonical ordinal order for deterministic replay; this intentionally replaces GraphSAGE's randomized neighbor permutation and is not a trained or sampled full-model reproduction. The per-node neighbor count is bounded at 256. Formulation basis: [Hamilton et al., NeurIPS 2017](https://arxiv.org/abs/1706.02216).

The bounded operator coverage matrix below describes code and proof status, not full paper reproduction. Each row has a deterministic CPU fixture and is routed through the shared PyTorch device implementation; the CUDA column means an executor path exists in code, not that GPU execution or CPU/GPU parity has been run. Every model remains untrained and non-authoritative.

| Operator | CPU fixture | Shared CUDA path | CUDA parity |
| --- | --- | --- | --- |
| `GCN_SYMMETRIC_V1` | Present | Present, unverified | Not proven |
| `SAGE_MEAN_V1` | Present | Present, unverified | Not proven |
| `SAGE_LSTM_V1` | Present | Present, unverified | Not proven |
| `GAT_SINGLE_HEAD_V1` | Present | Present, unverified | Not proven |
| `GAT_MULTI_HEAD_V1` | Present | Present, unverified | Not proven |
| `GIN_SUM_MLP_V1` | Present | Present, unverified | Not proven |
| `SGC_K_STEP_V1` | Present | Present, unverified | Not proven |
| `SAGE_MAXPOOL_V1` | Present | Present, unverified | Not proven |
| `GAT_V2_V1` | Present | Present, unverified | Not proven |
| `APPNP_PROPAGATION_V1` | Present | Present, unverified | Not proven |
| `CHEB_CONV_V1` | Present | Present, unverified | Not proven |
| `GCNII_LAYER_V1` | Present | Present, unverified | Not proven |
| `ARMA_RECURSIVE_V1` | Present | Present, unverified | Not proven |
| `LIGHTGCN_PROPAGATION_V1` | Present | Present, unverified | Not proven |
| `FAGCN_FREQUENCY_ADAPTATION_V1` | Present | Present, unverified | Not proven |
| `GATED_GCN_EDGE_GATE_V1` | Present | Present, unverified | Not proven |
| `MONET_GAUSSIAN_PSEUDOCOORD_V1` | Present | Present, unverified | Not proven |
| `ECC_EDGE_CONDITIONED_FILTER_V1` | Present | Present, unverified | Not proven |
| `RGCN_LAYER_V1` | Present | Present, unverified | Not proven |
| `COMPGCN_MULTIPLICATIVE_V1` | Present | Present, unverified | Not proven |
| `GGNN_GRU_PROPAGATION_V1` | Present | Present, unverified | Not proven |
| `GRAND_DROP_NODE_AVERAGE_V1` | Present | Present, unverified | Not proven |
| `GRAPHORMER_SPATIAL_ATTENTION_V1` | Present | Present, unverified | Not proven |
| `HGT_TYPED_ATTENTION_V1` | Present | Present, unverified | Not proven |
| `PNA_LAYER_V1` | Present | Present, unverified | Not proven |
| `GPR_GNN_V1` | Present | Present, unverified | Not proven |
| `MIXHOP_LAYER_V1` | Present | Present, unverified | Not proven |
| `SIGN_CONCAT_V1` | Present | Present, unverified | Not proven |
| `EDGE_CONV_FIXED_GRAPH_V1` | Present | Present, unverified | Not proven |
| `JKNET_CONCAT_V1` | Present | Present, unverified | Not proven |
| `JKNET_MAXPOOL_V1` | Present | Present, unverified | Not proven |
| `JKNET_LSTM_ATTENTION_V1` | Present | Present, unverified | Not proven |
| `H2GCN_CHANNEL_CONCAT_V1` | Present | Present, unverified | Not proven |
| `AGNN_PROPAGATION_V1` | Present | Present, unverified | Not proven |
| `HGNN_INCIDENCE_CONV_V1` | Present | Present, unverified | Not proven |

`JKNET_MAXPOOL_V1` performs coordinate-wise max selection across layer outputs without selector parameters. `JKNET_LSTM_ATTENTION_V1` uses a bounded bidirectional LSTM to score layer representations, then softmax-weights them per node; its recurrent and attention parameters are checksum-bound. These are fixture operators, not trained or admitted models. The Jumping Knowledge family is based on [Xu et al., 2018](https://arxiv.org/abs/1806.03536).

`GRAPHORMER_SPATIAL_ATTENTION_V1` also binds a bounded shortest-path edge encoding: every topology edge must map to exactly one typed relation, and per-hop/per-relation forward-versus-reverse biases are added to attention logits only when the complete shortest path fits the configured cap. Paths beyond the cap receive spatial-distance bias only. Path-length cap, relation vocabulary, and bias tensor are checksum-bound. This remains a one-head, one-layer fixture; it is not full Graphormer edge-feature encoding or training.

This is a finite, bounded inventory rather than a claim to implement every GNN architecture. GPU parity remains gated on explicit operator approval, an idle runtime slot, and the required free-memory floor.

The fixture roster also includes `MIXHOP_LAYER_V1`: bounded hop-specific normalized-adjacency channels with distinct checksum-bound projection matrices. This validates operator wiring and deterministic CPU behavior only; it does not prove trained weights, GPU parity, or admitted Parent Atlas evidence. The formulation follows [Abu-El-Haija et al.](https://arxiv.org/abs/1905.00067).

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

Code-symbol semantic retrieval for agentic DAG synthesis is tracked separately in
[`docs/architecture/code-symbol-semantic-retrieval-v1.md`](../../architecture/code-symbol-semantic-retrieval-v1.md)
and `SYMBOL-SEMANTIC-RETRIEVAL-01`; it is an open design gate, not an implemented or admitted lane.
