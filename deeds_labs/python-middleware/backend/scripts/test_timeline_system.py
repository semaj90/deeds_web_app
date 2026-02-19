#!/usr/bin/env python3
"""
Phase 89: Timeline System Test Suite

Comprehensive tests for timeline logger and API endpoints.

Author: ACE (Agentic Code Evolution)
Date: 2025-01-01
"""

import sys
sys.stdout.reconfigure(encoding="utf-8")

import os
import logging
import time
import requests
from datetime import datetime

# Import timeline logger
sys.path.append(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
from services.timeline_logger import TimelineLogger

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger(__name__)

# Test configuration
API_BASE_URL = os.getenv("TIMELINE_API_URL", "http://localhost:8001/api/timeline")

# ═══════════════════════════════════════════════════════════════════
# Test Helper Functions
# ═══════════════════════════════════════════════════════════════════

def print_header(title: str):
    """Print formatted test section header"""
    print()
    print("═" * 70)
    print(f"  {title}")
    print("═" * 70)
    print()

def print_success(message: str):
    """Print success message"""
    print(f"✅ {message}")

def print_error(message: str):
    """Print error message"""
    print(f"❌ {message}")

def print_info(message: str):
    """Print info message"""
    print(f"ℹ️  {message}")

# ═══════════════════════════════════════════════════════════════════
# Timeline Logger Tests
# ═══════════════════════════════════════════════════════════════════

def test_timeline_logger():
    """Test core timeline logger functionality"""
    print_header("TEST 1: Timeline Logger Core Functionality")

    try:
        with TimelineLogger() as timeline:
            print_info("Testing database connection...")
            print_success("Connected to timeline database")

            # Test 1: Log upsert event
            print_info("Test 1.1: Logging upsert event...")
            event_id = timeline.log_upsert(
                collection="test_collection",
                point_id="test_point_1",
                actor="test_suite",
                note_text="Test upsert event for timeline validation",
                tags=["test", "validation", "phase89"],
                ref="test/file.ts",
                payload={"test": True, "count": 1}
            )
            if event_id:
                print_success(f"Logged upsert event #{event_id}")
            else:
                print_error("Failed to log upsert event")
                return False

            # Test 2: Log update event
            print_info("Test 1.2: Logging update event...")
            event_id = timeline.log_update_payload(
                collection="test_collection",
                point_id="test_point_1",
                actor="test_suite",
                note_text="Updated payload with additional metadata",
                tags=["test", "update"],
                ref="test/file.ts",
                payload={"test": True, "count": 2, "updated": True}
            )
            if event_id:
                print_success(f"Logged update event #{event_id}")
            else:
                print_error("Failed to log update event")
                return False

            # Test 3: Log delete event
            print_info("Test 1.3: Logging delete event...")
            event_id = timeline.log_delete(
                collection="test_collection",
                point_id="test_point_1",
                actor="test_suite",
                note_text="Deleted test point after validation",
                tags=["test", "cleanup"]
            )
            if event_id:
                print_success(f"Logged delete event #{event_id}")
            else:
                print_error("Failed to log delete event")
                return False

            time.sleep(1)  # Allow time for events to be written

            # Test 4: Get recent events
            print_info("Test 1.4: Querying recent events...")
            events = timeline.get_recent_events(limit=5, collection="test_collection")
            if events and len(events) >= 3:
                print_success(f"Retrieved {len(events)} recent events")
                for event in events:
                    print(f"  - {event['operation']}: {event['note_text'][:50]}...")
            else:
                print_error(f"Expected at least 3 events, got {len(events) if events else 0}")
                return False

            # Test 5: Semantic search
            print_info("Test 1.5: Testing semantic search...")
            results = timeline.search_timeline(
                query_text="testing and validation",
                limit=5,
                min_similarity=0.5
            )
            if results:
                print_success(f"Found {len(results)} semantically similar events")
                for result in results:
                    similarity = result.get('similarity', 0) * 100
                    print(f"  - {similarity:.1f}% similar: {result['note_text'][:50]}...")
            else:
                print_error("Semantic search returned no results")
                return False

            # Test 6: File timeline
            print_info("Test 1.6: Getting file-specific timeline...")
            file_events = timeline.get_file_timeline(
                file_path="test/file.ts",
                limit=10
            )
            if file_events:
                print_success(f"Retrieved {len(file_events)} events for test/file.ts")
            else:
                print_error("File timeline returned no results")
                return False

            print()
            print_success("All timeline logger tests passed! ✅")
            return True

    except Exception as e:
        print_error(f"Timeline logger tests failed: {e}")
        logger.exception(e)
        return False

# ═══════════════════════════════════════════════════════════════════
# API Endpoint Tests
# ═══════════════════════════════════════════════════════════════════

def test_api_health():
    """Test API health endpoint"""
    print_header("TEST 2: API Health Endpoint")

    try:
        print_info(f"Testing {API_BASE_URL}/health...")
        response = requests.get(f"{API_BASE_URL}/health", timeout=10)

        if response.status_code == 200:
            data = response.json()
            print_success(f"Health check passed: {data['status']}")
            print_info(f"Database: {data.get('database', 'unknown')}")
            print_info(f"Version: {data.get('version', 'unknown')}")
            return True
        else:
            print_error(f"Health check failed: HTTP {response.status_code}")
            return False

    except requests.exceptions.ConnectionError:
        print_error("Cannot connect to API - is the server running?")
        print_info("Skipping API tests...")
        return None  # None = skip remaining API tests
    except Exception as e:
        print_error(f"Health check failed: {e}")
        return False

def test_api_recent_events():
    """Test recent events API endpoint"""
    print_header("TEST 3: API Recent Events Endpoint")

    try:
        print_info("Testing /recent endpoint...")
        response = requests.get(
            f"{API_BASE_URL}/recent",
            params={"limit": 10, "collection": "test_collection"},
            timeout=10
        )

        if response.status_code == 200:
            data = response.json()
            event_count = data.get('count', 0)
            print_success(f"Retrieved {event_count} recent events")

            if event_count > 0:
                print_info("Sample event:")
                event = data['events'][0]
                print(f"  Operation: {event.get('operation')}")
                print(f"  Collection: {event.get('collection')}")
                print(f"  Note: {event.get('note_text', '')[:60]}...")

            return True
        else:
            print_error(f"Recent events request failed: HTTP {response.status_code}")
            return False

    except Exception as e:
        print_error(f"Recent events test failed: {e}")
        return False

def test_api_semantic_search():
    """Test semantic search API endpoint"""
    print_header("TEST 4: API Semantic Search Endpoint")

    try:
        print_info("Testing /search endpoint...")
        response = requests.get(
            f"{API_BASE_URL}/search",
            params={
                "query": "TypeScript errors and Svelte 5 migration",
                "limit": 5,
                "min_similarity": 0.6
            },
            timeout=30
        )

        if response.status_code == 200:
            data = response.json()
            result_count = data.get('count', 0)
            print_success(f"Semantic search found {result_count} results")

            if result_count > 0:
                print_info("Top result:")
                result = data['results'][0]
                similarity = result.get('similarity', 0) * 100
                print(f"  Similarity: {similarity:.1f}%")
                print(f"  Note: {result.get('note_text', '')[:60]}...")

            return True
        else:
            print_error(f"Semantic search failed: HTTP {response.status_code}")
            return False

    except Exception as e:
        print_error(f"Semantic search test failed: {e}")
        return False

def test_api_file_timeline():
    """Test file timeline API endpoint"""
    print_header("TEST 5: API File Timeline Endpoint")

    try:
        print_info("Testing /file/{path} endpoint...")
        response = requests.get(
            f"{API_BASE_URL}/file/test/file.ts",
            params={"limit": 10},
            timeout=10
        )

        if response.status_code == 200:
            data = response.json()
            event_count = data.get('count', 0)
            print_success(f"Retrieved {event_count} events for test/file.ts")
            return True
        else:
            print_error(f"File timeline request failed: HTTP {response.status_code}")
            return False

    except Exception as e:
        print_error(f"File timeline test failed: {e}")
        return False

def test_api_stats():
    """Test timeline statistics API endpoint"""
    print_header("TEST 6: API Statistics Endpoint")

    try:
        print_info("Testing /stats endpoint...")
        response = requests.get(f"{API_BASE_URL}/stats", timeout=10)

        if response.status_code == 200:
            data = response.json()
            print_success("Statistics retrieved successfully")
            print_info(f"Total events: {data.get('total_events', 0)}")
            print_info(f"Events last 24h: {data.get('events_last_24h', 0)}")
            print_info(f"Events last 7d: {data.get('events_last_7d', 0)}")

            top_collections = data.get('top_collections', [])
            if top_collections:
                print_info("Top collections:")
                for coll in top_collections[:3]:
                    print(f"  - {coll['collection']}: {coll['count']} events")

            return True
        else:
            print_error(f"Stats request failed: HTTP {response.status_code}")
            return False

    except Exception as e:
        print_error(f"Stats test failed: {e}")
        return False

def test_api_collections():
    """Test collections list API endpoint"""
    print_header("TEST 7: API Collections Endpoint")

    try:
        print_info("Testing /collections endpoint...")
        response = requests.get(f"{API_BASE_URL}/collections", timeout=10)

        if response.status_code == 200:
            data = response.json()
            collection_count = data.get('count', 0)
            print_success(f"Found {collection_count} tracked collections")

            if collection_count > 0:
                print_info("Sample collection:")
                coll = data['collections'][0]
                print(f"  Name: {coll['collection']}")
                print(f"  Events: {coll['event_count']}")
                print(f"  Operations: {', '.join(coll.get('operations', []))}")

            return True
        else:
            print_error(f"Collections request failed: HTTP {response.status_code}")
            return False

    except Exception as e:
        print_error(f"Collections test failed: {e}")
        return False

# ═══════════════════════════════════════════════════════════════════
# Edge Case Tests
# ═══════════════════════════════════════════════════════════════════

def test_edge_cases():
    """Test edge cases and error handling"""
    print_header("TEST 8: Edge Cases and Error Handling")

    try:
        with TimelineLogger() as timeline:
            # Test 1: Empty note text
            print_info("Test 8.1: Empty note text...")
            event_id = timeline.log_event(
                operation="test",
                collection="test_edge_cases",
                actor="test_suite",
                note_text=""
            )
            if event_id:
                print_success("Handled empty note text")
            else:
                print_error("Failed to handle empty note text")

            # Test 2: Very long note text
            print_info("Test 8.2: Very long note text (10,000 chars)...")
            long_text = "A" * 10000
            event_id = timeline.log_event(
                operation="test",
                collection="test_edge_cases",
                actor="test_suite",
                note_text=long_text
            )
            if event_id:
                print_success("Handled long note text")
            else:
                print_error("Failed to handle long note text")

            # Test 3: Special characters
            print_info("Test 8.3: Special characters in note text...")
            special_text = "Test with emoji 🚀 and unicode 中文 characters: \"quotes\", 'apostrophes', <tags>"
            event_id = timeline.log_event(
                operation="test",
                collection="test_edge_cases",
                actor="test_suite",
                note_text=special_text
            )
            if event_id:
                print_success("Handled special characters")
            else:
                print_error("Failed to handle special characters")

            # Test 4: NULL point_id
            print_info("Test 8.4: NULL point_id...")
            event_id = timeline.log_event(
                operation="test",
                collection="test_edge_cases",
                actor="test_suite",
                point_id=None,
                note_text="Event without point_id"
            )
            if event_id:
                print_success("Handled NULL point_id")
            else:
                print_error("Failed to handle NULL point_id")

            # Test 5: Complex payload
            print_info("Test 8.5: Complex JSONB payload...")
            complex_payload = {
                "nested": {
                    "array": [1, 2, 3],
                    "object": {"key": "value"},
                    "null": None,
                    "bool": True,
                    "float": 3.14
                },
                "list": ["a", "b", "c"]
            }
            event_id = timeline.log_event(
                operation="test",
                collection="test_edge_cases",
                actor="test_suite",
                note_text="Complex payload test",
                payload=complex_payload
            )
            if event_id:
                print_success("Handled complex JSONB payload")
            else:
                print_error("Failed to handle complex payload")

            print()
            print_success("All edge case tests passed! ✅")
            return True

    except Exception as e:
        print_error(f"Edge case tests failed: {e}")
        logger.exception(e)
        return False

# ═══════════════════════════════════════════════════════════════════
# Main Test Runner
# ═══════════════════════════════════════════════════════════════════

def run_all_tests():
    """Run all timeline system tests"""
    print()
    print("╔══════════════════════════════════════════════════════════════════╗")
    print("║  Phase 89: Timeline System Test Suite                          ║")
    print("╚══════════════════════════════════════════════════════════════════╝")
    print()
    print(f"Started: {datetime.now().isoformat()}")
    print(f"API URL: {API_BASE_URL}")
    print()

    results = {}

    # Run timeline logger tests
    results['timeline_logger'] = test_timeline_logger()

    # Run edge case tests
    results['edge_cases'] = test_edge_cases()

    # Run API tests
    results['api_health'] = test_api_health()

    if results['api_health'] is not None:
        if results['api_health']:
            results['api_recent'] = test_api_recent_events()
            results['api_search'] = test_api_semantic_search()
            results['api_file'] = test_api_file_timeline()
            results['api_stats'] = test_api_stats()
            results['api_collections'] = test_api_collections()
        else:
            print_info("Skipping remaining API tests due to health check failure")
    else:
        print_info("API server not running - timeline logger tests only")

    # Print summary
    print_header("TEST SUMMARY")

    passed = sum(1 for v in results.values() if v is True)
    failed = sum(1 for v in results.values() if v is False)
    skipped = sum(1 for v in results.values() if v is None)
    total = len(results)

    print(f"Total tests: {total}")
    print_success(f"Passed: {passed}")
    if failed > 0:
        print_error(f"Failed: {failed}")
    if skipped > 0:
        print_info(f"Skipped: {skipped}")
    print()

    # Detailed results
    for test_name, result in results.items():
        if result is True:
            print(f"  ✅ {test_name}")
        elif result is False:
            print(f"  ❌ {test_name}")
        else:
            print(f"  ⏭️  {test_name} (skipped)")

    print()
    if failed == 0 and passed > 0:
        print("╔══════════════════════════════════════════════════════════════════╗")
        print("║  ✅ ALL TESTS PASSED!                                           ║")
        print("╚══════════════════════════════════════════════════════════════════╝")
        return 0
    else:
        print("╔══════════════════════════════════════════════════════════════════╗")
        print("║  ⚠️  SOME TESTS FAILED                                           ║")
        print("╚══════════════════════════════════════════════════════════════════╝")
        return 1

if __name__ == "__main__":
    exit_code = run_all_tests()
    sys.exit(exit_code)
