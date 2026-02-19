# Ollama / Gemma3 embedding wrapper (placeholder)
import numpy as np

def get_gemma_embedding(text_or_doc_id: str) -> np.ndarray:
    # TODO: call Ollama/Gemma3 locally or remote to get embeddings
    return np.zeros((768,), dtype=np.float32)
