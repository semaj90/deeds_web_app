"""
CLIP (Contrastive Language-Image Pre-Training) Service
Wraps OpenAI CLIP for unified vision-text embeddings
GPU-accelerated with RTX 3060 Ti (8GB VRAM)
"""

import asyncio
from typing import Optional, List, Union
import torch
import clip
from PIL import Image
import io
import numpy as np

class CLIPService:
    """
    CLIP embedding service with GPU acceleration
    Model: ViT-B/32 (151M params, ~600MB VRAM)
    Embedding dimension: 512

    Usage:
        service = CLIPService()
        await service.initialize()
        image_emb = await service.embed_image(image_bytes)
        text_emb = await service.embed_text("a legal document")
        similarity = np.dot(image_emb, text_emb)
    """

    # Model name -> embedding dimension
    MODEL_DIM = {
        "RN50": 1024,
        "RN101": 512,
        "RN50x4": 640,
        "RN50x16": 768,
        "RN50x64": 1024,
        "ViT-B/32": 512,
        "ViT-B/16": 512,
        "ViT-L/14": 768,
        "ViT-L/14@336px": 768,
    }

    def __init__(self, model_name: str = "ViT-B/32", device: Optional[str] = None):
        """
        Args:
            model_name: CLIP model variant (ViT-B/32 recommended for 8GB VRAM)
            device: 'cuda', 'cpu', or None (auto-detect)
        """
        self.model_name = model_name
        self.device = device or ("cuda" if torch.cuda.is_available() else "cpu")
        self.model: Optional[torch.nn.Module] = None
        self.preprocess = None
        self._lock = asyncio.Lock()
        self.embedding_dim = self.MODEL_DIM.get(model_name, 512)

    async def initialize(self) -> None:
        """Load CLIP model onto GPU/CPU"""
        if self.model is not None:
            return

        async with self._lock:
            if self.model is not None:
                return

            # Run blocking model load in executor
            loop = asyncio.get_event_loop()
            result = await loop.run_in_executor(
                None,
                lambda: clip.load(self.model_name, device=self.device)
            )
            self.model, self.preprocess = result

            # Warmup inference (primes CUDA kernels)
            dummy_image = Image.new('RGB', (224, 224), color='black')
            dummy_text = ["warmup"]
            await self._embed_image_sync(dummy_image)
            await self._embed_text_sync(dummy_text)

    async def _embed_image_sync(self, image: Image.Image) -> np.ndarray:
        """Internal: sync image encoding"""
        preprocessed = self.preprocess(image).unsqueeze(0).to(self.device)
        with torch.no_grad():
            features = self.model.encode_image(preprocessed)
            features /= features.norm(dim=-1, keepdim=True)  # L2 normalize
        return features.cpu().numpy()[0]

    async def _embed_text_sync(self, texts: List[str]) -> np.ndarray:
        """Internal: sync text encoding"""
        tokens = clip.tokenize(texts).to(self.device)
        with torch.no_grad():
            features = self.model.encode_text(tokens)
            features /= features.norm(dim=-1, keepdim=True)  # L2 normalize
        return features.cpu().numpy()

    async def embed_image(self, image_bytes: bytes) -> np.ndarray:
        """
        Encode image to CLIP embedding

        Args:
            image_bytes: Raw image data (JPEG/PNG)

        Returns:
            L2-normalized embedding vector (512-dim for ViT-B/32)
        """
        if self.model is None:
            await self.initialize()

        # Decode image
        image = Image.open(io.BytesIO(image_bytes)).convert('RGB')

        # Run in executor (blocking CUDA ops)
        loop = asyncio.get_event_loop()
        embedding = await loop.run_in_executor(
            None,
            lambda: self._run_sync(self._embed_image_sync(image))
        )
        return embedding

    async def embed_text(self, text: str) -> np.ndarray:
        """
        Encode text to CLIP embedding

        Args:
            text: Text string (max 77 tokens)

        Returns:
            L2-normalized embedding vector (512-dim for ViT-B/32)
        """
        if self.model is None:
            await self.initialize()

        # Run in executor (blocking CUDA ops)
        loop = asyncio.get_event_loop()
        embedding = await loop.run_in_executor(
            None,
            lambda: self._run_sync(self._embed_text_sync([text]))
        )
        return embedding[0]

    async def embed_text_batch(self, texts: List[str]) -> np.ndarray:
        """
        Encode multiple texts to CLIP embeddings

        Args:
            texts: List of text strings (max 77 tokens each)

        Returns:
            Array of L2-normalized embeddings (N x 512)
        """
        if self.model is None:
            await self.initialize()

        # Process in batches of 32 to avoid CUDA OOM
        batch_size = 32
        all_embeddings = []

        loop = asyncio.get_event_loop()
        for i in range(0, len(texts), batch_size):
            batch = texts[i:i+batch_size]
            embeddings = await loop.run_in_executor(
                None,
                lambda: self._run_sync(self._embed_text_sync(batch))
            )
            all_embeddings.append(embeddings)

        return np.vstack(all_embeddings)

    def _run_sync(self, coro):
        """Helper to run async function synchronously in executor"""
        # This is already called from executor, so we can use asyncio.run
        return asyncio.run(coro)

    async def compute_similarity(
        self,
        image_bytes: Optional[bytes] = None,
        text: Optional[str] = None,
        image_embedding: Optional[np.ndarray] = None,
        text_embedding: Optional[np.ndarray] = None
    ) -> float:
        """
        Compute cosine similarity between image and text

        Args:
            image_bytes: Raw image data (if image_embedding not provided)
            text: Text string (if text_embedding not provided)
            image_embedding: Pre-computed image embedding
            text_embedding: Pre-computed text embedding

        Returns:
            Cosine similarity score (0.0-1.0, higher is more similar)
        """
        # Get embeddings
        if image_embedding is None:
            if image_bytes is None:
                raise ValueError("Must provide either image_bytes or image_embedding")
            image_embedding = await self.embed_image(image_bytes)

        if text_embedding is None:
            if text is None:
                raise ValueError("Must provide either text or text_embedding")
            text_embedding = await self.embed_text(text)

        # Compute cosine similarity (embeddings already L2-normalized)
        similarity = float(np.dot(image_embedding, text_embedding))
        return similarity

    async def zero_shot_classify(
        self,
        image_bytes: bytes,
        candidate_labels: List[str],
        return_scores: bool = False
    ) -> Union[str, List[tuple[str, float]]]:
        """
        Zero-shot image classification using text prompts

        Args:
            image_bytes: Raw image data
            candidate_labels: List of possible class labels
            return_scores: If True, return (label, score) tuples sorted by score

        Returns:
            Best matching label, or list of (label, score) tuples
        """
        if self.model is None:
            await self.initialize()

        # Embed image
        image_emb = await self.embed_image(image_bytes)

        # Embed all labels
        text_embs = await self.embed_text_batch(candidate_labels)

        # Compute similarities
        similarities = image_emb @ text_embs.T  # Dot product (already normalized)

        if return_scores:
            # Return sorted (label, score) tuples
            results = list(zip(candidate_labels, similarities))
            results.sort(key=lambda x: x[1], reverse=True)
            return [(label, float(score)) for label, score in results]
        else:
            # Return best label
            best_idx = int(np.argmax(similarities))
            return candidate_labels[best_idx]

    def get_stats(self) -> dict:
        """Return service statistics"""
        return {
            "model": self.model_name,
            "device": self.device,
            "embedding_dim": self.embedding_dim,
            "initialized": self.model is not None,
            "cuda_available": torch.cuda.is_available(),
            "cuda_device_count": torch.cuda.device_count() if torch.cuda.is_available() else 0,
            "vram_allocated_mb": torch.cuda.memory_allocated() / (1024**2) if torch.cuda.is_available() else 0,
        }


# Singleton instance
_clip_service: Optional[CLIPService] = None

def get_clip_service() -> CLIPService:
    """Get singleton CLIPService instance"""
    global _clip_service
    if _clip_service is None:
        _clip_service = CLIPService()
    return _clip_service