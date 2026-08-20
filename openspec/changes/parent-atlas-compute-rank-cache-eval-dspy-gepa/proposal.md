# Proposal — Parent Atlas Compute / Rank / Cache / Eval / DSPy-GEPA

## Goal

Turn the long-running Parent Atlas daily Graphify/retrieval/repair workflow into a revision-qualified incremental computation DAG. Expensive AST, embedding, graph, feature, cross-encoder, and program-evaluation outputs become content-addressed artifacts that are reused until one of their actual dependencies changes.

This change does **not** move canonical truth into caches, ANN indexes, DSPy, GEPA, or model weights.

## Ownership boundaries

- Postgres / canonical Parent Atlas contracts: identity, source revision, evidence lineage, recommendation/task state.
- Tree-sitter / ast-grep / LangExtract / lexical lanes: evidence producers.
- Qdrant / cuVS CAGRA: semantic candidate generation executors for one logical semantic lane.
- Neo4j / NetworkX / cuGraph: structural graph algorithms and parity oracles.
- FeatureRowV1: revision-qualified scalar derived features for ranking/evaluation.
- Cross-encoder: pairwise neural reranking on a bounded candidate set.
- Valkey/BitFrost/immutable artifacts: hot references and content-addressed computed outputs; never canonical facts.
- DSPy: repair reasoning program structure.
- GEPA: optimize DSPy text/program components against receipt-derived metrics.
- Human/operator: approval boundary for risky/ambiguous recommendations.
- Kanban: projection of recommendations, review state, acceptance criteria, and verification status.
- QLoRA/Unsloth: later model adaptation only from verified outcome datasets; out of scope for promotion in this change.

## Identity rule

Do **not** create a compound identifier such as `source_ref_domain_class_url`.

Use orthogonal fields:

```text
canonicalId       stable logical identity
packetKey         Parent Atlas packet identity when available
sourceRef         stable source/provenance reference
filePath          optional physical repository path
sourceUrl         optional external source URL
domain            revisioned derived classification
contentHash       exact source content revision
workspaceRevision workspace snapshot
sourceRevision    source-specific revision
```

Domain classification is derived evidence and can change independently of source identity. URLs and file paths are locators, not canonical IDs.

## Incremental computation DAG

```text
source/content revision
  ├─ lexical artifact
  ├─ AST / structural artifact
  ├─ LangExtract/NLP artifact
  └─ semantic embedding artifact
          │
          ├─ Qdrant/CAGRA index projection
          └─ semantic candidate fanout

structural artifact hash
  └─ graph projection
       ├─ PageRank
       ├─ PPR
       ├─ Leiden/community
       └─ graph paths

candidate set
  └─ FeatureRowV1
       └─ bounded cross-encoder rerank
            └─ exact evidence promotion
                 └─ DSPy RepairProgramV1
                      └─ execute + validators
                           └─ typed receipt
                                ├─ Kanban projection
                                ├─ GEPA evaluation
                                └─ verified training example (later)
```

Every stage cache key must include producer revision plus all semantic/numerical dependencies that can change its output. Only `PROVEN` receipts may skip recomputation.

## FeatureRowV1

The first staged row contains exactly one PageRank authority feature with explicit graph revision lineage. It may also contain a query-specific PPR affinity. Correlated PageRank aliases are not independently added unless ablation proves they are distinct.

```text
dense
sparse
rrf
ast
pagerankAuthority
pprAffinity?
domainAffinity
freshness
crossEncoder?
executionUtility
```

The row retains canonical/source/revision fields and evidence references separately from the numeric `Float32` projection.

## Cross-encoder cache

Cross-encoder outputs are keyed by:

```text
queryHash
candidateContentHash
modelRevision
tokenizerRevision
maxLength
scoringRevision
```

PageRank/community/cache state does not invalidate a neural pair score unless it changes the actual pair text/model inputs.

## Human-in-the-loop workflow

Daily Graphify may create or refresh recommendation candidates but must not auto-approve risky edits. Recommendations are projected into Kanban with:

- evidence refs
- target files
- acceptance criteria
- validation commands
- permission mode
- graph/feature revisions
- promotion gate result
- explicit human decision state

Ambiguous or incomplete evidence becomes `review_required`; it is not silently converted into a patch.

## DSPy / GEPA

`RepairProgramV1` is a DSPy module with diagnosis and proposal predictors over a supplied exact `ContextManifest`. It may rank/describe only evidence already promoted by Parent Atlas.

GEPA uses current DSPy `GEPA(metric=..., reflection_lm=..., log_dir=..., track_stats=True, track_best_outputs=True, seed=...)` behavior. `log_dir` is treated as a resumable optimization artifact; the compiled program is a derived artifact, not truth.

The metric returns a 0..1 score plus textual feedback derived from validator receipts. Hard gates include targeted tests, typecheck, regression freedom, exact-evidence coverage, and localization quality.

## Promotion rule

A GEPA-optimized program is promoted only if it beats the unchanged baseline on a frozen validation/test set and does not regress hard safety/verification gates. A higher aggregate score alone is insufficient if regressions or fabricated evidence appear.

## Out of scope

- automatically training or promoting QLoRA adapters
- replacing canonical storage with Valkey/Qdrant/Arrow
- allowing GEPA/DSPy to rewrite evidence identity or graph truth
- treating cuGraph/CAGRA executors as independent ranking votes
- flattening n-ary canonical relations into invented binary semantic edges
