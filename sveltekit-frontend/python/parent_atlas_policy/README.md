# Parent Atlas policy experiments

Production routing remains TypeScript + existing HMM/Viterbi/DAG policy. Python is offline/experimental only.

- `train_policy_router.py`: tiny three-head linear policy model.
- `geometry_diagnostics.py`: JVP/covector diagnostics; avoids full Jacobian materialization.
- `som_torch.py`: optional 20x20 SOM, preferably trained from KMeans centroids.
- `build_policy_sft_dataset.py`: creates constrained action SFT data for QLoRA.
- `dspy_policy_program.py`: DSPy route program plus official `dspy.GEPA` optimizer wiring. GEPA is shadow-only and consumes immutable execution-receipt-derived trajectories.
- `run_dspy_gepa.py`: offline CLI that compiles the DSPy program with GEPA, saves the optimized DSPy module, and emits `atlas.gepa-optimization-receipt.v1`.
- `ppo_policy_env.py`: finite reward/action contract only; no production PPO policy owner.
- `parent_atlas_gym_env.py`: replay-only Gymnasium environment for historical trajectory evaluation.

## DSPy + GEPA experiment

GEPA is not a production retrieval or action owner. It optimizes the text/instructions inside the DSPy program and must remain shadow-only until held-out Parent Atlas evaluation produces an explicit promotion receipt.

Input JSONL rows must be immutable, receipt-derived trajectories with at least:

```json
{
  "state": "...",
  "allowed_actions": ["INSPECT_SOURCE", "PATCH"],
  "evidence_summary": "...",
  "expected_action": "INSPECT_SOURCE",
  "receipt_id": "execution-receipt:...",
  "validation_passed": true,
  "exact_promotion_required": true,
  "exact_promotion_satisfied": true,
  "latency_ms": 42,
  "latency_budget_ms": 100,
  "tool_calls": 1,
  "tool_call_budget": 3,
  "feedback_context": "Exact source evidence was available; graph expansion was unnecessary."
}
```

Example offline command:

```bash
python -m parent_atlas_policy.run_dspy_gepa \
  --train ./data/gepa-train.jsonl \
  --val ./data/gepa-val.jsonl \
  --student-model '<configured DSPy task model>' \
  --reflection-model '<configured DSPy reflection model>' \
  --auto light \
  --output ./artifacts/route-decision-gepa.json \
  --receipt ./artifacts/route-decision-gepa.receipt.json
```

Do not put provider credentials, live MCP/gRPC tool calls, or mutable repository state in this experiment dataset. GEPA should learn from recorded evidence and validation feedback, not mutate the workstation while optimizing prompts.

Promotion order: deterministic baseline -> linear policy -> DSPy/GEPA shadow -> held-out promotion gate -> SFT/QLoRA -> preference/RL only with stable rewards.
