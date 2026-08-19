# Parent Atlas Learning Feedback Loop

## Why

Parent Atlas already has many pieces needed for learning from execution: an agentic error workflow with `ExecutionReceipt`, Kanban/task projections, QLoRA dataset/export scripts, a finite PPO action/reward boundary, QAS/Tang-inspired routing, tensor-head/MoE shadow routing, MCP/gRPC tool surfaces, llama-server MTP experiments, and an outbox-oriented event architecture.

The remaining risk is false integration: these pieces can all exist without proving the closed loop

`validated execution -> eligible training/eval record -> offline train -> held-out evaluation -> promotion/rejection receipt`.

This change owns only that integration seam. It does not replace the existing owners listed below.

## Existing owners that remain authoritative

- Agent/workflow execution: existing action writer, workflow events/outbox, error-agent workflow.
- QLoRA/KV-cache research: `openspec/changes/parent-atlas-kv-cache-adaptation-research/`.
- Agentic completion/Kanban/MCP: `openspec/specs/openspec/changes/parent-atlas-agentic-completion/`.
- QAS/Tang routing: existing `query-adaptive-sampler.ts` and Tang lifecycle adapters.
- Tensor-head routing: existing deterministic/tensor-head route contracts; learned MoE remains shadow until promoted.
- Kafka/CDC: `PA-KAFKA-001`; PostgreSQL/outbox remains canonical before CDC.
- llama-server serving: existing `:8090` runtime and MTP/draft experiment scripts.

## Boundary rules

1. `ExecutionReceipt` is evidence; a completed Kanban checkbox is not sufficient training truth.
2. SFT/QLoRA examples require grounded source/evidence and successful executable validation.
3. Failed/rejected attempts may be retained for DPO/reward/RL evaluation, but must be labeled and must never be silently converted into successful SFT examples.
4. Live web-fetch output is not directly trainable. It must pass sanitize -> evidence -> validated outcome -> offline corpus eligibility.
5. GGUF is an inference artifact, not a trainable QLoRA base. QLoRA requires a compatible trainable checkpoint plus a frozen quantized base and trainable adapter parameters.
6. PEFT/QLoRA, DPO and PPO are offline/post-training strategies. They do not own live retrieval relevance.
7. PPO/TorchRL actions remain finite and bounded. During offline evaluation, MCP/gRPC tools are simulated/replayed from receipts unless an explicitly isolated environment authorizes live calls.
8. MTP changes decode cost only; target-model verification remains authoritative.
9. Kafka/CDC is a projection of committed Postgres/outbox state and must not become the source of execution/training truth.
10. Every promoted adapter/policy/model route requires a revisioned training receipt and held-out evaluation receipt.

## Completion definition

This change is complete only when at least one real historical Parent Atlas repair trajectory can be traced end-to-end from canonical task/evidence through `ExecutionReceipt`, dataset eligibility, offline adapter or policy training, held-out evaluation, explicit promotion/rejection, model/adapter routing, and a subsequent execution receipt proving which revision was used.
