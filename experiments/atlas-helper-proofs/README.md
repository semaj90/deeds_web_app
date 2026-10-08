# Parent Atlas helper proof (isolated, proposal-only)

This directory is intentionally **not wired into any live packet writer, service, cache, or retrieval owner**. It is a self-contained parity oracle for key-value feature ordering and revision-qualified packet references.

Run: `cd experiments/atlas-helper-proofs && python -m unittest -v`.

## Integration gates

1. Census existing owners for canonical packet identity, source/graph/representation revision, AST chunk lineage, embedding ordinals, retrieval, ContextManifest, residency, and receipts.
2. Map `PacketRef` to the **existing** registry contracts; do not create a new canonical table or writer.
3. Add TypeScript/Pydantic cross-language golden fixtures including omitted, stale, malformed, and duplicate identities.
4. Validate exact lexical and dense retrieval separately; original, rewritten, and HyDE embeddings are variants within **one logical semantic lane**.
5. Add read-only graph expansion with traversal budgets, revision-qualified edges, and evidence-linked participants.
6. Integrate only proposal-only residency decisions with ACE/BitFrost and existing execution receipts.
7. Run local sidecar, Postgres, Qdrant, Kafka, llama-server, and GPU owner proofs *only when their running environments are available*.

## Status

Implemented here: immutable packet reference, dense deterministic feature encoding, SHA256 proposal digest, revision fail-closed admission, unit tests.

Not implemented: on-wire QUIC/gRPC, binary packet replacement, Kafka writes, PyTorch/QLoRA training, cache mutation, Graphify execution, local GPU tests, or production DAG integration.

These modules are experiments, not proof of deployment or feature completion.
