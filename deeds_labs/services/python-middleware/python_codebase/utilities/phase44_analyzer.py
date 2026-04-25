import logging
import os
import time
from functools import lru_cache
from typing import Dict, List, Optional

import torch
from fastapi import FastAPI, HTTPException
from pydantic import BaseModel, Field

try:
    import simdjson
except ImportError:  # pragma: no cover - fallback for local dev without simdjson
    simdjson = None

try:
    import redis  # type: ignore
except ImportError:  # pragma: no cover
    redis = None

LOG = logging.getLogger("phase44-analyzer")
logging.basicConfig(level=logging.INFO)


class AnalyzeRequest(BaseModel):
    id: str = Field(..., examples=["src/lib/components/Foo.ts"])
    embedding: List[float]
    metadata: Dict[str, str] = Field(default_factory=dict)
    ast_json: Optional[str] = Field(
        default=None,
        description="Optional serialized TypeScript AST (ts-morph cache JSON).",
    )
    neighbors: int = Field(
        default=5, ge=1, le=50, description="Number of similar entries to return."
    )


class Recommendation(BaseModel):
    id: str
    score: float
    metadata: Dict[str, str]


class AnalyzeResponse(BaseModel):
    fused_vector: List[float]
    recommendations: List[Recommendation]
    neo4j_payload: Dict[str, List[Dict[str, str]]]
    latency_ms: float
    device: str


def resolve_device() -> torch.device:
    if torch.cuda.is_available():
        preferred = int(os.getenv("CUDA_DEVICE", "0"))
        return torch.device(f"cuda:{preferred}")
    return torch.device("cpu")


DEVICE = resolve_device()


class EmbeddingStore:
    """In-memory tensor cache, optionally hydrated via Redis hash."""

    def __init__(self) -> None:
        self._ids: List[str] = []
        self._meta: List[Dict[str, str]] = []
        self._matrix: Optional[torch.Tensor] = None
        self._redis = self._init_redis()

    @staticmethod
    def _init_redis():
        url = os.getenv("REDIS_URL")
        if not url or redis is None:
            return None
        try:
            client = redis.Redis.from_url(url)
            client.ping()
            LOG.info("Redis connected for reference embeddings")
            return client
        except Exception as exc:  # pragma: no cover - depends on runtime env
            LOG.warning("Redis unavailable: %s", exc)
            return None

    def load_reference(self) -> None:
        if not self._redis:
            return
        key = os.getenv("PHASE44_REFERENCE_KEY", "phase44:reference")
        records = self._redis.hgetall(key)
        if not records:
            return
        import json

        ids, vectors, meta = [], [], []
        for entry_id, payload in records.items():
            try:
                decoded = json.loads(payload.decode())
            except Exception as exc:  # pragma: no cover - depends on payload
                LOG.debug("Skipping malformed Redis payload: %s", exc)
                continue
            ids.append(entry_id.decode())
            vectors.append(decoded["vector"])
            meta.append(decoded.get("metadata", {}))
        if vectors:
            self._ids = ids
            self._meta = meta
            tensor = torch.tensor(vectors, dtype=torch.float32, device=DEVICE)
            self._matrix = torch.nn.functional.normalize(tensor, dim=1)
            LOG.info("Loaded %d reference embeddings", len(self._ids))

    def add(self, entry_id: str, vector: torch.Tensor, metadata: Dict[str, str]) -> None:
        vector = torch.nn.functional.normalize(vector.detach().to(DEVICE), dim=0)
        if self._matrix is None:
            self._matrix = vector.unsqueeze(0)
        else:
            self._matrix = torch.cat([self._matrix, vector.unsqueeze(0)], dim=0)
        self._ids.append(entry_id)
        self._meta.append(metadata)

    def topk(self, query: torch.Tensor, k: int) -> List[Recommendation]:
        if self._matrix is None or not self._ids:
            return []
        expanded = query.unsqueeze(0).expand_as(self._matrix)
        scores = torch.nn.functional.cosine_similarity(self._matrix, expanded, dim=-1)
        topk = torch.topk(scores, min(k, len(self._ids)))
        return [
            Recommendation(
                id=self._ids[idx],
                score=float(scores_val),
                metadata=self._meta[idx],
            )
            for scores_val, idx in zip(topk.values.tolist(), topk.indices.tolist())
        ]


@lru_cache(maxsize=1)
def get_store() -> EmbeddingStore:
    store = EmbeddingStore()
    store.load_reference()
    return store


def parse_ast_features(ast_json: Optional[str]) -> torch.Tensor:
    if not ast_json:
        return torch.zeros(128, device=DEVICE)
    try:
        tokens = _extract_tokens(ast_json)
    except Exception as exc:  # pragma: no cover - defensive logging
        LOG.warning("Could not parse AST JSON: %s", exc)
        return torch.zeros(128, device=DEVICE)
    hashed = torch.zeros(128, device=DEVICE)
    for token in tokens[:2048]:
        bucket = hash(token) % 128
        hashed[bucket] += 1.0
    return torch.nn.functional.normalize(hashed, dim=0)


def _extract_tokens(ast_json: str) -> List[str]:
    if simdjson:
        parser = simdjson.Parser()
        parsed = parser.parse(ast_json)
    else:
        import json

        parsed = json.loads(ast_json)
    tokens: List[str] = []

    def walk(node):
        if isinstance(node, dict):
            node_type = node.get("kind") or node.get("type")
            if node_type:
                tokens.append(str(node_type))
            for value in node.values():
                walk(value)
        elif isinstance(node, list):
            for item in node:
                walk(item)
        elif isinstance(node, str):
            tokens.append(node[:32])

    walk(parsed)
    return tokens


def fuse_vectors(embedding: List[float], ast_tensor: torch.Tensor) -> torch.Tensor:
    embed_tensor = torch.tensor(embedding, device=DEVICE, dtype=torch.float32)
    embed_tensor = torch.nn.functional.normalize(embed_tensor, dim=0)
    if ast_tensor.shape[0] != embed_tensor.shape[0]:
        if ast_tensor.shape[0] < embed_tensor.shape[0]:
            pad = embed_tensor.shape[0] - ast_tensor.shape[0]
            ast_tensor = torch.nn.functional.pad(ast_tensor, (0, pad))
        else:
            ast_tensor = ast_tensor[: embed_tensor.shape[0]]
    return torch.nn.functional.normalize(embed_tensor + ast_tensor, dim=0)


app = FastAPI(title="Phase44 CUDA Analyzer", version="0.1.0")


@app.get("/health")
def health() -> Dict[str, str]:
    return {
        "status": "ok",
        "device": str(DEVICE),
        "torch": torch.__version__,
        "has_reference": str(get_store()._matrix is not None),
    }


@app.post("/analyze", response_model=AnalyzeResponse)
def analyze(payload: AnalyzeRequest) -> AnalyzeResponse:
    start = time.perf_counter()
    if not payload.embedding:
        raise HTTPException(status_code=400, detail="embedding list is empty")

    ast_tensor = parse_ast_features(payload.ast_json)
    fused = fuse_vectors(payload.embedding, ast_tensor)

    store = get_store()
    recommendations = store.topk(fused, payload.neighbors)
    store.add(payload.id, fused, payload.metadata)

    neo4j_payload = _build_neo4j_payload(payload, recommendations)
    latency_ms = (time.perf_counter() - start) * 1000.0
    LOG.info(
        "analyzed id=%s neighbors=%d latency=%.2fms",
        payload.id,
        len(recommendations),
        latency_ms,
    )

    return AnalyzeResponse(
        fused_vector=fused.detach().cpu().tolist(),
        recommendations=recommendations,
        neo4j_payload=neo4j_payload,
        latency_ms=latency_ms,
        device=str(DEVICE),
    )


def _build_neo4j_payload(
    payload: AnalyzeRequest, recommendations: List[Recommendation]
) -> Dict[str, List[Dict[str, str]]]:
    nodes = [
        {
            "label": "File",
            "id": payload.metadata.get("file", payload.id),
            "properties": payload.metadata,
        },
        {
            "label": "Embedding",
            "id": payload.id,
            "properties": {"dimension": len(payload.embedding)},
        },
    ]
    edges = [
        {
            "from": payload.metadata.get("file", payload.id),
            "to": payload.id,
            "type": "HAS_EMBEDDING",
        }
    ]
    for rec in recommendations:
        nodes.append(
            {
                "label": "Error",
                "id": rec.metadata.get("error", rec.id),
                "properties": rec.metadata,
            }
        )
        edges.append(
            {
                "from": payload.id,
                "to": rec.metadata.get("error", rec.id),
                "type": "SIMILAR_TO",
                "score": f"{rec.score:.5f}",
            }
        )
    return {"nodes": nodes, "edges": edges}


if __name__ == "__main__":
    import uvicorn

    uvicorn.run(
        "phase44_analyzer:app",
        host=os.getenv("PHASE44_HOST", "0.0.0.0"),
        port=int(os.getenv("PHASE44_PORT", "8090")),
        reload=bool(os.getenv("PHASE44_RELOAD", "0") == "1"),
    )
