# Concept Evidence Spine Audit

Generated: 2026-06-14T01:33:15.435Z

## Summary

- total concepts: 10
- packet_keys concepts: 10
- feature_ids concepts: 10
- evidence_cards concepts: 0
- packet_keys -> atlas_packets.packet_key coverage: 100%
- feature_ids -> atlas_packets.feature_id coverage: 89.98%
- evidence_cards -> atlas_packets.packet_id coverage: 0%

## Classification

- PACKET_KEYS_AUTHORITATIVE: 10
- FEATURE_IDS_AUTHORITATIVE: 0
- EVIDENCE_CARDS_AUTHORITATIVE: 0
- MIXED_SPINE: 0
- STALE_ONLY: 0
- NO_SPINE: 0

## Recommendation

- canonicalSpine: packet_keys
- action: Backfill evidence_cards from packet_keys; keep packet_keys as the authoritative live spine.

## Samples

| concept_id | label | spine | packet_keys | feature_ids | evidence_cards |
|---|---|---|---:|---:|---:|
| `ui_components` | UI Components (Svelte & UX) | packet_keys | 2264 | 290 | 0 |
| `test_harness` | Testing Harness & Smoke Benchmarks | packet_keys | 3258 | 871 | 0 |
| `observability_telemetry` | Observability & Retrieval Telemetry | packet_keys | 3185 | 686 | 0 |
| `native_accelerators` | Native Accelerators & GPU (LibTorch/SIMD) | packet_keys | 2628 | 171 | 0 |
| `infrastructure_config` | Infrastructure & Configuration (Docker) | packet_keys | 3932 | 694 | 0 |
| `general_abstractions` | General Codebase Abstractions | packet_keys | 3150 | 387 | 0 |
| `emergent_topology` | Emergent Topology Clusters | packet_keys | 3357 | 985 | 0 |
| `database_orm` | Database & ORM (PostgreSQL & Drizzle) | packet_keys | 3040 | 476 | 0 |
| `api_endpoints` | API Endpoints & Routing | packet_keys | 2832 | 536 | 0 |
| `agent_intelligence` | Agent Intelligence & Self-Healing | packet_keys | 2732 | 382 | 0 |

