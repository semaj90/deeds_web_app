# parent-atlas-triton-trtllm-readiness

TensorRT-LLM/Triton readiness gates, recorded explicitly as NOT_PROVEN rather than assumed from adjacent GPU work. No installation, conversion, or routing changes yet — llama-server.exe :8090 stays canonical until this track independently proves out.

**2026-08-05**: candidate-model architecture notes added to proposal.md.
Ornith 1.0 9B (`hforf.gguf`) is a `qwen35` hybrid attention+SSM
architecture — a real risk flag for `MODEL_ARCHITECTURE_SUPPORTED` since
hybrid/recurrent architectures have historically lagged pure-attention
models in TensorRT-LLM's supported list. `gemma4-legal-iq4xs-direct.gguf`
is pure attention, the more conventional candidate. Neither has an HF
checkpoint locally, which likely blocks `CHECKPOINT_CONVERSION` for both
regardless of architecture support.
