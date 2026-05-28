#!/usr/bin/env python
"""
turbovec-sidecar.py — Phase 10B
Minimal HTTP sidecar wrapping turbovec TurboQuantIndex.
Listens on :8791, provides /health + /rerank endpoints.

POST /rerank
  body: { "query": [768 floats], "candidates": [{"id": str, "vector": [768 floats], ...}], "top_k": int }
  returns: { "results": [{"id": str, "turbovec_score": float, "rank": int, ...}] }

GET /health
  returns: { "status": "ok", "indexed": int, "dim": 768, "bit_width": 2 }
"""

import json
import sys
import time
import numpy as np
from http.server import BaseHTTPRequestHandler, HTTPServer
from turbovec import TurboQuantIndex

PORT     = 8791
DIM      = 768
BIT_W    = 2   # 2-bit TurboQuant quantization


class TurboVecSidecar:
    def __init__(self, dim=DIM, bit_width=BIT_W):
        self.dim       = dim
        self.bit_width = bit_width
        self._index    = None
        self._ids      = []

    def build(self, ids, vectors):
        """Build index from id list + float32 matrix (N, dim)."""
        vecs = np.array(vectors, dtype=np.float32)
        if vecs.ndim == 1:
            vecs = vecs.reshape(1, -1)
        self._index = TurboQuantIndex(self.dim, self.bit_width)
        self._index.add(vecs)
        self._index.prepare()
        self._ids = list(ids)

    def search(self, query_vec, top_k=10):
        """Search index. Returns list of {id, turbovec_score, rank}."""
        if self._index is None or not self._ids:
            return []
        q = np.array(query_vec, dtype=np.float32).reshape(1, -1)
        k = min(top_k, len(self._ids))
        scores, indices = self._index.search(q, k)
        results = []
        for rank, (score, idx) in enumerate(zip(scores[0], indices[0])):
            if idx < len(self._ids):
                results.append({
                    "id":              self._ids[idx],
                    "turbovec_score":  round(float(score), 6),
                    "rank":            rank,
                })
        return results

    @property
    def indexed(self):
        return len(self._ids)


sidecar = TurboVecSidecar()


class Handler(BaseHTTPRequestHandler):
    def log_message(self, fmt, *args):
        pass  # suppress default access log

    def send_json(self, code, obj):
        body = json.dumps(obj).encode()
        self.send_response(code)
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def do_GET(self):
        if self.path == "/health":
            self.send_json(200, {
                "status":    "ok",
                "indexed":   sidecar.indexed,
                "dim":       sidecar.dim,
                "bit_width": sidecar.bit_width,
            })
        else:
            self.send_json(404, {"error": "not found"})

    def do_POST(self):
        length = int(self.headers.get("Content-Length", 0))
        body   = self.rfile.read(length)
        try:
            req = json.loads(body)
        except Exception as e:
            self.send_json(400, {"error": f"json parse: {e}"})
            return

        if self.path == "/rerank":
            self._handle_rerank(req)
        elif self.path == "/build":
            self._handle_build(req)
        else:
            self.send_json(404, {"error": "not found"})

    def _handle_build(self, req):
        """Build index from provided vectors. Called once per ACE packet."""
        candidates = req.get("candidates", [])
        if not candidates:
            self.send_json(400, {"error": "candidates required"})
            return
        ids     = [c["id"] for c in candidates]
        vectors = [c["vector"] for c in candidates]
        t0 = time.perf_counter()
        sidecar.build(ids, vectors)
        elapsed = round((time.perf_counter() - t0) * 1000, 1)
        self.send_json(200, {"indexed": sidecar.indexed, "build_ms": elapsed})

    def _handle_rerank(self, req):
        """Rerank candidates by TurboVec score against query vector."""
        query      = req.get("query")
        candidates = req.get("candidates", [])
        top_k      = int(req.get("top_k", 20))

        if not query:
            self.send_json(400, {"error": "query vector required"})
            return

        # If candidates provided, build a fresh ephemeral index
        if candidates:
            ids     = [c["id"] for c in candidates]
            vectors = [c.get("vector") for c in candidates]
            # Filter out candidates without vectors
            valid = [(i, v) for i, v in zip(ids, vectors) if v is not None]
            if not valid:
                self.send_json(400, {"error": "no candidates with vectors"})
                return
            valid_ids, valid_vecs = zip(*valid)
            sidecar.build(valid_ids, valid_vecs)

        if sidecar.indexed == 0:
            self.send_json(400, {"error": "no index built — POST /build first or include candidates"})
            return

        t0      = time.perf_counter()
        results = sidecar.search(query, top_k)
        elapsed = round((time.perf_counter() - t0) * 1000, 1)

        self.send_json(200, {
            "results":    results,
            "indexed":    sidecar.indexed,
            "search_ms":  elapsed,
            "top_k":      top_k,
        })


def main():
    print(f"turbovec-sidecar v0.1 — dim={DIM} bit_width={BIT_W} port={PORT}", flush=True)
    server = HTTPServer(("127.0.0.1", PORT), Handler)
    print(f"listening on http://127.0.0.1:{PORT}", flush=True)
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        print("stopped", flush=True)


if __name__ == "__main__":
    main()