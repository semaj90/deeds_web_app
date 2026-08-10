# Parent Atlas policy routing integration

## Why

Parent Atlas now has distinct OKF fit scores and a typed HMM observation path, but the next action,
model target, execution budget, concurrency limit, and residency decision still need one bounded
control contract. Without it, future SOM/QLoRA/DSPy/PPO experiments risk becoming parallel runtime
owners or bypassing graph/retrieval provenance.

## What

Add a finite `PolicyStateTensor` compiled from existing OKF/HMM/retrieval/graph/execution/resource
signals. Score a finite action/model/budget space with a deterministic baseline and optional trained
linear heads. Keep model tool concurrency under the Atlas orchestrator, reduce asynchronous results by
canonical identity + revision rather than arrival order, and provide offline geometry/SOM/training
experiments that cannot become canonical owners accidentally.

## Non-goals

- Do not unblock or implement Patch H before graph freshness/revision proof.
- Do not replace HMM/Viterbi.
- Do not create another retrieval/RRF/rerank owner.
- Do not make SOM coordinates, ANN IDs, or policy tensors canonical packet identity.
- Do not train PPO or QLoRA from unverified model guesses.
