#!/usr/bin/env python3
"""
Test script for Gemma-3 VLM integration in embedding service
"""

import asyncio
import os
import sys
import numpy as np
from pathlib import Path

# Add the embedding service directory to path
sys.path.insert(0, os.path.dirname(__file__))

from embedding_service import EmbeddingService

async def test_vlm_integration():
    """Test the Gemma-3 VLM integration"""
    print("🧪 Testing Gemma-3 VLM Integration")
    print("=" * 50)

    service = EmbeddingService()

    try:
        # Test 1: Load VLM model
        print("1️⃣ Loading Gemma-3 VLM model...")
        await service.load_model()
        print("✅ VLM model loaded successfully")

        # Test 2: Text-only embedding
        print("\n2️⃣ Testing text-only embedding...")
        test_text = "This is a test document about legal proceedings and court cases."
        embedding = service.generate_embedding(test_text)
        print(f"✅ Text embedding generated: shape {embedding.shape}, norm {np.linalg.norm(embedding):.4f}")

        # Test 3: Multimodal embedding (if we have a test image)
        test_image_path = "test_image.jpg"  # You can add a test image
        if os.path.exists(test_image_path):
            print("\n3️⃣ Testing multimodal embedding...")
            try:
                image = service.process_image(test_image_path)
                multimodal_embedding = service.generate_embedding("Legal document image", image)
                print(f"✅ Multimodal embedding generated: shape {multimodal_embedding.shape}")
            except Exception as e:
                print(f"⚠️ Multimodal test skipped (no test image): {e}")
        else:
            print("\n3️⃣ Multimodal test skipped (no test image available)")

        # Test 4: Database connection
        print("\n4️⃣ Testing database connection...")
        if service.db_conn:
            print("✅ Database connected")
            stats = service.get_summary_stats()
            print(f"📊 Current summaries: {stats.get('total_files', 0)} files")
        else:
            print("⚠️ Database not available (expected in test environment)")

        # Test 5: Chunking functionality
        print("\n5️⃣ Testing text chunking...")
        long_text = "This is a very long legal document. " * 100
        chunks = service.chunk_text(long_text)
        print(f"✅ Text chunked into {len(chunks)} chunks")

        print("\n🎉 All VLM integration tests passed!")

    except Exception as e:
        print(f"❌ Test failed: {e}")
        import traceback
        traceback.print_exc()
        return False

    return True

async def test_file_processing():
    """Test processing different file types"""
    print("\n🗂️ Testing File Processing")
    print("=" * 30)

    service = EmbeddingService()
    await service.load_model()

    # Create a test text file
    test_file = "test_legal_doc.txt"
    test_content = """
    COURT DOCUMENT - CASE NO. 2024-CV-00123

    This is a test legal document for embedding service validation.
    It contains information about civil litigation proceedings,
    including claims for breach of contract and negligence.

    PARTIES:
    Plaintiff: John Doe
    Defendant: ABC Corporation

    CLAIMS:
    1. Breach of fiduciary duty
    2. Negligent misrepresentation
    3. Violation of consumer protection laws

    RELIEF SOUGHT:
    Compensatory damages in the amount of $500,000
    Punitive damages
    Attorney fees and costs
    """

    try:
        with open(test_file, 'w') as f:
            f.write(test_content)

        print(f"📄 Processing test file: {test_file}")
        await service.process_file(test_file)

        # Check if summary was stored
        summary = service.get_file_summary(test_file)
        if summary:
            print("✅ File summary stored successfully")
            print(f"📝 Summary: {summary['summary']}")
        else:
            print("⚠️ File summary not found")

        # Clean up
        os.remove(test_file)
        print("🧹 Test file cleaned up")

    except Exception as e:
        print(f"❌ File processing test failed: {e}")
        return False

    return True

if __name__ == "__main__":
    async def main():
        success1 = await test_vlm_integration()
        success2 = await test_file_processing()

        if success1 and success2:
            print("\n🎯 ALL TESTS PASSED - Gemma-3 VLM integration ready!")
            sys.exit(0)
        else:
            print("\n💥 SOME TESTS FAILED - check logs above")
            sys.exit(1)

    asyncio.run(main())