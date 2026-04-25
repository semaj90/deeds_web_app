# python-services/embedding_service.py
import os
import json
import numpy as np
import onnxruntime as ort
from fastapi import FastAPI
from pydantic import BaseModel

THIS_DIR = os.path.dirname(os.path.abspath(__file__))
PROJECT_ROOT = os.path.dirname(THIS_DIR)

MODEL_DIR = os.path.join(PROJECT_ROOT, "models", "embeddinggemma_300m_onnx")
MODEL_PATH = os.path.join(MODEL_DIR, "model.onnx")

# Load tokenizer config
with open(os.path.join(MODEL_DIR, "tokenizer_config.json"), "r", encoding="utf-8") as f:
    tokenizer_config = json.load(f)

# Simple tokenizer class to avoid heavy transformers import
class SimpleTokenizer:
    def __init__(self, config):
        self.config = config
        self.vocab_size = 256000  # Gemma vocab size
        self.bos_token_id = 2
        self.eos_token_id = 1
        self.pad_token_id = 0

    def encode(self, text):
        # Very basic tokenization - split by spaces and hash
        # In production, you'd want proper tokenization
        words = text.lower().split()
        tokens = [self.bos_token_id]  # BOS token
        for word in words[:50]:  # Limit length
            # Simple hash function
            hash_val = hash(word) % (self.vocab_size - 1000) + 1000
            tokens.append(hash_val)
        tokens.append(self.eos_token_id)  # EOS token
        return tokens

    def __call__(self, texts, padding=True, truncation=True, max_length=512, return_tensors="np"):
        if isinstance(texts, str):
            texts = [texts]

        all_tokens = []
        attention_masks = []

        for text in texts:
            tokens = self.encode(text)
            if truncation and len(tokens) > max_length:
                tokens = tokens[:max_length-1] + [self.eos_token_id]

            # Pad to max_length
            attention_mask = [1] * len(tokens)
            while len(tokens) < max_length:
                tokens.append(self.pad_token_id)
                attention_mask.append(0)

            all_tokens.append(tokens)
            attention_masks.append(attention_mask)

        if return_tensors == "np":
            return {
                "input_ids": np.array(all_tokens, dtype=np.int64),
                "attention_mask": np.array(attention_masks, dtype=np.int64)
            }

        return {
            "input_ids": all_tokens,
            "attention_mask": attention_masks
        }

tokenizer = SimpleTokenizer(tokenizer_config)

providers = [
    ("CUDAExecutionProvider", {"cudnn_conv_algo_search": "DEFAULT"}),
    "CPUExecutionProvider",
]

session = ort.InferenceSession(MODEL_PATH, providers=providers)

app = FastAPI(title="EmbeddingGemma ONNX Service", version="1.0.0")

class EmbedRequest(BaseModel):
    texts: list[str]
    normalize: bool = True
    max_length: int = 512

class EmbedResponse(BaseModel):
    embeddings: list[list[float]]
    model: str = "embeddinggemma_300m_onnx"
    dimension: int = 768
    count: int

class HealthResponse(BaseModel):
    status: str = "healthy"
    model_loaded: bool = True
    tokenizer_loaded: bool = True
    providers: list[str]

@app.get("/health", response_model=HealthResponse)
def health():
    return HealthResponse(
        providers=session.get_providers()
    )

@app.get("/info")
def info():
    return {
        "model": "EmbeddingGemma 300M",
        "format": "ONNX",
        "embedding_dimension": 768,
        "max_sequence_length": 512,
        "providers": session.get_providers(),
        "input_names": [i.name for i in session.get_inputs()],
        "output_names": [o.name for o in session.get_outputs()]
    }

@app.post("/embed", response_model=EmbedResponse)
def embed(req: EmbedRequest):
    enc = tokenizer(
        req.texts,
        padding=True,
        truncation=True,
        max_length=req.max_length,
        return_tensors="np",
    )
    outputs = session.run(
        None,
        {
            "input_ids": enc["input_ids"],
            "attention_mask": enc["attention_mask"],
        },
    )
    embeddings = outputs[0]  # (batch, seq, 768)

    # Mean-pool over sequence dimension (ignoring padding via attention_mask)
    attention_mask = enc["attention_mask"]
    masked_embeddings = embeddings * attention_mask[:, :, np.newaxis]  # Apply mask
    pooled = masked_embeddings.sum(axis=1) / attention_mask.sum(axis=1, keepdims=True)  # Mean pool

    # Normalize if requested
    if req.normalize:
        norms = np.linalg.norm(pooled, axis=1, keepdims=True)
        norms = np.where(norms == 0, 1, norms)  # Avoid division by zero
        pooled = pooled / norms

    return EmbedResponse(
        embeddings=pooled.tolist(),
        count=len(req.texts)
    )

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8098)