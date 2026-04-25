# SOM Autoencoder Native Scaffold

This directory contains the native + WASM build pipeline for the SOM autoencoder
and the companion Python training scripts used in Phase F.

## Requirements
- PyTorch C++ (libtorch)
- TensorRT SDK (optional for `.plan` export)
- Emscripten (for WASM fallback)

## Train (Python → TorchScript → TensorRT)

```bash
# 1. Train autoencoder + optional QLoRA adapter
python train_autoencoder.py \
  ../../data/embeddings.pt \
  ./artifacts \
  --latent-dim 64 --epochs 15 --train-adapter --grpo-feedback ../../data/grpo_feedback.json

# 2. Produce SOM→KMeans cluster snapshot (and optionally publish to Redis)
python cluster_trainer.py \
  ./artifacts/foaf_latents.pt \
  ./artifacts \
  --k 32 --redis-url redis://localhost:6379/0
```

The training scripts emit:

| File | Purpose |
| ---- | ------- |
| `som_autoencoder.pt` | TorchScript model consumed by libtorch (`som_autoencoder.cpp`). |
| `som_autoencoder.onnx` | ONNX graph for TensorRT conversion. |
| `foaf_kmeans.joblib` | scikit-learn model with centroids/assignments. |
| `cluster_model.json` | Snapshot read by `cluster-service.ts`. |

## Build (libtorch / TensorRT)
```bash
cd native/autoencoder
cmake -B build \
  -DCMAKE_PREFIX_PATH=/path/to/libtorch \
  -DTORCHSCRIPT_MODEL=./artifacts/som_autoencoder.pt
cmake --build build --config Release
```

## Export TorchScript → ONNX → TensorRT
```python
import torch

class SomAutoEncoder(torch.nn.Module):
    def __init__(self):
        super().__init__()
        # TODO: define architecture
    def forward(self, x):
        return x

model = SomAutoEncoder().eval()
torch.jit.save(torch.jit.script(model), "model.pt")

torch.onnx.export(model, torch.randn(1, 128), "model.onnx")
```

```bash
/usr/src/tensorrt/bin/trtexec --onnx=model.onnx --saveEngine=model.plan
```

## Build WASM Fallback (Emscripten)
```bash
emcmake cmake -B build -DCMAKE_BUILD_TYPE=Release
emmake make
# Produces som_autoencoder.wasm + som_autoencoder.js (path depends on your setup)
```

### Notes

- Place `som_autoencoder.js/.wasm` where Vite/SvelteKit can import them. The
  `autoencoder-wasm.ts` loader defaults to `/native/autoencoder/som_autoencoder.js`.
- `cluster_trainer.py` can push centroids + membership into Redis so the
  orchestrator immediately sees the new snapshot (`foaf:cluster:model`).
- `../../scripts/rl_train_worker.py` provides a Redis-backed GRPO loop that
  updates QLoRA adapters from feedback emitted by the orchestrator.
