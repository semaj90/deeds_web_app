# Graphify Stage 4-5 OpenSpec Tracking

**Generated:** 2026-07-23  
**Repository:** `C:/Users/james/Videos/deeds-web-app`  
**Tracking mode:** State-based gates are authoritative; percentages are roadmap estimates only.

## Proposal

**Proposal ID:** `graphify-stage-4-5-execution-continuation`  
**Intent:** Finish Graphify Stage 4 topology extraction, Stage 4b edge endpoint validation, and Stage 5 PageRank authority with OpenSpec-style task tracking.

## Proof Model

| State | Meaning |
|---|---|
| `IMPLEMENTED` | Code exists |
| `FIXTURE_PROVEN` | Fixture or mock proof only |
| `RUNTIME_PROVEN` | Local runtime executed |
| `LIVE_STORE_PROVEN` | Live store validated |
| `CROSS_STORE_PROVEN` | Cross-store parity proven |
| `EVALUATED` | Quality evaluated against metrics |
| `PRODUCTION_PROVEN` | Multi-run and rollback proven |
| `UNAVAILABLE` | Required live dependency missing |
| `FAILED` | Required gate failed |
| `NOT_IMPLEMENTED` | No implementation yet |

## Current Task Ledger

| Task ID | Spec ID | State | Proof State | Blocked By | Command | Gate |
|---|---|---|---|---|---|---|
| `stage4_topology_extraction` | `spec_stage4_topology_extraction` | `IN_PROGRESS` | `IMPLEMENTED` | none | `node scripts/atlas/stage4-topology-extraction-parallel.mjs` | `TOPOLOGY_EXTRACTION_PROVEN` |
| `stage4b_edge_endpoint_validation` | `spec_stage4b_edge_endpoint_validation` | `BLOCKED` | `IMPLEMENTED` | `stage4_topology_extraction` | `node scripts/atlas/stage4b-edge-endpoint-validation.mjs` | `EDGE_ENDPOINT_INTEGRITY_PROVEN` |
| `stage5_pagerank_authority` | `spec_stage5_pagerank_authority` | `BLOCKED` | `IMPLEMENTED` | `stage4b_edge_endpoint_validation` | `node scripts/atlas/stage5-pagerank-authority-validated.mjs` | `NETWORKX_REFERENCE_PROVEN` |

## Gate Rules

1. Stage 4 only counts when the topology output file exists, has a validated record count, and produces sample rows.
2. Stage 4b cannot run until Stage 4 output exists.
3. Stage 5 cannot run until Stage 4b passes edge endpoint integrity.
4. Script creation does not count as proof.
5. A timeout must be treated as a bottleneck signal, not a success signal.

## Evidence Ledger

### Known implementation artifacts

- `scripts/atlas/stage4-topology-extraction-parallel.mjs`
- `scripts/atlas/stage4b-edge-endpoint-validation.mjs`
- `scripts/atlas/stage5-pagerank-authority-validated.mjs`
- `docs/PARENT-ATLAS-KANBAN-CORRECTED.md`
- `docs/GRAPHIFY-STAGES-0-5-EXECUTION-COMPLETE.md`

### Expected outputs

- `docs/stage4/topology_facts.ndjson`
- `docs/stage4b/edge_endpoint_validation_report.json`
- `docs/stage5/pagerank_validation_report.json`

### Current blockers

1. The earlier Stage 4b and Stage 5 results were generated on the pre-filter corpus and are superseded.
2. The current filtered Stage 4 rerun was stopped before producing a fresh topology artifact.
3. Stage 4b is blocked until the filtered Stage 4 output lands again.
4. Stage 5 is blocked by Stage 4b and the filtered corpus rerun.

## Next Bounded Task

1. Re-run Stage 4 with the filtered corpus until `docs/stage4/topology_facts.ndjson` exists again.
2. Validate row count and sample records on the filtered corpus.
3. Run Stage 4b again and compare it with the superseded pass.
4. Only then run Stage 5 again.

## OpenSpec-Style Acceptance Criteria

- `stage4_topology_extraction`: output file exists, row count validated, sample rows inspected.
- `stage4b_edge_endpoint_validation`: zero orphaned edges, canonical endpoints only.
- `stage5_pagerank_authority`: deterministic reference PageRank validated and gate recorded.
