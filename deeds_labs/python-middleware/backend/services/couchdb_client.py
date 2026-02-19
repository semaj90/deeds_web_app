"""
CouchDB Client Service
Manages connections to CouchDB for graph analysis, codebase indexing, and LLM summaries.
"""

import os
import logging
from typing import Dict, List, Any, Optional
import couchdb
from datetime import datetime

logger = logging.getLogger(__name__)


class CouchDBClient:
    """
    CouchDB client for document storage and MapReduce graph analysis.

    Databases:
    - codebase_graph: AST topology, file dependencies
    - llm_summaries: AI-generated code summaries
    - error_clusters: Phase 89 GPU clustering results
    """

    def __init__(self, url: Optional[str] = None):
        """
        Initialize CouchDB client.

        Args:
            url: CouchDB connection URL (default: from env or localhost)
        """
        self.url = url or os.getenv(
            "COUCHDB_URL",
            "http://admin:password@localhost:5984"
        )

        try:
            self.server = couchdb.Server(self.url)
            logger.info(f"Connected to CouchDB: {self.url}")
        except Exception as e:
            logger.error(f"Failed to connect to CouchDB: {e}")
            raise

        # Initialize databases
        self.codebase_graph = self._get_or_create_db("codebase_graph")
        self.llm_summaries = self._get_or_create_db("llm_summaries")
        self.error_clusters = self._get_or_create_db("error_clusters")

    def _get_or_create_db(self, db_name: str):
        """Get database or create if not exists"""
        try:
            if db_name in self.server:
                db = self.server[db_name]
                logger.info(f"Using existing database: {db_name}")
            else:
                db = self.server.create(db_name)
                logger.info(f"Created new database: {db_name}")
            return db
        except Exception as e:
            logger.error(f"Error accessing database {db_name}: {e}")
            raise

    # ============================================================================
    # Codebase Graph Operations
    # ============================================================================

    def store_file_node(
        self,
        file_path: str,
        imports: List[str],
        exports: List[str],
        classes: List[str],
        functions: List[str],
        error_count: int = 0,
        metadata: Optional[Dict[str, Any]] = None
    ) -> str:
        """
        Store a file node in the codebase graph.

        Args:
            file_path: Relative path to file
            imports: List of imported modules/files
            exports: List of exported symbols
            classes: List of class names
            functions: List of function names
            error_count: Number of errors in this file
            metadata: Additional metadata

        Returns:
            Document ID
        """
        doc = {
            "_id": f"file:{file_path}",
            "type": "file",
            "path": file_path,
            "imports": imports,
            "exports": exports,
            "classes": classes,
            "functions": functions,
            "error_count": error_count,
            "metadata": metadata or {},
            "indexed_at": datetime.utcnow().isoformat()
        }

        # Update if exists, create if not
        if doc["_id"] in self.codebase_graph:
            existing = self.codebase_graph[doc["_id"]]
            doc["_rev"] = existing["_rev"]

        doc_id, _ = self.codebase_graph.save(doc)
        logger.debug(f"Stored file node: {file_path}")
        return doc_id

    def get_file_node(self, file_path: str) -> Optional[Dict[str, Any]]:
        """Get a file node by path"""
        doc_id = f"file:{file_path}"
        if doc_id in self.codebase_graph:
            return self.codebase_graph[doc_id]
        return None

    def query_error_hotspots(self, limit: int = 20) -> List[Dict[str, Any]]:
        """
        Query files with most errors using MapReduce.

        Returns:
            List of files sorted by error count (descending)
        """
        # Use design doc view created during setup
        try:
            results = self.codebase_graph.view(
                '_design/topology/by_error_count',
                descending=True,
                limit=limit
            )
            return [row.value for row in results]
        except Exception as e:
            logger.warning(f"Error querying hotspots: {e}")
            return []

    def query_dependency_graph(self, file_path: str) -> Dict[str, Any]:
        """
        Get dependency graph for a file (what it imports and what imports it).

        Returns:
            {
                "imports": [...],
                "imported_by": [...]
            }
        """
        file_node = self.get_file_node(file_path)
        if not file_node:
            return {"imports": [], "imported_by": []}

        imports = file_node.get("imports", [])

        # Find files that import this one using design doc view
        # Note: This requires a custom view - for now use simple iteration
        # In production, add a by_imports view to topology design doc
        try:
            all_results = self.codebase_graph.view(
                '_design/topology/dependency_graph',
                include_docs=True
            )
            imported_by = [
                row.doc['path']
                for row in all_results
                if row.doc.get('type') == 'file' and file_path in row.doc.get('imports', [])
            ]
        except Exception as e:
            logger.warning(f"Error querying reverse dependencies: {e}")
            imported_by = []

        return {
            "imports": imports,
            "imported_by": imported_by
        }

    # ============================================================================
    # LLM Summary Operations
    # ============================================================================

    def store_llm_summary(
        self,
        file_path: str,
        summary: str,
        key_entities: List[str],
        llm_provider: str = "gemma3-legal",
        metadata: Optional[Dict[str, Any]] = None
    ) -> str:
        """
        Store LLM-generated summary for a code file.

        Args:
            file_path: File that was summarized
            summary: LLM-generated summary text
            key_entities: Extracted entities (classes, functions, concepts)
            llm_provider: LLM used for generation
            metadata: Additional metadata

        Returns:
            Document ID
        """
        doc = {
            "_id": f"summary:{file_path}",
            "type": "llm_summary",
            "file_path": file_path,
            "summary": summary,
            "key_entities": key_entities,
            "llm_provider": llm_provider,
            "metadata": metadata or {},
            "generated_at": datetime.utcnow().isoformat()
        }

        # Update if exists
        if doc["_id"] in self.llm_summaries:
            existing = self.llm_summaries[doc["_id"]]
            doc["_rev"] = existing["_rev"]

        doc_id, _ = self.llm_summaries.save(doc)
        logger.debug(f"Stored LLM summary: {file_path}")
        return doc_id

    def get_llm_summary(self, file_path: str) -> Optional[Dict[str, Any]]:
        """Get LLM summary for a file"""
        doc_id = f"summary:{file_path}"
        if doc_id in self.llm_summaries:
            return self.llm_summaries[doc_id]
        return None

    def list_unsummarized_files(self, limit: int = 100) -> List[str]:
        """
        Find files in codebase_graph that don't have summaries.

        Returns:
            List of file paths needing summaries
        """
        # Get all file paths from codebase_graph
        map_func = """
        function(doc) {
            if (doc.type === 'file') {
                emit(doc.path, 1);
            }
        }
        """

        all_files = [row.key for row in self.codebase_graph.query(map_func)]

        # Get summarized files
        map_func_summaries = """
        function(doc) {
            if (doc.type === 'llm_summary') {
                emit(doc.file_path, 1);
            }
        }
        """

        summarized = {row.key for row in self.llm_summaries.query(map_func_summaries)}

        # Find difference
        unsummarized = [f for f in all_files if f not in summarized]
        return unsummarized[:limit]

    # ============================================================================
    # Error Cluster Operations
    # ============================================================================

    def store_error_cluster(
        self,
        cluster_id: int,
        centroid: List[float],
        member_files: List[str],
        representative_errors: List[str],
        cluster_label: str,
        metadata: Optional[Dict[str, Any]] = None
    ) -> str:
        """
        Store GPU clustering results.

        Args:
            cluster_id: Cluster number
            centroid: 768-dim centroid vector
            member_files: Files in this cluster
            representative_errors: Sample errors from cluster
            cluster_label: Human-readable label
            metadata: Additional metadata

        Returns:
            Document ID
        """
        doc = {
            "_id": f"cluster:{cluster_id}",
            "type": "error_cluster",
            "cluster_id": cluster_id,
            "centroid": centroid,
            "member_files": member_files,
            "representative_errors": representative_errors,
            "cluster_label": cluster_label,
            "metadata": metadata or {},
            "created_at": datetime.utcnow().isoformat()
        }

        # Update if exists
        if doc["_id"] in self.error_clusters:
            existing = self.error_clusters[doc["_id"]]
            doc["_rev"] = existing["_rev"]

        doc_id, _ = self.error_clusters.save(doc)
        logger.info(f"Stored error cluster: {cluster_id} ({len(member_files)} files)")
        return doc_id

    def get_error_cluster(self, cluster_id: int) -> Optional[Dict[str, Any]]:
        """Get error cluster by ID"""
        doc_id = f"cluster:{cluster_id}"
        if doc_id in self.error_clusters:
            return self.error_clusters[doc_id]
        return None

    def list_all_clusters(self) -> List[Dict[str, Any]]:
        """List all error clusters"""
        map_func = """
        function(doc) {
            if (doc.type === 'error_cluster') {
                emit(doc.cluster_id, {
                    label: doc.cluster_label,
                    file_count: doc.member_files.length,
                    created_at: doc.created_at
                });
            }
        }
        """

        results = self.error_clusters.query(map_func)
        return [{"cluster_id": row.key, **row.value} for row in results]

    # ============================================================================
    # Health & Diagnostics
    # ============================================================================

    def health_check(self) -> Dict[str, Any]:
        """Check CouchDB health and database stats"""
        try:
            # Test connection
            version = self.server.version()

            # Get database stats
            stats = {
                "status": "healthy",
                "version": version,
                "databases": {
                    "codebase_graph": {
                        "doc_count": len(self.codebase_graph),
                        "exists": True
                    },
                    "llm_summaries": {
                        "doc_count": len(self.llm_summaries),
                        "exists": True
                    },
                    "error_clusters": {
                        "doc_count": len(self.error_clusters),
                        "exists": True
                    }
                }
            }

            return stats
        except Exception as e:
            return {
                "status": "unhealthy",
                "error": str(e)
            }


# Global instance
_couchdb_client: Optional[CouchDBClient] = None


def get_couchdb_client() -> CouchDBClient:
    """Get or create global CouchDB client"""
    global _couchdb_client
    if _couchdb_client is None:
        _couchdb_client = CouchDBClient()
    return _couchdb_client
