#!/usr/bin/env python3
"""
Test Gemma-3 VLM Embedding Service
Verify 1024d embeddings on CUDA
"""

import asyncio
import sys
import logging
from pathlib import Path

# Add parent directory to path
sys.path.insert(0, str(Path(__file__).parent.parent))

from services.gemma_vlm_embedding_service import (
    GemmaVLMEmbeddingService,
    EmbeddingRequest
)

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

async def test_text_embedding():
    """Test text-only embedding generation"""
    logger.info("=" * 60)
    logger.info("TEST 1: Text-Only Embedding")
    logger.info("=" * 60)

    service = GemmaVLMEmbeddingService(
        model_name="google/gemma-3-2b-it-v",
        device="cuda",
        batch_size=4,
        max_length=512
    )

    # Load model
    await service.load_model()

    # Create test request
    request = EmbeddingRequest(
        text="This is a test document about legal contracts.",
        chunk_id="test_chunk_001"
    )

    # Generate embedding
    responses = await service.generate_embeddings([request])

    # Verify results
    assert len(responses) == 1, f"Expected 1 response, got {len(responses)}"

    response = responses[0]
    logger.info(f"✅ Chunk ID: {response.chunk_id}")
    logger.info(f"✅ Modality: {response.modality}")
    logger.info(f"✅ Embedding dimension: {len(response.embedding)}")
    logger.info(f"✅ Processing time: {response.processing_time_ms:.2f}ms")
    logger.info(f"✅ Model: {response.model_name}")

    assert len(response.embedding) == 1024, f"Expected 1024d, got {len(response.embedding)}d"
    assert response.modality == "text", f"Expected 'text', got {response.modality}"

    logger.info(f"✅ First 10 embedding values: {response.embedding[:10]}")

    # Get stats
    stats = service.get_stats()
    logger.info("\n📊 Service Statistics:")
    for key, value in stats.items():
        logger.info(f"   {key}: {value}")

    await service.shutdown()
    logger.info("✅ Text embedding test PASSED\n")

async def test_health_check():
    """Test health check endpoint"""
    logger.info("=" * 60)
    logger.info("TEST 2: Health Check")
    logger.info("=" * 60)

    service = GemmaVLMEmbeddingService(
        model_name="google/gemma-3-2b-it-v",
        device="cuda"
    )

    health = await service.health_check()

    logger.info(f"✅ Status: {health['status']}")
    logger.info(f"✅ Model loaded: {health['model_loaded']}")
    logger.info(f"✅ Embedding dimension: {health['embedding_dimension']}")
    logger.info(f"✅ Test inference time: {health['test_inference_time_ms']:.2f}ms")
    logger.info(f"✅ Device: {health['device']}")

    assert health['status'] == 'healthy', f"Expected 'healthy', got {health['status']}"
    assert health['embedding_dimension'] == 1024, f"Expected 1024d, got {health['embedding_dimension']}d"

    await service.shutdown()
    logger.info("✅ Health check test PASSED\n")

async def test_batch_processing():
    """Test batch embedding generation"""
    logger.info("=" * 60)
    logger.info("TEST 3: Batch Processing (10 requests)")
    logger.info("=" * 60)

    service = GemmaVLMEmbeddingService(
        model_name="google/gemma-3-2b-it-v",
        device="cuda",
        batch_size=4
    )

    await service.load_model()

    # Create 10 test requests
    requests = [
        EmbeddingRequest(
            text=f"Legal document chunk {i}: This is test content about contracts and agreements.",
            chunk_id=f"chunk_{i:03d}"
        )
        for i in range(10)
    ]

    # Generate embeddings
    responses = await service.generate_embeddings(requests)

    # Verify results
    assert len(responses) == 10, f"Expected 10 responses, got {len(responses)}"

    for i, response in enumerate(responses):
        assert len(response.embedding) == 1024, f"Chunk {i}: Expected 1024d, got {len(response.embedding)}d"
        assert response.modality == "text", f"Chunk {i}: Expected 'text', got {response.modality}"
        logger.info(f"✅ Chunk {response.chunk_id}: {len(response.embedding)}d in {response.processing_time_ms:.2f}ms")

    stats = service.get_stats()
    logger.info(f"\n📊 Total requests: {stats['total_requests']}")
    logger.info(f"📊 Avg processing time: {stats['avg_processing_time_ms']:.2f}ms")

    await service.shutdown()
    logger.info("✅ Batch processing test PASSED\n")

async def main():
    """Run all tests"""
    logger.info("\n" + "=" * 60)
    logger.info("🧪 Gemma-3 VLM Embedding Service Tests")
    logger.info("=" * 60 + "\n")

    try:
        await test_text_embedding()
        await test_health_check()
        await test_batch_processing()

        logger.info("=" * 60)
        logger.info("✅ ALL TESTS PASSED")
        logger.info("=" * 60)

    except Exception as e:
        logger.error(f"❌ TEST FAILED: {e}")
        import traceback
        traceback.print_exc()
        sys.exit(1)

if __name__ == "__main__":
    asyncio.run(main())
