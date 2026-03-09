Phase H: Adaptive Bridge (FastAPI + HMM + QLoRA trainer)

Components:
- analytics_bridge.py - FastAPI bridge to ingest analytics events and return predicted intents
- behavior_router.py - background HMM consumer that predicts next intent per user
- qlora_trainer_stream.py - simplified trainer stream that watches RL feedback and enqueues adapter checkpoints
- adapter_merge_worker.py - existing worker that merges adapter checkpoints (PEFT-aware)

Quick start (development):

1. Start Redis (local or docker-compose)
2. Start the behavior router in background:
   python native/autoencoder/behavior_router.py
3. Start the QLoRA trainer stream (simulated):
   python native/autoencoder/qlora_trainer_stream.py
4. Start the analytics bridge (FastAPI):
   uvicorn native.autoencoder.analytics_bridge:app --port 8001 --reload

Notes:
- The trainer stream and adapter merging in this repo are scaffolds for demonstration. Replacing the synthetic adapter checkpoint generator
  with a PEFT-based trainer requires installing `peft`, `bitsandbytes`, and `torch` and adjusting the checkpoint-writing logic.

## Docker stack (GPU + CPU fallback)

The compose file at the repository root now launches the full Phase H+ bridge:

```powershell
# Build GPU-enabled services (Triton, QLoRA trainer, analytics bridge, CPU fallback)
docker compose build analytics-bridge behavior-router qlora-trainer adapter-merge-worker cpu-synthesizer triton

# Start the core adaptive loop
docker compose up analytics-bridge behavior-router qlora-trainer adapter-merge-worker cpu-synthesizer triton
```

Validation checklist:

- `./native/autoencoder/scripts/gpu-diagnostics.sh` &mdash; verifies host drivers, Docker runtime and GPU visibility.
- `curl http://localhost:8000/v2/health/ready` &mdash; Triton (TensorRT-LLM) ready status.
- `curl http://localhost:8001/health` &mdash; FastAPI analytics bridge healthy.
- `curl http://localhost:8101/health` &mdash; CPU synthesizer fallback reachable.

The new `cpu-synthesizer` service exposes `/synthesize` (heuristic CPU summary) and records events to the `cpu.synthesized`
Redis stream. The analytics bridge continues to serve GPU-backed inference when available.

## Synthetic event generator

To replay analytics and RL feedback into Redis for local testing:

```bash
python native/autoencoder/scripts/replay_analytics.py --events 50 --users 4 --feedback --delay 0.1
```

This writes to the `user.analytics` and `rl.feedback` streams and is safe to run while the docker stack is online.

# Autoencoder Native Pipeline (Phases F & G)

This directory now houses the end-to-end training and deployment scaffolding
for the adaptive SOM autoencoder, QLoRA adapters, distributed GPU training,
and Triton Inference Server integration.

```
native/autoencoder/
├─ artifacts/                  # Generated models (TorchScript/ONNX/plan/etc.)
├─ distributed_train.py        # Phase G DDP trainer (torchrun entry point)
├─ train_autoencoder.py        # Phase F trainer + optional QLoRA adapter
├─ cluster_trainer.py          # SOM→KMeans clustering snapshot + Redis cache
├─ launch_triton.py            # Sync artifacts + launch Triton server
├─ requirements.txt            # Python dependencies
├─ som_autoencoder.cpp/.h      # Libtorch executable
├─ CMakeLists.txt              # Builds native/WASM binaries
└─ triton_model_repository/    # Triton model repository skeleton
```

---

## Phase F – Adaptive RAG + QLoRA Loop

1. **Install dependencies**
   ```bash
   python -m venv .venv
   source .venv/bin/activate
   pip install -r requirements.txt
   ```

2. **Train autoencoder + optional QLoRA adapter**
   ```bash
   python train_autoencoder.py \
     ../../data/embeddings.pt \
     ./artifacts \
     --train-adapter \
     --grpo-feedback ../../data/grpo_feedback.json
   ```

   Outputs include `som_autoencoder.pt`, `model.onnx`, `model.plan`,
   `foaf_latents.pt`, and `adapter_legal_qlora/`.

3. **Generate SOM→KMeans cluster snapshot (and push to Redis)**
   ```bash
   python cluster_trainer.py \
     ./artifacts/foaf_latents.pt \
     ./artifacts \
     --k 32 \
     --redis-url redis://localhost:6379/0
   ```

4. **Run the GRPO reinforcement worker (optional)**
   ```bash
   python ../scripts/rl_train_worker.py \
     --redis-url redis://localhost:6379/0 \
     --adapter-path ./artifacts/adapter_legal_qlora
   ```

---

## Phase G – Distributed GPU + Triton Serving

### Distributed Autoencoder Training (torchrun + NCCL)

1. Create a config JSON:
   ```json
   {
     "embeddings_path": "../../data/embeddings.pt",
     "output_dir": "./artifacts",
     "latent_dim": 128,
     "epochs": 8,
     "batch_size": 1024,
     "learning_rate": 0.0001
   }
   ```

2. Launch with torchrun:
   ```bash
   torchrun --nproc_per_node=4 --nnodes=1 \
     distributed_train.py config.json
   ```

This writes `som_autoencoder_distributed.pt`, which can be fed back into
`train_autoencoder.py` or directly exported to TensorRT/Triton.

### Triton Model Repository & Server

1. Synchronize the latest TorchScript model into the repository:
   ```bash
   python launch_triton.py --artifacts ./artifacts --repository ./triton_model_repository
   ```

2. Optional: start Triton Inference Server (requires Docker + GPU):
   ```bash
   python launch_triton.py \
     --artifacts ./artifacts \
     --repository ./triton_model_repository \
     --run \
     --http-port 8000 --grpc-port 8001 --metrics-port 8002
   ```

The orchestrator can now reach Triton via `TRITON_URL=http://localhost:8000`.

---

## Building Native and WASM Targets

Native (libtorch / optional TensorRT):
```bash
cmake -B build \
  -DCMAKE_PREFIX_PATH=/path/to/libtorch \
  -DTORCHSCRIPT_MODEL=./artifacts/som_autoencoder.pt
cmake --build build --config Release
```

WASM (Emscripten):
```bash
emcmake cmake -B build -DCMAKE_BUILD_TYPE=Release -DBUILD_WASM=ON
emmake make -C build
```

---

## Environment Hooks & Integration

- `TRITON_URL` – if set, `runAutoencoder()` in the orchestrator uses Triton
  (`/v2/models/autoencoder/infer`) before falling back to the native binary.
- Redis keys populated by `cluster_trainer.py`:
  - `foaf:cluster:model` – snapshot metadata
  - `foaf:kmeans:centroids` – centroid vectors for quick lookup
  - `foaf:cluster:<id>:members` – semantic neighborhoods

---

## Additional Notes

- `requirements.txt` now includes `tritonclient[http]` and `redis`.
- `distributed_train.py` expects NCCL; when using CPUs only, change
  `backend` to `gloo` in the config JSON.
- The Triton Python backend (`triton_model_repository/autoencoder/1/model.py`)
  loads `model.pt` and emits both reconstruction and latent vectors.
