## Memory/agent reconciliation design — 2026-09-05

Keep WorkflowActionEventV1 as canonical run/action/event identity and
WorkflowExecutionCoordinatesV1 as the framework/runtime/checkpoint/transport separator.
Mastra snapshots and LangGraph checkpoints are backend artifacts. Audit existing
evidenceRefs/artifactRefs first; add a missing checkpoint link only after proving the
existing shape cannot express it. Preserve event identity and authorization across retries.

The curated post-run digest question is still open, distinct from raw event history.
Resolve reuse with ContextManifest/summary/artifact refs before creating a new type.
No checkpoint storage or live recorder is implemented by this planning update.
