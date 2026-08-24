#!/usr/bin/env python
"""
turbovec-sidecar.py — Phase 10B
Minimal HTTP sidecar wrapping turbovec IdMapIndex when stable numeric IDs are
available, with TurboQuantIndex positional compatibility for legacy callers.
Listens on :8791, provides /health + /rerank + /build + /prefilter + /search endpoints.

POST /rerank
  body: { "query": [768 floats], "candidates": [{"id": str, "vector": [768 floats], ...}], "top_k": int }
  returns: { "results": [{"id": str, "turbovec_score": float, "rank": int, ...}] }

POST /build
  body: { "candidates": [{"id": str, "vector": [768 floats]}, ...] }
  returns: { "indexed": int, "build_ms": float }

POST /prefilter
  body: { "vector": [768 floats], "topClusters": int }
  returns: { "clusterIds": [int, ...], "centroidScores": {cluster_id: score}, "backend": "python" }

POST /search
  body: { "vector": [768 floats], "topK": int }
  body may include allowlist: [CandidateOrdinal, ...]; TurboVec 1.0 applies it
  inside the IdMapIndex search kernel.

GET /health
  returns: { "ok": true, "indexed": int, "dim": 768, "bits": 2,
             "index_mode": "id_map", "native_allowlist": true }
"""

import json
import inspect
import sys
import time
import numpy as np
from http.server import BaseHTTPRequestHandler, HTTPServer
import turbovec
from turbovec import TurboQuantIndex, IdMapIndex

PORT     = 8791
DIM      = 768
BIT_W    = 2   # 2-bit TurboQuant quantization


class TurboVecSidecar:
    def __init__(self, dim=DIM, bit_width=BIT_W):
        self.dim        = dim
        self.bit_width  = bit_width
        self._index     = None
        self._ids       = []
        self._external_ids = {}
        self._clusters  = []   # parallel cluster label per indexed vector
        self._index_mode = "uninitialized"
        self._allowlist_native = "allowlist" in inspect.signature(IdMapIndex.search).parameters

    def build(self, ids, vectors, clusters=None, index_ids=None):
        """Build from display IDs and optional stable CandidateOrdinal IDs."""
        vecs = np.array(vectors, dtype=np.float32)
        if vecs.ndim == 1:
            vecs = vecs.reshape(1, -1)
        numeric_ids = []
        index_ids = list(index_ids) if index_ids is not None else list(ids)
        try:
            numeric_ids = [int(value) for value in index_ids]
            if len(set(numeric_ids)) != len(numeric_ids) or min(numeric_ids, default=0) < 0:
                raise ValueError("ids must be unique non-negative ordinals")
            self._index = IdMapIndex(self.dim, self.bit_width)
            self._index.add_with_ids(vecs, np.asarray(numeric_ids, dtype=np.uint64))
            self._index_mode = "id_map"
            self._external_ids = dict(zip(numeric_ids, ids))
        except (TypeError, ValueError, OverflowError):
            self._index = TurboQuantIndex(self.dim, self.bit_width)
            self._index.add(vecs)
            self._index_mode = "positional_compatibility"
            self._external_ids = {}
        self._index.prepare()
        self._ids     = list(ids)
        self._clusters = list(clusters) if clusters else [0] * len(ids)

    def search(self, query_vec, top_k=10, allowlist=None):
        """Search index. Returns list of {id, turbovec_score, rank, cluster}."""
        if self._index is None or not self._ids:
            return []
        q  = np.array(query_vec, dtype=np.float32).reshape(1, -1)
        k  = min(top_k, len(self._ids))
        native_allowlist = None
        if allowlist and self._index_mode == "id_map" and self._allowlist_native:
            native_allowlist = np.asarray([int(value) for value in allowlist], dtype=np.uint64)
        if native_allowlist is not None:
            scores, indices = self._index.search(q, k, allowlist=native_allowlist)
        else:
            scores, indices = self._index.search(q, k)
        results = []
        for rank, (score, idx) in enumerate(zip(scores[0], indices[0])):
            value = int(idx)
            if self._index_mode == "id_map":
                external_id = self._external_ids.get(value)
            else:
                external_id = self._ids[value] if 0 <= value < len(self._ids) else None
            if external_id is not None and (not allowlist or native_allowlist is not None or external_id in allowlist):
                results.append({
                    "id":             external_id,
                    "score":          round(float(score), 6),
                    "turbovec_score": round(float(score), 6),
                    "cluster":        self._clusters[idx] if idx < len(self._clusters) else 0,
                    "rank":           rank,
                })
        return results

    def prefilter(self, query_vec, top_clusters=5):
        """
        Return top cluster IDs by scoring the query against cluster centroids.
        Centroids are computed as mean of each cluster's indexed vectors.
        Returns cluster_ids and per-cluster centroid scores.
        """
        if self._index is None or not self._ids:
            return [], {}

        # Group vectors by cluster label
        cluster_vecs = {}
        for i, cid in enumerate(self._clusters):
            cluster_vecs.setdefault(cid, []).append(i)

        if not cluster_vecs:
            return [], {}

        q_norm = np.array(query_vec, dtype=np.float32)
        norm   = np.linalg.norm(q_norm)
        if norm > 0:
            q_norm = q_norm / norm

        # Compute centroid scores via TurboVec search with top_k=len(unique_clusters)*3
        results = self.search(query_vec, top_k=min(len(self._ids), max(50, top_clusters * 10)))

        # Aggregate by cluster — take max score per cluster
        cluster_best = {}
        for r in results:
            cid = r["cluster"]
            if cid not in cluster_best or r["score"] > cluster_best[cid]:
                cluster_best[cid] = r["score"]

        # Sort by score and take top_clusters
        sorted_clusters = sorted(cluster_best.items(), key=lambda x: -x[1])[:top_clusters]
        cluster_ids     = [int(cid) for cid, _ in sorted_clusters]
        centroid_scores = {str(cid): round(score, 6) for cid, score in sorted_clusters}

        return cluster_ids, centroid_scores

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
                "ok":      True,
                "status":  "ok",
                "indexed": sidecar.indexed,
                "dim":     sidecar.dim,
                "bits":    sidecar.bit_width,
                "bit_width": sidecar.bit_width,
                "backend": "python",
                "turbovec_version": getattr(turbovec, "__version__", "unknown"),
                "index_mode": sidecar._index_mode,
                "native_allowlist": sidecar._allowlist_native,
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
        elif self.path == "/prefilter":
            self._handle_prefilter(req)
        elif self.path == "/search":
            self._handle_search(req)
        else:
            self.send_json(404, {"error": "not found"})

    def _handle_build(self, req):
        """Build index from provided vectors. Called once per ACE packet."""
        candidates = req.get("candidates", [])
        if not candidates:
            self.send_json(400, {"error": "candidates required"})
            return
        ids      = [c["id"] for c in candidates]
        index_ids = [c.get("candidateOrdinal", c["id"]) for c in candidates]
        vectors  = [c["vector"] for c in candidates]
        clusters = [c.get("cluster", 0) for c in candidates]
        t0 = time.perf_counter()
        sidecar.build(ids, vectors, clusters, index_ids=index_ids)
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
            ids      = [c["id"] for c in candidates]
            index_ids = [c.get("candidateOrdinal", c["id"]) for c in candidates]
            vectors  = [c.get("vector") for c in candidates]
            clusters = [c.get("cluster", 0) for c in candidates]
            # Filter out candidates without vectors
            valid = [(i, ordinal, v, cl) for i, ordinal, v, cl in zip(ids, index_ids, vectors, clusters) if v is not None]
            if not valid:
                self.send_json(400, {"error": "no candidates with vectors"})
                return
            valid_ids, valid_index_ids, valid_vecs, valid_cls = zip(*valid)
            sidecar.build(valid_ids, valid_vecs, valid_cls, index_ids=valid_index_ids)

        if sidecar.indexed == 0:
            self.send_json(400, {"error": "no index built — POST /build first or include candidates"})
            return

        t0      = time.perf_counter()
        results = sidecar.search(query, top_k)
        elapsed = round((time.perf_counter() - t0) * 1000, 1)

        self.send_json(200, {
            "results":   results,
            "indexed":   sidecar.indexed,
            "search_ms": elapsed,
            "top_k":     top_k,
        })

    def _handle_prefilter(self, req):
        """Return top cluster IDs for a query vector (Qdrant must-filter injection)."""
        vector      = req.get("vector")
        top_clusters = int(req.get("topClusters", 5))

        if not vector:
            self.send_json(400, {"error": "vector required"})
            return

        if sidecar.indexed == 0:
            # No index built — return empty (caller falls back to full Qdrant scan)
            self.send_json(200, {
                "clusterIds":     [],
                "centroidScores": {},
                "backend":        "python",
                "indexed":        0,
            })
            return

        t0 = time.perf_counter()
        cluster_ids, centroid_scores = sidecar.prefilter(vector, top_clusters)
        elapsed = round((time.perf_counter() - t0) * 1000, 1)

        self.send_json(200, {
            "clusterIds":     cluster_ids,
            "centroidScores": centroid_scores,
            "backend":        "python",
            "indexed":        sidecar.indexed,
            "durationMs":     elapsed,
        })

    def _handle_search(self, req):
        """ANN search — returns top-K candidate point IDs with scores."""
        vector = req.get("vector")
        top_k  = int(req.get("topK", 200))
        allowlist = req.get("allowlist")

        if not vector:
            self.send_json(400, {"error": "vector required"})
            return

        if sidecar.indexed == 0:
            self.send_json(200, {
                "candidates": [],
                "backend":    "python",
                "indexed":    0,
            })
            return

        t0      = time.perf_counter()
        results = sidecar.search(vector, top_k, allowlist=allowlist)
        elapsed = round((time.perf_counter() - t0) * 1000, 1)

        # Reshape to the interface turbovec-prefilter.ts expects
        candidates = [{"id": r["id"], "score": r["score"], "cluster": r["cluster"]} for r in results]

        self.send_json(200, {
            "candidates": candidates,
            "backend":    "python",
            "indexed":    sidecar.indexed,
            "index_mode": sidecar._index_mode,
            "native_allowlist": sidecar._allowlist_native,
            "allowlist_mode": "native" if allowlist and sidecar._allowlist_native else "post_filter" if allowlist else "none",
            "durationMs": elapsed,
        })


def main():
    global PORT
    for i, arg in enumerate(sys.argv):
        if arg.startswith('--port='):
            try:
                PORT = int(arg.split('=')[1])
            except ValueError:
                pass
        elif arg == '--port' and i + 1 < len(sys.argv):
            try:
                PORT = int(sys.argv[i + 1])
            except ValueError:
                pass

    print(f"turbovec-sidecar v0.2 — dim={DIM} bit_width={BIT_W} port={PORT}", flush=True)
    print(f"endpoints: /health /build /rerank /prefilter /search", flush=True)
    server = HTTPServer(("127.0.0.1", PORT), Handler)
    print(f"listening on http://127.0.0.1:{PORT}", flush=True)
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        print("stopped", flush=True)


if __name__ == "__main__":
    main()
