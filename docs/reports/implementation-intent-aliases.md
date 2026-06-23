# Implementation Intent Aliases

Generated: 2026-06-23T02:54:30.121Z
Packets: 8
Status: PASS

## Active Vector Surfaces

| Named vector | Dim | Role |
|---|---|---|
| `content` | 768 | canonical semantic search |
| `encoded_64` | 64 | topology / search (active latent) |
| `error` | 768 | error-context embeddings |
| `signature` | 768 | code signature embeddings |

**Postponed** (no concrete caller, pending retrieval stability): `latent_128`, AE training, manifold graph.

## Active Cache Keys

| Store | Key | Purpose |
|---|---|---|
| Redis | `gpu:karpathy:scores` | Karpathy authority blend (file → JSON) |
| Redis | `gpu:karpathy:encoded` | 64-dim encoded vectors (file → CSV) |
| Neo4j | `gpuCluster` | GPU cluster node property |
| Neo4j | `som_cluster` | SOM cluster node property |
| Neo4j | `PageRank` | PageRank score node property |

## Intents

- **qdrant_payload_writer** -> Qdrant Payload Enrichment (7 likely files)
- **packet_contract_writer** -> Packet Contract Lane (4 likely files)
- **mcp_tool_manifest_writer** -> MCP Tool Manifest Packets (5 likely files)
- **gpu_rerank_writer** -> GPU BatchCosine Rerank (3 likely files)
- **feature_dependency_group_writer** -> Feature Dependency Groups (3 likely files)
- **env_runtime_contract** -> Environment Runtime Contract (5 likely files)
- **active_latent_surfaces** -> Active Latent Surfaces (3 likely files)
- **som_topology_surfaces** -> SOM Topology Surfaces (4 likely files)

## Warnings

- none

## Failures

- none
