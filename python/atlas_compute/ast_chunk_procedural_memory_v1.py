#!/usr/bin/env python3
"""ast_chunk_procedural_memory_v1.py — AST Procedural Memory, Domain Classification & Tensor Mapping.

Provides high-throughput, zero-copy helpers for /ast/chunk:
1. Exact recognition of experimental feature-domain IDs; cross-vocabulary mapping is not inferred here.
2. Rule-based AST/path cues emitted only as unreviewed domain proposals.
3. Linked lists & Key-Value tuples for procedural AST memory.
4. Direct numpy / PyTorch contiguous float32 tensor creation (bypassing JSON serialization).
"""

from __future__ import annotations

import re
from dataclasses import dataclass
from typing import Any, Dict, List, Optional, Sequence, Tuple, Union

try:
    import numpy as np
    HAVE_NUMPY = True
except ImportError:
    np = None  # type: ignore
    HAVE_NUMPY = False

try:
    import torch
    HAVE_TORCH = True
except ImportError:
    torch = None  # type: ignore
    HAVE_TORCH = False


# ═══════════════════════════════════════════════════════════════════
# 1. Experimental Feature Domains
# ═══════════════════════════════════════════════════════════════════

EXPERIMENTAL_FEATURE_DOMAINS: Tuple[str, ...] = (
    "auth",
    "ui",
    "retrieval",
    "database",
    "cache",
    "agent",
    "graph",
    "ml",
    "network",
)

FEATURE_DOMAIN_TO_ORDINAL: Dict[str, int] = {
    domain: index for index, domain in enumerate(EXPERIMENTAL_FEATURE_DOMAINS)
}

def canonicalize_domain(domain_str: str) -> str:
    """Accept only an exact experimental feature-domain ID; never infer crosswalks."""
    cleaned = domain_str.strip().lower() if domain_str else ""
    return cleaned if cleaned in FEATURE_DOMAIN_TO_ORDINAL else "unresolved"


# ═══════════════════════════════════════════════════════════════════
# 2. AST Domain Classification Routing Rules
# ═══════════════════════════════════════════════════════════════════

# Svelte 5 runes and UI cues
UI_KEYWORDS = re.compile(r"(\$state|\$derived|\$props|\$effect|\$inspect|svelte|html|css|bits-ui|component|render)", re.IGNORECASE)
AUTH_KEYWORDS = re.compile(r"(auth|jwt|session|token|bcrypt|oauth|password|credential|permission|rbac)", re.IGNORECASE)
DB_KEYWORDS = re.compile(r"(drizzle|pgtable|postgres|schema|foreignkey|primarykey|sql|querybuilder|migration)", re.IGNORECASE)
CACHE_KEYWORDS = re.compile(r"(valkey|redis|cache|ttl|setex|getset|lru|cache-aside)", re.IGNORECASE)
RETRIEVAL_KEYWORDS = re.compile(r"(qdrant|embedding|vector|similarity|cosine|rerank|rrf|bm25|hnsw|ann)", re.IGNORECASE)
GRAPH_KEYWORDS = re.compile(r"(networkx|cugraph|pagerank|hypergraph|adjacency|graph_struct|bfs|edge|node)", re.IGNORECASE)
AGENT_KEYWORDS = re.compile(r"(agent|subagent|kanban|workflow|planner|dag|dispatcher|tool_registry)", re.IGNORECASE)
ML_KEYWORDS = re.compile(r"(torch|cuda|tensor|libtorch|tensorrt|cublas|gemm|kmeans|embeddinggemma|onnx|nvcc)", re.IGNORECASE)
NETWORK_KEYWORDS = re.compile(r"(grpc|proto|http|fetch|endpoint|\+server|route|handler|websocket)", re.IGNORECASE)


def classify_ast_chunk_domain(
    file_path: str,
    node_type: str,
    text_content: str,
    symbol_name: Optional[str] = None,
) -> str:
    """Return an unreviewed heuristic proposal, not a canonical domain assignment."""
    fpath = file_path.lower()
    content = text_content or ""
    sym = (symbol_name or "").lower()

    # 1. Strict extension cues
    if fpath.endswith(".svelte") or UI_KEYWORDS.search(sym):
        return "ui"
    if fpath.endswith((".sql", ".drizzle")):
        return "database"
    if fpath.endswith((".proto", ".grpc")):
        return "network"
    if fpath.endswith((".cu", ".cuh")):
        return "ml"

    # 2. Path routing cues
    if "/routes/" in fpath or "/api/" in fpath:
        if "+server." in fpath or "+page." in fpath:
            return "ui" if "+page." in fpath else "network"
    if "/db/" in fpath or "/schema/" in fpath:
        return "database"
    if "/retrieval/" in fpath or "/search/" in fpath:
        return "retrieval"
    if "/gpu/" in fpath or "/tensor" in fpath or "/torch" in fpath:
        return "ml"
    if "/graph/" in fpath or "/topology/" in fpath:
        return "graph"
    if "/auth/" in fpath:
        return "auth"

    # 3. Content cue regex scoring
    scores = {
        "ui": len(UI_KEYWORDS.findall(content)),
        "auth": len(AUTH_KEYWORDS.findall(content)),
        "database": len(DB_KEYWORDS.findall(content)),
        "cache": len(CACHE_KEYWORDS.findall(content)),
        "retrieval": len(RETRIEVAL_KEYWORDS.findall(content)),
        "graph": len(GRAPH_KEYWORDS.findall(content)),
        "agent": len(AGENT_KEYWORDS.findall(content)),
        "ml": len(ML_KEYWORDS.findall(content)),
        "network": len(NETWORK_KEYWORDS.findall(content)),
    }

    best_domain, best_score = max(scores.items(), key=lambda item: item[1])
    if best_score > 0:
        return best_domain

    return "unresolved"


# ═══════════════════════════════════════════════════════════════════
# 3. Procedural Memory: Linked Lists & Python Key-Value Tuples
# ═══════════════════════════════════════════════════════════════════

@dataclass
class AstProceduralNode:
    """Procedural linked list node for O(1) AST chunk traversal."""
    chunk_id: str
    domain: str
    span_start: int
    span_end: int
    parent_symbol: Optional[str]
    node_type: str
    call_targets: Tuple[str, ...]
    dependencies: Tuple[str, ...]
    domain_proposal: Optional[str] = None
    next_node: Optional[AstProceduralNode] = None

    def to_tuple(self) -> Tuple[str, str, int, int, Optional[str], str, Tuple[str, ...], Tuple[str, ...], Optional[str]]:
        """Return immutable Python tuple representation."""
        return (
            self.chunk_id,
            self.domain,
            self.span_start,
            self.span_end,
            self.parent_symbol,
            self.node_type,
            self.call_targets,
            self.dependencies,
            self.domain_proposal,
        )

    def to_kv_pairs(self) -> List[Tuple[str, Any]]:
        """Return as sequence of key-value tuples for procedural indexing."""
        return [
            ("chunk_id", self.chunk_id),
            ("domain", self.domain),
            ("domain_proposal", self.domain_proposal),
            ("span_start", self.span_start),
            ("span_end", self.span_end),
            ("parent_symbol", self.parent_symbol),
            ("node_type", self.node_type),
            ("calls", self.call_targets),
            ("deps", self.dependencies),
        ]


def build_procedural_chain(
    chunks: Sequence[Dict[str, Any]],
    file_path: str = "",
) -> Optional[AstProceduralNode]:
    """Chain chunks; only caller-supplied resolved_domain enters canonical feature slots."""
    if not chunks:
        return None

    head: Optional[AstProceduralNode] = None
    curr: Optional[AstProceduralNode] = None

    for ch in chunks:
        chunk_id = ch.get("chunk_id") or ch.get("id") or f"span:{ch.get('start_byte', 0)}-{ch.get('end_byte', 0)}"
        node_type = ch.get("node_type", "chunk")
        content = ch.get("text", "") or ch.get("content", "")
        sym = ch.get("symbol_name") or ch.get("parent_symbol")

        domain = canonicalize_domain(ch.get("resolved_domain", ""))
        domain_proposal = ch.get("domain_proposal") or classify_ast_chunk_domain(file_path, node_type, content, sym)

        calls = tuple(ch.get("calls", []))
        deps = tuple(ch.get("dependencies", []))

        node = AstProceduralNode(
            chunk_id=chunk_id,
            domain=domain,
            span_start=ch.get("start_byte", 0),
            span_end=ch.get("end_byte", 0),
            parent_symbol=sym,
            node_type=node_type,
            call_targets=calls,
            dependencies=deps,
            domain_proposal=domain_proposal,
            next_node=None,
        )

        if head is None:
            head = node
            curr = node
        else:
            assert curr is not None
            curr.next_node = node
            curr = node

    return head


# ═══════════════════════════════════════════════════════════════════
# 4. Procedural Memory Mapping for Direct PyTorch / NumPy Arrays
# ═══════════════════════════════════════════════════════════════════

# Feature vector layout: 25 dimensions
# [0..8]: One-hot domain indicator (9 canonical domains)
# [9]: Span length normalized (min(span_bytes / 4096.0, 1.0))
# [10]: Line count normalized (min(line_count / 128.0, 1.0))
# [11]: Call count normalized (min(calls / 16.0, 1.0))
# [12]: Dependency count normalized (min(deps / 16.0, 1.0))
# [13]: Has parent symbol indicator (0.0 or 1.0)
# [14]: Is export indicator (0.0 or 1.0)
# [15..24]: Reserved procedural slots for low-rank / clustering weights
PROCEDURAL_FEATURE_DIM = 25


def chunk_to_feature_vector(
    node: AstProceduralNode,
    line_count: int = 1,
    is_export: bool = False,
) -> List[float]:
    """Extract a 25-dimensional procedural feature vector from an AST node."""
    vec = [0.0] * PROCEDURAL_FEATURE_DIM

    # 1. Domain one-hot (dims 0..8)
    domain_idx = FEATURE_DOMAIN_TO_ORDINAL.get(node.domain)
    if domain_idx is not None:
        vec[domain_idx] = 1.0

    # 2. Structural metrics
    span_bytes = max(0, node.span_end - node.span_start)
    vec[9] = min(float(span_bytes) / 4096.0, 1.0)
    vec[10] = min(float(max(1, line_count)) / 128.0, 1.0)
    vec[11] = min(float(len(node.call_targets)) / 16.0, 1.0)
    vec[12] = min(float(len(node.dependencies)) / 16.0, 1.0)
    vec[13] = 1.0 if node.parent_symbol else 0.0
    vec[14] = 1.0 if is_export else 0.0

    return vec


def procedural_chain_to_array(
    head: Optional[AstProceduralNode],
    as_tensor: bool = True,
    pin_memory: bool = False,
) -> Any:
    """Convert a procedural linked-list chain directly into a contiguous float32 PyTorch tensor or NumPy matrix.
    
    Bypasses JSON completely for direct host/device consumption.
    """
    rows: List[List[float]] = []
    curr = head
    while curr is not None:
        rows.append(chunk_to_feature_vector(curr))
        curr = curr.next_node

    if not rows:
        if as_tensor and HAVE_TORCH:
            return torch.empty((0, PROCEDURAL_FEATURE_DIM), dtype=torch.float32)
        elif HAVE_NUMPY:
            return np.empty((0, PROCEDURAL_FEATURE_DIM), dtype=np.float32)
        return []

    if HAVE_NUMPY:
        mat_np = np.asarray(rows, dtype=np.float32)
        if as_tensor and HAVE_TORCH:
            t = torch.from_numpy(mat_np)
            if pin_memory and torch.cuda.is_available():
                t = t.pin_memory()
            return t
        return mat_np

    if as_tensor and HAVE_TORCH:
        t = torch.tensor(rows, dtype=torch.float32)
        if pin_memory and torch.cuda.is_available():
            t = t.pin_memory()
        return t

    return rows
