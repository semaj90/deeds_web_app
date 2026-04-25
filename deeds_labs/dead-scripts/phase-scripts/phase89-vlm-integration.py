#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
Phase 89: VLM Integration Test
Integrates Gemma-3 VLM (1024d) with GPU-accelerated pipeline
Compares embeddinggemma:latest (768d) vs Gemma-3 VLM (1024d)
"""

import sys
import io
sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8')

import torch
import requests
import json
import time
import base64
from pathlib import Path
from typing import List, Dict, Any

class VLMIntegrationTest:
    """Test integration between Gemma-3 VLM and Phase 89 pipeline"""

    def __init__(self):
        self.ollama_url = "http://localhost:11434"
        self.vlm_service_url = "http://localhost:8001"
        self.device = torch.device('cuda' if torch.cuda.is_available() else 'cpu')

        print("=" * 70)
        print("Phase 89: VLM Integration Test")
        print("=" * 70)
        print(f"\nGPU Device: {self.device}")
        if torch.cuda.is_available():
            print(f"GPU: {torch.cuda.get_device_name(0)}")
            print(f"Memory: {torch.cuda.get_device_properties(0).total_memory / 1e9:.1f} GB")

    def test_ollama_embeddings(self, text: str) -> Dict[str, Any]:
        """Test embeddinggemma:latest (768d)"""
        print(f"\n1️⃣ Testing Ollama embeddinggemma:latest (768d)...")

        try:
            start_time = time.time()
            response = requests.post(
                f"{self.ollama_url}/api/embeddings",
                json={
                    "model": "embeddinggemma:latest",
                    "prompt": text
                },
                timeout=30
            )

            if response.status_code == 200:
                embedding = response.json()['embedding']
                elapsed = (time.time() - start_time) * 1000

                print(f"   ✅ Generated {len(embedding)}d embedding in {elapsed:.1f}ms")
                return {
                    "success": True,
                    "embedding": embedding,
                    "dimension": len(embedding),
                    "time_ms": elapsed,
                    "model": "embeddinggemma:latest"
                }
            else:
                print(f"   ❌ Ollama error: {response.status_code}")
                return {"success": False, "error": response.text}

        except Exception as e:
            print(f"   ❌ Error: {e}")
            return {"success": False, "error": str(e)}

    def test_vlm_service(self, text: str, image_path: str = None) -> Dict[str, Any]:
        """Test Gemma-3 VLM service (1024d)"""
        print(f"\n2️⃣ Testing Gemma-3 VLM service (1024d)...")

        try:
            # Check if service is running
            health_check = requests.get(f"{self.vlm_service_url}/health", timeout=5)

            if health_check.status_code != 200:
                print(f"   ⚠️ VLM service not responding (status: {health_check.status_code})")
                return {"success": False, "error": "Service not running"}

            print(f"   ✅ VLM service is healthy")

            # Prepare request
            request_data = {
                "texts": [text],
                "images": [],
                "chunk_ids": ["test_chunk_001"]
            }

            # Add image if provided
            if image_path and Path(image_path).exists():
                with open(image_path, 'rb') as f:
                    image_b64 = base64.b64encode(f.read()).decode('utf-8')
                    request_data["images"] = [image_b64]
                print(f"   📷 Including image: {image_path}")

            # Generate embedding
            start_time = time.time()
            response = requests.post(
                f"{self.vlm_service_url}/embed",
                json=request_data,
                timeout=60
            )

            if response.status_code == 200:
                result = response.json()
                elapsed = (time.time() - start_time) * 1000

                embeddings = result['embeddings']
                dimension = len(embeddings[0]) if embeddings else 0
                modality = result['modalities'][0] if result['modalities'] else "unknown"

                print(f"   ✅ Generated {dimension}d embedding in {elapsed:.1f}ms")
                print(f"   📊 Modality: {modality}")

                return {
                    "success": True,
                    "embedding": embeddings[0],
                    "dimension": dimension,
                    "time_ms": elapsed,
                    "model": result['model_name'],
                    "modality": modality
                }
            else:
                print(f"   ❌ VLM service error: {response.status_code}")
                return {"success": False, "error": response.text}

        except requests.exceptions.ConnectionError:
            print(f"   ⚠️ VLM service not running")
            print(f"   💡 Start with: python backend/services/gemma_vlm_embedding_service.py")
            return {"success": False, "error": "Service not available"}
        except Exception as e:
            print(f"   ❌ Error: {e}")
            return {"success": False, "error": str(e)}

    def compare_embeddings(self, ollama_result: Dict, vlm_result: Dict):
        """Compare embedding quality and dimensions"""
        print(f"\n3️⃣ Comparing Embeddings...")

        if not ollama_result.get("success") or not vlm_result.get("success"):
            print("   ⚠️ Cannot compare - one or both services failed")
            return

        ollama_emb = torch.tensor(ollama_result["embedding"])
        vlm_emb = torch.tensor(vlm_result["embedding"])

        print(f"\n   📊 Dimension Comparison:")
        print(f"      Ollama:  {ollama_result['dimension']}d (embeddinggemma:latest)")
        print(f"      VLM:     {vlm_result['dimension']}d (Gemma-3 VLM)")

        print(f"\n   ⚡ Performance:")
        print(f"      Ollama:  {ollama_result['time_ms']:.1f}ms")
        print(f"      VLM:     {vlm_result['time_ms']:.1f}ms")
        print(f"      Speedup: {vlm_result['time_ms'] / ollama_result['time_ms']:.2f}x slower")

        # L2 norms
        ollama_norm = torch.norm(ollama_emb).item()
        vlm_norm = torch.norm(vlm_emb).item()

        print(f"\n   📏 L2 Norms:")
        print(f"      Ollama:  {ollama_norm:.4f}")
        print(f"      VLM:     {vlm_norm:.4f}")

        print(f"\n   💡 Recommendation:")
        if vlm_result['dimension'] > ollama_result['dimension']:
            print(f"      VLM provides {vlm_result['dimension'] - ollama_result['dimension']} extra dimensions")
            print(f"      for multimodal (text+image+layout+seal) information")

        if vlm_result.get('modality') == 'multimodal':
            print(f"      ✨ VLM used multimodal fusion - richer embeddings!")

    def test_qdrant_storage(self, embeddings: List[float], collection: str = "phase89_vlm_test"):
        """Test storing VLM embeddings in Qdrant"""
        print(f"\n4️⃣ Testing Qdrant Storage...")

        try:
            from qdrant_client import QdrantClient
            from qdrant_client.models import Distance, VectorParams, PointStruct

            qdrant = QdrantClient(url="http://localhost:6333")

            # Check/create collection
            try:
                qdrant.get_collection(collection)
                print(f"   ✅ Collection '{collection}' exists")
            except:
                print(f"   📦 Creating collection '{collection}'...")
                qdrant.create_collection(
                    collection_name=collection,
                    vectors_config=VectorParams(
                        size=len(embeddings),
                        distance=Distance.COSINE
                    )
                )
                print(f"   ✅ Created {len(embeddings)}d collection")

            # Store embedding
            point = PointStruct(
                id=int(time.time() * 1000),
                vector=embeddings,
                payload={
                    "text": "VLM integration test",
                    "timestamp": time.time(),
                    "model": "gemma-3-vlm",
                    "dimension": len(embeddings)
                }
            )

            qdrant.upsert(collection_name=collection, points=[point])
            print(f"   ✅ Stored {len(embeddings)}d vector in Qdrant")

            # Verify
            collection_info = qdrant.get_collection(collection)
            print(f"   📊 Collection now has {collection_info.points_count} vectors")

        except Exception as e:
            print(f"   ❌ Qdrant error: {e}")

def main():
    test = VLMIntegrationTest()

    # Test text
    sample_text = """
    This is a legal document regarding property deed requirements.
    The notarization must be completed within 30 days.
    All parties must sign in the presence of a notary public.
    """

    # Run tests
    ollama_result = test.test_ollama_embeddings(sample_text)
    vlm_result = test.test_vlm_service(sample_text)

    # Compare
    test.compare_embeddings(ollama_result, vlm_result)

    # Store to Qdrant if VLM succeeded
    if vlm_result.get("success"):
        test.test_qdrant_storage(vlm_result["embedding"])

    print("\n" + "=" * 70)
    print("✅ VLM Integration Test Complete!")
    print("=" * 70)

    # Summary
    print("\n📋 Summary:")
    print(f"   Ollama (768d):  {'✅ Working' if ollama_result.get('success') else '❌ Failed'}")
    print(f"   VLM (1024d):    {'✅ Working' if vlm_result.get('success') else '❌ Failed'}")

    if not vlm_result.get("success"):
        print("\n💡 To start VLM service:")
        print("   python backend/services/gemma_vlm_embedding_service.py")

if __name__ == "__main__":
    main()
