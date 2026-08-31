# Parent Atlas OaK 2026 + DSPy Helpers

This package is the Parent Atlas programming layer for the OaK 2026 kernel.
It wraps DSPy's public API; it does **not** vendor/copy DSPy internals.

## Ownership

```text
OaK 2026 K=(S,F)
  schema + frozen legal reasoning functions
          ↓
DSPy program
  classification / diagnosis / one typed F proposal / critique
          ↓
Oak2026KernelFunctionProposalV1
          ↓
TypeScript proposal validator
          ↓
KernelBoundDagPlannerV1
          ↓
AdaptiveDagPlanV1
          ↓
Parent Atlas executor + authorization + validators
          ↓
ExecutionReceiptV1
```

GEPA is **offline only**. It may compile/optimize DSPy program text against a
frozen train/validation corpus and receipt-derived metric. It cannot mutate a
live kernel, authorize an action, alter canonical identity, or consume the
held-out test split as optimization feedback.

## Public helpers

- `build_oak2026_typed_dag_program_v1()` — DSPy `Predict`-based controller;
  intentionally not `dspy.ReAct`.
- `build_kernel_function_proposal_v1()` — fail-closed proposal builder over the
  frozen function/evidence allowlists.
- `build_oak2026_gepa_optimizer_v1()` — offline GEPA constructor.
- `stable_checksum_v1()` — deterministic JSON contract checksum.

## Existing Parent Atlas DSPy modules

The older `python/parent_atlas_dspy_repair.py` and
`python/parent_atlas_dspy_community.py` remain valid specialized programs.
They are not execution authorities. This package adds the OaK-specific control
boundary that chooses only from the frozen `F` catalog and hands that choice to
the deterministic DAG planner.

## Non-goals

- no tool execution from Python/DSPy
- no arbitrary function/code generation
- no source/symbol/packet identity creation
- no ontology promotion
- no direct Postgres/Qdrant/Neo4j writes
- no live GEPA self-modification
- no replacement of the Parent Atlas authorization/validation layers
