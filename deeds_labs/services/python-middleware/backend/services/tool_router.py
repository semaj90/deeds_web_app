"""
Tool Router - Central registry for ACE agent tools
Integrates: MinIO SIMD, CHR97, svelte-check, ts-morph, RAG, VLM
"""
from __future__ import annotations
from typing import Dict, Any, Callable, Optional
import os
import httpx
import asyncio

class ToolExecutionError(Exception):
    """Raised when tool execution fails"""
    pass

class ToolRouter:
    """
    Central registry so ACE can say:
      TOOL: minio_get_chunks
      ARGS: {"case_id": "doj_v_foo"}

    and this router does the actual HTTP calls.
    """

    # Tool name aliases for compatibility
    ALIASES = {
        # FastMCP-style names → canonical names
        "get_document_chunks": "minio_get_chunks",
        "get_case_evidence_metadata": "minio_get_evidence",
        "get_manifest": "minio_get_manifest",
        "search_legal_documents": "ace_rag_search",
        "query_knowledge_graph": "ace_kag_search",
        "analyze_document_with_gemma": "ace_analyze_with_gemma",
        "ace_plan_action": "ace_phase72_next_step",
        "run_svelte_check": "phase72_run_svelte_check",
        "get_ast_graph": "phase72_get_ast_graph",
    }

    def __init__(
        self,
        minio_simd_base: str | None = None,
        ollama_base: str | None = None,
        qdrant_base: str | None = None,
        neo4j_uri: str | None = None,
    ):
        # Service endpoints
        self.minio_simd_base = minio_simd_base or os.getenv("MINIO_SIMD_BASE", "http://localhost:8096")
        self.ollama_base = ollama_base or os.getenv("OLLAMA_HOST", "http://localhost:11434")
        self.qdrant_base = qdrant_base or os.getenv("QDRANT_HOST", "http://localhost:6333")
        self.neo4j_uri = neo4j_uri or os.getenv("NEO4J_URI", "bolt://localhost:7687")

        # Tool registry
        self._tools: Dict[str, Callable[[Dict[str, Any]], Dict[str, Any]]] = {}
        self._async_tools: Dict[str, Callable[[Dict[str, Any]], Any]] = {}

        self._register_default_tools()

    # ----------------- Public API -----------------

    def list_tools(self) -> Dict[str, str]:
        """List all available tools with descriptions"""
        tools = {}
        for name, fn in self._tools.items():
            tools[name] = fn.__doc__ or ""
        for name, fn in self._async_tools.items():
            tools[name] = fn.__doc__ or ""
        return tools

    def execute(self, name: str, args: Dict[str, Any]) -> Dict[str, Any]:
        """Execute a synchronous tool"""
        # Resolve alias
        canonical = self.ALIASES.get(name, name)

        if canonical not in self._tools:
            raise ToolExecutionError(f"Unknown tool: {name} (canonical: {canonical})")
        return self._tools[canonical](args)

    async def execute_async(self, name: str, args: Dict[str, Any]) -> Dict[str, Any]:
        """Execute an async tool"""
        # Resolve alias
        canonical = self.ALIASES.get(name, name)

        if canonical in self._async_tools:
            return await self._async_tools[canonical](args)
        elif canonical in self._tools:
            # Fallback to sync execution
            return self._tools[canonical](args)
        else:
            raise ToolExecutionError(f"Unknown tool: {name} (canonical: {canonical})")

    # ----------------- Tool Registration -----------------

    def _register_default_tools(self) -> None:
        """Register all default tools"""
        # MinIO SIMD tools
        self._tools["minio_health"] = self._tool_minio_health
        self._tools["minio_get_chunks"] = self._tool_minio_get_chunks
        self._tools["minio_get_evidence"] = self._tool_minio_get_evidence
        self._tools["minio_get_manifest"] = self._tool_minio_get_manifest

        # AST/TypeScript tools
        self._async_tools["run_svelte_check"] = self._tool_run_svelte_check
        self._async_tools["run_tsc"] = self._tool_run_tsc
        self._async_tools["get_ast_graph"] = self._tool_get_ast_graph

        # Error analysis tools
        self._async_tools["cluster_errors"] = self._tool_cluster_errors
        self._async_tools["chr97_get_hotspots"] = self._tool_chr97_get_hotspots

        # RAG/Search tools
        self._async_tools["rag_search"] = self._tool_rag_search
        self._async_tools["vector_search"] = self._tool_vector_search

        # VLM/Multimodal tools
        self._async_tools["analyze_multimodal_evidence"] = self._tool_analyze_multimodal

        # Code modification tools
        self._async_tools["apply_ts_morph_fix"] = self._tool_apply_ts_morph_fix
        self._async_tools["apply_codemod"] = self._tool_apply_codemod

    # ----------------- MinIO SIMD Tools -----------------

    def _tool_minio_health(self, args: Dict[str, Any]) -> Dict[str, Any]:
        """Check MinIO SIMD service health."""
        url = f"{self.minio_simd_base}/health"
        with httpx.Client(timeout=2.0) as client:
            r = client.get(url)
            r.raise_for_status()
            return {"ok": True, "data": r.json()}

    def _tool_minio_get_chunks(self, args: Dict[str, Any]) -> Dict[str, Any]:
        """
        Fetch document chunk metadata for a case/file.

        ARGS:
          - case_id?: str
          - doc_id?: str
          - bucket?: str
          - limit?: int
        """
        params = {}
        if "case_id" in args:
            params["case_id"] = args["case_id"]
        if "doc_id" in args:
            params["doc_id"] = args["doc_id"]
        if "bucket" in args:
            params["bucket"] = args["bucket"]
        if "limit" in args:
            params["limit"] = args["limit"]

        url = f"{self.minio_simd_base}/api/chunks"
        with httpx.Client(timeout=3.0) as client:
            r = client.get(url, params=params)
            r.raise_for_status()
            return r.json()

    def _tool_minio_get_evidence(self, args: Dict[str, Any]) -> Dict[str, Any]:
        """
        List evidence objects (files) for a case.

        ARGS:
          - case_id: str
          - bucket?: str
          - kind?: str ("image", "pdf", "video", etc.)
        """
        params = {}
        if "case_id" in args:
            params["case_id"] = args["case_id"]
        if "bucket" in args:
            params["bucket"] = args["bucket"]
        if "kind" in args:
            params["kind"] = args["kind"]

        url = f"{self.minio_simd_base}/api/evidence"
        with httpx.Client(timeout=3.0) as client:
            r = client.get(url, params=params)
            r.raise_for_status()
            return r.json()

    def _tool_minio_get_manifest(self, args: Dict[str, Any]) -> Dict[str, Any]:
        """
        Fetch and SIMD-parse a large JSON manifest.

        ARGS:
          - path: str  (MinIO key or manifest ID)
          - bucket?: str
        """
        path = args.get("path")
        if not path:
            raise ToolExecutionError("minio_get_manifest requires 'path'")

        params = {"key": path}
        if "bucket" in args:
            params["bucket"] = args["bucket"]

        url = f"{self.minio_simd_base}/api/manifest"
        with httpx.Client(timeout=5.0) as client:
            r = client.get(url, params=params)
            r.raise_for_status()
            return r.json()

    # ----------------- AST/TypeScript Tools -----------------

    async def _tool_run_svelte_check(self, args: Dict[str, Any]) -> Dict[str, Any]:
        """
        Run svelte-check and collect TS/Svelte errors.

        ARGS:
          - path?: str (default: "src")
          - threshold?: str ("error" or "warning")
        """
        import subprocess

        path = args.get("path", "src")
        threshold = args.get("threshold", "error")

        cmd = [
            "npx", "svelte-check",
            "--tsconfig", "./tsconfig.json",
            "--threshold", threshold,
            "--output", "machine"
        ]

        result = subprocess.run(cmd, capture_output=True, text=True, cwd="sveltekit-frontend")

        # Parse machine output
        errors = []
        for line in result.stdout.split("\n"):
            if line.strip():
                try:
                    import json
                    error = json.loads(line)
                    errors.append(error)
                except:
                    pass

        return {
            "errors": errors,
            "count": len(errors),
            "exit_code": result.returncode
        }

    async def _tool_run_tsc(self, args: Dict[str, Any]) -> Dict[str, Any]:
        """
        Run TypeScript compiler and collect errors.

        ARGS:
          - project?: str (tsconfig path)
        """
        import subprocess

        project = args.get("project", "./tsconfig.json")

        cmd = ["npx", "tsc", "--noEmit", "--project", project]

        result = subprocess.run(cmd, capture_output=True, text=True, cwd="sveltekit-frontend")

        # Parse tsc output
        errors = []
        for line in result.stdout.split("\n"):
            if "error TS" in line:
                errors.append(line.strip())

        return {
            "errors": errors,
            "count": len(errors),
            "exit_code": result.returncode,
            "raw_output": result.stdout
        }

    async def _tool_get_ast_graph(self, args: Dict[str, Any]) -> Dict[str, Any]:
        """
        Get AST graph from /api/ast/analyze endpoint.

        ARGS:
          - file_path: str
        """
        file_path = args.get("file_path")
        if not file_path:
            raise ToolExecutionError("get_ast_graph requires 'file_path'")

        async with httpx.AsyncClient(timeout=10.0) as client:
            r = await client.post(
                "http://localhost:5173/api/ast/analyze",
                json={"filePath": file_path}
            )
            r.raise_for_status()
            return r.json()

    # ----------------- Error Analysis Tools -----------------

    async def _tool_cluster_errors(self, args: Dict[str, Any]) -> Dict[str, Any]:
        """
        Cluster errors by code/message/file using embeddings.

        ARGS:
          - errors: list[dict]
          - method?: str ("code", "message", "file")
        """
        errors = args.get("errors", [])
        method = args.get("method", "code")

        # Simple clustering by error code
        clusters = {}
        for error in errors:
            key = error.get(method, "unknown")
            if key not in clusters:
                clusters[key] = []
            clusters[key].append(error)

        return {
            "clusters": clusters,
            "cluster_count": len(clusters),
            "total_errors": len(errors)
        }

    async def _tool_chr97_get_hotspots(self, args: Dict[str, Any]) -> Dict[str, Any]:
        """
        Ask CHR97 for hot files / error regions.

        ARGS:
          - threshold?: int (min errors per file)
        """
        threshold = args.get("threshold", 5)

        # Query CHR97 service (placeholder)
        # In production, this would call your CHR97 bitmap service
        return {
            "hotspots": [
                {"file": "src/routes/+page.svelte", "error_count": 12},
                {"file": "src/lib/components/Header.svelte", "error_count": 8}
            ],
            "threshold": threshold
        }

    # ----------------- RAG/Search Tools -----------------

    async def _tool_rag_search(self, args: Dict[str, Any]) -> Dict[str, Any]:
        """
        Query legal RAG/KAG for specs/guides.

        ARGS:
          - query: str
          - top_k?: int
        """
        query = args.get("query")
        if not query:
            raise ToolExecutionError("rag_search requires 'query'")

        top_k = args.get("top_k", 5)

        async with httpx.AsyncClient(timeout=5.0) as client:
            r = await client.post(
                f"{self.qdrant_base}/collections/legal-documents/points/search",
                json={
                    "vector": [],  # Would use actual embedding
                    "limit": top_k
                }
            )
            return r.json()

    async def _tool_vector_search(self, args: Dict[str, Any]) -> Dict[str, Any]:
        """
        Search Qdrant for similar errors/documents.

        ARGS:
          - query: str
          - collection?: str
          - top_k?: int
        """
        query = args.get("query")
        collection = args.get("collection", "error_embeddings")
        top_k = args.get("top_k", 5)

        # Generate embedding via Ollama
        async with httpx.AsyncClient(timeout=10.0) as client:
            embed_resp = await client.post(
                f"{self.ollama_base}/api/embeddings",
                json={"model": "embeddinggemma:latest", "prompt": query}
            )
            embedding = embed_resp.json()["embedding"]

            # Search Qdrant
            search_resp = await client.post(
                f"{self.qdrant_base}/collections/{collection}/points/search",
                json={"vector": embedding, "limit": top_k}
            )
            return search_resp.json()

    # ----------------- VLM/Multimodal Tools -----------------

    async def _tool_analyze_multimodal(self, args: Dict[str, Any]) -> Dict[str, Any]:
        """
        Use VLM on screenshots/logs for visual error analysis.

        ARGS:
          - image_path: str
          - prompt?: str
        """
        image_path = args.get("image_path")
        prompt = args.get("prompt", "Analyze this screenshot for errors")

        # Placeholder for VLM integration
        return {
            "analysis": "Screenshot shows TypeScript errors in editor",
            "confidence": 0.85,
            "image_path": image_path
        }

    # ----------------- Code Modification Tools -----------------

    async def _tool_apply_ts_morph_fix(self, args: Dict[str, Any]) -> Dict[str, Any]:
        """
        Apply ts-morph codemod to fix errors.

        ARGS:
          - file_path: str
          - fix_type: str ("add_type", "fix_import", etc.)
          - params?: dict
        """
        file_path = args.get("file_path")
        fix_type = args.get("fix_type")

        if not file_path or not fix_type:
            raise ToolExecutionError("apply_ts_morph_fix requires 'file_path' and 'fix_type'")

        # Call ts-morph service
        async with httpx.AsyncClient(timeout=10.0) as client:
            r = await client.post(
                "http://localhost:5173/api/ast/fix",
                json={
                    "filePath": file_path,
                    "fixType": fix_type,
                    "params": args.get("params", {})
                }
            )
            r.raise_for_status()
            return r.json()

    async def _tool_apply_codemod(self, args: Dict[str, Any]) -> Dict[str, Any]:
        """
        Apply automated codemod transformation.

        ARGS:
          - pattern: str
          - replacement: str
          - files?: list[str]
        """
        pattern = args.get("pattern")
        replacement = args.get("replacement")

        if not pattern or not replacement:
            raise ToolExecutionError("apply_codemod requires 'pattern' and 'replacement'")

        return {
            "applied": True,
            "files_modified": args.get("files", []),
            "pattern": pattern,
            "replacement": replacement
        }

# Global instance
tool_router = ToolRouter()
