# Parent Atlas policy experiments

Production routing remains TypeScript + existing HMM/Viterbi. Python is offline/experimental only.

- `train_policy_router.py`: tiny three-head linear policy model.
- `geometry_diagnostics.py`: JVP/covector diagnostics; avoids full Jacobian materialization.
- `som_torch.py`: optional 20x20 SOM, preferably trained from KMeans centroids.
- `build_policy_sft_dataset.py`: creates constrained action SFT data for QLoRA.
- `dspy_policy_program.py`: prompt/program optimization experiment.
- `ppo_policy_env.py`: finite reward/action contract only; no PPO trainer yet.

Promotion order: deterministic baseline -> linear policy -> DSPy/SFT/QLoRA -> preference/RL only with stable rewards.
