# Parent Atlas decision-function family

This module prevents three different concerns from being collapsed into one knob.

```text
MODEL FAMILY
  PyTorch | XGBoost | logistic regression | SVM | ordinal | transformer

TRAINING / POST-TRAINING
  SFT | PEFT/LoRA | DPO | PPO | reward modeling

DECISION / NORMALIZATION
  argmax | top-k | softmax | sigmoid | sparsemax | experimental square/polynomial families
```

Executors are a fourth axis:

```text
TypeScript/CPU
PyTorch CPU/CUDA
LibTorch CPU/CUDA
Triton
TensorRT-RTX
WebGPU
XGBoost CPU/CUDA
```

## Defaults

- mutually exclusive classification -> softmax probabilities; argmax/top-k only after scores/probabilities when an index is needed
- independent multi-label classification -> sigmoid
- sparse classification challenger -> sparsemax, measured against softmax/calibration metrics
- ordered outcomes -> ordinal-regression model/objective, not arbitrary softmax replacement
- XGBoost -> one model family; `device=cpu` or `device=cuda` is executor selection
- PEFT/LoRA -> weight adaptation; not an inference normalization function
- DPO/PPO -> post-training objectives; runtime policy/action selection remains separately receipted
- pretrained transformer attention -> preserve softmax unless a model-specific retraining/quality receipt proves another normalization

## GPU route

```text
REFERENCE
TypeScript / PyTorch CPU
        |
        v
GPU REFERENCE
LibTorch / PyTorch CUDA
        |
        +--> TensorRT-RTX native: SoftMax, Sigmoid, TopK
        |
        +--> Triton: fused/challenger kernels
        |
        +--> WebGPU: browser visualization/lightweight inference
```

TensorRT-RTX custom Sparsemax/Squaremax/Polynomial implementations require an explicit plugin or graph-composition proof. Do not infer native support from the existence of a similarly named research method.

## Attention experiments

`SQUAREMAX` in Parent Atlas currently means only the explicitly receipted experimental squared-normalization reference implemented by this branch. It is **not** claimed to be a standardized algorithm or a drop-in replacement for pretrained attention.

Any replacement attention experiment must record at minimum:

- model revision
- adapter/training revision
- baseline softmax metrics
- perplexity / task accuracy
- attention-output error
- generation regression rate
- latency and memory
- executor/environment receipt

`POLYNOMIAL` remains a family placeholder until an exact polynomial, coefficient set, normalization rule, and stability interval are revisioned.

## Interpolation

Linear interpolation (`lerp`) is a utility subfunction, not a classifier. It can be used to blend calibrated priors, scheduling parameters, visualization values, or experimentally interpolate model/runtime policy parameters. Interpolating two probability vectors does not prove calibration and must not create a second evidence vote.

## TODO(test later)

1. Run TypeScript reference tests.
2. Add LibTorch translation unit to isolated CMake target; prove CPU/CUDA parity.
3. Promote Triton fused softmax only for shapes that beat PyTorch/cuBLAS on the 3060 Ti.
4. Bind TensorRT-RTX native SoftMax/Sigmoid/TopK only after Windows environment receipt passes.
5. Add WebGPU stable-softmax reduction only if browser-side classification/visualization needs it.
6. Evaluate Sparsemax calibration/sparsity against baseline softmax.
7. Keep Squaremax/Polynomial attention disabled until retraining + quality receipts exist.
8. Route XGBoost CPU/CUDA through the existing classification executor policy rather than counting both as evidence.
9. Keep DPO/PPO/PEFT training receipts separate from runtime decision-function receipts.
