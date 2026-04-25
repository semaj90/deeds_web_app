#!/usr/bin/env python3
"""
Phase 89: VLM Timeline Integration Example
===========================================

Demonstrates how to use the multimodal timeline logger with:
1. Ollama embeddings (768d) for text-only events
2. Gemma-3 VLM embeddings (1024d) for multimodal events
3. Integration with YOLO seal detection + DocLing layout analysis

Author: ACE (Agentic Code Evolution)
Date: 2026-01-02
"""

import sys
sys.stdout.reconfigure(encoding="utf-8")

import os
from backend.services.timeline_logger_vlm import MultimodalTimelineLogger

# ═══════════════════════════════════════════════════════════════════
# Example 1: Text-Only Code Fix Event (768d Ollama)
# ═══════════════════════════════════════════════════════════════════

def log_code_fix_event():
    """Log a TypeScript error fix with 768d text embedding"""
    print("📝 Example 1: Logging TypeScript Fix (768d)")
    print("-" * 60)

    with MultimodalTimelineLogger() as timeline:
        event_id = timeline.log_event(
            operation="fix_applied",
            collection="phase89_code_chunks",
            point_id="src/lib/auth/session.ts:chunk:12",
            actor="agentic",
            note_text=(
                "Fixed TypeScript error: Property 'user' does not exist on type 'Session'. "
                "Migrated from Svelte 4 createEventDispatcher to Svelte 5 $state() rune. "
                "Added proper type definitions for SessionStore interface."
            ),
            tags=["typescript", "svelte5", "auth", "migration"],
            ref="src/lib/auth/session.ts",
            payload={
                "error_count": 3,
                "loc": 150,
                "before": "let user = createEventDispatcher();",
                "after": "let user = $state<User | null>(null);",
                "confidence": 0.92
            },
            metadata={
                "phase": "phase89",
                "llm_provider": "gemma3-legal",
                "fix_method": "contextual_prompt_engineering"
            }
        )

        print(f"✅ Event #{event_id} logged to phase89_vector_events (768d)")
        print(f"   Searchable by: 'TypeScript Svelte 5 migration'")
        print()

# ═══════════════════════════════════════════════════════════════════
# Example 2: Multimodal Seal Detection Event (1024d VLM)
# ═══════════════════════════════════════════════════════════════════

def log_seal_detection_event():
    """Log notary seal detection with image, layout, and confidence (1024d VLM)"""
    print("🖼️  Example 2: Logging Seal Detection (1024d VLM)")
    print("-" * 60)

    # Simulated YOLO detection results
    seal_confidence = 0.945
    layout_boxes = [
        {
            "x": 1200,
            "y": 2800,
            "width": 450,
            "height": 450,
            "type": "seal",
            "text": "NOTARY PUBLIC",
            "confidence": 0.945
        },
        {
            "x": 1150,
            "y": 3250,
            "width": 550,
            "height": 100,
            "type": "signature",
            "text": "John Smith",
            "confidence": 0.88
        }
    ]

    # In real usage, you would load the actual document image:
    # with open("document_page_5.jpg", "rb") as f:
    #     image_bytes = f.read()

    # For this example, we'll skip the image (will use text-only 1024d)
    image_bytes = None

    with MultimodalTimelineLogger() as timeline:
        event_id = timeline.log_multimodal_event(
            operation="seal_detection",
            collection="phase89_legal_documents",
            point_id="doc_ABC123:page_5:seal_1",
            actor="yolo_detector",
            note_text=(
                f"Detected notary seal with {seal_confidence*100:.1f}% confidence on page 5. "
                f"Seal type: Embossed circular notary public seal. "
                f"Location: Bottom right corner. "
                f"Associated signature detected with 88% confidence."
            ),
            image_bytes=image_bytes,  # Would contain actual image in production
            seal_confidence=seal_confidence,
            layout_boxes=layout_boxes,
            tags=["seal", "notary", "high_confidence", "page_5"],
            ref="documents/ABC123/page_5.pdf",
            payload={
                "document_id": "ABC123",
                "page_number": 5,
                "seal_type": "notary_public",
                "seal_shape": "circular",
                "seal_embossed": True,
                "state": "California",
                "associated_elements": ["signature", "date", "stamp"]
            },
            metadata={
                "detection_model": "yolov8-seal-detector",
                "layout_model": "docling-v2",
                "processing_timestamp": "2026-01-02T15:30:00Z"
            }
        )

        print(f"✅ Event #{event_id} logged to phase89_vector_events_vlm (1024d)")
        print(f"   Modality: {'multimodal' if image_bytes else 'text'}")
        print(f"   Seal confidence: {seal_confidence*100:.1f}%")
        print(f"   Layout boxes: {len(layout_boxes)}")
        print(f"   Searchable by: 'notary seal California high confidence'")
        print()

# ═══════════════════════════════════════════════════════════════════
# Example 3: Semantic Timeline Search
# ═══════════════════════════════════════════════════════════════════

def search_timeline_examples():
    """Demonstrate semantic timeline search across both tables"""
    print("🔍 Example 3: Semantic Timeline Search")
    print("-" * 60)

    with MultimodalTimelineLogger() as timeline:
        # Search 768d table (code fixes)
        print("Query 1: 'TypeScript errors related to Svelte 5'")
        results = timeline.search_timeline(
            query_text="TypeScript errors related to Svelte 5 migration",
            limit=5,
            min_similarity=0.7,
            table="768d"
        )
        print(f"   Found {len(results)} code fix events (768d)")
        for r in results[:2]:
            sim = r.get('similarity', 0) * 100
            print(f"   - {sim:.1f}% similar: {r['note_text'][:60]}...")
        print()

        # Search 1024d table (document events)
        print("Query 2: 'high confidence notary seals'")
        results = timeline.search_timeline(
            query_text="high confidence notary seals with signatures",
            limit=5,
            min_similarity=0.7,
            table="1024d"
        )
        print(f"   Found {len(results)} multimodal events (1024d)")
        for r in results[:2]:
            sim = r.get('similarity', 0) * 100
            conf = r.get('seal_confidence', 0) * 100
            print(f"   - {sim:.1f}% similar, {conf:.1f}% seal conf: {r['note_text'][:60]}...")
        print()

# ═══════════════════════════════════════════════════════════════════
# Example 4: Querying Recent Events by Type
# ═══════════════════════════════════════════════════════════════════

def query_recent_events():
    """Get recent events from both tables"""
    print("📊 Example 4: Recent Events Query")
    print("-" * 60)

    with MultimodalTimelineLogger() as timeline:
        # Get recent code fixes (768d)
        print("Recent code fix events (768d):")
        events = timeline.get_recent_events(
            limit=5,
            collection="phase89_code_chunks",
            actor="agentic",
            table="768d"
        )
        print(f"   Found {len(events)} events")
        for e in events[:2]:
            print(f"   - {e['timestamp']}: {e['note_text'][:50]}...")
        print()

        # Get recent seal detections (1024d)
        print("Recent seal detection events (1024d):")
        events = timeline.get_recent_events(
            limit=5,
            collection="phase89_legal_documents",
            actor="yolo_detector",
            table="1024d"
        )
        print(f"   Found {len(events)} events")
        for e in events[:2]:
            conf = e.get('seal_confidence', 0) * 100
            print(f"   - {e['timestamp']}: {conf:.1f}% conf - {e['note_text'][:50]}...")
        print()

        # Get all events (unified query across both tables)
        print("All recent events (both 768d and 1024d):")
        events = timeline.get_recent_events(
            limit=10,
            table="both"
        )
        print(f"   Found {len(events)} events across both tables")
        for e in events[:3]:
            etype = e.get('embedding_type', 'unknown')
            print(f"   - [{etype}] {e['timestamp']}: {e['note_text'][:40]}...")
        print()

# ═══════════════════════════════════════════════════════════════════
# Example 5: Integration with Phase 89 GPU Pipeline
# ═══════════════════════════════════════════════════════════════════

def phase89_pipeline_integration_example():
    """
    Show how to integrate timeline logging into Phase 89 GPU pipeline
    """
    print("🚀 Example 5: Phase 89 GPU Pipeline Integration")
    print("-" * 60)
    print()
    print("Integration pattern for phase89-gpu-unified-pipeline.py:")
    print()
    print("```python")
    print("from backend.services.timeline_logger_vlm import MultimodalTimelineLogger")
    print()
    print("# Initialize timeline logger")
    print("timeline = MultimodalTimelineLogger()")
    print()
    print("# After indexing code chunks to Qdrant")
    print("for chunk in code_chunks:")
    print("    # Upsert to Qdrant")
    print("    qdrant_client.upsert(")
    print("        collection_name='phase89_code_chunks',")
    print("        points=[chunk_point]")
    print("    )")
    print("    ")
    print("    # Log to timeline (768d)")
    print("    timeline.log_upsert(")
    print("        collection='phase89_code_chunks',")
    print("        point_id=f'{file_path}:chunk:{i}',")
    print("        actor='gpu_pipeline',")
    print("        note_text=f'Indexed {file_path} chunk {i}: {summary}',")
    print("        tags=['indexing', 'phase89', language],")
    print("        ref=file_path,")
    print("        payload={'loc': loc, 'functions': func_count}")
    print("    )")
    print()
    print("# After seal detection with YOLO")
    print("for seal_detection in seal_results:")
    print("    # Log multimodal event (1024d VLM)")
    print("    timeline.log_multimodal_event(")
    print("        operation='seal_detection',")
    print("        collection='phase89_legal_documents',")
    print("        note_text=f'Detected {seal_type} seal with {confidence:.1%} confidence',")
    print("        image_bytes=document_image,")
    print("        seal_confidence=confidence,")
    print("        layout_boxes=docling_boxes,")
    print("        actor='yolo_detector',")
    print("        tags=['seal', seal_type, 'auto_detected']")
    print("    )")
    print("```")
    print()

# ═══════════════════════════════════════════════════════════════════
# Main Runner
# ═══════════════════════════════════════════════════════════════════

if __name__ == "__main__":
    print()
    print("╔══════════════════════════════════════════════════════════════════╗")
    print("║  Phase 89: VLM Timeline Integration Examples                   ║")
    print("╚══════════════════════════════════════════════════════════════════╝")
    print()

    # Run examples
    log_code_fix_event()
    log_seal_detection_event()
    search_timeline_examples()
    query_recent_events()
    phase89_pipeline_integration_example()

    print("╔══════════════════════════════════════════════════════════════════╗")
    print("║  ✅ All Integration Examples Complete!                          ║")
    print("╚══════════════════════════════════════════════════════════════════╝")
    print()
    print("📚 Architecture Summary:")
    print("   • 768d embeddings (Ollama) → Fast text-only events")
    print("   • 1024d embeddings (VLM) → Multimodal (text + vision + layout)")
    print("   • Unified timeline view → Query both tables seamlessly")
    print("   • Semantic search → Natural language event discovery")
    print("   • Graceful fallback → Works even if VLM service is down")
    print()
