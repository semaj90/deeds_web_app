## Memory/agent reconciliation design — 2026-09-05

This is a governance recording owner only. The operator resolved the evidence-axis
decision as layering/projection over ContextCandidate/ContextLane. There is one
ContextManifest compiler; this decision does not implement new packet classes.
Use evidenceDepth and residencyTier for new axes, leaving existing LOD APIs intact.

Keep model execution state, exact caches, ACE control, retrieval evidence, statistical
features, external observations, and durable outcomes distinct. Delegate implementation
to the existing owners listed in the reconciliation report; no new memory store,
agent controller, or cross-cutting proposal results from this decision.
