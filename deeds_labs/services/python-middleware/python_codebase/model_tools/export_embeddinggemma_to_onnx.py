import torch
from transformers import AutoTokenizer, AutoModel
import os

MODEL_PATH = "/workspace/embeddinggemma_300m"
ONNX_OUT = "/tmp/embeddinggemma_300m_onnx"

os.makedirs(ONNX_OUT, exist_ok=True)

print("📥 Loading local embeddingGemma 300M...")
tokenizer = AutoTokenizer.from_pretrained(MODEL_PATH)
model = AutoModel.from_pretrained(MODEL_PATH, torch_dtype=torch.float16).cuda()

dummy = tokenizer("legal evidence", return_tensors="pt").to("cuda")

print("📤 Exporting embeddings to ONNX...")
torch.onnx.export(
    model,
    (dummy["input_ids"], dummy["attention_mask"]),
    f"{ONNX_OUT}/model_fp16.onnx",
    input_names=["input_ids", "attention_mask"],
    output_names=["embeddings"],
    opset_version=17,
    dynamic_axes={
        "input_ids": {0: "batch", 1: "sequence"},
        "attention_mask": {0: "batch", 1: "sequence"},
        "embeddings": {0: "batch", 1: "sequence"},
    }
)

print("✅ Exported to:", f"{ONNX_OUT}/model_fp16.onnx")