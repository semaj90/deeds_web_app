# HuggingFace Model Registry

All model artifacts uploaded to [huggingface.co/Semaj90](https://huggingface.co/Semaj90) on April 9, 2026.

| Repo | Size | Description | Link |
|------|------|-------------|------|
| gemma3-legal-trt | 843 MB | TensorRT FP16 engine (Gemma 270M legal fine-tune via Unsloth LoRA) | [Semaj90/gemma3-legal-trt](https://huggingface.co/Semaj90/gemma3-legal-trt) |
| gemma3-legal-pytorch | 243 MB | PyTorch checkpoints (legal_ai_model.pt, int4_quantized, simple_q4km) | [Semaj90/gemma3-legal-pytorch](https://huggingface.co/Semaj90/gemma3-legal-pytorch) |
| embeddinggemma-300m-onnx | 324 MB | ONNX embedding model (768-dim, client-side inference) | [Semaj90/embeddinggemma-300m-onnx](https://huggingface.co/Semaj90/embeddinggemma-300m-onnx) |
| yolo-doc-layout | 28 MB | YOLO ONNX model for document layout detection | [Semaj90/yolo-doc-layout](https://huggingface.co/Semaj90/yolo-doc-layout) |
| phase44-checkpoints | 33 MB | Training checkpoints (batch + cache tensors) | [Semaj90/phase44-checkpoints](https://huggingface.co/Semaj90/phase44-checkpoints) |
| engine-builder-scripts | ~1 MB | TRT engine build scripts + config | [Semaj90/engine-builder-scripts](https://huggingface.co/Semaj90/engine-builder-scripts) |

## Restore locally

```bash
# Clone any repo back
hf download Semaj90/gemma3-legal-trt --local-dir ./gemma3-legal-trt
hf download Semaj90/embeddinggemma-300m-onnx --local-dir ./embeddinggemma-300m-onnx
```

## Next Steps

### Track 1: TurboQuant (GGUF + CUDA)
Clone [TheTom/turboquant_plus](https://github.com/TheTom/turboquant_plus), build with CUDA, serve:
```bash
git clone https://github.com/TheTom/turboquant_plus
cd turboquant_plus && cmake -B build -DGGML_CUDA=ON && cmake --build build -j
./build/bin/llama-server -m gemma4-rotorquant:latest.gguf -ctk turbo3 -ctv turbo3 --port 8090
```

### Track 2: LiteRT-LM (E2B model)
```bash
pip install litert-lm
# Download E2B model from registry
litert-lm serve --port 8070
```

### Track 3: VLM Reattach (Colab)
Run VLM reattach notebook on Google Colab (user-driven, GPU runtime required).
