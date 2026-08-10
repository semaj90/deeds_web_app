# Parent Atlas finite policy architecture

```text
canonical evidence
   -> OKF fit + HMM/Viterbi
   -> PolicyStateTensor (~30 dims)
   -> finite action/model/budget heads
   -> ExecutionBudget
   -> bounded async tool plan (<=3 tools)
   -> canonical revision reducer
   -> rerank + ACE residency
   -> Ornith/Gemma4 only when action requires generation
   -> compile/test
   -> RouteTrace
   -> offline policy/SFT/QLoRA experiments
```

## Mathematical roles

- `semantic_768`: vector in R^768; if normalized, on S^767; cosine/dot.
- policy state: small control vector in R^P.
- each linear action scorer: covector `w_a`; score `w_a^T x + b_a`.
- vector-valued nonlinear transform derivative: Jacobian/linear tangent map.
- scalar score derivative: gradient/covector.
- epsilon: numerical stability/convergence only.
- MapReduce analogy: map independent evidence passes; reduce by canonical identity + revision.

## ANN / clustering / topology

- Qdrant/HNSW or cuVS/CAGRA: nearest-neighbor owner.
- KMeans: coarse semantic partition, revision-time training.
- SOM 20x20: optional derived routing map, not ANN replacement.
- graph depth 1-4: Parent Atlas traversal budget, unrelated to HNSW hierarchy levels.
- tricubic/cubic interpolation: visualization/grid experiment only, not semantic ANN.

## Model training

Train the model to choose among allowed actions and use external memory; do not train repository facts
into the model. Preserve HMM state and allowed-action masks in SFT/QLoRA examples.
