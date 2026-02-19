# python-services/test_embedding_service.py
import os
import numpy as np
import onnxruntime as ort
from transformers import AutoTokenizer

# Resolve project root based on this file's location
THIS_DIR = os.path.dirname(os.path.abspath(__file__))
PROJECT_ROOT = os.path.dirname(THIS_DIR)

MODEL_DIR = os.path.join(PROJECT_ROOT, "models", "embeddinggemma_300m_onnx")
MODEL_PATH = os.path.join(MODEL_DIR, "model.onnx")  # actual filename from export

print("=== EmbeddingGemma ONNX Test ===")
print("PROJECT_ROOT:", PROJECT_ROOT)
print("MODEL_DIR   :", MODEL_DIR)
print("MODEL_PATH  :", MODEL_PATH)
print()

if not os.path.exists(MODEL_PATH):
    raise FileNotFoundError(f"ONNX model not found at {MODEL_PATH}")

# Prefer CUDA if available; fall back to CPU
providers = [
    ("CUDAExecutionProvider", {"cudnn_conv_algo_search": "DEFAULT"}),
    "CPUExecutionProvider",
]

print("Loading ONNXRuntime session...")
session = ort.InferenceSession(MODEL_PATH, providers=providers)
print("Session providers:", session.get_providers())
print("Input names :", [i.name for i in session.get_inputs()])
print("Output names:", [o.name for o in session.get_outputs()])
print()

print("Loading tokenizer...")
tokenizer = AutoTokenizer.from_pretrained(MODEL_DIR)
print("Tokenizer loaded.")
print()

text = "A short legal sentence about breach of contract."
print("Text:", text)
enc = tokenizer(
    [text],
    padding=True,
    truncation=True,
    return_tensors="np",
)

inputs = {
    "input_ids": enc["input_ids"],
    "attention_mask": enc["attention_mask"],
}

print("Running inference...")
outputs = session.run(None, inputs)
embeds = outputs[0]  # shape: (batch, seq, 768) from your export log

print("Raw embedding tensor shape:", embeds.shape)

# Mean-pool over sequence dimension
pooled = embeds.mean(axis=1)  # (batch, 768)
print("Pooled embedding shape:", pooled.shape)
print("First 8 dims:", pooled[0, :8])
print("\n✅ EmbeddingGemma ONNX test completed successfully.")