#!/usr/bin/env python3
"""
Phase 47 Graph Analyzer microservice.

Fuses AST and textual embeddings, performs similarity ranking, and persists
relationships to Redis-era downstream systems (Neo4j, Qdrant) for the Phase 47
pipeline. CUDA is preferred when available; TensorRT and Ollama can be used as
optional acceleration/fallback layers.
"""
from __future__ import annotations

import os
import torch

# Memory optimization for PyTorch
if torch.cuda.is_available():
    # Limit GPU memory usage
    torch.cuda.set_per_process_memory_fraction(0.8)  # Use max 80% of GPU memory
    torch.cuda.empty_cache()

# Set Python memory limits
import resource
if hasattr(resource, 'RLIMIT_AS'):
    # Set address space limit to 4GB
    resource.setrlimit(resource.RLIMIT_AS, (4 * 1024 * 1024 * 1024, 4 * 1024 * 1024 * 1024))

# Force garbage collection more frequently
import gc
gc.set_threshold(700, 10, 10)

# Torch / CUDA handling (optional CPU fallback)
try:
    import torch
    import torch.nn.functional as F
except Exception as torch_exc:  # pragma: no cover - torch import errors are runtime env specific
    torch = None  # type: ignore[assignment]
    F = None  # type: ignore[assignment]
    logging.warning("Torch unavailable for Phase47 analyzer: %s", torch_exc)

# Optional Neo4j + Qdrant dependencies
try:
    from neo4j import GraphDatabase
except Exception as neo_exc:  # pragma: no cover
    GraphDatabase = None  # type: ignore[assignment]
    logging.warning("Neo4j driver unavailable: %s", neo_exc)

try:
    from qdrant_client import QdrantClient
    from qdrant_client.http import models as qmodels
except Exception as qdrant_exc:  # pragma: no cover
    QdrantClient = None  # type: ignore[assignment]
    qmodels = None  # type: ignore[assignment]
    logging.warning("Qdrant client unavailable: %s", qdrant_exc)

# ---------------------------------------------------------------------------
# Configuration
# ---------------------------------------------------------------------------
LOG_LEVEL = os.getenv("PHASE47_LOG_LEVEL", "INFO").upper()
logging.basicConfig(level=LOG_LEVEL, format="%(asctime)s [%(levelname)s] %(name)s: %(message)s")
logger = logging.getLogger("phase47.graph_analyzer")

DEFAULT_ANALYZER_TAG = os.getenv("PHASE47_ANALYZER_TAG", "phase47")
DEFAULT_RELATION = os.getenv("PHASE47_DEFAULT_RELATION", "SIMILAR")
MAX_TOP_K = int(os.getenv("PHASE47_MAX_TOPK", "25"))

TRT_PLAN_PATH = os.getenv("PHASE47_TRT_PLAN_PATH", os.path.join("checkpoints", "phase47", "graph_fusion.plan"))
OLLAMA_ENDPOINT = os.getenv("OLLAMA_ENDPOINT") or os.getenv("OLLAMA_URL") or "http://127.0.0.1:11434"
OLLAMA_MODEL = os.getenv("PHASE47_OLLAMA_MODEL", "gemma3-legal:latest")
ENABLE_OLLAMA_FALLBACK = os.getenv("PHASE47_ENABLE_OLLAMA_FALLBACK", "true").lower() == "true"

NEO4J_ENABLED = os.getenv("PHASE47_ENABLE_NEO4J", "true").lower() == "true"
NEO4J_URI = os.getenv("NEO4J_URI") or os.getenv("NEO4J_URL") or "bolt://localhost:7687"
NEO4J_USER = os.getenv("NEO4J_USER", "neo4j")
NEO4J_PASSWORD = os.getenv("NEO4J_PASSWORD", "neo4j")

QDRANT_ENABLED = os.getenv("PHASE47_ENABLE_QDRANT", "false").lower() == "true"
QDRANT_URL = os.getenv("QDRANT_URL", "http://127.0.0.1:6333")
QDRANT_API_KEY = os.getenv("QDRANT_API_KEY")
QDRANT_COLLECTION = os.getenv("PHASE47_QDRANT_COLLECTION", "phase47_ast_fused")

APP_VERSION = os.getenv("PHASE47_ANALYZER_VERSION", "0.1.0")

# Globals
_neo4j_driver = None
_qdrant_client = None
_qdrant_ready = False


# ---------------------------------------------------------------------------
# Request / response models
# ---------------------------------------------------------------------------
class GraphNode(BaseModel):
    key: str = Field(..., min_length=1, description="Unique identifier for this artifact (e.g., file path or hash).")
    ast_vec: List[float] = Field(..., min_items=1, description="AST embedding vector.")
    text_vec: List[float] = Field(..., min_items=1, description="Text/code embedding vector.")
    metadata: Dict[str, Any] = Field(default_factory=dict, description="Additional node metadata.")
    file_path: Optional[str] = Field(default=None, description="Original file path for reference.")
    language: Optional[str] = Field(default=None, description="Language identifier (optional).")


class GraphRequest(BaseModel):
    nodes: List[GraphNode] = Field(..., min_items=1, description="Artifacts to fuse/analyze.")
    top_k: int = Field(default=10, ge=1, description="Number of most-similar edges to emit per node.")
    relation: str = Field(default=DEFAULT_RELATION, description="Logical relation label for created edges.")
    analyzer_tag: Optional[str] = Field(default=None, description="Override analyzer tag for persistence metadata.")
    persist_neo4j: bool = Field(default=True, description="Toggle Neo4j persistence.")
    persist_qdrant: bool = Field(default=False, description="Toggle Qdrant upserts for fused vectors.")
    summary_prompt: Optional[str] = Field(
        default=None,
        description="Optional custom prompt for Ollama fallback summarisation when TensorRT plan is absent.",
    )


class GraphEdge(BaseModel):
    src: str
    dst: str
    score: float
    relation: str
    metadata: Dict[str, Any] = Field(default_factory=dict)


class GraphResponse(BaseModel):
    device: str
    torch_available: bool
    tensorrt_plan: Optional[str]
    edges: List[GraphEdge]
    persisted: Dict[str, bool]
    fallback_summary: Optional[str]
    latency_ms: float


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------
def _has_tensorrt_plan() -> bool:
    return os.path.exists(TRT_PLAN_PATH)


def _normalize_relation(rel: str) -> str:
    safe = (rel or DEFAULT_RELATION).strip().upper().replace(" ", "_")
    return safe if safe else DEFAULT_RELATION


def _pad_vector(vec: Iterable[float], target_len: int) -> List[float]:
    data = list(vec)
    if len(data) == target_len:
        return data
    if len(data) > target_len:
        return data[:target_len]
    return data + [0.0] * (target_len - len(data))


def _torch_available() -> bool:
    return torch is not None and F is not None


def _torch_device() -> str:
    if not _torch_available():
        return "cpu-numpy"
    return "cuda" if torch.cuda.is_available() else "cpu"


def _fuse_with_torch(nodes: List[GraphNode], top_k: int) -> Tuple[List[GraphEdge], str, List[List[float]]]:
    assert torch is not None and F is not None  # for mypy
    device = torch.device("cuda" if torch.cuda.is_available() else "cpu")
    vector_size = max(
        max(len(node.ast_vec), len(node.text_vec))
        for node in nodes
    )
    ast_tensor = torch.tensor(
        [_pad_vector(node.ast_vec, vector_size) for node in nodes],
        dtype=torch.float32,
        device=device,
    )
    text_tensor = torch.tensor(
        [_pad_vector(node.text_vec, vector_size) for node in nodes],
        dtype=torch.float32,
        device=device,
    )

    with torch.no_grad():
        fused = F.normalize(ast_tensor + text_tensor, dim=-1)
        sim_matrix = fused @ fused.T
        sim_matrix.fill_diagonal_(-float("inf"))

        fused_cpu = fused.detach().to("cpu")
        edges: List[GraphEdge] = []
        keys = [node.key for node in nodes]
        relation = _normalize_relation(nodes[0].metadata.get("relation", DEFAULT_RELATION))
        for idx, src_key in enumerate(keys):
            limit = min(top_k, len(keys) - 1)
            if limit <= 0:
                continue
            values, indices = torch.topk(sim_matrix[idx], k=limit)
            src_meta = nodes[idx].metadata
            for score, j in zip(values.tolist(), indices.tolist()):
                if j < 0 or j >= len(keys):
                    continue
                dst_node = nodes[j]
                edges.append(
                    GraphEdge(
                        src=src_key,
                        dst=keys[j],
                        score=float(score),
                        relation=relation,
                        metadata={
                            "analyzer": DEFAULT_ANALYZER_TAG,
                            "src_metadata": src_meta,
                            "dst_metadata": dst_node.metadata,
                        },
                    )
                )

    return edges, str(device), fused_cpu.tolist()


def _fuse_with_numpy(nodes: List[GraphNode], top_k: int) -> Tuple[List[GraphEdge], str, List[List[float]]]:
    import numpy as np

    vector_size = max(
        max(len(node.ast_vec), len(node.text_vec))
        for node in nodes
    )
    ast = np.array([_pad_vector(node.ast_vec, vector_size) for node in nodes], dtype=np.float32)
    text = np.array([_pad_vector(node.text_vec, vector_size) for node in nodes], dtype=np.float32)
    fused = ast + text
    norms = np.linalg.norm(fused, axis=1, keepdims=True) + 1e-12
    fused = fused / norms

    sim_matrix = fused @ fused.T
    np.fill_diagonal(sim_matrix, -np.inf)

    edges: List[GraphEdge] = []
    keys = [node.key for node in nodes]
    relation = _normalize_relation(nodes[0].metadata.get("relation", DEFAULT_RELATION))

    for idx, src_key in enumerate(keys):
        limit = min(top_k, len(keys) - 1)
        if limit <= 0:
            continue
        row = sim_matrix[idx]
        top_indices = np.argpartition(row, -limit)[-limit:]
        top_indices = top_indices[np.argsort(row[top_indices])[::-1]]
        src_meta = nodes[idx].metadata
        for j in top_indices:
            score = float(row[j])
            if not (0 <= j < len(keys)):
                continue
            dst_node = nodes[j]
            edges.append(
                GraphEdge(
                    src=src_key,
                    dst=keys[j],
                    score=score,
                    relation=relation,
                    metadata={
                        "analyzer": DEFAULT_ANALYZER_TAG,
                        "src_metadata": src_meta,
                        "dst_metadata": dst_node.metadata,
                    },
                )
            )

    return edges, "cpu-numpy", fused.tolist()


def _fuse_and_rank(nodes: List[GraphNode], top_k: int) -> Tuple[List[GraphEdge], str, List[List[float]]]:
    if len(nodes) < 2:
        return [], _torch_device(), []

    if top_k > MAX_TOP_K:
        raise HTTPException(status_code=400, detail=f"top_k={top_k} exceeds PHASE47_MAX_TOPK={MAX_TOP_K}")

    if _torch_available():
        return _fuse_with_torch(nodes, top_k)
    return _fuse_with_numpy(nodes, top_k)


def _safe_analyzer_tag(req: GraphRequest) -> str:
    return (req.analyzer_tag or DEFAULT_ANALYZER_TAG).strip() or DEFAULT_ANALYZER_TAG


def _ensure_neo4j_driver():
    global _neo4j_driver
    if not NEO4J_ENABLED or GraphDatabase is None:
        return None
    if _neo4j_driver is not None:
        return _neo4j_driver
    try:
        _neo4j_driver = GraphDatabase.driver(NEO4J_URI, auth=(NEO4J_USER, NEO4J_PASSWORD))
        logger.info("Connected to Neo4j at %s", NEO4J_URI)
    except Exception as exc:  # pragma: no cover - depends on runtime env
        logger.warning("Neo4j connection failed: %s", exc)
        _neo4j_driver = None
    return _neo4j_driver


def _persist_to_neo4j(edges: List[GraphEdge], tag: str) -> bool:
    driver = _ensure_neo4j_driver()
    if driver is None:
        return False
    if not edges:
        return True

    payload = [
        {
            "src": edge.src,
            "dst": edge.dst,
            "score": edge.score,
            "relation": edge.relation,
            "analyzer": edge.metadata.get("analyzer", tag),
            "metadata": edge.metadata,
        }
        for edge in edges
    ]

    query = """
    UNWIND $edges AS edge
    MERGE (src:CodeArtifact {id: edge.src})
    MERGE (dst:CodeArtifact {id: edge.dst})
    MERGE (src)-[rel:SIMILAR]->(dst)
    SET rel.score = edge.score,
        rel.phase = $tag,
        rel.edgeRelation = edge.relation,
        rel.metadata = edge.metadata,
        rel.updatedAt = datetime()
    """

    try:
        with driver.session() as session:
            session.execute_write(lambda tx: tx.run(query, edges=payload, tag=tag))
        return True
    except Exception as exc:  # pragma: no cover - depends on runtime env
        logger.warning("Neo4j persistence failed: %s", exc)
        return False


def _ensure_qdrant(vector_size: int) -> Optional[QdrantClient]:
    global _qdrant_client, _qdrant_ready
    if not QDRANT_ENABLED or QdrantClient is None or qmodels is None:
        return None

    if _qdrant_client is None:
        try:
            _qdrant_client = QdrantClient(url=QDRANT_URL, api_key=QDRANT_API_KEY)
            logger.info("Connected to Qdrant at %s", QDRANT_URL)
        except Exception as exc:  # pragma: no cover
            logger.warning("Qdrant connection failed: %s", exc)
            _qdrant_client = None
            return None

    if not _qdrant_ready:
        try:
            _qdrant_client.get_collection(QDRANT_COLLECTION)
            _qdrant_ready = True
        except Exception:
            try:
                _qdrant_client.create_collection(
                    collection_name=QDRANT_COLLECTION,
                    vectors_config=qmodels.VectorParams(size=vector_size, distance=qmodels.Distance.COSINE),
                )
                _qdrant_ready = True
                logger.info("Created Qdrant collection %s (size=%s)", QDRANT_COLLECTION, vector_size)
            except Exception as exc:  # pragma: no cover
                logger.warning("Qdrant collection init failed: %s", exc)
                _qdrant_ready = False
                return None
    return _qdrant_client


def _persist_to_qdrant(nodes: List[GraphNode], fused_vectors: List[List[float]], tag: str) -> bool:
    if not fused_vectors:
        return True
    client = _ensure_qdrant(len(fused_vectors[0]))
    if client is None:
        return False

    try:
        points = []
        for node, vec in zip(nodes, fused_vectors):
            payload = {
                "key": node.key,
                "phase": "phase47",
                "analyzer": tag,
                "metadata": node.metadata,
                "file_path": node.file_path,
                "language": node.language,
            }
            points.append(qmodels.PointStruct(id=node.key, vector=vec, payload=payload))

        client.upsert(collection_name=QDRANT_COLLECTION, points=points)
        return True
    except Exception as exc:  # pragma: no cover
        logger.warning("Qdrant upsert failed: %s", exc)
        return False


@lru_cache(maxsize=1)
def _ollama_available() -> bool:
    if not ENABLE_OLLAMA_FALLBACK:
        return False
    try:
        response = requests.get(f"{OLLAMA_ENDPOINT}/api/tags", timeout=2)
        return response.ok
    except Exception:
        return False


def _compose_summary_prompt(nodes: List[GraphNode], edges: List[GraphEdge], request_prompt: Optional[str]) -> str:
    if request_prompt:
        return request_prompt

    sample_edges = edges[: min(5, len(edges))]
    edge_snippets = "\n".join(
        f"- {edge.src} ↔ {edge.dst} (score {edge.score:.3f})"
        for edge in sample_edges
    )
    files = ", ".join(node.key for node in nodes[: min(5, len(nodes))])

    return (
        "You are Gemma3-Legal assisting with code similarity analysis.\n"
        "Summarize the most important relationships discovered by the Phase47 analyzer.\n"
        f"Files: {files}\nEdges:\n{edge_snippets}\n"
        "Highlight key clusters, possible dependency chains, and any anomalies worth inspecting."
    )


def _run_ollama_summary(prompt: str) -> Optional[str]:
    if not _ollama_available():
        return None

    try:
        response = requests.post(
            f"{OLLAMA_ENDPOINT}/api/generate",
            timeout=60,
            headers={"Content-Type": "application/json"},
            data=json.dumps(
                {
                    "model": OLLAMA_MODEL,
                    "prompt": prompt,
                    "stream": False,
                    "options": {"temperature": 0.1, "num_ctx": 4096},
                }
            ),
        )
        if response.ok:
            data = response.json()
            return data.get("response") or data.get("text")
        logger.warning("Ollama fallback failed (%s): %s", response.status_code, response.text)
    except Exception as exc:  # pragma: no cover
        logger.warning("Ollama request error: %s", exc)
    return None


# ---------------------------------------------------------------------------
# FastAPI application
# ---------------------------------------------------------------------------
app = FastAPI(title="Phase 47 Graph Analyzer", version=APP_VERSION)


@app.get("/health")
def health() -> Dict[str, Any]:
    device = _torch_device()
    return {
        "status": "ok",
        "torch_available": _torch_available(),
        "device": device,
        "tensorrt_plan_present": _has_tensorrt_plan(),
        "neo4j_enabled": NEO4J_ENABLED and GraphDatabase is not None,
        "neo4j_connected": _ensure_neo4j_driver() is not None,
        "qdrant_enabled": QDRANT_ENABLED and QdrantClient is not None,
        "qdrant_ready": _qdrant_ready,
        "ollama_enabled": ENABLE_OLLAMA_FALLBACK,
        "ollama_available": _ollama_available(),
        "version": APP_VERSION,
    }


@app.post("/analyze_graph", response_model=GraphResponse)
def analyze_graph(request: GraphRequest) -> GraphResponse:
    if not request.nodes:
        raise HTTPException(status_code=400, detail="Request contains no nodes.")

    start = time.perf_counter()

    try:
        edges, device, fused_vectors = _fuse_and_rank(request.nodes, request.top_k)
    except HTTPException:
        raise
    except Exception as exc:
        logger.exception("Fusion failed")
        raise HTTPException(status_code=500, detail=f"Fusion failed: {exc}")

    analyzer_tag = _safe_analyzer_tag(request)
    persisted = {"neo4j": False, "qdrant": False}

    if request.persist_neo4j:
        persisted["neo4j"] = _persist_to_neo4j(edges, analyzer_tag)
    if request.persist_qdrant:
        persisted["qdrant"] = _persist_to_qdrant(request.nodes, fused_vectors, analyzer_tag)

    fallback_summary = None
    if not _has_tensorrt_plan() and edges:
        prompt = _compose_summary_prompt(request.nodes, edges, request.summary_prompt)
        fallback_summary = _run_ollama_summary(prompt)

    latency_ms = (time.perf_counter() - start) * 1000.0

    return GraphResponse(
        device=device,
        torch_available=_torch_available(),
        tensorrt_plan=TRT_PLAN_PATH if _has_tensorrt_plan() else None,
        edges=edges,
        persisted=persisted,
        fallback_summary=fallback_summary,
        latency_ms=latency_ms,
    )


@app.get("/")
def root() -> Dict[str, Any]:
    return {
        "service": "phase47-graph-analyzer",
        "version": APP_VERSION,
        "docs": "/docs",
    }
