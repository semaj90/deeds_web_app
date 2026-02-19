#!/usr/bin/env python3
"""
═══════════════════════════════════════════════════════════════════════
Agentic Knowledge Integration V2 - Coordinate Cache Tests
═══════════════════════════════════════════════════════════════════════
Date: January 2, 2026
Purpose: Property-based tests for coordinate cache consistency
Task: 8.3 - Write property test for cache consistency
Validates: Requirements 7.3, 7.5
═══════════════════════════════════════════════════════════════════════
"""

import pytest
import time
import uuid
from typing import List, Dict

from backend.services.coordinate_cache_service import (
    CoordinateCacheService,
    CachedCoordinate
)


# ═══════════════════════════════════════════════════════════════════════
# Property 6: Cache Consistency
# For any cached coordinate, the system SHALL maintain consistency
# between cache and source, with proper TTL enforcement and invalidation.
# Validates: Requirements 7.3, 7.5
# ═══════════════════════════════════════════════════════════════════════


@pytest.fixture
def cache_service():
    """Create CoordinateCacheService for testing."""
    service = CoordinateCacheService()
    # Clean up any existing test data
    service.invalidate_all()
    yield service
    # Cleanup after tests
    service.invalidate_all()


@pytest.mark.asyncio
async def test_property_6_cache_set_and_get(cache_service):
    """
    Property 6: Cache Consistency - Basic Set/Get
    Cached coordinates must be retrievable with correct values.
    """
    tag_id = f"test-tag-{uuid.uuid4().hex[:8]}"
    x, y, z = 0.5, -0.3, 0.8

    # Set coordinate
    success = cache_service.set_coordinate(tag_id, x, y, z, method="pca")
    assert success, "Cache set must succeed"

    # Get coordinate
    coord = cache_service.get_coordinate(tag_id)
    assert coord is not None, "Cached coordinate must be retrievable"
    assert coord.id == tag_id, "Tag ID must match"
    assert abs(coord.x - x) < 0.001, "X coordinate must match"
    assert abs(coord.y - y) < 0.001, "Y coordinate must match"
    assert abs(coord.z - z) < 0.001, "Z coordinate must match"
    assert coord.method == "pca", "Method must match"

    print(f"✅ Property 6: Basic set/get validated")


@pytest.mark.asyncio
async def test_property_6_cache_miss_handling(cache_service):
    """
    Property 6: Cache Consistency - Cache Miss
    Non-existent keys must return None gracefully.
    """
    non_existent_id = f"non-existent-{uuid.uuid4().hex}"

    coord = cache_service.get_coordinate(non_existent_id)
    assert coord is None, "Cache miss must return None"

    print(f"✅ Property 6: Cache miss handling validated")


@pytest.mark.asyncio
async def test_property_6_cache_invalidation(cache_service):
    """
    Property 6: Cache Consistency - Invalidation
    Invalidated coordinates must not be retrievable.
    """
    tag_id = f"test-invalidate-{uuid.uuid4().hex[:8]}"

    # Set coordinate
    cache_service.set_coordinate(tag_id, 0.1, 0.2, 0.3)

    # Verify it exists
    coord = cache_service.get_coordinate(tag_id)
    assert coord is not None, "Coordinate must exist before invalidation"

    # Invalidate
    success = cache_service.invalidate(tag_id)
    assert success, "Invalidation must succeed"

    # Verify it's gone
    coord = cache_service.get_coordinate(tag_id)
    assert coord is None, "Coordinate must not exist after invalidation"

    print(f"✅ Property 6: Cache invalidation validated")


@pytest.mark.asyncio
async def test_property_6_batch_operations(cache_service):
    """
    Property 6: Cache Consistency - Batch Operations
    Batch set/get must work correctly for multiple coordinates.
    """
    # Create batch of coordinates
    coords = [
        {"id": f"batch-{i}-{uuid.uuid4().hex[:6]}", "x": i * 0.1, "y": i * 0.2, "z": i * 0.3}
        for i in range(5)
    ]

    # Batch set
    cached = cache_service.set_coordinates_batch(coords)
    assert cached == 5, "All coordinates must be cached"

    # Batch get
    ids = [c["id"] for c in coords]
    results = cache_service.get_coordinates_batch(ids)

    assert len(results) == 5, "All coordinates must be retrieved"
    for coord_dict in coords:
        result = results.get(coord_dict["id"])
        assert result is not None, f"Coordinate {coord_dict['id']} must exist"
        assert abs(result.x - coord_dict["x"]) < 0.001, "X must match"
        assert abs(result.y - coord_dict["y"]) < 0.001, "Y must match"
        assert abs(result.z - coord_dict["z"]) < 0.001, "Z must match"

    print(f"✅ Property 6: Batch operations validated ({cached} coordinates)")


@pytest.mark.asyncio
async def test_property_6_batch_invalidation(cache_service):
    """
    Property 6: Cache Consistency - Batch Invalidation
    Batch invalidation must remove all specified coordinates.
    """
    # Create and cache coordinates
    ids = [f"batch-inv-{i}-{uuid.uuid4().hex[:6]}" for i in range(3)]
    for i, tag_id in enumerate(ids):
        cache_service.set_coordinate(tag_id, i * 0.1, i * 0.2, i * 0.3)

    # Verify all exist
    for tag_id in ids:
        assert cache_service.get_coordinate(tag_id) is not None

    # Batch invalidate
    deleted = cache_service.invalidate_batch(ids)
    assert deleted == 3, "All coordinates must be invalidated"

    # Verify all gone
    for tag_id in ids:
        assert cache_service.get_coordinate(tag_id) is None

    print(f"✅ Property 6: Batch invalidation validated")


@pytest.mark.asyncio
async def test_property_6_ttl_enforcement(cache_service):
    """
    Property 6: Cache Consistency - TTL Enforcement
    Cached coordinates must have TTL set correctly.
    """
    tag_id = f"test-ttl-{uuid.uuid4().hex[:8]}"

    # Set coordinate
    cache_service.set_coordinate(tag_id, 0.5, 0.5, 0.5)

    # Check TTL is set (should be close to 24 hours = 86400 seconds)
    ttl = cache_service.get_ttl(tag_id)
    assert ttl > 0, "TTL must be positive"
    assert ttl <= 86400, "TTL must not exceed 24 hours"
    assert ttl > 86000, "TTL should be close to 24 hours for fresh entry"

    print(f"✅ Property 6: TTL enforcement validated (TTL={ttl}s)")


@pytest.mark.asyncio
async def test_property_6_cache_update_overwrites(cache_service):
    """
    Property 6: Cache Consistency - Update Overwrites
    Setting a coordinate again must overwrite the previous value.
    """
    tag_id = f"test-update-{uuid.uuid4().hex[:8]}"

    # Set initial coordinate
    cache_service.set_coordinate(tag_id, 0.1, 0.2, 0.3)
    coord1 = cache_service.get_coordinate(tag_id)
    assert abs(coord1.x - 0.1) < 0.001

    # Update with new values
    cache_service.set_coordinate(tag_id, 0.9, 0.8, 0.7)
    coord2 = cache_service.get_coordinate(tag_id)

    assert abs(coord2.x - 0.9) < 0.001, "X must be updated"
    assert abs(coord2.y - 0.8) < 0.001, "Y must be updated"
    assert abs(coord2.z - 0.7) < 0.001, "Z must be updated"

    print(f"✅ Property 6: Cache update overwrites validated")


@pytest.mark.asyncio
async def test_property_6_cache_stats(cache_service):
    """
    Property 6: Cache Consistency - Statistics
    Cache stats must accurately reflect cached data.
    """
    # Get initial stats
    initial_stats = cache_service.get_cache_stats()
    assert initial_stats["redis_connected"], "Redis must be connected"

    # Add some coordinates
    for i in range(3):
        cache_service.set_coordinate(f"stats-test-{i}", i * 0.1, i * 0.2, i * 0.3)

    # Get updated stats
    stats = cache_service.get_cache_stats()
    assert stats["total_cached"] >= 3, "Stats must reflect cached coordinates"
    assert stats["ttl_seconds"] == 86400, "TTL must be 24 hours"

    print(f"✅ Property 6: Cache stats validated (total={stats['total_cached']})")


@pytest.mark.asyncio
async def test_property_6_coordinate_data_integrity(cache_service):
    """
    Property 6: Cache Consistency - Data Integrity
    All coordinate fields must be preserved correctly.
    """
    tag_id = f"test-integrity-{uuid.uuid4().hex[:8]}"
    x, y, z = -0.999, 0.0, 0.999
    method = "umap"

    # Set coordinate with specific values
    cache_service.set_coordinate(tag_id, x, y, z, method=method)

    # Retrieve and verify all fields
    coord = cache_service.get_coordinate(tag_id)
    assert coord is not None

    # Verify coordinate values
    assert coord.id == tag_id, "ID must match"
    assert abs(coord.x - x) < 0.0001, "X must be precise"
    assert abs(coord.y - y) < 0.0001, "Y must be precise"
    assert abs(coord.z - z) < 0.0001, "Z must be precise"
    assert coord.method == method, "Method must match"

    # Verify timestamps exist
    assert coord.cached_at, "cached_at must be set"
    assert coord.expires_at, "expires_at must be set"

    print(f"✅ Property 6: Data integrity validated")


if __name__ == "__main__":
    pytest.main([__file__, "-v", "-s"])
