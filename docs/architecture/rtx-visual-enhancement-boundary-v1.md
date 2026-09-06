# RTX Visual Enhancement Boundary V1

## Rule

Visual enhancement is presentation/media infrastructure. It does not own:

- ACE packet identity
- retrieval identity
- ontology truth
- structural identity
- semantic truth
- DAG scheduling truth

## Capability mapping

| Capability | Use | Parent Atlas role |
|---|---|---|
| DLSS Super Resolution | temporal game/render upscaling | optional UI/render integration only |
| DLSS Ray Reconstruction | ray-traced denoising/reconstruction | optional 3D/render integration only |
| DLSS Frame Generation | generated display frames | do not target on RTX 3060 Ti |
| RTX Video Super Resolution | video/media enhancement | optional media preview path |
| NVIDIA Image Scaling | spatial upscaling/sharpening | optional render/UI path |
| TensorRT-RTX | optimized neural inference | useful for small classifiers/rerankers/upscalers after benchmark |
| cuML/cuVS/cuGraph/CuPy | data/ML/retrieval/graph compute | Parent Atlas GPU execution lanes |

## "Loading screen" rule

A loading/progress UI may consume `DagTimeBudgetV1`, but progress must be based on
observed/completed DAG nodes and historical timing receipts. Do not fabricate smooth progress.

```text
DAG receipts
    -> timing estimator
    -> predicted remaining time
    -> UI
```

DLSS does not shorten the retrieval DAG. It may only improve rendering quality/perceived
smoothness in a compatible graphics pipeline.
