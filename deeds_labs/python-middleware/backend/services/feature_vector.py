#!/usr/bin/env python3
"""
Multi-Modal Feature Vector for RL/QLoRA Head

1024-dimensional feature vector layout:
[ LLM_TEXT | VLM_LAYOUT | WEB/RAG | TOOLS | GRAPH/AST | LEGAL_FLAGS | RUNTIME ]

Block A – LLM Text State (256d)
Block B – VLM / LangExtract (128d)
Block C – Web / RAG Quality (128d)
Block D – Tool-Call Telemetry (128d)
Block E – Phase / AST / Error Graph (192d)
Block F – Legal Context Flags (96d)
Block G – Runtime / Engine Perf (96d)

Total: 256 + 128 + 128 + 128 + 192 + 96 + 96 = 1024
"""

from __future__ import annotations
import numpy as np
from dataclasses import dataclass, field
from typing import Dict, List, Any, Optional
from datetime import datetime
import logging

logger = logging.getLogger(__name__)

# Feature vector dimensions
DIMS = {
    "llm_text": 256,
    "vlm_layout": 128,
    "web_rag": 128,
    "tools": 128,
    "phase_ast": 192,
    "legal_flags": 96,
    "runtime": 96,
}
TOTAL_DIMS = sum(DIMS.values())  # 1024


@dataclass
class LLMTextState:
    """Block A: LLM Text State (256d)"""
    hidden_state: Optional[np.ndarray] = None  # Last hidden layer
    mean_logprob: float = 0.0
    entropy: float = 0.0
    low_confidence_fraction: float = 0.0
    token_count: int = 0
    perplexity: float = 0.0


@dataclass
class VLMLayoutState:
    """Block B: VLM / LangExtract (128d)"""
    # Document structure (16d)
    page_count: int = 0
    avg_words_per_page: float = 0.0
    tables_per_page: float = 0.0
    images_per_page: float = 0.0
    has_signatures: bool = False
    has_seals: bool = False

    # Block roles (16d)
    header_fraction: float = 0.0
    body_fraction: float = 0.0
    footnote_fraction: float = 0.0
    has_exhibits: bool = False
    has_annexes: bool = False

    # Visual embedding (32d)
    visual_embedding: Optional[np.ndarray] = None

    # LangExtract entities (64d)
    person_count: int = 0
    org_count: int = 0
    location_count: int = 0
    money_count: int = 0
    date_count: int = 0
    children_coded: bool = False
    minor_victim_prob: float = 0.0
    doc_type_probs: Dict[str, float] = field(default_factory=dict)


@dataclass
class WebRAGState:
    """Block C: Web / RAG Quality (128d)"""
    # Top-k scores (16d)
    top1_bm25: float = 0.0
    top1_cosine: float = 0.0
    avg_top5: float = 0.0
    avg_top10: float = 0.0

    # Diversity (16d)
    pairwise_cosine_var: float = 0.0
    domain_diversity: float = 0.0
    unique_domains: int = 0

    # Coverage (16d)
    query_term_coverage: float = 0.0
    snippet_overlap: float = 0.0

    # Citation quality (16d)
    statute_matches: int = 0
    case_matches: int = 0
    citation_confidence: float = 0.0

    # RAG context embedding (64d)
    rag_context_embedding: Optional[np.ndarray] = None


@dataclass
class ToolTelemetryState:
    """Block D: Tool-Call Telemetry (128d)"""
    # Usage counts (16d)
    web_search_calls: int = 0
    minio_evidence_calls: int = 0
    ca_const_lookup_calls: int = 0
    citation_manager_calls: int = 0
    rag_search_calls: int = 0
    kag_search_calls: int = 0

    # Success/failure (16d)
    failure_rate: float = 0.0
    http_error_rate: float = 0.0
    timeout_rate: float = 0.0

    # Latency stats (16d)
    avg_latency_ms: float = 0.0
    p95_latency_ms: float = 0.0
    max_latency_ms: float = 0.0

    # Tool graph bigrams (16d)
    tool_bigrams: Dict[str, float] = field(default_factory=dict)

    # Tool program embedding (64d)
    tool_program_embedding: Optional[np.ndarray] = None


@dataclass
class PhaseASTState:
    """Block E: Phase / AST / Error Graph (192d)"""
    # AST structure (32d)
    avg_depth: float = 0.0
    max_depth: int = 0
    num_functions: int = 0
    num_components: int = 0
    num_imports: int = 0
    num_exports: int = 0
    num_generics: int = 0

    # Error distribution (32d)
    error_counts: Dict[str, int] = field(default_factory=dict)
    total_errors: int = 0
    unique_error_codes: int = 0

    # Graph centrality (32d)
    errors_per_file: Dict[str, int] = field(default_factory=dict)
    root_layout_errors: int = 0
    leaf_component_errors: int = 0
    betweenness_approx: float = 0.0

    # Phase state (32d)
    current_phase: int = 0
    retry_count: int = 0
    time_in_phase_ms: int = 0
    phase_history: List[int] = field(default_factory=list)

    # Graph embedding (64d)
    graph_embedding: Optional[np.ndarray] = None


@dataclass
class LegalFlagsState:
    """Block F: Legal Context Flags (96d)"""
    # Jurisdiction (32d)
    jurisdiction: str = ""
    is_federal: bool = False
    is_state: bool = False
    state_code: str = ""
    court_level: int = 0  # 0=unknown, 1=district, 2=appeals, 3=supreme

    # Topic clusters (32d)
    topic_probs: Dict[str, float] = field(default_factory=dict)
    primary_topic: str = ""

    # Statute density (32d)
    statute_density: float = 0.0
    case_law_density: float = 0.0
    regulation_density: float = 0.0
    constitutional_refs: int = 0


@dataclass
class RuntimeState:
    """Block G: Runtime / Engine Perf (96d)"""
    # TRT-LLM stats (32d)
    tokens_per_sec: float = 0.0
    inference_latency_ms: float = 0.0
    batch_size: int = 1
    using_tensorrt: bool = False
    using_wasm_fallback: bool = False

    # Memory (32d)
    gpu_memory_used_mb: float = 0.0
    gpu_memory_total_mb: float = 8192.0
    gpu_utilization: float = 0.0
    thermal_state: str = "normal"

    # Latency budget (32d)
    latency_budget_ms: float = 1000.0
    latency_remaining_ms: float = 1000.0
    deadline_pressure: float = 0.0


class FeatureVectorAssembler:
    """
    Assembles the 1024-d multi-modal feature vector from component states.

    Usage:
        assembler = FeatureVectorAssembler()

        # Set component states
        assembler.set_llm_state(llm_state)
        assembler.set_vlm_state(vlm_state)
        assembler.set_web_rag_state(web_state)
        assembler.set_tool_state(tool_state)
        assembler.set_phase_ast_state(phase_state)
        assembler.set_legal_state(legal_state)
        assembler.set_runtime_state(runtime_state)

        # Get assembled vector
        vector = assembler.assemble()  # np.ndarray of shape (1024,)
    """

    def __init__(self):
        self.llm_state: Optional[LLMTextState] = None
        self.vlm_state: Optional[VLMLayoutState] = None
        self.web_rag_state: Optional[WebRAGState] = None
        self.tool_state: Optional[ToolTelemetryState] = None
        self.phase_ast_state: Optional[PhaseASTState] = None
        self.legal_state: Optional[LegalFlagsState] = None
        self.runtime_state: Optional[RuntimeState] = None

        # Projection matrices (would be learned)
        self._init_projections()

    def _init_projections(self):
        """Initialize projection matrices for embeddings"""
        # These would be learned during training
        self.llm_proj = np.random.randn(768, 256) * 0.02  # Gemma hidden → 256
        self.vlm_proj = np.random.randn(512, 32) * 0.02   # VLM → 32
        self.rag_proj = np.random.randn(768, 64) * 0.02   # RAG context → 64
        self.tool_proj = np.random.randn(384, 64) * 0.02  # Tool program → 64
        self.graph_proj = np.random.randn(256, 64) * 0.02 # Graph → 64

    def set_llm_state(self, state: LLMTextState):
        self.llm_state = state

    def set_vlm_state(self, state: VLMLayoutState):
        self.vlm_state = state

    def set_web_rag_state(self, state: WebRAGState):
        self.web_rag_state = state

    def set_tool_state(self, state: ToolTelemetryState):
        self.tool_state = state

    def set_phase_ast_state(self, state: PhaseASTState):
        self.phase_ast_state = state

    def set_legal_state(self, state: LegalFlagsState):
        self.legal_state = state

    def set_runtime_state(self, state: RuntimeState):
        self.runtime_state = state


    def _encode_llm_block(self) -> np.ndarray:
        """Block A: LLM Text State (256d)"""
        block = np.zeros(256, dtype=np.float32)

        if self.llm_state is None:
            return block

        s = self.llm_state

        # If we have hidden state, project it
        if s.hidden_state is not None:
            hidden = s.hidden_state.flatten()[:768]
            if len(hidden) == 768:
                block[:256] = hidden @ self.llm_proj
            else:
                # Pad or truncate
                padded = np.zeros(768)
                padded[:len(hidden)] = hidden
                block[:256] = padded @ self.llm_proj

        # Add scalar features (last 16 dims)
        block[240] = s.mean_logprob
        block[241] = s.entropy
        block[242] = s.low_confidence_fraction
        block[243] = np.log1p(s.token_count) / 10.0  # Normalized
        block[244] = np.log1p(s.perplexity) / 10.0

        return block

    def _encode_vlm_block(self) -> np.ndarray:
        """Block B: VLM / LangExtract (128d)"""
        block = np.zeros(128, dtype=np.float32)

        if self.vlm_state is None:
            return block

        s = self.vlm_state

        # Document structure (0-15)
        block[0] = np.log1p(s.page_count) / 5.0
        block[1] = s.avg_words_per_page / 500.0
        block[2] = s.tables_per_page
        block[3] = s.images_per_page
        block[4] = float(s.has_signatures)
        block[5] = float(s.has_seals)

        # Block roles (16-31)
        block[16] = s.header_fraction
        block[17] = s.body_fraction
        block[18] = s.footnote_fraction
        block[19] = float(s.has_exhibits)
        block[20] = float(s.has_annexes)

        # Visual embedding (32-63)
        if s.visual_embedding is not None:
            vis = s.visual_embedding.flatten()[:512]
            if len(vis) == 512:
                block[32:64] = vis @ self.vlm_proj

        # LangExtract entities (64-127)
        block[64] = np.log1p(s.person_count) / 3.0
        block[65] = np.log1p(s.org_count) / 3.0
        block[66] = np.log1p(s.location_count) / 3.0
        block[67] = np.log1p(s.money_count) / 3.0
        block[68] = np.log1p(s.date_count) / 3.0
        block[69] = float(s.children_coded)
        block[70] = s.minor_victim_prob

        # Doc type probs (one-hot style)
        doc_types = ["contract", "statute", "court_order", "cps_report", "complaint"]
        for i, dt in enumerate(doc_types):
            block[80 + i] = s.doc_type_probs.get(dt, 0.0)

        return block


    def _encode_web_rag_block(self) -> np.ndarray:
        """Block C: Web / RAG Quality (128d)"""
        block = np.zeros(128, dtype=np.float32)

        if self.web_rag_state is None:
            return block

        s = self.web_rag_state

        # Top-k scores (0-15)
        block[0] = s.top1_bm25
        block[1] = s.top1_cosine
        block[2] = s.avg_top5
        block[3] = s.avg_top10

        # Diversity (16-31)
        block[16] = s.pairwise_cosine_var
        block[17] = s.domain_diversity
        block[18] = np.log1p(s.unique_domains) / 3.0

        # Coverage (32-47)
        block[32] = s.query_term_coverage
        block[33] = s.snippet_overlap

        # Citation quality (48-63)
        block[48] = np.log1p(s.statute_matches) / 3.0
        block[49] = np.log1p(s.case_matches) / 3.0
        block[50] = s.citation_confidence

        # RAG context embedding (64-127)
        if s.rag_context_embedding is not None:
            ctx = s.rag_context_embedding.flatten()[:768]
            if len(ctx) == 768:
                block[64:128] = ctx @ self.rag_proj

        return block

    def _encode_tool_block(self) -> np.ndarray:
        """Block D: Tool-Call Telemetry (128d)"""
        block = np.zeros(128, dtype=np.float32)

        if self.tool_state is None:
            return block

        s = self.tool_state

        # Usage counts (0-15)
        block[0] = np.log1p(s.web_search_calls) / 3.0
        block[1] = np.log1p(s.minio_evidence_calls) / 3.0
        block[2] = np.log1p(s.ca_const_lookup_calls) / 3.0
        block[3] = np.log1p(s.citation_manager_calls) / 3.0
        block[4] = np.log1p(s.rag_search_calls) / 3.0
        block[5] = np.log1p(s.kag_search_calls) / 3.0

        # Success/failure (16-31)
        block[16] = s.failure_rate
        block[17] = s.http_error_rate
        block[18] = s.timeout_rate

        # Latency stats (32-47)
        block[32] = np.log1p(s.avg_latency_ms) / 10.0
        block[33] = np.log1p(s.p95_latency_ms) / 10.0
        block[34] = np.log1p(s.max_latency_ms) / 10.0

        # Tool bigrams (48-63)
        bigram_keys = ["web→evidence", "evidence→citation", "rag→kag", "search→analyze"]
        for i, key in enumerate(bigram_keys):
            block[48 + i] = s.tool_bigrams.get(key, 0.0)

        # Tool program embedding (64-127)
        if s.tool_program_embedding is not None:
            prog = s.tool_program_embedding.flatten()[:384]
            if len(prog) == 384:
                block[64:128] = prog @ self.tool_proj

        return block


    def _encode_phase_ast_block(self) -> np.ndarray:
        """Block E: Phase / AST / Error Graph (192d)"""
        block = np.zeros(192, dtype=np.float32)

        if self.phase_ast_state is None:
            return block

        s = self.phase_ast_state

        # AST structure (0-31)
        block[0] = s.avg_depth / 10.0
        block[1] = s.max_depth / 20.0
        block[2] = np.log1p(s.num_functions) / 5.0
        block[3] = np.log1p(s.num_components) / 5.0
        block[4] = np.log1p(s.num_imports) / 5.0
        block[5] = np.log1p(s.num_exports) / 5.0
        block[6] = np.log1p(s.num_generics) / 3.0

        # Error distribution (32-63)
        error_codes = ["TS1005", "TS2307", "TS2339", "TS2345", "TS2741", "TS7006", "TS18046"]
        for i, code in enumerate(error_codes):
            count = s.error_counts.get(code, 0)
            block[32 + i] = np.log1p(count) / 5.0

        block[48] = np.log1p(s.total_errors) / 10.0
        block[49] = np.log1p(s.unique_error_codes) / 3.0

        # Graph centrality (64-95)
        block[64] = np.log1p(len(s.errors_per_file)) / 5.0
        block[65] = np.log1p(s.root_layout_errors) / 5.0
        block[66] = np.log1p(s.leaf_component_errors) / 5.0
        block[67] = s.betweenness_approx

        # Phase state (96-127)
        # One-hot for phase
        phase_map = {26: 0, 52: 1, 66: 2, 70: 3, 71: 4, 72: 5, 73: 6, 74: 7, 75: 8}
        phase_idx = phase_map.get(s.current_phase, 9)
        block[96 + phase_idx] = 1.0

        block[112] = np.log1p(s.retry_count) / 3.0
        block[113] = np.log1p(s.time_in_phase_ms) / 15.0

        # Phase history (last 8 phases)
        for i, phase in enumerate(s.phase_history[-8:]):
            block[120 + i] = phase / 100.0

        # Graph embedding (128-191)
        if s.graph_embedding is not None:
            graph = s.graph_embedding.flatten()[:256]
            if len(graph) == 256:
                block[128:192] = graph @ self.graph_proj

        return block

    def _encode_legal_block(self) -> np.ndarray:
        """Block F: Legal Context Flags (96d)"""
        block = np.zeros(96, dtype=np.float32)

        if self.legal_state is None:
            return block

        s = self.legal_state

        # Jurisdiction (0-31)
        block[0] = float(s.is_federal)
        block[1] = float(s.is_state)
        block[2] = s.court_level / 3.0

        # State code one-hot (simplified)
        state_codes = ["CA", "NY", "TX", "FL", "IL", "PA", "OH", "GA"]
        for i, code in enumerate(state_codes):
            block[8 + i] = float(s.state_code == code)

        # Topic clusters (32-63)
        topics = ["contract", "tort", "criminal", "family", "immigration",
                  "bankruptcy", "ip", "employment", "constitutional"]
        for i, topic in enumerate(topics):
            block[32 + i] = s.topic_probs.get(topic, 0.0)

        # Statute density (64-95)
        block[64] = s.statute_density
        block[65] = s.case_law_density
        block[66] = s.regulation_density
        block[67] = np.log1p(s.constitutional_refs) / 3.0

        return block


    def _encode_runtime_block(self) -> np.ndarray:
        """Block G: Runtime / Engine Perf (96d)"""
        block = np.zeros(96, dtype=np.float32)

        if self.runtime_state is None:
            return block

        s = self.runtime_state

        # TRT-LLM stats (0-31)
        block[0] = np.log1p(s.tokens_per_sec) / 10.0
        block[1] = np.log1p(s.inference_latency_ms) / 10.0
        block[2] = np.log1p(s.batch_size) / 3.0
        block[3] = float(s.using_tensorrt)
        block[4] = float(s.using_wasm_fallback)

        # Memory (32-63)
        block[32] = s.gpu_memory_used_mb / s.gpu_memory_total_mb
        block[33] = s.gpu_utilization

        # Thermal state one-hot
        thermal_map = {"normal": 0, "warm": 1, "hot": 2, "throttling": 3}
        thermal_idx = thermal_map.get(s.thermal_state, 0)
        block[40 + thermal_idx] = 1.0

        # Latency budget (64-95)
        block[64] = s.latency_budget_ms / 5000.0
        block[65] = s.latency_remaining_ms / 5000.0
        block[66] = s.deadline_pressure

        return block

    def assemble(self) -> np.ndarray:
        """
        Assemble the full 1024-d feature vector.

        Returns:
            np.ndarray of shape (1024,) with dtype float32
        """
        # Encode each block
        llm_block = self._encode_llm_block()        # 256d
        vlm_block = self._encode_vlm_block()        # 128d
        web_block = self._encode_web_rag_block()    # 128d
        tool_block = self._encode_tool_block()      # 128d
        phase_block = self._encode_phase_ast_block() # 192d
        legal_block = self._encode_legal_block()    # 96d
        runtime_block = self._encode_runtime_block() # 96d

        # Concatenate
        vector = np.concatenate([
            llm_block,
            vlm_block,
            web_block,
            tool_block,
            phase_block,
            legal_block,
            runtime_block
        ])

        assert vector.shape == (TOTAL_DIMS,), f"Expected {TOTAL_DIMS}, got {vector.shape}"

        return vector.astype(np.float32)

    def assemble_dict(self) -> Dict[str, np.ndarray]:
        """
        Assemble as dictionary of named blocks.

        Returns:
            Dict mapping block names to their vectors
        """
        return {
            "llm_text": self._encode_llm_block(),
            "vlm_layout": self._encode_vlm_block(),
            "web_rag": self._encode_web_rag_block(),
            "tools": self._encode_tool_block(),
            "phase_ast": self._encode_phase_ast_block(),
            "legal_flags": self._encode_legal_block(),
            "runtime": self._encode_runtime_block(),
        }

    def to_json(self) -> Dict[str, Any]:
        """Serialize to JSON-compatible dict for Go SIMD scorer"""
        vector = self.assemble()
        return {
            "vector": vector.tolist(),
            "dims": TOTAL_DIMS,
            "blocks": {name: dim for name, dim in DIMS.items()},
            "timestamp": datetime.now().isoformat()
        }


# ============================================================
# Helper functions for collecting state from various sources
# ============================================================

async def collect_llm_state_from_ollama(
    response: Dict[str, Any],
    hidden_state: Optional[np.ndarray] = None
) -> LLMTextState:
    """Collect LLM state from Ollama response"""
    return LLMTextState(
        hidden_state=hidden_state,
        mean_logprob=response.get("mean_logprob", 0.0),
        entropy=response.get("entropy", 0.0),
        low_confidence_fraction=response.get("low_confidence_fraction", 0.0),
        token_count=response.get("eval_count", 0),
        perplexity=response.get("perplexity", 0.0)
    )


async def collect_vlm_state_from_langextract(
    doc_analysis: Dict[str, Any]
) -> VLMLayoutState:
    """Collect VLM state from langextract/Granite analysis"""
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
        doc_type_probs=doc_analysis.get("doc_type_probs", {})
    )


async def collect_web_rag_state(
    search_results: List[Dict[str, Any]],
    query_embedding: Optional[np.ndarray] = None
) -> WebRAGState:
    """Collect Web/RAG state from search results"""
    if not search_results:
        return WebRAGState()

    scores = [r.get("score", 0.0) for r in search_results]
    domains = set(r.get("domain", "") for r in search_results)

    return WebRAGState(
        top1_bm25=search_results[0].get("bm25_score", 0.0) if search_results else 0.0,
        top1_cosine=scores[0] if scores else 0.0,
        avg_top5=np.mean(scores[:5]) if len(scores) >= 5 else np.mean(scores),
        avg_top10=np.mean(scores[:10]) if len(scores) >= 10 else np.mean(scores),
        domain_diversity=len(domains) / max(len(search_results), 1),
        unique_domains=len(domains),
        statute_matches=sum(1 for r in search_results if r.get("is_statute")),
        case_matches=sum(1 for r in search_results if r.get("is_case")),
        citation_confidence=np.mean([r.get("citation_confidence", 0.0) for r in search_results])
    )


async def collect_tool_state(
    tool_history: List[Dict[str, Any]]
) -> ToolTelemetryState:
    """Collect tool telemetry from recent tool calls"""
    if not tool_history:
        return ToolTelemetryState()

    # Count tool usage
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
        max_latency_ms=max(latencies) if latencies else 0.0
    )


async def collect_phase_ast_state(
    error_report: Dict[str, Any],
    phase_info: Dict[str, Any]
) -> PhaseASTState:
    """Collect Phase/AST state from ts-morph error analysis"""
    errors = error_report.get("errors", [])

    # Count errors by code
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
        phase_history=phase_info.get("phase_history", [])
    )


async def collect_runtime_state(
    gpu_stats: Dict[str, Any],
    inference_stats: Dict[str, Any]
) -> RuntimeState:
    """Collect runtime state from GPU and inference stats"""
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
        deadline_pressure=inference_stats.get("deadline_pressure", 0.0)
    )


# ============================================================
# Main assembler function for ACE integration
# ============================================================

async def assemble_feature_vector(
    llm_response: Optional[Dict[str, Any]] = None,
    doc_analysis: Optional[Dict[str, Any]] = None,
    search_results: Optional[List[Dict[str, Any]]] = None,
    tool_history: Optional[List[Dict[str, Any]]] = None,
    error_report: Optional[Dict[str, Any]] = None,
    phase_info: Optional[Dict[str, Any]] = None,
    legal_context: Optional[Dict[str, Any]] = None,
    gpu_stats: Optional[Dict[str, Any]] = None,
    inference_stats: Optional[Dict[str, Any]] = None
) -> np.ndarray:
    """
    Main entry point: assemble 1024-d feature vector from all sources.

    This is what you call from ACE before sending to Go SIMD → C++ scorer.

    Args:
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
        np.ndarray of shape (1024,) ready for RL/QLoRA head
    """
    assembler = FeatureVectorAssembler()

    # Collect states from each source
    if llm_response:
        assembler.set_llm_state(await collect_llm_state_from_ollama(llm_response))

    if doc_analysis:
        assembler.set_vlm_state(await collect_vlm_state_from_langextract(doc_analysis))

    if search_results:
        assembler.set_web_rag_state(await collect_web_rag_state(search_results))

    if tool_history:
        assembler.set_tool_state(await collect_tool_state(tool_history))

    if error_report and phase_info:
        assembler.set_phase_ast_state(await collect_phase_ast_state(error_report, phase_info))

    if legal_context:
        assembler.set_legal_state(LegalFlagsState(
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
            constitutional_refs=legal_context.get("constitutional_refs", 0)
        ))

    if gpu_stats and inference_stats:
        assembler.set_runtime_state(await collect_runtime_state(gpu_stats, inference_stats))

    return assembler.assemble()


# ============================================================
# Example usage
# ============================================================

if __name__ == "__main__":
    import asyncio

    async def demo():
        # Create assembler
        assembler = FeatureVectorAssembler()

        # Set some example states
        assembler.set_llm_state(LLMTextState(
            mean_logprob=-0.5,
            entropy=2.3,
            token_count=150
        ))

        assembler.set_phase_ast_state(PhaseASTState(
            current_phase=72,
            total_errors=31777,
            error_counts={"TS2307": 5000, "TS2339": 3000, "TS1005": 1234}
        ))

        assembler.set_runtime_state(RuntimeState(
            tokens_per_sec=45.0,
            using_tensorrt=True,
            gpu_memory_used_mb=5900,
            thermal_state="normal"
        ))

        # Assemble
        vector = assembler.assemble()
        print(f"Feature vector shape: {vector.shape}")
        print(f"Feature vector dtype: {vector.dtype}")
        print(f"Non-zero elements: {np.count_nonzero(vector)}")
        print(f"Vector norm: {np.linalg.norm(vector):.4f}")

        # Show block breakdown
        blocks = assembler.assemble_dict()
        for name, block in blocks.items():
            print(f"  {name}: {block.shape}, non-zero: {np.count_nonzero(block)}")

    asyncio.run(demo())
