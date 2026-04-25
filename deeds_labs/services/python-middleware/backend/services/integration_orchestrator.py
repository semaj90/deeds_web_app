#!/usr/bin/env python3
"""
═══════════════════════════════════════════════════════════════════════
Agentic Knowledge Integration V2 - Integration Orchestrator
═══════════════════════════════════════════════════════════════════════
Date: January 2, 2026
Purpose: Wire up file watcher to indexing pipeline
Task: 16.1 - Wire up file watcher to indexing pipeline
═══════════════════════════════════════════════════════════════════════
"""

import os
import json
import logging
import asyncio
from datetime import datetime
from typing import Dict, List, Optional, Any, Set
from dataclasses import dataclass, asdict
from pathlib import Path

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)


@dataclass
class IndexingEvent:
    """Event emitted during indexing."""
    event_type: str  # 'file_indexed', 'file_removed', 'batch_complete', 'error'
    file_path: Optional[str]
    timestamp: str
    details: Dict[str, Any]


class IntegrationOrchestrator:
    """
    Integration Orchestrator - Wires up all services for end-to-end flow.

    Flow:
    1. File watcher detects changes
    2. AST analysis extracts structure
    3. Multi-DB coordinator stores data
    4. Enhanced tags created with embeddings
    5. Clustering updated
    6. UI notified via SSE/WebSocket
    """

    def __init__(
        self,
        workspace_root: Optional[str] = None,
        enable_file_watcher: bool = True,
        enable_clustering: bool = True
    ):
        """Initialize the integration orchestrator."""
        self.workspace_root = workspace_root or os.getcwd()
        self.enable_file_watcher = enable_file_watcher
        self.enable_clustering = enable_clustering

        # Service instances (lazy loaded)
        self._codebase_indexer = None
        self._ast_service = None
        self._multi_db_coordinator = None
        self._enhanced_tag_service = None
        self._clustering_service = None
        self._ai_recommendation_service = None

        # Event subscribers
        self._event_subscribers: List[callable] = []

        # State
        self._is_running = False
        self._pending_files: Set[str] = set()
        self._last_cluster_update: Optional[str] = None

        logger.info(f"🔗 IntegrationOrchestrator initialized (root: {self.workspace_root})")

    @property
    def codebase_indexer(self):
        """Lazy load codebase indexer service."""
        if self._codebase_indexer is None:
            from backend.services.codebase_indexer_service import CodebaseIndexerService
            self._codebase_indexer = CodebaseIndexerService(workspace_root=self.workspace_root)
        return self._codebase_indexer

    @property
    def ast_service(self):
        """Lazy load AST analysis service."""
        if self._ast_service is None:
            from backend.services.ast_analysis_service import ASTAnalysisService
            self._ast_service = ASTAnalysisService()
        return self._ast_service

    @property
    def multi_db_coordinator(self):
        """Lazy load multi-DB coordinator."""
        if self._multi_db_coordinator is None:
            from backend.services.multi_db_coordinator import MultiDBCoordinator
            self._multi_db_coordinator = MultiDBCoordinator()
        return self._multi_db_coordinator

    @property
    def enhanced_tag_service(self):
        """Lazy load enhanced tag service."""
        if self._enhanced_tag_service is None:
            from backend.services.enhanced_tag_service import EnhancedTagService
            self._enhanced_tag_service = EnhancedTagService()
        return self._enhanced_tag_service

    @property
    def clustering_service(self):
        """Lazy load clustering service."""
        if self._clustering_service is None:
            from backend.services.kmeans_clustering_service import KMeansClusteringService
            self._clustering_service = KMeansClusteringService()
        return self._clustering_service

    @property
    def ai_recommendation_service(self):
        """Lazy load AI recommendation service."""
        if self._ai_recommendation_service is None:
            from backend.services.ai_recommendation_service import AIRecommendationService
            self._ai_recommendation_service = AIRecommendationService()
        return self._ai_recommendation_service

    def subscribe(self, callback: callable):
        """Subscribe to indexing events."""
        self._event_subscribers.append(callback)

    def unsubscribe(self, callback: callable):
        """Unsubscribe from indexing events."""
        if callback in self._event_subscribers:
            self._event_subscribers.remove(callback)

    async def _emit_event(self, event: IndexingEvent):
        """Emit event to all subscribers."""
        for subscriber in self._event_subscribers:
            try:
                if asyncio.iscoroutinefunction(subscriber):
                    await subscriber(event)
                else:
                    subscriber(event)
            except Exception as e:
                logger.error(f"Event subscriber error: {e}")

    async def start(self):
        """Start the integration orchestrator."""
        if self._is_running:
            logger.warning("Orchestrator already running")
            return

        self._is_running = True
        logger.info("🚀 Starting Integration Orchestrator...")

        # Start file watcher if enabled
        if self.enable_file_watcher:
            self.codebase_indexer.start_watching()
            logger.info("  ✓ File watcher started")

        # Initial indexing
        await self.run_full_index()

        logger.info("✅ Integration Orchestrator started")

    async def stop(self):
        """Stop the integration orchestrator."""
        if not self._is_running:
            return

        self._is_running = False

        # Stop file watcher
        if self.enable_file_watcher:
            self.codebase_indexer.stop_watching()

        logger.info("🛑 Integration Orchestrator stopped")

    async def run_full_index(self) -> Dict[str, Any]:
        """
        Run full codebase indexing pipeline.

        Flow:
        1. Index all files with codebase indexer
        2. Run AST analysis on each file
        3. Store in multi-DB coordinator
        4. Create enhanced tags
        5. Run clustering

        Returns:
            Indexing statistics
        """
        logger.info("📂 Running full codebase index...")
        start_time = datetime.now()

        stats = {
            "total_files": 0,
            "indexed_files": 0,
            "ast_analyzed": 0,
            "tags_created": 0,
            "clusters_created": 0,
            "errors": []
        }

        try:
            # Step 1: Index files
            indexing_stats = await self.codebase_indexer.index_directory(
                directory=self.workspace_root,
                extensions={'.ts', '.tsx', '.svelte', '.js', '.py', '.go'}
            )
            stats["total_files"] = indexing_stats.total_files
            stats["indexed_files"] = indexing_stats.indexed_files

            await self._emit_event(IndexingEvent(
                event_type="batch_complete",
                file_path=None,
                timestamp=datetime.now().isoformat(),
                details={"phase": "indexing", "count": stats["indexed_files"]}
            ))

            # Step 2: AST analysis for TypeScript/Svelte files
            indexed_files = self.codebase_indexer.get_indexed_files()
            for indexed in indexed_files:
                if indexed.file_path.endswith(('.ts', '.tsx', '.svelte')):
                    try:
                        await self.ast_service.analyze_file(indexed.file_path)
                        stats["ast_analyzed"] += 1
                    except Exception as e:
                        stats["errors"].append(f"AST error for {indexed.file_path}: {e}")

            # Step 3: Create enhanced tags
            for indexed in indexed_files:
                try:
                    tag = await self.enhanced_tag_service.create_tag(
                        file_path=indexed.file_path,
                        category=indexed.category,
                        summary=indexed.summary,
                        imports=indexed.imports,
                        exports=indexed.exports,
                        functions=indexed.functions
                    )
                    if tag:
                        stats["tags_created"] += 1
                except Exception as e:
                    stats["errors"].append(f"Tag error for {indexed.file_path}: {e}")

            # Step 4: Run clustering if enabled
            if self.enable_clustering and stats["tags_created"] >= 10:
                try:
                    cluster_result = await self.clustering_service.cluster_tags(k=10)
                    stats["clusters_created"] = cluster_result.num_clusters
                    self._last_cluster_update = datetime.now().isoformat()
                except Exception as e:
                    stats["errors"].append(f"Clustering error: {e}")

            # Calculate duration
            duration = (datetime.now() - start_time).total_seconds()
            stats["duration_seconds"] = duration
            stats["completed_at"] = datetime.now().isoformat()

            logger.info(f"✅ Full index complete: {stats['indexed_files']} files, "
                       f"{stats['tags_created']} tags, {stats['clusters_created']} clusters "
                       f"in {duration:.1f}s")

            await self._emit_event(IndexingEvent(
                event_type="batch_complete",
                file_path=None,
                timestamp=datetime.now().isoformat(),
                details=stats
            ))

        except Exception as e:
            logger.error(f"Full index failed: {e}")
            stats["errors"].append(str(e))

        return stats

    async def index_single_file(self, file_path: str) -> Dict[str, Any]:
        """
        Index a single file through the full pipeline.

        Args:
            file_path: Path to file to index

        Returns:
            Indexing result
        """
        logger.info(f"📄 Indexing single file: {file_path}")

        result = {
            "file_path": file_path,
            "success": False,
            "indexed": False,
            "ast_analyzed": False,
            "tag_created": False,
            "errors": []
        }

        try:
            # Step 1: Index file
            indexed = await self.codebase_indexer.index_file(file_path)
            if indexed:
                result["indexed"] = True

                # Step 2: AST analysis
                if file_path.endswith(('.ts', '.tsx', '.svelte')):
                    try:
                        await self.ast_service.analyze_file(file_path)
                        result["ast_analyzed"] = True
                    except Exception as e:
                        result["errors"].append(f"AST: {e}")

                # Step 3: Create/update enhanced tag
                try:
                    tag = await self.enhanced_tag_service.create_tag(
                        file_path=file_path,
                        category=indexed.category,
                        summary=indexed.summary,
                        imports=indexed.imports,
                        exports=indexed.exports,
                        functions=indexed.functions
                    )
                    if tag:
                        result["tag_created"] = True
                except Exception as e:
                    result["errors"].append(f"Tag: {e}")

                result["success"] = True

                await self._emit_event(IndexingEvent(
                    event_type="file_indexed",
                    file_path=file_path,
                    timestamp=datetime.now().isoformat(),
                    details=result
                ))

        except Exception as e:
            result["errors"].append(str(e))
            logger.error(f"Failed to index {file_path}: {e}")

        return result

    async def remove_file(self, file_path: str) -> Dict[str, Any]:
        """
        Remove a file from all indexes.

        Args:
            file_path: Path to file to remove

        Returns:
            Removal result
        """
        logger.info(f"🗑️ Removing file from index: {file_path}")

        result = {
            "file_path": file_path,
            "removed_from": []
        }

        try:
            # Remove from codebase indexer
            await self.codebase_indexer.remove_from_index(file_path)
            result["removed_from"].append("codebase_indexer")

            # Remove from enhanced tags
            await self.enhanced_tag_service.delete_tag(file_path)
            result["removed_from"].append("enhanced_tags")

            # Remove from Neo4j
            await self.ast_service.remove_file(file_path)
            result["removed_from"].append("neo4j")

            await self._emit_event(IndexingEvent(
                event_type="file_removed",
                file_path=file_path,
                timestamp=datetime.now().isoformat(),
                details=result
            ))

        except Exception as e:
            logger.error(f"Failed to remove {file_path}: {e}")
            result["error"] = str(e)

        return result

    async def run_clustering(self, k: int = 10) -> Dict[str, Any]:
        """
        Run clustering on all tags.

        Args:
            k: Number of clusters

        Returns:
            Clustering result
        """
        logger.info(f"🔮 Running clustering (k={k})...")

        try:
            result = await self.clustering_service.cluster_tags(k=k, generate_summaries=True)

            # Store results
            self.clustering_service.store_clusters_postgresql(result)
            self.clustering_service.cache_clusters_redis(result)

            self._last_cluster_update = datetime.now().isoformat()

            return {
                "success": True,
                "num_clusters": result.num_clusters,
                "total_tags": result.total_tags,
                "silhouette_score": result.silhouette_score,
                "clusters": [
                    {
                        "id": c.cluster_id,
                        "size": c.size,
                        "summary": c.summary,
                        "keywords": c.keywords
                    }
                    for c in result.clusters
                ]
            }

        except Exception as e:
            logger.error(f"Clustering failed: {e}")
            return {"success": False, "error": str(e)}

    async def get_stats(self) -> Dict[str, Any]:
        """Get current indexing statistics."""
        indexer_stats = self.codebase_indexer.get_stats()

        return {
            "totalFiles": indexer_stats.get("total_files", 0),
            "indexedFiles": indexer_stats.get("total_files", 0),
            "categories": indexer_stats.get("categories", {}),
            "totalLines": indexer_stats.get("total_lines", 0),
            "totalFunctions": indexer_stats.get("total_functions", 0),
            "lastClusterUpdate": self._last_cluster_update,
            "isRunning": self._is_running,
            "workspaceRoot": self.workspace_root
        }

    async def semantic_search(
        self,
        query: str,
        top_k: int = 10,
        filters: Optional[Dict[str, Any]] = None
    ) -> List[Dict[str, Any]]:
        """
        Perform semantic search across the codebase.

        Args:
            query: Search query
            top_k: Number of results
            filters: Optional filters

        Returns:
            Search results
        """
        results = await self.codebase_indexer.semantic_search(
            query=query,
            top_k=top_k,
            filters=filters
        )

        return [
            {
                "id": r.file_path.replace("/", "-").replace(".", "-"),
                "filePath": r.file_path,
                "label": Path(r.file_path).name,
                "type": r.category,
                "score": r.score,
                "errorCount": 0,  # Would need to query error index
                "snippet": r.snippet
            }
            for r in results
        ]

    async def get_graph_data(self) -> Dict[str, Any]:
        """
        Get dependency graph data for visualization.

        Returns:
            Graph nodes and edges
        """
        indexed_files = self.codebase_indexer.get_indexed_files()

        nodes = []
        edges = []
        file_id_map = {}

        # Create nodes
        for indexed in indexed_files:
            node_id = indexed.file_path.replace("/", "-").replace(".", "-")
            file_id_map[indexed.file_path] = node_id

            nodes.append({
                "id": node_id,
                "label": Path(indexed.file_path).name,
                "type": indexed.category,
                "errorCount": 0,  # Would need error index
                "filePath": indexed.file_path,
                "imports": indexed.imports,
                "exports": indexed.exports,
                "functions": indexed.functions
            })

        # Create edges from imports
        for indexed in indexed_files:
            source_id = file_id_map.get(indexed.file_path)
            if not source_id:
                continue

            for imp in indexed.imports:
                # Try to resolve import to a file
                for target_path, target_id in file_id_map.items():
                    if any(part in imp for part in Path(target_path).parts):
                        edges.append({
                            "source": source_id,
                            "target": target_id,
                            "type": "import"
                        })
                        break

        return {
            "nodes": nodes,
            "edges": edges,
            "metadata": {
                "totalNodes": len(nodes),
                "totalEdges": len(edges),
                "generatedAt": datetime.now().isoformat()
            }
        }


# Singleton instance
_orchestrator: Optional[IntegrationOrchestrator] = None


def get_orchestrator() -> IntegrationOrchestrator:
    """Get the singleton orchestrator instance."""
    global _orchestrator
    if _orchestrator is None:
        _orchestrator = IntegrationOrchestrator()
    return _orchestrator


async def main():
    """Example usage."""
    orchestrator = IntegrationOrchestrator(
        workspace_root=".",
        enable_file_watcher=False,
        enable_clustering=False
    )

    # Run indexing
    stats = await orchestrator.run_full_index()
    print(f"\n✅ Indexing complete:")
    print(f"   Files: {stats['indexed_files']}")
    print(f"   Tags: {stats['tags_created']}")

    # Get stats
    current_stats = await orchestrator.get_stats()
    print(f"\n📊 Current stats:")
    print(f"   Total files: {current_stats['totalFiles']}")


if __name__ == "__main__":
    asyncio.run(main())
