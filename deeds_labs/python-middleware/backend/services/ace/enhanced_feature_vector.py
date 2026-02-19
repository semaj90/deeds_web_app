"""
Enhanced Feature Vector Assembler with ACE Integration.

Extends the base FeatureVectorAssembler with:
- ACE context integration
- Go SIMD serialization/deserialization
- Block-level updates
"""

from __future__ import annotations
import struct
import json
import logging
from datetime import datetime
from typing import Dict, List, Any, Optional
import numpy as np
import aiohttp

from ..feature_vector import (
    FeatureVectorAssembler,
    LLMTextState,
    VLMLayoutState,
    WebRAGState,
    ToolTelemetryState,
    PhaseASTState,
    LegalFlagsState,
    RuntimeState,
    TOTAL_DIMS,
    DIMS,
)
from .models import (
    AceContext,
    BLOCK_DIMS,
    BLOCK_OFFSETS,
)
from .config import get_config, AceConfig

logger = logging.getLogger(__name__)


class EnhancedFeatureVectorAssembler(FeatureVectorAssembler):
    """
    Enhanced feature vector assembler with ACE integration.

    Extends the base assembler with:
    - ACE context-aware assembly
    - Go SIMD binary serialization
    - Block-level updates
    - Async scoring via Go service
    """

    def __init__(self, config: Optional[AceConfig] = None):
        """Initialize enhanced assembler.

        Args:
            config: ACE configuration (uses global if not provided)
        """
        super().__init__()
        self.config = config or get_config()
        self._last_vector: Optional[np.ndarray] = None
        self._last_timestamp: Optional[datetime] = None

    async def assemble_from_ace_context(
        self,
        ace_context: AceContext,
        llm_response: Optional[Dict[str, Any]] = None,
        doc_analysis: Optional[Dict[str, Any]] = None,
        search_results: Optional[List[Dict[str, Any]]] = None,
        tool_history: Optional[List[Dict[str, Any]]] = None,
        error_report: Optional[Dict[str, Any]] = None,
        phase_info: Optional[Dict[str, Any]] = None,
        legal_context: Optional[Dict[str, Any]] = None,
        gpu_stats: Optional[Dict[str, Any]] = None,
        inference_stats: Optional[Dict[str, Any]] = None,
    ) -> np.ndarray:
        """
        Assemble feature vector from ACE context and signals.

        Args:
            ace_context: ACE orchestrator context
            llm_response: Ollama/Gemma response
            doc_analysis: VLM/langextract analysis
            search_results: Web/RAG search results
            tool_history: Recent tool calls
            error_report: ts-morph error analysis
            phase_info: Current phase state
            legal_context: Legal flags and jurisdiction
            gpu_stats: GPU memory/thermal stats
            inference_stats: TRT-LLM performance stats

        Returns:
            1024-d numpy array
        """
        # Use existing feature vector from context if available
        if ace_context.feature_vector is not None:
            self._last_vector = ace_context.feature_vector.copy()

        # Set states from provided data
        if llm_response:
            self.set_llm_state(await self._collect_llm_state(llm_response))

        if doc_analysis:
            self.set_vlm_state(await self._collect_vlm_state(doc_analysis))

        if search_results:
            self.set_web_rag_state(await self._collect_web_rag_state(search_results))

        if tool_history:
            self.set_tool_state(await self._collect_tool_state(tool_history))

        if error_report and phase_info:
            self.set_phase_ast_state(await self._collect_phase_ast_state(error_report, phase_info))

        if legal_context:
            self.set_legal_state(self._create_legal_state(legal_context))

        if gpu_stats and inference_stats:
            self.set_runtime_state(await self._collect_runtime_state(gpu_stats, inference_stats))

        # Assemble the vector
        vector = self.assemble()

        # Update context
        ace_context.feature_vector = vector
        ace_context.updated_at = datetime.now()

        self._last_vector = vector
        self._last_timestamp = datetime.now()

        return vector

    def to_go_simd_format(self, vector: np.ndarray) -> bytes:
        """
        Serialize feature vector for Go SIMD scorer.

        Binary format:
        - 4 bytes: dims (int32)
        - 4 bytes: timestamp (int32, unix seconds)
        - 4096 bytes: vector data (1024 * float32)

        Args:
            vector: 1024-d numpy array

        Returns:
            Binary encoded data
        """
        if vector.shape[0] != TOTAL_DIMS:
            raise ValueError(f"Expected {TOTAL_DIMS} dims, got {vector.shape[0]}")

        # Ensure float32
        vector = vector.astype(np.float32)

        # Pack header
        header = struct.pack('<II', TOTAL_DIMS, int(datetime.now().timestamp()))

        # Pack vector data
        vector_bytes = vector.tobytes()

        return header + vector_bytes

    def from_go_simd_format(self, data: bytes) -> np.ndarray:
        """
        Deserialize feature vector from Go SIMD format.

        Args:
            data: Binary encoded data

        Returns:
            1024-d numpy array
        """
        # Unpack header
        dims, timestamp = struct.unpack('<II', data[:8])

        if dims != TOTAL_DIMS:
            raise ValueError(f"Expected {TOTAL_DIMS} dims, got {dims}")

        # Unpack vector
        vector = np.frombuffer(data[8:], dtype=np.float32)

        if vector.shape[0] != TOTAL_DIMS:
            raise ValueError(f"Vector size mismatch: {vector.shape[0]}")

        return vector

    def to_json(self) -> Dict[str, Any]:
        """Serialize to JSON-compatible dict for Go SIMD scorer."""
        vector = self._last_vector if self._last_vector is not None else self.assemble()
        return {
            "vector": vector.tolist(),
            "dims": TOTAL_DIMS,
            "blocks": {name: dim for name, dim in DIMS.items()},
            "timestamp": datetime.now().isoformat(),
        }

    async def score_with_go_simd(
        self,
        vector: Optional[np.ndarray] = None,
    ) -> Dict[str, Any]:
        """
        Score feature vector using Go SIMD service.

        Args:
            vector: Feature vector (uses last assembled if not provided)

        Returns:
            Score result from Go service
        """
        if vector is None:
            vector = self._last_vector

        if vector is None:
            raise ValueError("No vector to score")

        payload = {
            "vector": vector.tolist(),
            "dims": TOTAL_DIMS,
            "timestamp": datetime.now().isoformat(),
        }

        try:
            async with aiohttp.ClientSession() as session:
                async with session.post(
                    self.config.go_simd.score_endpoint,
                    json=payload,
                    timeout=aiohttp.ClientTimeout(total=self.config.go_simd.timeout_ms / 1000),
                ) as response:
                    if response.status != 200:
                        logger.error(f"Go SIMD scorer error: {response.status}")
                        return {"error": f"HTTP {response.status}"}

                    return await response.json()

        except Exception as e:
            logger.error(f"Go SIMD scorer failed: {e}")
            return {"error": str(e)}

    def update_block(
        self,
        block_name: str,
        values: np.ndarray,
        vector: Optional[np.ndarray] = None,
    ) -> np.ndarray:
        """
        Update a specific block in the feature vector.

        Args:
            block_name: Name of block to update
            values: New values for the block
            vector: Vector to update (uses last assembled if not provided)

        Returns:
            Updated feature vector
        """
        if block_name not in BLOCK_DIMS:
            raise ValueError(f"Unknown block: {block_name}")

        if vector is None:
            vector = self._last_vector.copy() if self._last_vector is not None else np.zeros(TOTAL_DIMS, dtype=np.float32)

        offset = BLOCK_OFFSETS[block_name]
        dims = BLOCK_DIMS[block_name]

        if values.shape[0] != dims:
            raise ValueError(f"Block {block_name} expects {dims} dims, got {values.shape[0]}")

        vector[offset:offset + dims] = values.astype(np.float32)
        self._last_vector = vector

        return vector

    def get_block(
        self,
        block_name: str,
        vector: Optional[np.ndarray] = None,
    ) -> np.ndarray:
        """
        Get a specific block from the feature vector.

        Args:
            block_name: Name of block to get
            vector: Vector to read from (uses last assembled if not provided)

        Returns:
            Block values
        """
        if block_name not in BLOCK_DIMS:
            raise ValueError(f"Unknown block: {block_name}")

        if vector is None:
            vector = self._last_vector

        if vector is None:
            raise ValueError("No vector available")

        offset = BLOCK_OFFSETS[block_name]
        dims = BLOCK_DIMS[block_name]

        return vector[offset:offset + dims].copy()

    # Helper methods for state collection
    async def _collect_llm_state(self, response: Dict[str, Any]) -> LLMTextState:
        """Collect LLM state from response."""
        return LLMTextState(
            hidden_state=response.get("hidden_state"),
            mean_logprob=response.get("mean_logprob", 0.0),
            entropy=response.get("entropy", 0.0),
            low_confidence_fraction=response.get("low_confidence_fraction", 0.0),
            token_count=response.get("eval_count", 0),
            perplexity=response.get("perplexity", 0.0),
        )

    async def _collect_vlm_state(self, doc_analysis: Dict[str, Any]) -> VLMLayoutState:
        """Collect VLM state from document analysis."""
        entities = doc_analysis.get("entities", {})
        structure = doc_analysis.get("structure", {})

        return VLMLayoutState(
            page_count=structure.get("page_count", 0),
            avg_words_per_page=structure.get("avg_words_per_page", 0.0),
            tables_per_page=structure.get("tables_per_page", 0.0),
            images_per_page=structure.get("images_per_page", 0.0),
            has_signatures=structure.get("has_signatures", False),
            has_seals=structure.get("has_seals", False),
            header_fraction=structure.get("header_fraction", 0.0),
            body_fraction=structure.get("body_fraction", 0.0),
            footnote_fraction=structure.get("footnote_fraction", 0.0),
            has_exhibits=structure.get("has_exhibits", False),
            has_annexes=structure.get("has_annexes", False),
            person_count=len(entities.get("PERSON", [])),
            org_count=len(entities.get("ORG", [])),
            location_count=len(entities.get("LOCATION", [])),
            money_count=len(entities.get("MONEY", [])),
            date_count=len(entities.get("DATE", [])),
            children_coded=doc_analysis.get("children_coded", False),
            minor_victim_prob=doc_analysis.get("minor_victim_prob", 0.0),
            doc_type_probs=doc_analysis.get("doc_type_probs", {}),
        )

    async def _collect_web_rag_state(self, search_results: List[Dict[str, Any]]) -> WebRAGState:
        """Collect Web/RAG state from search results."""
        if not search_results:
            return WebRAGState()

        scores = [r.get("score", 0.0) for r in search_results]
        domains = set(r.get("domain", "") for r in search_results)

        return WebRAGState(
            top1_bm25=search_results[0].get("bm25_score", 0.0) if search_results else 0.0,
            top1_cosine=scores[0] if scores else 0.0,
            avg_top5=np.mean(scores[:5]) if len(scores) >= 5 else np.mean(scores) if scores else 0.0,
            avg_top10=np.mean(scores[:10]) if len(scores) >= 10 else np.mean(scores) if scores else 0.0,
            domain_diversity=len(domains) / max(len(search_results), 1),
            unique_domains=len(domains),
            statute_matches=sum(1 for r in search_results if r.get("is_statute")),
            case_matches=sum(1 for r in search_results if r.get("is_case")),
            citation_confidence=np.mean([r.get("citation_confidence", 0.0) for r in search_results]) if search_results else 0.0,
        )

    async def _collect_tool_state(self, tool_history: List[Dict[str, Any]]) -> ToolTelemetryState:
        """Collect tool telemetry from history."""
        if not tool_history:
            return ToolTelemetryState()

        tool_counts = {}
        failures = 0
        latencies = []

        for call in tool_history:
            tool_name = call.get("tool", "unknown")
            tool_counts[tool_name] = tool_counts.get(tool_name, 0) + 1

            if call.get("error"):
                failures += 1

            if call.get("latency_ms"):
                latencies.append(call["latency_ms"])

        return ToolTelemetryState(
            web_search_calls=tool_counts.get("web_search", 0),
            minio_evidence_calls=tool_counts.get("minio_evidence", 0),
            ca_const_lookup_calls=tool_counts.get("ca_const_lookup", 0),
            citation_manager_calls=tool_counts.get("citation_manager", 0),
            rag_search_calls=tool_counts.get("rag_search", 0),
            kag_search_calls=tool_counts.get("kag_search", 0),
            failure_rate=failures / max(len(tool_history), 1),
            avg_latency_ms=np.mean(latencies) if latencies else 0.0,
            p95_latency_ms=np.percentile(latencies, 95) if latencies else 0.0,
            max_latency_ms=max(latencies) if latencies else 0.0,
        )

    async def _collect_phase_ast_state(
        self,
        error_report: Dict[str, Any],
        phase_info: Dict[str, Any],
    ) -> PhaseASTState:
        """Collect Phase/AST state from error report."""
        errors = error_report.get("errors", [])

        error_counts = {}
        errors_per_file = {}

        for err in errors:
            code = err.get("code", "unknown")
            error_counts[code] = error_counts.get(code, 0) + 1

            file = err.get("file", "unknown")
            errors_per_file[file] = errors_per_file.get(file, 0) + 1

        return PhaseASTState(
            avg_depth=error_report.get("ast_avg_depth", 0.0),
            max_depth=error_report.get("ast_max_depth", 0),
            num_functions=error_report.get("num_functions", 0),
            num_components=error_report.get("num_components", 0),
            num_imports=error_report.get("num_imports", 0),
            num_exports=error_report.get("num_exports", 0),
            num_generics=error_report.get("num_generics", 0),
            error_counts=error_counts,
            total_errors=len(errors),
            unique_error_codes=len(error_counts),
            errors_per_file=errors_per_file,
            root_layout_errors=errors_per_file.get("+layout.svelte", 0),
            leaf_component_errors=sum(v for k, v in errors_per_file.items() if ".svelte" in k and "layout" not in k),
            current_phase=phase_info.get("current_phase", 0),
            retry_count=phase_info.get("retry_count", 0),
            time_in_phase_ms=phase_info.get("time_in_phase_ms", 0),
            phase_history=phase_info.get("phase_history", []),
        )

    def _create_legal_state(self, legal_context: Dict[str, Any]) -> LegalFlagsState:
        """Create legal state from context."""
        return LegalFlagsState(
            jurisdiction=legal_context.get("jurisdiction", ""),
            is_federal=legal_context.get("is_federal", False),
            is_state=legal_context.get("is_state", False),
            state_code=legal_context.get("state_code", ""),
            court_level=legal_context.get("court_level", 0),
            topic_probs=legal_context.get("topic_probs", {}),
            primary_topic=legal_context.get("primary_topic", ""),
            statute_density=legal_context.get("statute_density", 0.0),
            case_law_density=legal_context.get("case_law_density", 0.0),
            regulation_density=legal_context.get("regulation_density", 0.0),
            constitutional_refs=legal_context.get("constitutional_refs", 0),
        )

    async def _collect_runtime_state(
        self,
        gpu_stats: Dict[str, Any],
        inference_stats: Dict[str, Any],
    ) -> RuntimeState:
        """Collect runtime state from stats."""
        return RuntimeState(
            tokens_per_sec=inference_stats.get("tokens_per_sec", 0.0),
            inference_latency_ms=inference_stats.get("latency_ms", 0.0),
            batch_size=inference_stats.get("batch_size", 1),
            using_tensorrt=inference_stats.get("using_tensorrt", False),
            using_wasm_fallback=inference_stats.get("using_wasm", False),
            gpu_memory_used_mb=gpu_stats.get("memory_used_mb", 0.0),
            gpu_memory_total_mb=gpu_stats.get("memory_total_mb", 8192.0),
            gpu_utilization=gpu_stats.get("utilization", 0.0),
            thermal_state=gpu_stats.get("thermal_state", "normal"),
            latency_budget_ms=inference_stats.get("latency_budget_ms", 1000.0),
            latency_remaining_ms=inference_stats.get("latency_remaining_ms", 1000.0),
            deadline_pressure=inference_stats.get("deadline_pressure", 0.0),
        )
