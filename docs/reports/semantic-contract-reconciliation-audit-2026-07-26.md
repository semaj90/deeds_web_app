# Semantic Contract Reconciliation Audit

Date: 2026-07-26
Status: `STATICALLY_PRESENT_WITH_REMAINING_LEGACY_DEFAULTS`

## Scope

This audit checks the live contract seams behind the semantic-packet reframing:

- identity owners
- packet and ontology schemas
- HyperRAG packet normalization
- feature-envelope signal separation
- root versus runtime OKF ownership

## Executive Summary

The repo already contains the main semantic infrastructure primitives, and the core embedding contract owners now align on native `768` plus an explicit legacy `384` projection lineage. The remaining gaps are narrower transport adapters, proof gates, and runtime parity rather than a total contract split.

Current defensible state:

- `OKF_PRIMITIVES_PRESENT`
- `HYPERRAG_PRIMITIVES_PRESENT`
- `PACKET_SCHEMAS_PRESENT`
- `ZOD_VALIDATION_PRESENT`
- `IDENTITY_UTILITIES_PRESENT`
- `TOPOLOGY_ROUTING_FEATURES_PRESENT`
- `CANONICAL_PACKET_CONTRACT_RECONCILIATION_IN_PROGRESS`
- `CANONICAL_FACT_CONTRACT_RECONCILIATION_REQUIRED`
- `ROOT_RUNTIME_OKF_AUTHORITY_UNRESOLVED`
- `IDENTITY_POLICY_PARTIAL`
- `JSON_SCHEMA_ZOD_PARITY_NOT_PROVEN`
- `CROSS_STORE_IDENTITY_NOT_PROVEN`
- `END_TO_END_RUNTIME_EXECUTION_PENDING`

## Findings

### 1. Embedding representation policy is partially reconciled, with remaining legacy defaults

- [src/lib/server/ingest/ingest-packet-schema.ts](/C:/Users/james/Videos/deeds-web-app/src/lib/server/ingest/ingest-packet-schema.ts:46) now accepts native `768` and truncated EmbeddingGemma projections such as `384` and `256` when projection lineage is explicit.
- [src/lib/server/topology/feature-tracking-layer.ts](/C:/Users/james/Videos/deeds-web-app/src/lib/server/topology/feature-tracking-layer.ts:169) now carries `embedding_native_dim = 768`, optional `embedding_projection_dim`, and a `representation_policy` marker instead of hardcoding `384` as canonical truth.
- [sveltekit-frontend/src/lib/server/ontology/packet-ontology.schema.ts](/C:/Users/james/Videos/deeds-web-app/sveltekit-frontend/src/lib/server/ontology/packet-ontology.schema.ts:146) now accepts `384` or `768` vectors.
- [sveltekit-frontend/src/lib/server/embedding/embedding-contract.ts](/C:/Users/james/Videos/deeds-web-app/sveltekit-frontend/src/lib/server/embedding/embedding-contract.ts:29) now treats `768` as the native semantic representation and `384` as the explicit online retrieval projection.
- [src/lib/server/retrieval/unified-orchestrator.ts](/C:/Users/james/Videos/deeds-web-app/src/lib/server/retrieval/unified-orchestrator.ts:98), [src/routes/api/retrieval/gpu-knn/+server.ts](/C:/Users/james/Videos/deeds-web-app/src/routes/api/retrieval/gpu-knn/+server.ts:88), and [sveltekit-frontend/src/lib/server/telemetry/retrieval-event-schema.ts](/C:/Users/james/Videos/deeds-web-app/sveltekit-frontend/src/lib/server/telemetry/retrieval-event-schema.ts:141) should be read as legacy compatibility adapters, not as proof that `384` is the canonical online lane.

Result: the contract owners now consistently separate native `768` from online `384`. The unresolved issue is no longer dimensional ambiguity inside these owners; it is proving parity, cleaning up remaining compatibility adapters, and verifying cross-store identity and retrieval behavior end to end.

### 2. Packet identity semantics are not unified

- [src/lib/server/ingest/ingest-packet-schema.ts](/C:/Users/james/Videos/deeds-web-app/src/lib/server/ingest/ingest-packet-schema.ts:154) requires `packetKey` to be a UUID.
- [src/lib/server/topology/feature-tracking-layer.ts](/C:/Users/james/Videos/deeds-web-app/src/lib/server/topology/feature-tracking-layer.ts:35) models `packet_key` as a canonical identity string and separately validates `tree_node_id` and `title_id` as UUIDs at [lines 548-551](/C:/Users/james/Videos/deeds-web-app/src/lib/server/topology/feature-tracking-layer.ts:548).
- [sveltekit-frontend/src/lib/server/retrieval/hyperrag-packet-rpc.ts](/C:/Users/james/Videos/deeds-web-app/sveltekit-frontend/src/lib/server/retrieval/hyperrag-packet-rpc.ts:796) still derives `packetKey` by fallback from `packet_key`, `packetKey`, `id`, `source_ref`, or a synthetic `hyperrag:${index}` marker.

Result: `packet_key` is not yet a single enforced identity contract. Different layers treat it as UUID-only, canonical string, or best-effort fallback.

### 3. HyperRAG packet normalization is still adapter logic, not a canonical packet contract

- [sveltekit-frontend/src/lib/server/retrieval/hyperrag-packet-rpc.ts](/C:/Users/james/Videos/deeds-web-app/sveltekit-frontend/src/lib/server/retrieval/hyperrag-packet-rpc.ts:796) accepts multiple alias fields instead of one promoted packet shape.
- It maps `feature_label` from `domainClass` at [line 815](/C:/Users/james/Videos/deeds-web-app/sveltekit-frontend/src/lib/server/retrieval/hyperrag-packet-rpc.ts:815).
- It maps `ontology_label` from the same `domainClass` at [line 817](/C:/Users/james/Videos/deeds-web-app/sveltekit-frontend/src/lib/server/retrieval/hyperrag-packet-rpc.ts:817).
- It passes through `kmeans_cluster`, `community_id`, and `som_cluster` at [lines 819-822](/C:/Users/james/Videos/deeds-web-app/sveltekit-frontend/src/lib/server/retrieval/hyperrag-packet-rpc.ts:819) without a stronger promoted feature-family contract.

Result: the HyperRAG RPC layer is still a permissive transport adapter. It is not yet consuming a canonical `SemanticPacketV1`.

### 4. The topology parity layer overclaims canonical completeness

- [src/lib/server/topology/feature-tracking-layer.ts](/C:/Users/james/Videos/deeds-web-app/src/lib/server/topology/feature-tracking-layer.ts:29) says 11 canonical fields must exist across Postgres, Qdrant, and Neo4j.
- Its Postgres read only selects through `topolog_cluster` and hardcodes `embedding_dim` at [lines 145-155](/C:/Users/james/Videos/deeds-web-app/src/lib/server/topology/feature-tracking-layer.ts:145), but does not load `som_cluster` or `community_id`.
- The same file later scores parity against `som_cluster` and `community_id` at [lines 375-385](/C:/Users/james/Videos/deeds-web-app/src/lib/server/topology/feature-tracking-layer.ts:375).

Result: this module is useful as a verifier, but it is not yet aligned with the actual canonical packet shape it claims to check.

### 5. The feature envelope correctly separates retrieval signals, but it is not the semantic packet

- [sveltekit-frontend/src/lib/server/retrieval/feature-envelope.ts](/C:/Users/james/Videos/deeds-web-app/sveltekit-frontend/src/lib/server/retrieval/feature-envelope.ts:170) defines `FeatureEnvelopeSchema`.
- It keeps `dense`, `lexical`, and `authority` as independent signals at [lines 185-189](/C:/Users/james/Videos/deeds-web-app/sveltekit-frontend/src/lib/server/retrieval/feature-envelope.ts:185).
- It also carries `packet_key`, `tree_node_id`, `domain_class`, and `title_id` at [lines 175-243](/C:/Users/james/Videos/deeds-web-app/sveltekit-frontend/src/lib/server/retrieval/feature-envelope.ts:175).

Result: this is already close to a `FeatureMatrixRowV1` or retrieval-envelope layer. It should remain a derived signal container, not be promoted as the canonical semantic packet itself.

### 6. Root and runtime OKF paths represent different concepts today

- [src/lib/server/atlas/contracts/okf-schema.ts](/C:/Users/james/Videos/deeds-web-app/src/lib/server/atlas/contracts/okf-schema.ts:3) defines a compact packet-oriented OKF record with `source_ref`, `packet_key`, `feature_id`, `title_id`, and `tree_node_id`.
- [sveltekit-frontend/src/lib/server/okf/mastra-okf-loader.ts](/C:/Users/james/Videos/deeds-web-app/sveltekit-frontend/src/lib/server/okf/mastra-okf-loader.ts:88) loads and validates workflow-oriented OKF documents with workflow metadata and step graphs instead.

Result: “OKF” is currently serving at least two separate roles:

- packet/record contract
- workflow/schema contract

Those roles are both valid, but the ownership rule is not yet explicit. The repo still needs a canonical declarative ontology source and a validated runtime projection policy.

## Contract Map

### Likely current owners

- `SemanticPacketV1`
  - not yet promoted
  - closest current seams: `IngestPacketSchema`, HyperRAG packet RPC packet shape, packet ontology packet tuple, packet readers/materializers
- `HypergraphFactV1`
  - not yet promoted
  - closest current seams: packet ontology edges, KAG/DAG evidence schemas, HyperRAG routes
- `FeatureMatrixRowV1`
  - partially present
  - closest current seam: `FeatureEnvelopeSchema`
- `ContractValidationResult`
  - not yet promoted
  - closest current seams: ad hoc Zod parse boundaries and verifier scripts

## Recommended Next Patch Order

1. Promote one packet identity policy:
   - `packet_key` string contract
   - `content_hash` version contract
   - `title_id` grouping contract
   - `tree_node_id` structural contract
   - `uuid` and `ulid` usage policy
2. Reconcile embedding representation policy:
   - native `dense_768`
   - optional projected representation
   - routing `latent_64`
   - remove or relabel remaining legacy `384` comments/defaults unless they remain an explicitly versioned derived lane
3. Split contract roles cleanly:
   - semantic packet
   - hypergraph fact
   - feature matrix row
   - validation envelope
4. Reduce HyperRAG packet RPC fallback normalization:
   - consume one packet contract
   - stop deriving `feature_label` and `ontology_label` from the same generic `domainClass`
5. Make OKF ownership explicit:
   - declarative ontology/packet/fact source
   - workflow/runtime projection source
   - export serialization boundary

## Evidence Files

- [src/lib/server/ingest/ingest-packet-schema.ts](/C:/Users/james/Videos/deeds-web-app/src/lib/server/ingest/ingest-packet-schema.ts)
- [src/lib/server/topology/feature-tracking-layer.ts](/C:/Users/james/Videos/deeds-web-app/src/lib/server/topology/feature-tracking-layer.ts)
- [sveltekit-frontend/src/lib/server/retrieval/hyperrag-packet-rpc.ts](/C:/Users/james/Videos/deeds-web-app/sveltekit-frontend/src/lib/server/retrieval/hyperrag-packet-rpc.ts)
- [sveltekit-frontend/src/lib/server/retrieval/feature-envelope.ts](/C:/Users/james/Videos/deeds-web-app/sveltekit-frontend/src/lib/server/retrieval/feature-envelope.ts)
- [sveltekit-frontend/src/lib/server/ontology/packet-ontology.schema.ts](/C:/Users/james/Videos/deeds-web-app/sveltekit-frontend/src/lib/server/ontology/packet-ontology.schema.ts)
- [src/lib/server/atlas/contracts/okf-schema.ts](/C:/Users/james/Videos/deeds-web-app/src/lib/server/atlas/contracts/okf-schema.ts)
- [sveltekit-frontend/src/lib/server/okf/mastra-okf-loader.ts](/C:/Users/james/Videos/deeds-web-app/sveltekit-frontend/src/lib/server/okf/mastra-okf-loader.ts)
