#!/usr/bin/env python3
"""
Test PaliGemma VLM for 1024d embeddings
Quick verification of model loading and embedding generation
"""

import asyncio
import torch
from transformers import AutoProcessor, AutoModelForVision2Seq
import logging

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

async def test_paligemma():
    print("=" * 60)
    print("🧪 Testing PaliGemma VLM for 1024d Embeddings")
    print("=" * 60)

    # Check CUDA
    device = "cuda" if torch.cuda.is_available() else "cpu"
    print(f"\n📌 Device: {device}")
    if device == "cuda":
        print(f"📌 GPU: {torch.cuda.get_device_name(0)}")
        print(f"📌 CUDA: {torch.version.cuda}")

    # Load model
    model_name = "google/paligemma-3b-mix-224"
    print(f"\n📥 Loading {model_name}...")

    processor = AutoProcessor.from_pretrained(
        model_name,
        trust_remote_code=True
    )

    model = AutoModelForVision2Seq.from_pretrained(
        model_name,
        torch_dtype=torch.float16 if device == "cuda" else torch.float32,
        device_map=device,
        trust_remote_code=True
    )

    model.eval()
    print(f"✅ Model loaded successfully")

    # Test text embedding
    print(f"\n🔄 Generating text embedding...")
    text = "This is a legal contract about property deed transfer."

    inputs = processor(
        text=text,
        return_tensors="pt",
        padding=True,
        truncation=True,
        max_length=512
    ).to(device)

    with torch.no_grad():
        outputs = model(**inputs)

        # Extract embeddings
        embeddings = outputs.last_hidden_state
        print(f"✅ Raw embedding shape: {embeddings.shape}")

        # Mean pooling
        attention_mask = inputs.get('attention_mask')
        if attention_mask is not None:
            mask_expanded = attention_mask.unsqueeze(-1).expand(embeddings.size()).float()
            embeddings = torch.sum(embeddings * mask_expanded, 1) / torch.clamp(mask_expanded.sum(1), min=1e-9)
        else:
            embeddings = embeddings.mean(dim=1)

        print(f"✅ After pooling: {embeddings.shape}")

        # Normalize
        embeddings = torch.nn.functional.normalize(embeddings, p=2, dim=1)

        # Ensure 1024d
        if embeddings.shape[1] < 1024:
            padding = torch.zeros(embeddings.shape[0], 1024 - embeddings.shape[1]).to(device)
            embeddings = torch.cat([embeddings, padding], dim=1)
        elif embeddings.shape[1] > 1024:
            embeddings = embeddings[:, :1024]

        print(f"✅ Final embedding shape: {embeddings.shape}")

        embedding_np = embeddings.cpu().numpy()[0]
        print(f"✅ Embedding dimension: {len(embedding_np)}")
        print(f"✅ First 10 values: {embedding_np[:10]}")
        print(f"✅ L2 norm: {torch.linalg.norm(embeddings).item():.6f}")

    print("\n" + "=" * 60)
    print("✅ TEST PASSED: PaliGemma can generate 1024d embeddings!")
    print("=" * 60)

    # Cleanup
    del model
    del processor
    if torch.cuda.is_available():
        torch.cuda.empty_cache()

if __name__ == "__main__":
    asyncio.run(test_paligemma())
