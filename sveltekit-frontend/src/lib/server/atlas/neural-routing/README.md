# Parent Atlas Neural Routing

This directory owns the deterministic-to-learned bridge for tool routing.

It does **not** own canonical repository truth, graph truth, tool authorization, or model training infrastructure.

## Pipeline

```text
query
  -> deterministic features
  -> FSM/capability hard mask
  -> canonical tool candidates
  -> CandidateFeatureMatrixV1
  -> deterministic baseline score
  -> optional neural challenger score
  -> ToolRoutingReceiptV1
  -> execute + verify
  -> ToolTrainingExampleV1
  -> held-out evaluation
  -> optional encoder/LoRA training
```

The LLM may help interpret ambiguity, but it must not create canonical tool identity, bypass the FSM/capability mask, or mark a route PROVEN.

## Files

- `contracts.ts`: versioned query, feature-matrix, runtime/GPU, routing, execution, and training-example contracts.
- `materializer.ts`: deterministic matrix/snapshot construction and baseline/hybrid top-k routing.
- `training-example-builder.ts`: converts verified execution outcomes into supervised routing examples.
- `gpu-admission.ts`: records Windows-host vs WSL execution identity and makes a fail-closed VRAM admission decision.
- `encoder-manifest.ts`: model-agnostic training manifests and promotion gates for an intent/domain encoder and tool CrossEncoder.
- `neural-routing.spec.ts`: contract and safety tests.

## Ownership boundaries

The existing `atlas-fsm-policy.ts` remains the hard action-state owner. Neural scores can rank only candidates that survived deterministic eligibility.

`retrieval/bounded-resolution.ts` remains the shared finite resource-envelope contract.

`atlas/graph/*` remains graph execution/parity ownership. Graph outputs become feature/evidence inputs; graph algorithms do not become independent tool-routing truth.

The RAPIDS sidecar remains the cuVS/cuGraph/cuML execution environment. Encoder training should use a separate WSL environment unless a benchmark proves safe dependency/VRAM coexistence.

## Training policy

Start with ordinary fine-tuning or LoRA for small encoders. QLoRA is available as a manifest option but should be promoted only if memory measurements justify 4-bit base-model training.

Positive labels require successful **and verified** execution. Selection alone is not a label.

Primary routing gates:

- ToolRecall@1/3/5
- MRR / NDCG@5
- execution-success@k
- calibration error (ECE/Brier)
- regression rate

The deterministic baseline must remain runnable as the correctness/challenger comparison path after a neural encoder is introduced.
