# Proposal — Parent Atlas OaK 2026 DSPy Typed DAG

## Goal

Keep the OaK 2026 ontology kernel `K=(S,F)` and replace the free-running
ReAct inference policy with a DSPy-programmed semantic controller whose output
is validated and lowered through `KernelBoundDagPlannerV1`.

DSPy is the programming/compilation layer. GEPA is an offline optimizer.
Neither is a runtime execution authority.

## Runtime

```text
Frozen AtlasOntologyKernelManifestV1
  schema S + legal function set F
        ↓
DSPy task classifier
        ↓
DSPy evidence diagnosis
        ↓
DSPy selects exactly one declared F function + arguments
        ↓
Oak2026KernelFunctionProposalV1
        ↓
proposal checksum / kernel revision / evidence subset validation
        ↓
KernelBoundDagPlannerV1
        ↓
AdaptiveDagPlanV1
        ↓
Parent Atlas deterministic executor
        ↓
ExecutionReceiptV1 + validators
        ↓
DSPy critic
```

A model never executes the proposed function directly.

## Offline optimization

```text
verified historical receipts
        ↓
frozen train/validation split
        ↓
GEPA.compile(DSPy program)
        ↓
program candidate artifact
        ↓
validation comparison + hard gates
        ↓
ProgramPromotionReceiptV1
        ↓
approved PromptProgramRevisionV1
        ↓
held-out test exactly once
```

The held-out test result cannot feed the same GEPA optimization run.

## Ownership boundaries

- OaK `S`: Parent Atlas ontology/schema contracts.
- OaK `F`: `AtlasKernelFunctionV1` catalog compiled from the trusted operator library.
- DSPy: task classification, evidence diagnosis, typed function selection, critique.
- `KernelBoundDagPlannerV1`: structural control flow and legal action lowering.
- Authorization layer: permission to mutate.
- Executor: side effects.
- Validators: truth/promotion gates.
- GEPA: offline DSPy program optimization only.

## Baselines

The OaK paper's ReAct inference strategy remains a benchmark baseline, not the
Parent Atlas target control architecture. A DSPy `dspy.ReAct` challenger may
also be benchmarked, but production promotion targets the typed DAG controller.

## Invariants

- undeclared function count = 0
- undeclared operator count = 0
- evidence refs outside supplied manifest = 0
- canonical identity created by DSPy = 0
- mutation performed by DSPy = 0
- live GEPA self-modification = 0
- kernel revision mismatch = fail closed
- proposal checksum mismatch = fail closed
