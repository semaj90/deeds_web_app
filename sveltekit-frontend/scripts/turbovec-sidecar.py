"""
scripts/turbovec-sidecar.py
=============================
TurboVec 4-bit ANN search sidecar.
Listens on PORT (default 8793), accepts POST /search { vector, k }
Returns { ids: [...], scores: [...] }

Loaded at startup (--source postgres, default):
  - One server-side cursor over codebase_chunk_index.content_embedding_768 (canonical
    semantic_768); the MRL-64 prefix l2_normalize(v[:64]) is sliced in SQL (subvector)
  - Builds TurboQuantIndex (4-bit) as a derived CHALLENGER_ONLY ANN prefilter
  - Re-indexes on POST /reindex
--source qdrant keeps the legacy Qdrant scroll path (mirror, not truth).

Usage:
    python scripts/turbovec-sidecar.py [--port 8793] [--dim 64] [--qdrant http://localhost:6333]
"""

import os
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
parser.add_argument('--source', choices=['postgres', 'qdrant'], default='postgres',
                    help='postgres = canonical content_embedding_768 (default); qdrant = legacy mirror scroll')
parser.add_argument('--projection', choices=['mrl', 'strided'], default='mrl',
                    help='mrl = l2_normalize(v[:DIM]) (EmbeddingGemma Matryoshka prefix); strided = legacy every-Nth')
parser.add_argument('--default-k', type=int, default=100,
                    help='candidates returned when a request omits k. Prefilter policy from the 1000-query frozen canary: '
                         'recall of exact top-10 after exact 768 rescoring is 0.899@50, 0.950@100, 0.965@150, 0.974@200')
parser.add_argument('--database-url-env', type=str, default='DATABASE_URL',
                    help='env var holding the Postgres DSN (never logged)')
args = parser.parse_args()

PORT       = args.port
DIM        = args.dim       # Projection dimension (64 for speed, project from 768)
BITS       = args.bits
QDRANT     = args.qdrant
COLLECTION = args.collection
VEC_NAME   = args.vector_name
FULL_DIM   = 768            # Full Ollama embedding dimension
SOURCE     = args.source
PROJECTION = args.projection
DB_ENV     = args.database_url_env
DEFAULT_K  = max(1, min(args.default_k, 1000))
REPRESENTATION_ID = (
    f"embeddinggemma_mrl{DIM}_l2_{BITS}bit_v1" if PROJECTION == 'mrl'
    else f"embeddinggemma_strided{DIM}_{BITS}bit_legacy"
)

# ── Global ANN index ─────────────────────────────────────────────────────────
index_lock  = threading.Lock()
ann_index   = None
ann_ids     = []  # Qdrant point IDs aligned with index rows
ann_identity = []  # optional canonical provenance aligned with index rows
ann_domain  = None  # np.uint8 slot aligned with index rows; DOMAIN_UNRESOLVED (255) = no exact
                    # crosswalk match. Filled at boot from atlas_domain_vocabulary_crosswalk_v1
                    # (NORMALIZED_EXACT rows only); canonical codebase_chunk_index is never written.
DOMAIN_UNRESOLVED = 255
domain_ordinals = {}  # taxonomy domain_id -> uint8 ordinal (sorted, stable per crosswalk build)

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
    """Project 768 -> DIM. mrl: l2_normalize(v[:DIM]); strided: legacy every-Nth (unnormalized)."""
    if PROJECTION == 'strided':
        step = FULL_DIM // DIM
        return [vec_768[i * step] for i in range(DIM)]
    prefix = np.asarray(vec_768[:DIM], dtype=np.float32)
    norm = float(np.linalg.norm(prefix))
    if norm == 0.0:
        return None  # zero-norm prefix is rejected, never indexed
    return (prefix / norm).tolist()

def parse_vector_text(text):
    """pgvector text form '[a,b,...]' -> list of floats."""
    return [float(x) for x in text.strip('[]').split(',')]

def load_from_postgres():
    """One bulk server-side cursor: canonical semantic_768 -> MRL prefix -> TurboQuant index."""
    global ann_index, ann_ids, ann_identity, ann_domain
    if not TURBOVEC_OK:
        return 0
    dsn = os.environ.get(DB_ENV)
    if not dsn:
        # Fallback for launchers without the env (e.g. VS Code startup task): read the
        # gitignored repo .env.local. The DSN is never printed or logged.
        env_file = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', '..', '.env.local')
        try:
            with open(env_file, encoding='utf8') as fh:
                for line in fh:
                    if line.startswith(DB_ENV + '='):
                        dsn = line.split('=', 1)[1].strip().strip('"').strip("'")
                        break
        except OSError:
            pass
    if not dsn:
        print(f"[sidecar] {DB_ENV} not set; cannot load from Postgres")
        return 0
    try:
        import psycopg2
    except ImportError:
        print("[sidecar] psycopg2 not installed; use --source qdrant")
        return 0

    t0 = time.time()
    new_index = turbovec.TurboQuantIndex(DIM, BITS)
    ids, identities = [], []
    row_domains = []
    rejected = 0
    # Prefix is sliced in SQL so only DIM floats cross the wire per row. packet_key comes
    # from the identity-link table only when exactly one canonical key exists for the chunk.
    sql = f"""
        SELECT c.id::text, c.source_ref, c.source_revision, c.content_hash,
               l.canonical_packet_key,
               x.taxonomy_domain_id,
               subvector(c.content_embedding_768, 1, {DIM})::text
          FROM codebase_chunk_index c
          LEFT JOIN atlas_domain_vocabulary_crosswalk_v1 x
            ON x.source_vocab = 'codebase_chunk_index.domain'
           AND x.source_value = COALESCE(c.domain, '')
           AND x.match_method = 'NORMALIZED_EXACT'
           AND x.crosswalk_version = 'atlas.domain-vocab-crosswalk.v1'
          LEFT JOIN (
                SELECT chunk_index_id, min(canonical_packet_key) AS canonical_packet_key
                  FROM atlas_chunk_packet_identity_links
                 WHERE canonical_packet_key IS NOT NULL
                 GROUP BY chunk_index_id
                HAVING count(DISTINCT canonical_packet_key) = 1
          ) l ON l.chunk_index_id = c.id
         WHERE c.content_embedding_768 IS NOT NULL
    """
    conn = psycopg2.connect(dsn)
    try:
        conn.set_session(readonly=True)
        with conn.cursor(name='turbovec_load') as cur:
            cur.itersize = 5000
            cur.execute(sql)
            batch_vecs, batch_ids, batch_idn = [], [], []

            def flush():
                if batch_vecs:
                    new_index.add(np.array(batch_vecs, dtype=np.float32))
                    ids.extend(batch_ids)
                    identities.extend(batch_idn)
                    batch_vecs.clear()
                    batch_ids.clear()
                    batch_idn.clear()

            for cid, source_ref, source_revision, content_hash, packet_key, domain_id, vec_text in cur:
                prefix = parse_vector_text(vec_text)
                if len(prefix) != DIM:
                    rejected += 1
                    continue
                if PROJECTION == 'mrl':
                    arr = np.asarray(prefix, dtype=np.float32)
                    norm = float(np.linalg.norm(arr))
                    if norm == 0.0:
                        rejected += 1
                        continue
                    vec = (arr / norm).tolist()
                else:
                    vec = prefix
                batch_vecs.append(vec)
                batch_ids.append(cid)
                row_domains.append(domain_id)
                batch_idn.append({k: v for k, v in {
                    "chunkId": cid, "packetKey": packet_key, "sourceRef": source_ref,
                    "sourceRevision": source_revision, "contentHash": content_hash,
                    "domainId": domain_id,
                }.items() if v})
                if len(batch_vecs) >= 5000:
                    flush()
            flush()
    finally:
        conn.close()

    print(f"[sidecar] Postgres load: {len(ids)} vectors, {rejected} rejected, {time.time()-t0:.1f}s")
    if not ids:
        return 0
    new_index.prepare()
    print(f"[sidecar] TurboVec index built ({len(ids)} vectors, {DIM}d, {BITS}-bit, {REPRESENTATION_ID})")
    ordinals = {d: i for i, d in enumerate(sorted({d for d in row_domains if d}))}
    slots = np.array([ordinals.get(d, DOMAIN_UNRESOLVED) if d else DOMAIN_UNRESOLVED for d in row_domains],
                     dtype=np.uint8)
    print(f"[sidecar] domain slot: {int((slots != DOMAIN_UNRESOLVED).sum())} resolved / {len(slots)} rows, "
          f"{len(ordinals)} domains")
    with index_lock:
        ann_index = new_index
        ann_ids = ids
        ann_identity = identities
        ann_domain = slots
        domain_ordinals.clear()
        domain_ordinals.update(ordinals)
    return len(ids)

def load_index():
    return load_from_postgres() if SOURCE == 'postgres' else load_from_qdrant()

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
                projected = project(vec[:FULL_DIM])
                if projected is None:
                    continue
                batch_ids.append(pt["id"])
                batch_vecs.append(projected)
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
                    "source": SOURCE,
                    "projection": PROJECTION,
                    "representationId": REPRESENTATION_ID,
                    "domainSlotPopulated": ann_domain is not None,
                    "domainResolved": int((ann_domain != DOMAIN_UNRESOLVED).sum()) if ann_domain is not None else 0,
                    "domainOrdinals": dict(domain_ordinals),
                    "role": "CHALLENGER_ONLY",
                    "defaultK": DEFAULT_K,
                })
        elif self.path == '/reindex':
            # Trigger async reindex
            threading.Thread(target=load_index, daemon=True).start()
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
                k   = min(int(req.get("k", DEFAULT_K)), 1000)

                with index_lock:
                    if ann_index is None or not TURBOVEC_OK:
                        self.send_json(200, {"ids": [], "scores": [], "fallback": True})
                        return

                    # Project to index dim if needed
                    if len(vec) > DIM:
                        vec = project(vec[:FULL_DIM])
                        if vec is None:
                            self.send_json(400, {"error": "zero-norm query prefix"})
                            return
                    
                    q = np.array([vec], dtype=np.float32)
                    wanted = req.get("domains")
                    allowed = None
                    if wanted and ann_domain is not None:
                        allowed = {domain_ordinals[d] for d in wanted if d in domain_ordinals}
                    fetch = min(len(ann_ids), k * 12) if allowed is not None else min(k, len(ann_ids))
                    scores, indices = ann_index.search(q, k=fetch)
                    if allowed is not None:
                        keep = [j for j, i in enumerate(indices[0])
                                if i < len(ann_ids) and int(ann_domain[i]) in allowed][:k]
                        indices = np.array([[indices[0][j] for j in keep]])
                        scores = np.array([[scores[0][j] for j in keep]])
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
            threading.Thread(target=load_index, daemon=True).start()
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
    print(f"          Source: {SOURCE} | Collection: {COLLECTION} | dim={DIM} | bits={BITS} | {REPRESENTATION_ID}")
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
    threading.Thread(target=load_index, daemon=True).start()

    print(f"[sidecar] Listening on http://127.0.0.1:{PORT}")
    print(f"          Health: GET /health | Search: POST /search | Reindex: GET /reindex")
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        print("\n[sidecar] Shutting down.")
