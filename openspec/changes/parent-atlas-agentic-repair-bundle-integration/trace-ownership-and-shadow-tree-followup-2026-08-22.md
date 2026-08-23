# Trace ownership (TRACE OWN) + shadow-tree follow-up (2026-08-22)

Status: **RAW DESIGN NOTE — captured verbatim from a pasted message, not yet reviewed,
not yet decided, not yet implemented.** Like the sibling
`parent-atlas-gpu-graph-vector-substrate/candidate-materializer-design-note-2026-08-22.md`,
this file exists so the content isn't lost; it is not a proposal this session evaluated,
endorsed, or acted on beyond what's noted below. Paragraph breaks added for
readability only; no wording changed.

## Note on the shadow-tree section below vs. what this session actually did

The last section of the pasted text ("Shadow tree investigation") argues for
"continuing investigate first rather than moving all 241 today" and proposes a formal
`ShadowTreeCensusV1` with an `ARCHIVE_SAFE` gate defined as `SHIPPING_IMPORT=0 AND
SHIPPING_SCRIPT_ENTRYPOINT=0 AND ACTIVE_TEST_ENTRYPOINT=0 AND CONFIG_REFERENCE=0`.

This session had already archived the 224-file root `src/`/`tests/` tree (commit
`7cc9be2215`, see `docs/archive-manifest.json` and the sibling
`workstation-todo-cross-reference-2026-08-22.md` item 3) before this note arrived. The
investigation that preceded that archival independently satisfies the note's own
`ARCHIVE_SAFE` criteria for every file moved: zero live `sveltekit-frontend/` importers
(grepped), zero script entrypoints (root `svelte.config.js` is a stub delegating to
`sveltekit-frontend/svelte.config.js` — nothing ever builds or serves the tree), zero
active test entrypoints (root has no `vitest.config`, no `$lib` alias — the tree's own
tests can't resolve their imports), zero config references outside the tree itself. So
there isn't a contradiction between what happened and what this note recommends as the
disposition *gate* — but the note's implied pacing ("investigate first, don't move
yet") is worth recording accurately as advice this session did not follow literally,
since the archival had already completed by the time it was received. A future session
auditing this decision should know that.

---

...fer unit is not the GPU embedding tensor itself. For Parent Atlas, transfer
revisioned descriptors: ordinals, compact control bits — and leave the large
representation resident in whichever executor owns it.

*(The GPU candidate-materializer portion of this paste duplicates
`candidate-materializer-design-note-2026-08-22.md` in the sibling change — see that file
for the full CandidateSetV1 / CandidateMaterializerV1 / DecisionFlagsV1 /
TraversalInstructionV1 / CandidateStateMatrixV1 / KNN-graph-reuse / Leiden-Louvain /
A*-Manhattan / sliding-window / ActionState / OKF-headMask / QLoRA-batch content — not
repeated here.)*

## New runtime trace finding — changes the XGBoost sequence more materially than the shadow tree discovery

The state is no longer simply `RUNTIME_TRACE_SEAM_EXISTS`,
`DURABLE_TRACE_STORE_ABSENT`. I would freeze it more precisely as:

- `WORKFLOW_TRACE_CONTRACT_EXISTS`
- `GAN_AUDIT_TRACE_PRODUCER_EXISTS`
- `POSTGRES_WRITER_IMPLEMENTED_UNPROVEN`
- `WORKFLOW_TRACES_SCHEMA_ABSENT`
- `SHIPPING_RUNTIME_REACHABILITY_UNPROVEN`
- `PERSISTENCE_BEST_EFFORT_NONAUTHORITATIVE`
- `RETRIEVAL_TELEMETRY_SHIPPING`
- `RETRIEVAL_TELEMETRY_POSTGRES_DURABLE`
- `RETRIEVAL_TELEMETRY_BEST_EFFORT`
- `RETRIEVAL_TELEMETRY_REVISION_LIGHT`
- `AGENT_TRACES_SCHEMA_EXISTS`
- `AGENT_TRACES_SYNTHETIC_ONLY_FOR_CURRENT_TRAINING_CORPUS`
- `XGBOOST_TRACE_IDENTITY_BLOCKED`

### Why that distinction matters

`WorkflowTrace` is substantially stronger than the synthetic trace data. It already
carries exact-looking `packet_keys_used`, `source_refs_used`, feature IDs, tool usage,
validator status, model information, and overall success. Its own documentation
explicitly describes Postgres as the canonical audit log. It even contains `INSERT INTO
workflow_traces` and readback SQL. But there is no repository migration defining that
table — repository search finds the consumer SQL, not a `CREATE TABLE workflow_traces`.
And its persistence semantics are not yet strong enough for training authority anyway.

The GAN audit constructs the complete trace and then does this: `deps.logWorkflowTrace(completeTrace).catch(...)` — without awaiting durable completion. The dependency factory weakens this further by individually swallowing Postgres/Redis failures: trace produced → `logWorkflowTrace` → Postgres failure → `console.warn` → workflow still completes. That's perfectly reasonable for observability. It is not sufficient for provenance-bearing training data.

There are actually two trace systems to reconcile. The shipping application already has
a different, more reachable trace seam: `retrieval_telemetry` stores selected packet
keys, feature IDs, strategy, scores, and query identity. And the real hybrid search path
actually calls it — it constructs hit records containing the candidate key, feature ID,
source reference, and score, and emits the telemetry after retrieval/reranking. But that
subsystem says explicitly that it is fire-and-forget too. It also lacks a modern
revision-authority tuple.

So the current topology is:

```
SHIPPING RETRIEVAL:
  SearchRuntime.hybridSearch → candidate retrieval
    → selectedPacketKeys, sourceRef, featureId, scores
    → retrieval_telemetry (POSTGRES, REAL REACHABILITY, but BEST-EFFORT, REVISION-LIGHT, NO DOWNSTREAM OUTCOME JOIN)

GAN WORKFLOW:
  GanAuditOrchestrator → packet_keys_used, source_refs_used, validator outcome, overall success
    → WorkflowTrace → logWorkflowTrace → Postgres workflow_traces
    (RICHER CONTRACT, but TABLE ABSENT, PERSISTENCE BEST-EFFORT, SHIPPING REACHABILITY UNPROVEN)
```

The correct solution is not to choose one and discard the other — they need one
correlation identity.

### Next tranche: TRACE OWN (ahead of the XGBoost bridge implementation)

- **TRACE-OWN-00** — trace owner inventory
- **TRACE-OWN-01** — `TraceExecutionId` request-identity contract
- **TRACE-OWN-02** — durable retrieval-evidence binding
- **TRACE-OWN-03** — durable workflow-outcome receipt
- **TRACE-OWN-04** — append/read checksum repository proof
- **TRACE-OWN-05** — disposable-Postgres migration proof
- **TRACE-OWN-06** — shipping retrieval producer wiring
- **TRACE-OWN-07** — downstream outcome producer wiring
- **TRACE-OWN-08** — same-trace-ID retrieval→outcome readback
- **TRACE-OWN-09** — XGBoost adapter consumes only proven traces

The central shape should be closer to:

```
TraceExecutionV1:
  traceId, requestId, workflowId, queryHash, surface,
  workspaceRevision, graphRevision, representationRevision, revisionSetHash,
  startedAt, finalizedAt, checksum
```

Candidate evidence should not be hidden inside one opaque trace JSON blob. Give it a
typed child contract:

```
WorkflowTraceEvidenceBindingV1:
  traceId, candidateOrdinal, packetKey, canonicalId, symbolVersionId, sourceRef,
  workspaceRevision, sourceRevision, representationRevision,
  logicalLane, executor, rawScore, normalizedScore, rank,
  retrieved, selected, promoted, evidenceRefs, bindingChecksum
```

The reason for child bindings is important: a trace can involve many candidates with
independent source revisions. Then, separately:

```
WorkflowTraceOutcomeReceiptV1:
  receiptId, traceId, executed, finalized, outcome, downstreamSuccess,
  resultRef, failureClass, errorCode, latencyMs, tokenCost,
  verificationReceiptRefs,
  workspaceRevision, graphRevision, representationRevision, revisionSetHash, checksum
```

Same principle as the recommendation loop: `retrieved → selected → (selected ∧
executed) → executed successful → candidate appeared in trace = training positive`.

Do not simply turn the existing `WorkflowTrace` interface into the table. Its current
contents mix at least four concerns: execution envelope, retrieval evidence, LLM
input/output, cache/representation, outcome/validation. It even contains raw
`llm_synthesis_input`/`llm_synthesis_output`, and its `WorkflowCacheEntry` still has raw
768-vector fields. Don't make that whole historical interface the canonical durable
schema. Instead: `WorkflowTrace` = legacy in-memory diagnostic envelope →
normalization → `TraceExecutionV1` + `WorkflowTraceEvidenceBindingV1` +
`WorkflowTraceOutcomeReceiptV1`. That lets the runtime logger evolve without changing
training identity.

### What happens to `agent_traces`

Keep it — but downgrade its semantic role: `agent_traces` =
`LEGACY_SYNTHETIC_EXPERIMENT_CORPUS`, not `CANONICAL_RUNTIME_TRACE_LEDGER`. The evidence
is unambiguous: the seeder literally announces that it is creating synthetic traces,
generates random outcomes/scores, and creates identifiers like `packet:agent_intelligence:13`.
Its table itself is legitimate — `0033_odd_moonstone.sql` really creates `agent_traces`.
The problem is not that the table is fake. The problem is that the rows being trained
from are synthetic and their identity encoding predates canonical packet lineage.

The current XGBoost exporter is definitely unsafe. The code validates the exact problem
the local audit found: it takes `packet:agent_intelligence:13`, then `ref.split(':')`,
`parts[1]` yielding `agent_intelligence`, then queries `WHERE feature_id = ANY(...)` and
maps all matching packets to that old reference. So: old synthetic ref
`packet:agent_intelligence:13` → `agent_intelligence` → `feature_id` → potentially N
`atlas_packets` → N training examples. That is not identity recovery — it's label
expansion. The exporter should eventually fail with something like
`TRACE_PACKET_BINDING_REQUIRED` rather than attempting that translation.

Keep `TracePacketBridgeV1`, but only for legacy traces. The new durable trace path
should not need the bridge:

- **For future traces**: live retrieval → exact `packetKey` + revisions →
  `WorkflowTraceEvidenceBindingV1`. No translation.
- **For the historical corpus**: `agent_traces` → `retrieved_packets` (explicit,
  reviewed) → `TracePacketBridgeV1` → canonical `packetKey` + revision + evidence. If no
  explicit evidence exists → `TRACE_PACKET_BRIDGE_MISSING`, training rows emitted = 0.

This gives: **NEW TRACE GENERATION** = exact identity at observation time; **LEGACY
TRACE GENERATION** = explicit, evidence-backed bridge; **NEVER** fuzzy
label/feature_id/packet guessing.

### Database sequence

The `5434` rule should remain absolute. Do not apply a `workflow_traces` migration
there merely because the logger expects the table. The sequence should be: schema
contract → migration SQL (UNAPPLIED) → migration lint / schema-ownership audit →
disposable-DB safety gate → disposable PostgreSQL apply → append/read checksum
verification → redelivery/idempotency test → only then workstation-integration
consideration. Reuse the same safety philosophy established for temporal DAG:
`02R: DATABASE_URL=127.0.0.1:5434 (KNOWN_PROXY_TARGET) → REJECTED`, even when
`RUN_DB_INTEGRATION=1` is present.

### Label correction

Do not let the existing `success: boolean` become the XGBoost relevance label directly.
In `WorkflowTrace` this currently means "overall workflow success," but the actual
candidate-level question is more specific. The eventual shape:

```
TraceCandidateOutcomeV1:
  retrieved, selected, exactPromoted, usedInContext,
  executionDependentOnCandidate, downstreamSuccess, verificationPassed, repairSucceeded
```

For retrieval ranking: a successful workflow does not prove every retrieved packet was
relevant. The same anti-label-leakage invariant that's been enforced elsewhere applies
here.

## Shadow tree investigation

The extra audit supports continuing to investigate first rather than moving all 241
today. The important numbers are now (eligible comparison files = 224): IDENTICAL = 3,
DIVERGED = 54, MISSING = 167. That means the shadow tree is not primarily
duplicates — it's a large historical implementation fork, but with unique, live-relevant
content. For example, the HMM module checked has its barrel at
`src/lib/server/hmm/tool-router-index.ts`, and search finds its HMM usage in the root
shadow code, tests, and OpenSpec — not a canonical `sveltekit-frontend` consumer. That
is exactly the class `UNIQUE_ARCHIVE_CAPABILITY`, `NO_PROVEN_SHIPPING_REACHABILITY` —
not `DELETE` and not `PORT_IMMEDIATELY`.

I would generate one final census with two independent axes:

```
ShadowTreeCensusV1:
  path, sha256,
  counterpartStatus: IDENTICAL | DIVERGED | BASENAME_MOVED | NO_CANONICAL_COUNTERPART,
  reachability: SHIPPING_IMPORT | SHIPPING_SCRIPT_ENTRYPOINT | ACTIVE_TEST_ENTRYPOINT
              | CONFIG_REFERENCE | SHADOW_INTERNAL_ONLY | DOC_ONLY | NONE_FOUND,
  capabilityClass: ROUTE | RETRIEVAL | RANKING | AGENT | HMM | GRAPH | CONTRACT | TEST | OTHER,
  archiveDisposition: BLOCKED_LIVE_REFERENCE | PORT_REVIEW | ARCHIVE_SAFE
```

Then the move gate becomes objective: `ARCHIVE_SAFE` iff `SHIPPING_IMPORT=0 AND
SHIPPING_SCRIPT_ENTRYPOINT=0 AND ACTIVE_TEST_ENTRYPOINT=0 AND CONFIG_REFERENCE=0` for the
files being moved. You do not have to understand all 167 unique implementations before
archival — you only have to prove they have no live incoming execution edge.

Do not run `graphify:daily` yet. This remains important — the wrapper starts from
`sveltekit-frontend` but its repository-provenance stage invokes
`atlas:phase109b:workflow:dry`, and that script is configured with `--repo-root=.`,
meaning the whole repository root. So the stale-Graphify warning should not override the
ownership investigation. Current order should be: shadow-source-ownership census (root
`src`/`tests` disposition) → Graphify source-manifest excludes (archive/shadow) → THEN
`graphify:daily`. Otherwise there's a risk of scanning the dead shadow tree fresh —
Graphify's new packet/graph evidence would look more authoritative because it's newer,
which is exactly backwards.

### Revised immediate ordering (as proposed in the paste)

1. **SHADOW OWNERSHIP** — finish reachability census, no move yet, no `graphify:daily`
2. **TRACE OWN** — freeze trace identity/evidence/outcome contracts
3. **TRACE SCHEMA** — add UNAPPLIED `workflow_traces` migration schema, no `5434` mutation
4. **TRACE DURABILITY** — append/read checksum repository
5. **TRACE DISPOSABLE** — DB-safe database proof, `5434` hard-rejected
6. **TRACE RUNTIME** — wire one shipping retrieval path, correlate retrieval evidence + downstream outcome
7. **XGB ID** — exact new-trace bindings; legacy `TracePacketBridgeV1` only for old `agent_traces`
8. **XGB DATA** — deterministic `qid` dataset, receipt `revisionSetHash` + checksum, zero heuristic packet joins
9. **AST CORPUS V2** — real 66-file workstation proof
10. **Graphify daily** — only after source-ownership exclusion is resolved
11. **Branch queue triage**

Move the XGBoost "review candidate mappings" task after TRACE OWN, since there's now
evidence the system can avoid creating another identity bridge for future traces
entirely. The key transition: OLD = `agent_traces` synthetic packet labels, try to
recover identity afterward; NEW = retrieval-runtime exact candidate identity,
revision-qualified trace binding, actual downstream outcome, deterministic dataset. That
removes the lineage-repair problem at its source rather than making
`TracePacketBridgeV1` a permanent part of Parent Atlas.

The diagnosis should therefore be upgraded from `RUNTIME_TRACE_SEAM_EXISTS` /
`DURABLE_TRACE_STORE_ABSENT` to: **TRACE EVIDENCE PRODUCERS EXIST, NO SINGLE DURABLE
TRACE AUTHORITY YET, LEGACY TRAINING TRACE IDENTITY IS SYNTHETIC, NEW TRAINING PIPELINE
SHOULD CAPTURE CANONICAL IDENTITY AT TRACE TIME.** That is the bounded architectural
problem to solve before XGBoost training.

## RTX 3060 Ti / 8GB / Ampere — proving XGBoost CUDA is real, not just importable

The best check is not merely `import xgboost` — prove all four layers: (1) NVIDIA driver
sees the 3060 Ti, (2) the XGBoost Python package is installed, (3) the installed
XGBoost build has CUDA support, (4) an actual XGBoost training job allocates VRAM on the
3060 Ti. Current XGBoost uses `tree_method="hist", device="cuda"`, not the old
`tree_method="gpu_hist"` style — official XGBoost 3.x docs say CUDA training is selected
with `device="cuda"` and `tree_method="hist"`.

1. **Check the GPU**: `nvidia-smi`, or
   `nvidia-smi --query-gpu=name,driver_version,memory.total,memory.free,memory.used --format=csv`.
   The 3060 Ti (Ampere) is comfortably above XGBoost's historical minimum compute-capability
   requirement.
2. **Check exactly which XGBoost Python sees** (same env that will run training):
   ```python
   import sys, xgboost as xgb
   print(sys.executable); print(xgb.__version__); print(xgb.__file__)
   ```
   Then `pip show xgboost`, `pip show xgboost-cpu`, `pip show xgboost-cu12`.
   `xgboost-cpu` installed = CPU only. `xgboost` installed (normal current wheel) = GPU
   support expected on supported Windows/NVIDIA systems. `xgboost-cu12` installed = CUDA
   12 compatibility wheel. Official docs explicitly distinguish the CPU-only
   `xgboost-cpu` package from GPU-capable binary packages.
3. **Run the definitive CUDA smoke test**:
   ```python
   import xgboost as xgb
   import numpy as np
   print("XGBoost", xgb.__version__); print("XGBoost path", xgb.__file__)
   rng = np.random.default_rng(42)
   X = rng.normal(size=(200_000, 64)).astype(np.float32)
   y = (X[:,0] + 0.5*X[:,1] - X[:,2] > 0).astype(np.float32)
   dtrain = xgb.QuantileDMatrix(X, y)
   params = {"objective": "binary:logistic", "tree_method": "hist", "device": "cuda:0",
             "max_depth": 8, "eta": 0.1, "verbosity": 2}
   print("Starting CUDA training")
   bst = xgb.train(params, dtrain, num_boost_round=100)
   print("CUDA XGBoost training: PASS")
   print("Booster config contains:"); print(bst.save_config())
   ```
   The critical part is `tree_method="hist", device="cuda:0"` (current official
   interface). "PASS" without a CUDA device error proves considerably more than package
   installation.
4. **Watch VRAM while it runs**: second PowerShell window, `nvidia-smi -l 1`, then run
   the smoke test in the first window. Want to see `python.exe` under GPU processes and
   Memory Usage increase during training (e.g. `python.exe 1600MiB`). Exact amount
   doesn't matter — the proof is: baseline VRAM → increases during `xgboost.train` →
   released after Python exits.
5. **Stronger proof**: `nvidia-smi --query-compute-apps=pid,process_name,used_memory --format=csv`
   and `nvidia-smi --query-gpu=utilization.gpu,memory.used,memory.free --format=csv`
   while the test executes.

Proof terminology: `XGBOOST_IMPORT: PASS`, `XGBOOST_VERSION`, `CUDA_DEVICE_REQUEST:
cuda:0`, `GPU: NVIDIA GeForce RTX 3060 Ti`, `VRAM_TOTAL: 8192 MiB`,
`CUDA_TRAINING: PASS`, `VRAM_ALLOCATION_OBSERVED: PASS`, `status:
GPU_RUNTIME_PROVEN`.

Caution with 8GB VRAM: don't judge CUDA support using the full Parent Atlas corpus
first. Prove it with the bounded 200k×64 float32 smoke test above, then measure
available VRAM and size the real training batch/data path accordingly.
`xgboost.QuantileDMatrix` is specifically useful for conserving memory with histogram
training.

## KNN / KMeans / HMM / Viterbi / XGBoost / POS — how these fit together for Parent Atlas

These are related but solve different layers of the problem. ("Vibreti" in the source
message appears to mean Viterbi.) Keep them separated:

```
raw query/action history
  → candidate features (POS-deterministic text features, domain classifier)
  → KNN neighborhood evidence
  → KMeans cluster evidence
  → HMM sequence-state evidence / Viterbi best-state path
  → historical execution/recommendation evidence
  → CandidateFeatureRowV1
  → XGBoost classification/ranking
  → deterministic policy
  → action/receipt
  → future training evidence
```

XGBoost itself is not normally reinforcement learning — it's supervised gradient
boosted trees. For retrieval, XGBoost has a proper learning-to-rank mode
(`rank:ndcg`, LambdaMART) where candidates are grouped by query and given relevance
labels.

| Component | What it learns/does | Parent Atlas role |
|---|---|---|
| KNN | Finds nearby examples in feature-vector space | "What did previous queries/actions that looked like this do?" |
| KMeans | Partitions vectors around centroids | Coarse routing / cluster affinity. Soft-KMeans (distribution + distance-weight to several centroids instead of one) gives a richer cluster feature vector |
| Domain classifier | Predicts graph/retrieval/db/ui/etc. | Query/candidate domain evidence |
| POS tagger | Identifies grammatical token roles | Lightweight query-structure signals |
| HMM | Models sequences of hidden states | Procedural action-state model |
| Viterbi | Finds the highest-probability HMM state sequence | Infer likely workflow path |
| XGBoost classifier | Predicts class probability from features | Domain/action success classifier |
| XGBoost ranker | Orders candidates within a query | ImportanceRanker retrieval challenger |
| RL policy | Learns from actions/rewards over time | Later: recommendation-action policy |

KNN is fundamentally local, instance-based reasoning — look at nearest stored
observations, infer from their labels/values. KMeans is different — it learns centroids
and minimizes within-cluster squared distance (the centroid is literally the mean of its
assigned points). So: KNN = "who are my neighbors?"; KMeans = "which population centroid
am I near?"; XGBoost = "given all these measured signals, what should I predict?"; HMM =
"given the sequence so far, what hidden procedural state are we in?"

### Means/distribution features

Instead of storing only `cluster_id: 17`, store a soft distribution:
`{cluster_17: 0.63, cluster_42: 0.21, cluster_8: 0.11, cluster_91: 0.05}` — far more
useful to XGBoost than one cluster number. Likewise KNN can produce
`neighbor_success_rate`, `neighbor_failure_rate`, `mean_neighbor_distance`,
`min_neighbor_distance`, `neighbor_domain_entropy`, `neighbor_action_distribution` —
those become ordinary features.

### HMM/Viterbi — where the sequence comes in

An HMM contains: start-state probabilities, `P(state_t | state_t-1)` transition
distribution, `P(observation | state)` emission distribution. Example hidden states:
`QUERY_CLASSIFIED, RETRIEVING, RERANKING, VALIDATING, REPAIRING, FINALIZING, FAILED`.
Observed events: `RG_SEARCH, QDRANT_SEARCH, AST_LOOKUP, TEST_RUN, PATCH, TOOL_ERROR,
SUCCESS`. The HMM asks: given these observations, what state are we probably in? Viterbi
specifically finds the most likely *complete* hidden-state sequence given the
observations. Example: observations `RG_SEARCH → AST_LOOKUP → PATCH → TEST_FAILED →
RG_SEARCH → PATCH → TEST_PASS` → HMM/Viterbi → `RETRIEVING → ANALYZING → REPAIRING →
VALIDATING → RETRIEVING → REPAIRING → FINALIZED`. Useful for Parent Atlas procedural
memory.

### POS tagging's HMM/Viterbi connection

Classic POS tagging is exactly the kind of sequence problem HMMs were used for: words →
find broken imports → possible hidden tags `VERB, ADJ, NOUN`. The HMM models
`P(tag_t | tag_t-1)`, `P(word_t | tag_t)`, and Viterbi finds the best tag sequence. For
Parent Atlas, don't make POS the authority — keep it as a cheap feature:
`verb_like_density`, `identifier_count`, `path_token_count`, `comparison_term_count`,
`mutation_verb_count`, `question_shape`. Then XGBoost decides whether those features
actually help.

### Where XGBoost sits — the combination

```
QueryCandidateFeatureV1:
  semantic_similarity, lexical_score, ast_affinity, pagerank, ppr, domain_affinity,
  knn_mean_distance, knn_success_rate,
  kmeans_cluster_17_prob, kmeans_cluster_42_prob, cluster_entropy,
  hmm_current_state_prob, hmm_failure_path_prob, viterbi_state_id,
  pos_verb_density, identifier_density,
  historical_action_success_rate, historical_recommendation_success_rate,
  expected_latency, mutation_risk
```

Then `XGBoost rank:ndcg` learns `features → predicted utility/relevance → candidate
ordering`. Much cleaner than asking XGBoost to independently rediscover vectors,
clustering, grammar, and temporal-sequence structure.

### Where reinforcement learning fits

Place RL after the receipt loop already being built. There's already the beginning of
`state → recommend action → execute → observe outcome → receipt` — structurally
RL-like (`state s_t, action a_t, reward r_t, next state s_t+1`). But don't label the
system RL yet unless a policy/value function is actually trained from rewards.
Initially: `HistoricalRecommendationAggregate` + XGBoost can learn supervised targets
such as `P(downstream_success | state, action)`, `expected_latency`,
`expected_token_cost`, `expected_repair_success`. Then a deterministic policy can
compute something like `U(a) = P(success)·V(success) − λ·latency − τ·tokens −
ρ·mutationRisk` and select the highest-utility action — contextual-bandit-like policy
behavior without prematurely introducing full RL. Later, `(state, action) → delayed
multi-step outcome → next state` could justify `Q(s,a)` / `policy(a|s)` offline RL — but
only after recommendation-outcome receipts are trustworthy.

### A strong Parent Atlas arrangement

```
OBSERVATION LAYER:   EmbeddingGemma semantic vectors, Postgres FTS lexical,
                      Tree-sitter AST, Neo4j/cuGraph topology, POS deterministic NLP query shape
STRUCTURE LAYER:      KNN local neighborhood, KMeans/SOM population topology,
                      HMM temporal procedural state, Viterbi most-likely path
LEARNED DECISION LAYER: XGBoost classifier (classification probability),
                      XGBoost LambdaMART (candidate/action ranking)
POLICY LAYER:         deterministic constraints, revision gates, known-failure
                      exclusions, expected utility
FEEDBACK:             execution → RecommendationOutcomeReceipt →
                      HistoricalRecommendationAggregate
```

Orthogonality: KNN ≠ KMeans (KMeans ≠ HMM, HMM ≠ Viterbi, Viterbi ≠ classifier/XGBoost,
XGBoost ≠ RL) — ranking/policy selects, executes, and (if successful) feeds back.

For an RTX 3060 Ti: KNN (cuVS), KMeans (cuML), and XGBoost (CUDA) are especially natural
GPU workloads. HMM/Viterbi and POS-style query features are usually small enough that
CPU execution is perfectly reasonable unless the sequence corpus becomes enormous. The
most interesting combination for Parent Atlas would probably be: KNN local evidence +
soft-KMeans distribution + HMM/Viterbi procedural state + domain/query features +
historical outcome receipts → XGBoost ranker. That gives XGBoost a compact summary of
semantic neighborhood, population structure, sequence state, and historical utility,
instead of asking one model to learn all four structures from scratch.
