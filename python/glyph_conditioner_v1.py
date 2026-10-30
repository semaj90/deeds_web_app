"""CHR97 glyph-tile conditioning (extracted from docker/image-synthesis/app.py /glyph/condition).

Pure numpy, no HTTP, no GPU: runs without the :8092 image-synthesis container. The caller supplies the
optional 768-d query embedding (embeddinggemma); this module never calls Ollama.

Behavior is intentionally IDENTICAL to the original endpoint, plus a tile cap. KNOWN LIMIT (not fixed here):
only dims 0-10 of the tile matrix are populated, so query attention uses just the first 11 coordinates of
the query embedding, which is not a semantic comparison. Replace with real tile embeddings before relying
on the weights. canonical_authority is always False.
"""
from __future__ import annotations

from typing import Any, Sequence

import numpy as np

DIM = 768
MAX_TILES = 4096


def condition_glyph_tiles_v1(
    tiles: Sequence[dict[str, Any]],
    query_vec: Sequence[float] | None = None,
    width: int = 512,
    height: int = 512,
) -> dict[str, Any]:
    if not tiles:
        raise ValueError("tiles must be non-empty")
    if len(tiles) > MAX_TILES:
        raise ValueError(f"tiles exceeds {MAX_TILES}")
    k = len(tiles)
    mat = np.zeros((k, DIM), dtype=np.float32)
    for i, t in enumerate(tiles):
        mat[i, 0] = float(t.get("normX", 0.0))
        mat[i, 1] = float(t.get("normY", 0.0))
        mat[i, 2 + int(t.get("clusterId", 0)) % 8] = 1.0
        mat[i, 10] = float(t.get("confidence", 0.5))

    weights = np.ones(k, dtype=np.float32) / k
    if query_vec is not None:
        q = np.asarray(query_vec, dtype=np.float32)
        if q.size == DIM:
            scores = mat @ q / (DIM ** 0.5)
            scores -= scores.max()
            weights = np.exp(scores)
            weights /= weights.sum()

    vec = (weights[:, None] * mat).sum(axis=0)
    norm = float(np.linalg.norm(vec))
    if norm > 1e-6:
        vec /= norm

    gh, gw = max(1, height // 8), max(1, width // 8)
    spatial = np.zeros((gh, gw), dtype=np.float32)
    for i, t in enumerate(tiles):
        px = max(0, min(gw - 1, int(float(t.get("normX", 0)) * (gw - 1))))
        py = max(0, min(gh - 1, int(float(t.get("normY", 0)) * (gh - 1))))
        spatial[py, px] = float(weights[i])

    return {
        "conditioning_vector": vec,
        "attention_weights": weights,
        "spatial_map": spatial,
        "tile_count": k,
        "canonical_authority": False,
    }


if __name__ == "__main__":
    out = condition_glyph_tiles_v1([{"normX": 0.1, "normY": 0.9, "clusterId": 9, "confidence": 0.8}, {"normX": 0.5, "normY": 0.5}])
    assert out["conditioning_vector"].shape == (DIM,) and abs(np.linalg.norm(out["conditioning_vector"]) - 1) < 1e-5
    assert abs(float(out["attention_weights"].sum()) - 1) < 1e-5 and out["spatial_map"].shape == (64, 64)
    print("glyph_conditioner_v1 ok")
