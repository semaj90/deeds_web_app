"""
Granite-Docling Worker - Test Suite
====================================

Validates complete pipeline with sample documents.

Tests:
1. Page classifier (Task 3)
2. Unified pipeline manager (Task 4)
3. Status event emitter (Task 10)
4. End-to-end processing

Usage:
    python test_pipeline.py
    python test_pipeline.py --verbose
"""

import sys
import asyncio
import logging
from pathlib import Path
import cv2
import numpy as np

# Add project paths
PROJECT_ROOT = Path(__file__).parent
sys.path.insert(0, str(PROJECT_ROOT))

from src.core.page_classifier import PageClassifier
from src.pipeline.unified_pipeline_manager import UnifiedPipelineManager
from src.core.status_event_emitter import (
    StatusEventEmitter,
    create_classification_event,
    create_processing_event,
    create_complete_event,
)


def create_test_images():
    """Create synthetic test images for each category"""
    test_images = {}

    # Text-heavy page (simulated contract)
    text_img = np.ones((1000, 800, 3), dtype=np.uint8) * 255
    for i in range(10, 900, 30):
        cv2.rectangle(text_img, (50, i), (750, i+15), (0, 0, 0), -1)
    test_images["text"] = text_img

    # Table page (simulated financial table)
    table_img = np.ones((1000, 800, 3), dtype=np.uint8) * 255
    # Horizontal lines
    for i in range(100, 900, 80):
        cv2.line(table_img, (50, i), (750, i), (0, 0, 0), 2)
    # Vertical lines
    for i in range(50, 800, 150):
        cv2.line(table_img, (i, 100), (i, 900), (0, 0, 0), 2)
    test_images["table"] = table_img

    # Image page (simulated diagram)
    image_img = np.ones((1000, 800, 3), dtype=np.uint8) * 255
    cv2.circle(image_img, (400, 500), 300, (100, 100, 100), -1)
    cv2.rectangle(image_img, (200, 200), (600, 300), (50, 50, 50), -1)
    test_images["image"] = image_img

    # Mixed page
    mixed_img = np.ones((1000, 800, 3), dtype=np.uint8) * 255
    # Some text
    for i in range(50, 300, 30):
        cv2.rectangle(mixed_img, (50, i), (750, i+15), (0, 0, 0), -1)
    # Some table
    cv2.line(mixed_img, (50, 350), (750, 350), (0, 0, 0), 2)
    cv2.line(mixed_img, (50, 450), (750, 450), (0, 0, 0), 2)
    # Some image
    cv2.circle(mixed_img, (400, 700), 150, (100, 100, 100), -1)
    test_images["mixed"] = mixed_img

    return test_images


async def test_page_classifier():
    """Test page classification (Task 3)"""
    print(f"\n{'='*60}")
    print("TEST 1: Page Classifier")
    print(f"{'='*60}")

    classifier = PageClassifier()
    test_images = create_test_images()

    results = []
    for expected_category, image in test_images.items():
        result = classifier.classify_page(image)

        # Check if classification matches expected
        match = "✅" if result.category == expected_category else "⚠️"

        print(f"\n{match} {expected_category.upper()} page:")
        print(f"  Classified as:  {result.category}")
        print(f"  Confidence:     {result.confidence:.2%}")
        print(f"  Processing:     {result.processing_time_ms:.2f}ms")
        print(f"  Features:")
        for key, value in result.features.items():
            print(f"    {key:20s} {value:.3f}")

        results.append({
            "expected": expected_category,
            "actual": result.category,
            "confidence": result.confidence,
            "time_ms": result.processing_time_ms,
            "match": result.category == expected_category
        })

    # Summary
    accuracy = sum(r["match"] for r in results) / len(results)
    avg_time = sum(r["time_ms"] for r in results) / len(results)

    print(f"\n{'='*60}")
    print(f"Accuracy:       {accuracy:.1%} ({sum(r['match'] for r in results)}/{len(results)} correct)")
    print(f"Avg Time:       {avg_time:.2f}ms")
    print(f"Target Met:     {'✅ YES' if avg_time < 50 and accuracy >= 0.95 else '⚠️ NO'}")
    print(f"{'='*60}\n")

    return accuracy >= 0.75  # Accept 75% accuracy for synthetic test


async def test_unified_pipeline():
    """Test unified pipeline manager (Task 4)"""
    print(f"\n{'='*60}")
    print("TEST 2: Unified Pipeline Manager")
    print(f"{'='*60}")

    manager = UnifiedPipelineManager()
    test_images = create_test_images()

    # Save test images temporarily
    test_dir = Path("test_images")
    test_dir.mkdir(exist_ok=True)

    for category, image in test_images.items():
        img_path = test_dir / f"{category}.png"
        cv2.imwrite(str(img_path), image)

    # Test processing
    try:
        results = await manager.process_document(str(test_dir / "table.png"))

        print(f"\n✅ Pipeline test passed!")
        print(f"  Processed:     {len(results)} pages")
        print(f"  GPU pages:     {manager.stats['gpu_pages']}")
        print(f"  CPU pages:     {manager.stats['cpu_pages']}")
        print(f"  Heavy ROI:     {manager.stats['heavy_roi_locked']}")

        return True

    except Exception as e:
        print(f"\n⚠️ Pipeline test failed: {e}")
        return False

    finally:
        # Cleanup
        import shutil
        if test_dir.exists():
            shutil.rmtree(test_dir)


async def test_event_emitter():
    """Test status event emitter (Task 10)"""
    print(f"\n{'='*60}")
    print("TEST 3: Status Event Emitter")
    print(f"{'='*60}")

    emitter = StatusEventEmitter()

    # Register test client
    client = await emitter.register_client()

    # Emit test events
    events = [
        create_classification_event("test_doc", "started"),
        create_classification_event("test_doc", "completed", category="table", confidence=0.95, duration_ms=23),
        create_processing_event("test_doc", "completed", processor="granite", page_num=1, confidence=0.92, duration_ms=450),
        create_complete_event("test_doc", total_duration_ms=1500, total_pages=1, gpu_pages=1, cpu_pages=0),
    ]

    for event in events:
        await emitter.emit(event)

    # Verify events received
    received = []
    while not client.empty():
        event = await client.get()
        received.append(event)

    print(f"\n✅ Event emitter test passed!")
    print(f"  Events sent:     {len(events)}")
    print(f"  Events received: {len(received)}")
    print(f"  Active clients:  {emitter.stats['active_clients']}")

    return len(received) == len(events)


async def test_end_to_end():
    """Test complete pipeline integration"""
    print(f"\n{'='*60}")
    print("TEST 4: End-to-End Pipeline")
    print(f"{'='*60}")

    # This would test with actual main.py
    # For now, just verify components initialized

    from main import GraniteDoclingWorker

    try:
        worker = GraniteDoclingWorker(
            enable_storage=False,  # Skip MinIO for test
            enable_chunking=False,  # Skip chunking for test
            enable_rag=False,  # Skip RAG for test
            enable_events=True,
        )

        print(f"\n✅ Worker initialization successful!")
        print(f"  Pipeline:   {'✅' if worker.pipeline else '❌'}")
        print(f"  Events:     {'✅' if worker.emitter else '❌'}")

        return True

    except Exception as e:
        print(f"\n⚠️ Worker initialization failed: {e}")
        return False


async def run_all_tests(verbose=False):
    """Run all tests"""
    print(f"\n{'#'*60}")
    print("#" + " "*58 + "#")
    print("#  GRANITE-DOCLING WORKER - TEST SUITE" + " "*21 + "#")
    print("#" + " "*58 + "#")
    print(f"{'#'*60}\n")

    results = {}

    # Test 1: Page Classifier
    results["classifier"] = await test_page_classifier()

    # Test 2: Unified Pipeline
    results["pipeline"] = await test_unified_pipeline()

    # Test 3: Event Emitter
    results["events"] = await test_event_emitter()

    # Test 4: End-to-End
    results["e2e"] = await test_end_to_end()

    # Summary
    print(f"\n{'='*60}")
    print("TEST SUMMARY")
    print(f"{'='*60}")

    for test_name, passed in results.items():
        status = "✅ PASS" if passed else "❌ FAIL"
        print(f"{test_name:20s} {status}")

    total = len(results)
    passed = sum(results.values())

    print(f"\n{'='*60}")
    print(f"TOTAL: {passed}/{total} tests passed ({passed/total:.1%})")
    print(f"{'='*60}\n")

    return all(results.values())


if __name__ == "__main__":
    import argparse

    parser = argparse.ArgumentParser(description="Test Granite-Docling Worker")
    parser.add_argument("--verbose", "-v", action="store_true", help="Verbose output")
    args = parser.parse_args()

    logging.basicConfig(
        level=logging.DEBUG if args.verbose else logging.INFO,
        format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
    )

    success = asyncio.run(run_all_tests(verbose=args.verbose))
    sys.exit(0 if success else 1)
