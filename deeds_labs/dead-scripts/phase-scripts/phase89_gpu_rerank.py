#!/usr/bin/env python3
"""
Phase 89: GPU Rerank Engine
After Qdrant returns candidates, rerank on GPU with FP16 cosine similarity
"""

import sys
import time
from typing import List, Dict, Tuple, Optional
from dataclasses import dataclass

if sys.platform == "win32":
    sys.stdout.reconfigure(encoding='utf-8')

import torch
import numpy as np
from qdrant_client import QdrantClient
from qdrant_client.models import PointStruct


@dataclass
class RerankResult:
    """Result of GPU reranking"""
    point_id: int
    score: float  # Cosine similarity (0-1)
    payload: Dict
    confidence: str  # miss|verify|safe_reuse


class GPURerankEngine:
    """
    GPU-accelerated reranking engine for semantic search.

    Threshold policy:
    - < 0.38: MISS - treat as cache miss, compute fresh
    - 0.38-0.55: VERIFY - use but verify/run smaller diff
    - > 0.55: SAFE_REUSE - strong prior, safe to reuse
    """

    def __init__(
        self,
        device: str = "cuda",
        threshold_miss: float = 0.38,
        threshold_verify: float = 0.55
    ):
        self.device = torch.device(device if torch.cuda.is_available() else "cpu")
        self.threshold_miss = threshold_miss
        self.threshold_verify = threshold_verify

        print(f"🎮 GPU Rerank Engine initialized")
        print(f"   Device: {self.device}")
        print(f"   Thresholds: MISS<{threshold_miss} | VERIFY<{threshold_verify} | SAFE>{threshold_verify}")

        if self.device.type == "cuda":
            print(f"   GPU: {torch.cuda.get_device_name(0)}")
            print(f"   VRAM: {torch.cuda.get_device_properties(0).total_memory / 1e9:.1f}GB")

    def cosine_similarity_gpu(
        self,
        query_embedding: torch.Tensor,
        candidate_embeddings: torch.Tensor
    ) -> torch.Tensor:
        """
        Compute cosine similarity on GPU with FP16 for speed.

        Args:
            query_embedding: [1, dim] tensor
            candidate_embeddings: [N, dim] tensor

        Returns:
            scores: [N] tensor of cosine similarities
        """
        # Convert to FP16 for 2x speed on RTX 3060 Ti
        query_fp16 = query_embedding.to(self.device, dtype=torch.float16)
        candidates_fp16 = candidate_embeddings.to(self.device, dtype=torch.float16)

        # Normalize (eps=1e-8 prevents division by zero)
        query_norm = torch.nn.functional.normalize(query_fp16, p=2, dim=1, eps=1e-8)
        candidates_norm = torch.nn.functional.normalize(candidates_fp16, p=2, dim=1, eps=1e-8)

        # Cosine similarity = dot product of normalized vectors
        scores = torch.matmul(query_norm, candidates_norm.T).squeeze(0)

        # Convert back to FP32 for precision and handle NaN
        scores_fp32 = scores.to(torch.float32)
        scores_fp32 = torch.nan_to_num(scores_fp32, nan=0.0)

        return scores_fp32

    def rerank(
        self,
        query_embedding: np.ndarray,
        candidates: List[Tuple[int, np.ndarray, Dict]]
    ) -> List[RerankResult]:
        """
        Rerank candidates on GPU.

        Args:
            query_embedding: Query embedding (768-dim)
            candidates: List of (point_id, embedding, payload)

        Returns:
            Sorted list of RerankResult (highest score first)
        """
        if not candidates:
            return []

        # Convert to tensors (use numpy array first for better performance)
        query_tensor = torch.from_numpy(np.array(query_embedding, dtype=np.float32)).unsqueeze(0)  # [1, 768]

        # Stack embeddings efficiently
        candidate_array = np.array([emb for _, emb, _ in candidates], dtype=np.float32)
        candidate_embeddings = torch.from_numpy(candidate_array)  # [N, 768]

        # GPU rerank
        start_time = time.perf_counter()
        scores = self.cosine_similarity_gpu(query_tensor, candidate_embeddings)
        gpu_time = (time.perf_counter() - start_time) * 1000

        # Convert back to CPU numpy
        scores_np = scores.cpu().numpy()

        # Create results with confidence levels
        results = []
        for (point_id, _, payload), score in zip(candidates, scores_np):
            score_float = float(score)

            # Determine confidence
            if score_float < self.threshold_miss:
                confidence = "miss"
            elif score_float < self.threshold_verify:
                confidence = "verify"
            else:
                confidence = "safe_reuse"

            results.append(RerankResult(
                point_id=point_id,
                score=score_float,
                payload=payload,
                confidence=confidence
            ))

        # Sort by score descending
        results.sort(key=lambda r: r.score, reverse=True)

        print(f"   ⚡ GPU rerank: {len(candidates)} candidates in {gpu_time:.2f}ms")

        return results

    def rerank_qdrant_results(
        self,
        query_embedding: np.ndarray,
        qdrant_results: List
    ) -> List[RerankResult]:
        """
        Rerank results from Qdrant search.

        Args:
            query_embedding: Query embedding (768-dim)
            qdrant_results: Results from qdrant_client.search()

        Returns:
            Sorted list of RerankResult
        """
        candidates = [
            (result.id, result.vector, result.payload)
            for result in qdrant_results
        ]

        return self.rerank(query_embedding, candidates)


def demo_gpu_rerank():
    """Demo the GPU rerank engine"""
    print("🧪 GPU Rerank Engine Demo")
    print("=" * 70)

    # Create engine
    engine = GPURerankEngine()

    # Generate dummy query and candidates
    dim = 768
    query = np.random.randn(dim).astype(np.float32)

    # Create candidates with varying similarity
    n_candidates = 200
    candidates = []

    for i in range(n_candidates):
        # Create embedding with controlled similarity
        if i < 20:
            # High similarity (0.6-0.9)
            noise_scale = 0.3
        elif i < 100:
            # Medium similarity (0.4-0.6)
            noise_scale = 0.7
        else:
            # Low similarity (<0.4)
            noise_scale = 1.5

        emb = query + np.random.randn(dim).astype(np.float32) * noise_scale
        emb = emb / np.linalg.norm(emb)  # Normalize

        payload = {
            'redis_key': f'phase89:chunk:file_{i}.ts:chunk:{i}',
            'kind': 'chunk',
            'codec': 'json'
        }

        candidates.append((i, emb, payload))

    # Rerank
    print(f"\n🔍 Reranking {n_candidates} candidates...")
    results = engine.rerank(query, candidates)

    # Print top 10
    print(f"\n📊 Top 10 Results:")
    print("-" * 70)
    print(f"{'Rank':<6} {'Score':<8} {'Confidence':<12} {'Key'}")
    print("-" * 70)

    for rank, result in enumerate(results[:10], 1):
        key = result.payload['redis_key'][:50]
        print(f"{rank:<6} {result.score:<8.4f} {result.confidence:<12} {key}")

    # Statistics
    print(f"\n📈 Confidence Distribution:")
    miss = sum(1 for r in results if r.confidence == "miss")
    verify = sum(1 for r in results if r.confidence == "verify")
    safe = sum(1 for r in results if r.confidence == "safe_reuse")

    print(f"   ❌ MISS (<0.38):        {miss:4} ({miss/len(results)*100:5.1f}%)")
    print(f"   ⚠️  VERIFY (0.38-0.55): {verify:4} ({verify/len(results)*100:5.1f}%)")
    print(f"   ✅ SAFE_REUSE (>0.55):  {safe:4} ({safe/len(results)*100:5.1f}%)")


if __name__ == "__main__":
    demo_gpu_rerank()
