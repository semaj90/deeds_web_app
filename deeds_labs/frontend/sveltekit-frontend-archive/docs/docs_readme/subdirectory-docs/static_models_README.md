# Models Directory

This directory should contain GGUF format model files for WebAssembly inference.

## Expected Models

- `gemma-3-legal-8b-q4_k_m.gguf` - Quantized Gemma 3 Legal model
- Other GGUF format models as needed

## Current Status

❌ **Missing**: GGUF model files not yet downloaded

## Model Sources

GGUF models can be downloaded from:

- **Hugging Face**: https://huggingface.co/models?library=gguf
- **Ollama**: Convert existing models to GGUF format
- **llama.cpp**: Official model repository

## File Size Considerations

- **8B Q4_K_M**: ~4.8GB
- **8B Q6_K**: ~6.2GB
- **8B F16**: ~15GB

## Current Ollama Models

Your system already has these Ollama models available:

- `gemma3-legal:latest` (7.3 GB)
- `nomic-embed-text:latest` (274 MB)
- `deeds-web:latest` (3.0 GB)

## Fallback Behavior

When GGUF models are unavailable, the system uses existing Ollama models via:

- Go Enhanced RAG Service (port 8094)
- Direct Ollama API (port 11434)
