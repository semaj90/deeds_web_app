## Memory/agent reconciliation design — 2026-09-05

This is a governance recording owner only. The operator resolved the evidence-axis
decision as layering/projection over ContextCandidate/ContextLane. There is one
ContextManifest compiler; this decision does not implement new packet classes.
Use evidenceDepth and residencyTier for new axes, leaving existing LOD APIs intact.

Keep model execution state, exact caches, ACE control, retrieval evidence, statistical
features, external observations, and durable outcomes distinct. Delegate implementation
to the existing owners listed in the reconciliation report; no new memory store,
agent controller, or cross-cutting proposal results from this decision.

## TriEngramV1 — Parent Atlas terminology

`TriEngramV1` is a Parent Atlas architecture term, not a claim about a standard published
architecture. It groups existing owners into three planes without merging their responsibilities:
E1 is PostgreSQL canonical knowledge and identity; E2 groups derived retrieval and residency
participants (Qdrant, Graphify, Neo4j/cuGraph, ACE, BitFrost, centroids, and clusters); E3 is
llama-server-owned execution state. E1 alone has canonical authority. E2 is derived, and E3 is
ephemeral; neither cache presence nor model runtime state is evidence or identity. The contract is a
descriptor only and does not create a new store or persistence path.
