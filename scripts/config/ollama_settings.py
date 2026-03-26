"""
Central Ollama inference settings for all scripts.

Override per-env with:
  OLLAMA_URL=http://...  LLM_MODEL=gemma3-legal:latest  python script.py

Profiles:
  EVAL_OPTIONS     — deterministic, short output (evals + indexing)
  GEN_OPTIONS      — creative, longer output (case generation)
  CITATION_OPTIONS — medium creativity, citation-focused
  ADVERSARIAL_OPTIONS — low temp, focused reasoning
"""
import os

OLLAMA_URL = os.getenv("OLLAMA_URL", "http://127.0.0.1:11434")
LLM_MODEL  = os.getenv("LLM_MODEL",  "gemma3-legal:latest")
EMBED_MODEL = os.getenv("EMBED_MODEL", "embeddinggemma:latest")

# ── Timeout (seconds) ─────────────────────────────────────────────────────────
# gemma3-legal 11.8B Q4_K_M @ 6.6 t/s, partially CPU-offloaded:
#   200 tokens ≈ 30s on GPU-only, ~90-120s with CPU offload
LLM_TIMEOUT = int(os.getenv("LLM_TIMEOUT", "240"))

# ── Inference profiles ────────────────────────────────────────────────────────

# Deterministic short output — for indexing summaries, retrieval labels
EVAL_OPTIONS: dict = {
    "temperature": 0.1,
    "num_predict": 150,
    "top_p":        0.9,
    "top_k":        40,
    "repeat_penalty": 1.1,
}

# Creative generation — for fictional case narratives
GEN_OPTIONS: dict = {
    "temperature": 0.7,
    "num_predict": 600,
    "top_p":        0.9,
    "top_k":        40,
    "repeat_penalty": 1.1,
}

# Citation-focused — moderate creativity, enough tokens for full citations
CITATION_OPTIONS: dict = {
    "temperature": 0.3,
    "num_predict": 350,
    "top_p":        0.9,
    "top_k":        40,
    "repeat_penalty": 1.1,
}

# Adversarial reasoning — low temp, short focused verdict
ADVERSARIAL_OPTIONS: dict = {
    "temperature": 0.2,
    "num_predict": 250,
    "top_p":        0.9,
    "top_k":        40,
    "repeat_penalty": 1.1,
}
