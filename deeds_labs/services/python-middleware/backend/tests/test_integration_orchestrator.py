#!/usr/bin/env python3
"""
═══════════════════════════════════════════════════════════════════════
Agentic Knowledge Integration V2 - Integration Orchestrator Tests
═══════════════════════════════════════════════════════════════════════
Date: January 2, 2026
Purpose: Test end-to-end integration (Phase 16)
Task: 16.1, 16.2, 16.3 - Integration tests
═══════════════════════════════════════════════════════════════════════
"""

import pytest
import asyncio
import os
import tempfile
from datetime import datetime
from pathlib import Path
from unittest.mock import Mock, AsyncMock, patch, MagicMock


# ═══════════════════════════════════════════════════════════════════════
# Test Fixtures
# ═══════════════════════════════════════════════════════════════════════

@pytest.fixture
def temp_workspace():
    """Create a temporary workspace with test files."""
    with tempfile.TemporaryDirectory() as tmpdir:
        # Create test files
        src_dir = Path(tmpdir) / "src"
        src_dir.mkdir()

        # TypeScript file
        ts_file = src_dir / "test.ts"
        ts_file.write_text("""
import { something } from './other';

export function testFunction(): string {
    // TODO: Implement this
    return 'test';
}
""")

        # Svelte file
        svelte_file = src_dir / "Test.svelte"
        svelte_file.write_text("""
<script lang="ts">
    import { onMount } from 'svelte';

    let count = $state(0);

    // FIXME: Add error handling
    function increment() {
        count++;
    }
</script>

<button onclick={increment}>{count}</button>
""")

        yield tmpdir


@pytest.fixture
def mock_services():
    """Mock all external services."""
    with patch.multiple(
        'backend.services.integration_orchestrator',
        create=True
    ):
        yield


# ═══════════════════════════════════════════════════════════════════════
# Task 16.1: File Watcher to Indexing Pipeline Tests
# ═══════════════════════════════════════════════════════════════════════

class TestFileWatcherIntegration:
    """Test file watcher to indexing pipeline integration."""

    def test_orchestrator_initialization(self, temp_workspace):
        """Test orchestrator initializes correctly."""
        from backend.services.integration_orchestrator import IntegrationOrchestrator

        orchestrator = IntegrationOrchestrator(
            workspace_root=temp_workspace,
            enable_file_watcher=False,
            enable_clustering=False
        )

        assert orchestrator.workspace_root == temp_workspace
        assert orchestrator._is_running is False

    @pytest.mark.asyncio
    async def test_index_single_file(self, temp_workspace):
        """Test indexing a single file through the pipeline."""
        from backend.services.integration_orchestrator import IntegrationOrchestrator

        orchestrator = IntegrationOrchestrator(
            workspace_root=temp_workspace,
            enable_file_watcher=False,
            enable_clustering=False
        )

        # Index a file
        ts_file = os.path.join(temp_workspace, "src", "test.ts")
        result = await orchestrator.index_single_file(ts_file)

        assert result["file_path"] == ts_file
        assert result["indexed"] is True

    @pytest.mark.asyncio
    async def test_get_stats(self, temp_workspace):
        """Test getting indexing statistics."""
        from backend.services.integration_orchestrator import IntegrationOrchestrator

        orchestrator = IntegrationOrchestrator(
            workspace_root=temp_workspace,
            enable_file_watcher=False,
            enable_clustering=False
        )

        stats = await orchestrator.get_stats()

        assert "totalFiles" in stats
        assert "indexedFiles" in stats
        assert "isRunning" in stats
        assert stats["workspaceRoot"] == temp_workspace

    def test_event_subscription(self, temp_workspace):
        """Test event subscription mechanism."""
        from backend.services.integration_orchestrator import IntegrationOrchestrator

        orchestrator = IntegrationOrchestrator(
            workspace_root=temp_workspace,
            enable_file_watcher=False,
            enable_clustering=False
        )

        events_received = []

        def event_handler(event):
            events_received.append(event)

        orchestrator.subscribe(event_handler)
        assert len(orchestrator._event_subscribers) == 1

        orchestrator.unsubscribe(event_handler)
        assert len(orchestrator._event_subscribers) == 0

    @pytest.mark.asyncio
    async def test_remove_file_from_index(self, temp_workspace):
        """Test removing a file from all indexes."""
        from backend.services.integration_orchestrator import IntegrationOrchestrator

        orchestrator = IntegrationOrchestrator(
            workspace_root=temp_workspace,
            enable_file_watcher=False,
            enable_clustering=False
        )

        # First index a file
        ts_file = os.path.join(temp_workspace, "src", "test.ts")
        await orchestrator.index_single_file(ts_file)

        # Then remove it
        result = await orchestrator.remove_file(ts_file)

        assert result["file_path"] == ts_file
        assert "removed_from" in result


# ═══════════════════════════════════════════════════════════════════════
# Task 16.2: Admin UI to FastAPI Tests
# ═══════════════════════════════════════════════════════════════════════

class TestAdminAPIRoutes:
    """Test admin API routes for UI integration."""

    def test_stats_endpoint_model(self):
        """Test stats response model."""
        from backend.services.admin_api_routes import StatsResponse

        stats = StatsResponse(
            totalFiles=100,
            indexedFiles=95,
            totalErrors=50,
            errorClusters=5,
            topErrorCodes=[{"code": "TS2307", "count": 20}],
            surfaceBreakdown={"routes": 30, "components": 20},
            techBreakdown={"typescript": 45, "svelte": 5},
            lastIndexed="2026-01-02T12:00:00Z"
        )

        assert stats.totalFiles == 100
        assert stats.indexedFiles == 95
        assert stats.totalErrors == 50
        assert len(stats.topErrorCodes) == 1

    def test_error_card_model(self):
        """Test error card model."""
        from backend.services.admin_api_routes import ErrorCard

        error = ErrorCard(
            id="err-1",
            errorCode="TS2307",
            message="Cannot find module",
            filePath="src/test.ts",
            line=5,
            column=10,
            surface=["routes"],
            tech=["typescript"],
            clusterId="cluster-1",
            fixSuggestion="Check import path",
            timestamp="2026-01-02T12:00:00Z"
        )

        assert error.errorCode == "TS2307"
        assert error.line == 5
        assert "routes" in error.surface

    def test_cluster_summary_model(self):
        """Test cluster summary model."""
        from backend.services.admin_api_routes import ClusterSummary

        cluster = ClusterSummary(
            id="cluster-1",
            name="Missing Imports",
            dominant_code="TS2307",
            member_count=20,
            fix_suggestion="Check import paths",
            surface=["routes", "components"],
            tech=["typescript"]
        )

        assert cluster.dominant_code == "TS2307"
        assert cluster.member_count == 20

    def test_graph_node_model(self):
        """Test graph node model."""
        from backend.services.admin_api_routes import GraphNode

        node = GraphNode(
            id="node-1",
            label="test.ts",
            type="service",
            errorCount=3,
            filePath="src/test.ts",
            cluster="cluster-1",
            imports=["./other"],
            exports=["testFunction"],
            functions=["testFunction"]
        )

        assert node.type == "service"
        assert node.errorCount == 3
        assert len(node.imports) == 1

    def test_search_result_model(self):
        """Test search result model."""
        from backend.services.admin_api_routes import SearchResult

        result = SearchResult(
            id="result-1",
            filePath="src/test.ts",
            label="test.ts",
            type="service",
            score=0.95,
            errorCount=2,
            snippet="export function testFunction"
        )

        assert result.score == 0.95
        assert result.type == "service"


# ═══════════════════════════════════════════════════════════════════════
# Task 16.3: Clustering to UI Tests
# ═══════════════════════════════════════════════════════════════════════

class TestClusteringUIIntegration:
    """Test clustering to UI integration."""

    @pytest.mark.asyncio
    async def test_run_clustering(self, temp_workspace):
        """Test running clustering from orchestrator."""
        from backend.services.integration_orchestrator import IntegrationOrchestrator

        orchestrator = IntegrationOrchestrator(
            workspace_root=temp_workspace,
            enable_file_watcher=False,
            enable_clustering=True
        )

        # Mock the clustering service
        with patch.object(orchestrator, '_clustering_service') as mock_clustering:
            mock_result = MagicMock()
            mock_result.num_clusters = 5
            mock_result.total_tags = 50
            mock_result.silhouette_score = 0.75
            mock_result.clusters = []

            mock_clustering.cluster_tags = AsyncMock(return_value=mock_result)
            mock_clustering.store_clusters_postgresql = Mock()
            mock_clustering.cache_clusters_redis = Mock()

            result = await orchestrator.run_clustering(k=5)

            assert result["success"] is True
            assert result["num_clusters"] == 5

    def test_cluster_request_validation(self):
        """Test cluster request validation."""
        from backend.services.admin_api_routes import ClusterRequest

        # Valid request
        request = ClusterRequest(k=10, generate_summaries=True)
        assert request.k == 10

        # Test bounds
        request_min = ClusterRequest(k=2)
        assert request_min.k == 2

        request_max = ClusterRequest(k=50)
        assert request_max.k == 50

    @pytest.mark.asyncio
    async def test_get_graph_data(self, temp_workspace):
        """Test getting graph data for visualization."""
        from backend.services.integration_orchestrator import IntegrationOrchestrator

        orchestrator = IntegrationOrchestrator(
            workspace_root=temp_workspace,
            enable_file_watcher=False,
            enable_clustering=False
        )

        # Index some files first
        ts_file = os.path.join(temp_workspace, "src", "test.ts")
        await orchestrator.index_single_file(ts_file)

        # Get graph data
        graph_data = await orchestrator.get_graph_data()

        assert "nodes" in graph_data
        assert "edges" in graph_data
        assert "metadata" in graph_data

    @pytest.mark.asyncio
    async def test_semantic_search(self, temp_workspace):
        """Test semantic search integration."""
        from backend.services.integration_orchestrator import IntegrationOrchestrator

        orchestrator = IntegrationOrchestrator(
            workspace_root=temp_workspace,
            enable_file_watcher=False,
            enable_clustering=False
        )

        # Index files first
        ts_file = os.path.join(temp_workspace, "src", "test.ts")
        await orchestrator.index_single_file(ts_file)

        # Search (will return empty without Qdrant, but tests the flow)
        results = await orchestrator.semantic_search(
            query="test function",
            top_k=5
        )

        assert isinstance(results, list)


# ═══════════════════════════════════════════════════════════════════════
# Integration Flow Tests
# ═══════════════════════════════════════════════════════════════════════

class TestEndToEndFlow:
    """Test complete end-to-end integration flow."""

    @pytest.mark.asyncio
    async def test_full_indexing_flow(self, temp_workspace):
        """Test the complete indexing flow."""
        from backend.services.integration_orchestrator import IntegrationOrchestrator

        orchestrator = IntegrationOrchestrator(
            workspace_root=temp_workspace,
            enable_file_watcher=False,
            enable_clustering=False
        )

        # Track events
        events = []
        orchestrator.subscribe(lambda e: events.append(e))

        # Index a file
        ts_file = os.path.join(temp_workspace, "src", "test.ts")
        result = await orchestrator.index_single_file(ts_file)

        assert result["indexed"] is True

        # Check stats
        stats = await orchestrator.get_stats()
        assert stats["totalFiles"] >= 0

    def test_singleton_orchestrator(self):
        """Test singleton pattern for orchestrator."""
        from backend.services.integration_orchestrator import get_orchestrator

        orch1 = get_orchestrator()
        orch2 = get_orchestrator()

        assert orch1 is orch2

    @pytest.mark.asyncio
    async def test_indexing_event_emission(self, temp_workspace):
        """Test that indexing emits proper events."""
        from backend.services.integration_orchestrator import IntegrationOrchestrator, IndexingEvent

        orchestrator = IntegrationOrchestrator(
            workspace_root=temp_workspace,
            enable_file_watcher=False,
            enable_clustering=False
        )

        received_events = []

        async def event_handler(event: IndexingEvent):
            received_events.append(event)

        orchestrator.subscribe(event_handler)

        # Index a file
        ts_file = os.path.join(temp_workspace, "src", "test.ts")
        await orchestrator.index_single_file(ts_file)

        # Should have received at least one event
        assert len(received_events) >= 1
        assert received_events[0].event_type == "file_indexed"


# ═══════════════════════════════════════════════════════════════════════
# Run Tests
# ═══════════════════════════════════════════════════════════════════════

if __name__ == "__main__":
    pytest.main([__file__, "-v", "--tb=short"])
