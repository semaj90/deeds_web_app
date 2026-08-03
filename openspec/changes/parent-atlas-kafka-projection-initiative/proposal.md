## Why

A Kafka/CDC projection initiative (`PA-KAFKA-001`) has been proposed as a
separate concern from Parent Atlas's core graph/retrieval/recommendation
work. It needs its own tracking home so it doesn't get folded into (or
crowd out) the unrelated `parent-atlas-graph-retrieval-proof` and
`parent-atlas-gpu-sidecar-patch-tournament` work streams. This stub exists
to record the ownership split and shared-identity contract only — the
full technical spec (event schemas, outbox contract, Kafka Connect
templates, Studio control plane) belongs in Spec Kit's `specs/` directory
per the four-tool ownership split below, not duplicated here.

## Four-tool ownership split (do not duplicate content across all four)

| Tool | Owns |
|---|---|
| Spec Kit (`.specify/`, `specs/`) | Initiative-level intent and architecture |
| OpenSpec (`openspec/`) | Bounded behavioral changes and acceptance contracts (this file and its siblings) |
| GSD (`.planning/`) | Execution phases, plans, progress, implementation summaries |
| `docs/` | Runtime audits, proof reports, screenshots, generated evidence |

## Shared identity (use in every artifact across all four tools)

```
initiative_id: PA-KAFKA-001
initiative_slug: parent-atlas-kafka-projection
spec_kit_feature: 111-parent-atlas-kafka-projection
github_epic: PA-KAFKA-001
```

Every OpenSpec change under this initiative should carry:

```
initiative_id: PA-KAFKA-001
change_id: <this-change's-slug>
gsd_phase: <matching .planning/phases/ number>
spec_kit_feature: 111-parent-atlas-kafka-projection
proof_status: NOT_PROVEN
```

## What Changes

Nothing yet — this is a placeholder recording the ownership model and
shared-identity contract so future Kafka-initiative OpenSpec changes
(`kafka-readiness-audit`, `projection-outbox-contract`,
`kafka-outbox-publisher`, `qdrant-projection-consumer`, `studio-kafka-lane`)
have a consistent home and don't collide with Parent Atlas graph/retrieval
naming. No Spec Kit (`specs/111-parent-atlas-kafka-projection/`) or GSD
(`.planning/phases/111-...`) scaffolding has been created yet — that's a
separate decision, not implied by this stub.

## Explicit non-goals

This initiative must not absorb or be absorbed by:
- `parent-atlas-graph-retrieval-proof` (graph/retrieval/PageRank/patch-tournament work)
- `parent-atlas-gpu-sidecar-patch-tournament` (RAPIDS/GPU/patch tournament)
- `parent-atlas-okf-knowledge-layers` (OKF/OpenWiki/Deep Agents)
- `parent-atlas-kv-cache-adaptation-research` (RotorQuant/QLoRA)

Each keeps its own `initiative_id`/change history. Cross-reference by
initiative ID when genuinely related; don't merge scope.
