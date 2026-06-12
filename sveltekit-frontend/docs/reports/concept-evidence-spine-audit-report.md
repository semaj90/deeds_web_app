# Concept Evidence Spine Audit

Generated: 2026-06-12T13:16:16.858Z

## Summary

- total concepts: 10
- packet_keys concepts: 10
- feature_ids concepts: 10
- evidence_cards concepts: 0
- packet_keys -> atlas_packets.packet_key coverage: 97.43%
- feature_ids -> atlas_packets.feature_id coverage: 94.17%
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
| `ui_components` | UI Components (Svelte & UX) | packet_keys | 2004 | 286 | 0 |
| `test_harness` | Testing Harness & Smoke Benchmarks | packet_keys | 2412 | 867 | 0 |
| `observability_telemetry` | Observability & Retrieval Telemetry | packet_keys | 2413 | 683 | 0 |
| `native_accelerators` | Native Accelerators & GPU (LibTorch/SIMD) | packet_keys | 1798 | 168 | 0 |
| `infrastructure_config` | Infrastructure & Configuration (Docker) | packet_keys | 3778 | 687 | 0 |
| `general_abstractions` | General Codebase Abstractions | packet_keys | 2878 | 383 | 0 |
| `emergent_topology` | Emergent Topology Clusters | packet_keys | 2607 | 981 | 0 |
| `database_orm` | Database & ORM (PostgreSQL & Drizzle) | packet_keys | 2685 | 473 | 0 |
| `api_endpoints` | API Endpoints & Routing | packet_keys | 2178 | 533 | 0 |
| `agent_intelligence` | Agent Intelligence & Self-Healing | packet_keys | 1922 | 378 | 0 |

