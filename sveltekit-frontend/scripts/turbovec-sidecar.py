"""
scripts/turbovec-sidecar.py
=============================
TurboVec 4-bit ANN search sidecar.
Listens on PORT (default 8793), accepts POST /search { vector, k }
Returns { ids: [...], scores: [...] }

Loaded at startup:
  - Pulls the revision-qualified codebase_chunks_768_v2 768d vectors from Qdrant
  - Builds TurboQuantIndex (4-bit) for ultra-fast ANN prefilter
  - Re-indexes on POST /reindex

Usage:
    python scripts/turbovec-sidecar.py [--port 8793] [--dim 64] [--qdrant http://localhost:6333]
"""

import sys
import json
import time
import argparse
import threading
import traceback
from http.server import BaseHTTPRequestHandler, HTTPServer
from urllib.request import urlopen
from urllib.error import URLError

try:
    import turbovec
    import numpy as np
    TURBOVEC_OK = True
except ImportError:
    TURBOVEC_OK = False
    print("[WARN] turbovec not installed — ANN sidecar will return empty results")
    print("       Install: python -m pip install vendor/wheels/turbovec-0.3.0-cp39-abi3-win_amd64.whl")

# ── Config ────────────────────────────────────────────────────────────────────
parser = argparse.ArgumentParser()
parser.add_argument('--port', type=int, default=8793)
parser.add_argument('--dim', type=int, default=64,  help='Projection dim for TurboVec index (max 64 for 4-bit speed)')
parser.add_argument('--bits', type=int, default=4,   help='Quantization bits (4 or 8)')
parser.add_argument('--qdrant', type=str, default='http://127.0.0.1:6333')
parser.add_argument('--collection', type=str, default='codebase_chunks_768_v2')
parser.add_argument('--vector-name', type=str, default='content')
args = parser.parse_args()

PORT       = args.port
DIM        = args.dim       # Projection dimension (64 for speed, project from 768)
BITS       = args.bits
QDRANT     = args.qdrant
COLLECTION = args.collection
VEC_NAME   = args.vector_name
FULL_DIM   = 768            # Full Ollama embedding dimension

# ── Global ANN index ─────────────────────────────────────────────────────────
index_lock  = threading.Lock()
ann_index   = None
ann_ids     = []  # Qdrant point IDs aligned with index rows
ann_identity = []  # optional canonical provenance aligned with index rows

def identity_from_payload(payload):
    """Return optional projection provenance without making TurboVec canonical."""
    payload = payload if isinstance(payload, dict) else {}
    identity = {
        "symbolVersionId": payload.get("symbol_version_id", payload.get("symbolVersionId")),
        "packetKey": payload.get("packet_key", payload.get("packetKey")),
        "sourceRef": payload.get("source_ref", payload.get("sourceRef", payload.get("file_path"))),
        "contentHash": payload.get("content_hash", payload.get("contentHash")),
        "sourceRevision": payload.get("source_revision", payload.get("sourceRevision")),
        "workspaceRevision": payload.get("workspace_revision", payload.get("workspaceRevision")),
        "namespace": payload.get("namespace", payload.get("source_namespace", payload.get("sourceNamespace"))),
    }
    return {key: value for key, value in identity.items() if value is not None and value != ""}

def project(vec_768):
    """Simple deterministic PCA-free projection: take every 12th dim from 768 → 64."""
    step = FULL_DIM // DIM
    return [vec_768[i * step] for i in range(DIM)]

def load_from_qdrant():
    """Scroll Qdrant, build TurboVec index."""
    global ann_index, ann_ids, ann_identity
    if not TURBOVEC_OK:
        return 0

    print(f"[sidecar] Scrolling {QDRANT}/collections/{COLLECTION} for ANN index...")
    new_index = turbovec.TurboQuantIndex(DIM, BITS)
    ids = []
    identities = []
    offset = None
    batch = 500
    total = 0
    indexed = 0

    while True:
        body = json.dumps({
            "limit": batch,
            "with_vector": True if COLLECTION == 'codebase_chunks_encoded64' else [VEC_NAME],
            "with_payload": True,
            **({"offset": offset} if offset else {})
        }).encode()

        try:
            import urllib.request
            req = urllib.request.Request(
                f"{QDRANT}/collections/{COLLECTION}/points/scroll",
                data=body,
                headers={"Content-Type": "application/json"},
                method="POST"
            )
            with urllib.request.urlopen(req, timeout=30) as resp:
                data = json.loads(resp.read())
        except Exception as e:
            print(f"[sidecar] Qdrant scroll error: {e}")
            break

        points = data.get("result", {}).get("points", [])
        batch_ids = []
        batch_vecs = []
        batch_identity = []

        for pt in points:
            vec = pt.get("vector", {})
            if isinstance(vec, dict):
                vec = vec.get(VEC_NAME, [])
            if len(vec) >= FULL_DIM:
                batch_ids.append(pt["id"])
                batch_vecs.append(project(vec[:FULL_DIM]))
                batch_identity.append(identity_from_payload(pt.get("payload")))
            elif len(vec) == DIM:
                batch_ids.append(pt["id"])
                batch_vecs.append(vec)
                batch_identity.append(identity_from_payload(pt.get("payload")))

        if batch_ids:
            arr = np.array(batch_vecs, dtype=np.float32)
            new_index.add(arr)
            ids.extend(batch_ids)
            identities.extend(batch_identity)
            indexed += len(batch_ids)

        total += len(points)
        offset = data.get("result", {}).get("next_page_offset")
        print(f"  Scrolled {total} points | indexed {indexed} vectors...", end='\r', flush=True)
        if not offset or not points:
            break

    print(f"\n[sidecar] Loaded {len(ids)} vectors for TurboVec index.")

    if not ids:
        return 0

    t0 = time.time()
    new_index.prepare()
    print(f"[sidecar] TurboVec index built in {time.time()-t0:.3f}s ({len(ids)} vectors, {DIM}d, {BITS}-bit)")

    with index_lock:
        ann_index = new_index
        ann_ids = ids
        ann_identity = identities

    return len(ids)

# ── HTTP Handler ─────────────────────────────────────────────────────────────
class SidecarHandler(BaseHTTPRequestHandler):
    def log_message(self, format, *args):
        pass  # Suppress default HTTP logging

    def send_json(self, code, obj):
        body = json.dumps(obj).encode()
        self.send_response(code)
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def do_GET(self):
        if self.path == '/health':
            with index_lock:
                self.send_json(200, {
                    "ok": True,
                    "indexed": len(ann_ids),
                    "dim": DIM,
                    "bits": BITS,
                    "turbovec": TURBOVEC_OK,
                    "collection": COLLECTION,
                })
        elif self.path == '/reindex':
            # Trigger async reindex
            threading.Thread(target=load_from_qdrant, daemon=True).start()
            self.send_json(202, {"status": "reindexing"})
        else:
            self.send_json(404, {"error": "not found"})

    def do_POST(self):
        global ann_index, ann_ids, ann_identity
        length = int(self.headers.get("Content-Length", 0))
        body = self.rfile.read(length)

        if self.path == '/search':
            try:
                req = json.loads(body)
                vec = req.get("vector", [])
                k   = min(int(req.get("k", 10)), 1000)

                with index_lock:
                    if ann_index is None or not TURBOVEC_OK:
                        self.send_json(200, {"ids": [], "scores": [], "fallback": True})
                        return

                    # Project to index dim if needed
                    if len(vec) > DIM:
                        vec = project(vec[:FULL_DIM])
                    
                    q = np.array([vec], dtype=np.float32)
                    scores, indices = ann_index.search(q, k=min(k, len(ann_ids)))
                    result_ids = [ann_ids[i] for i in indices[0] if i < len(ann_ids)]
                    result_scores = [float(s) for s in scores[0][:len(result_ids)]]
                    result_candidates = []
                    for rank, (idx, score) in enumerate(zip(indices[0], scores[0])):
                        if idx >= len(ann_ids):
                            continue
                        candidate = {
                            "id": ann_ids[idx],
                            "score": float(score),
                            "cluster": 0,
                            "rank": rank,
                        }
                        identity = ann_identity[idx] if idx < len(ann_identity) else {}
                        if identity:
                            candidate["identity"] = identity
                        result_candidates.append(candidate)

                self.send_json(200, {
                    "ids": result_ids,
                    "scores": result_scores,
                    "candidates": result_candidates,
                    "indexed": len(ann_ids),
                })
            except Exception as e:
                traceback.print_exc()
                self.send_json(500, {"error": str(e)})

        elif self.path == '/reindex':
            threading.Thread(target=load_from_qdrant, daemon=True).start()
            self.send_json(202, {"status": "reindexing"})
        elif self.path == '/build':
            try:
                import time
                t0 = time.time()
                req = json.loads(body)
                candidates = req.get("candidates", [])
                
                new_index = turbovec.TurboQuantIndex(DIM, BITS)
                ids = []
                identities = []
                batch_vecs = []
                
                for c in candidates:
                    cid = c.get("id")
                    vec = c.get("vector")
                    if cid and vec and len(vec) == DIM:
                        ids.append(cid)
                        batch_vecs.append(vec)
                        identities.append(identity_from_payload(c.get("identity")))
                
                if ids:
                    arr = np.array(batch_vecs, dtype=np.float32)
                    new_index.add(arr)
                    new_index.prepare()
                    
                    with index_lock:
                        ann_index = new_index
                        ann_ids = ids
                        ann_identity = identities
                
                build_ms = int((time.time() - t0) * 1000)
                self.send_json(200, {
                    "ok": True,
                    "indexed": len(ann_ids),
                    "build_ms": build_ms
                })
            except Exception as e:
                traceback.print_exc()
                self.send_json(500, {"error": str(e)})
        else:
            self.send_json(404, {"error": "not found"})

# http.server.HTTPServer sets allow_reuse_address = True by class default
# (a stdlib convenience for fast restarts, via socketserver.TCPServer). That
# lets a second sidecar process silently bind alongside a still-running one
# instead of failing with "address already in use" -- observed live 2026-08-01:
# two independently-launched sidecar processes both held a LISTEN socket on
# :8791 simultaneously, with requests nondeterministically routed to whichever
# process's kernel accept queue got them (explains intermittent hangs/timeouts
# against a supposedly single sidecar). Disabling reuse restores normal OS
# duplicate-bind semantics, so a second launch attempt fails loudly and
# immediately instead of creating a silent split-brain server pair.
class SingleBindHTTPServer(HTTPServer):
    allow_reuse_address = False

# ── Main ─────────────────────────────────────────────────────────────────────
if __name__ == '__main__':
    print(f"[sidecar] TurboVec ANN sidecar starting on port {PORT}...")
    print(f"          Collection: {COLLECTION} | dim={DIM} | bits={BITS}")
    print(f"          TurboVec available: {TURBOVEC_OK}")

    try:
        server = SingleBindHTTPServer(('127.0.0.1', PORT), SidecarHandler)
    except OSError as e:
        print(f"[sidecar] FATAL: could not bind 127.0.0.1:{PORT} -- {e}")
        print(f"          Another sidecar process is almost certainly already running on this port.")
        print(f"          Check: netstat -ano | findstr :{PORT}")
        raise SystemExit(1)

    # Initial index load in background (only after the bind succeeds, so a
    # failed launch doesn't leave an orphaned indexing thread running)
    threading.Thread(target=load_from_qdrant, daemon=True).start()

    print(f"[sidecar] Listening on http://127.0.0.1:{PORT}")
    print(f"          Health: GET /health | Search: POST /search | Reindex: GET /reindex")
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        print("\n[sidecar] Shutting down.")
