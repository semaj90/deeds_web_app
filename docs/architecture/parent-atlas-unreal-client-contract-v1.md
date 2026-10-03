# Parent Atlas Unreal Client Contract v1

**Status:** DESIGN_ONLY_NOT_IMPLEMENTED

**Scope:** Unreal Engine client boundary for a future `AtlasVectorService` gRPC service. This document does not claim that the protobuf service, server, or Unreal plugin exists.

## Ownership

- The Unreal plugin is a presentation client. Slate/UMG may display returned neighbor and execution-receipt projections.
- The plugin calls only the service endpoint through the future generated gRPC client. It does not link `atlas_core` directly.
- PostgreSQL remains canonical for identity and revision state. The service/application adapter validates identity and revisions before dispatch; Unreal does not resolve or mint canonical identity.
- Qdrant, cuVS, CAGRA, TurboVec, and WebGPU remain execution/projection providers. A provider result is not a new semantic representation or identity authority.

## Request and response boundary

The future protobuf contract is owned by P3.3. This client contract expects a typed request containing the operation, metric, bounded `top_k`, workspace and representation revision references, and a request correlation ID. Large numeric inputs are referenced by a validated `TensorRef` (storage URI, byte range, shape, dtype, content checksum); they are not embedded as large `repeated float` payloads or silently loaded into game memory.

The response contains a bounded `NeighborBatch` and an `ExecutionReceipt`. The receipt is diagnostic execution evidence (backend, status, timing/transfer counters, fallback state); it does not promote the returned rows or establish canonical identity. The service must reject stale or mismatched revisions before compute and return a typed status.

## Runtime behavior

- Every RPC has a finite deadline and supports cancellation when the owning screen, world, or request is torn down.
- The client applies configured response/count/byte limits before copying data into presentation state.
- A timeout, revision rejection, unavailable backend, or malformed response is rendered as an unavailable/error state. The client must not silently switch to local ranking or another executor.
- The plugin performs no database, vector-store, cache, graph-store, HTTP, or canonical filesystem access and performs no writes.
- Rendering is disposable: closing a widget releases client buffers and does not alter service or canonical state.

## Non-goals and proof boundary

This v1 contract does not define Unreal module/build files, credentials or deployment policy, a protobuf schema, server implementation, GPU behavior, or a production endpoint. P3.3 must define the service/protobuf contract before a client can be implemented. Acceptance of this document proves only the intended ownership boundary; no Unreal compilation or live RPC has been performed.
