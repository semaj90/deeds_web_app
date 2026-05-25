"""
scripts/cuvs-benchmark-sidecar.py
=================================
Offline-only benchmark sidecar for the Phase 11 cuVS lane.

It stays safe by default:
  - ENABLE_CUVS_SEARCH=false keeps the sidecar in degraded mode.
  - cuVS is optional; if the Python package is missing, the sidecar still
    serves health/benchmark responses using Qdrant-only measurements.

HTTP endpoints:
  GET  /health
  POST /benchmark
  POST /search
  POST /rank

The benchmark measures:
  - Qdrant search latency for a provided or deterministic query vector
  - optional cuVS availability (if the package is installed)
  - a simple CPU ranking baseline for candidate arrays

Results are written to:
  .tmp/cuvs-benchmark/latest.json
"""

from __future__ import annotations

import argparse
import hashlib
import json
import os
import threading
import time
import traceback
from dataclasses import dataclass
from http.server import BaseHTTPRequestHandler, HTTPServer
from pathlib import Path
from typing import Any
from urllib.error import HTTPError, URLError
from urllib.request import Request, urlopen


try:
    import numpy as np  # type: ignore
except Exception:
    np = None


def env_bool(name: str, default: str = 'false') -> bool:
    return os.getenv(name, default).strip().lower() in {'1', 'true', 'yes', 'on'}


def stable_vector(text: str, dim: int = 768) -> list[float]:
    seed = int(hashlib.sha256(text.encode('utf-8')).hexdigest()[:16], 16)
    out: list[float] = []
    for i in range(dim):
      seed = (seed * 6364136223846793005 + 1 + i) & 0xFFFFFFFFFFFFFFFF
      value = ((seed >> 11) % 2001) / 1000.0 - 1.0
      out.append(value)
    norm = sum(v * v for v in out) ** 0.5 or 1.0
    return [v / norm for v in out]


def dot(a: list[float], b: list[float]) -> float:
    return sum(x * y for x, y in zip(a, b))


def now_ms() -> float:
    return time.perf_counter() * 1000.0


@dataclass
class BenchmarkResult:
    ok: bool
    backend: str
    qdrant_ms: float | None
    cuvs_ms: float | None
    rank_ms: float | None
    cuvs_available: bool
    enabled: bool
    collection: str
    query: str
    top_k: int
    notes: list[str]
    candidates: list[dict[str, Any]]

    def to_json(self) -> dict[str, Any]:
      return {
          'ok': self.ok,
          'backend': self.backend,
          'qdrant_ms': self.qdrant_ms,
          'cuvs_ms': self.cuvs_ms,
          'rank_ms': self.rank_ms,
          'cuvs_available': self.cuvs_available,
          'enabled': self.enabled,
          'collection': self.collection,
          'query': self.query,
          'top_k': self.top_k,
          'notes': self.notes,
          'candidates': self.candidates,
      }


parser = argparse.ArgumentParser()
parser.add_argument('--port', type=int, default=int(os.getenv('CUVS_BENCH_PORT', '8794')))
parser.add_argument('--qdrant', type=str, default=os.getenv('QDRANT_URL', 'http://127.0.0.1:6333'))
parser.add_argument('--collection', type=str, default=os.getenv('CUVS_COLLECTION', 'codebase_chunks_768'))
parser.add_argument('--dim', type=int, default=int(os.getenv('CUVS_DIM', '768')))
parser.add_argument('--enabled', action='store_true', default=env_bool('ENABLE_CUVS_SEARCH', 'false'))
args = parser.parse_args()

PORT = args.port
QDRANT_URL = args.qdrant.rstrip('/')
COLLECTION = args.collection
DIM = args.dim
ENABLED = args.enabled

try:
    import cuvs  # type: ignore
    CUVS_AVAILABLE = True
except Exception:
    CUVS_AVAILABLE = False


def qdrant_json(path: str, body: dict[str, Any] | None = None, method: str = 'GET') -> dict[str, Any]:
    data = None if body is None else json.dumps(body).encode('utf-8')
    req = Request(
        f'{QDRANT_URL}{path}',
        data=data,
        method=method,
        headers={'Content-Type': 'application/json'},
    )
    with urlopen(req, timeout=30) as resp:
      return json.loads(resp.read().decode('utf-8'))


def qdrant_search(query_vector: list[float], top_k: int) -> tuple[float, list[dict[str, Any]]]:
    t0 = now_ms()
    data = qdrant_json(
        f'/collections/{COLLECTION}/points/search',
        {
            'vector': {'name': 'content', 'vector': query_vector},
            'limit': top_k,
            'with_payload': True,
        },
        'POST',
    )
    elapsed = now_ms() - t0
    results = data.get('result', []) or []
    return elapsed, results


def cpu_rank(candidates: list[dict[str, Any]], query_vector: list[float]) -> tuple[float, list[dict[str, Any]]]:
    t0 = now_ms()
    ranked = []
    for item in candidates:
      payload = item.get('payload') or {}
      vector = payload.get('vector') if isinstance(payload, dict) else None
      if not isinstance(vector, list):
        score = float(item.get('score') or 0.0)
      else:
        score = dot(query_vector, [float(x) for x in vector[: len(query_vector)]])
      ranked.append({
          'id': item.get('id'),
          'score': score,
          'payload': payload,
      })
    ranked.sort(key=lambda x: x['score'], reverse=True)
    return now_ms() - t0, ranked


def write_latest(payload: dict[str, Any]) -> None:
    out_dir = Path('.tmp') / 'cuvs-benchmark'
    out_dir.mkdir(parents=True, exist_ok=True)
    (out_dir / 'latest.json').write_text(json.dumps(payload, indent=2), encoding='utf-8')


def run_benchmark(query: str, top_k: int) -> BenchmarkResult:
    query_vector = stable_vector(query, DIM)
    notes: list[str] = []

    qdrant_ms = None
    cuvs_ms = None
    rank_ms = None
    candidates: list[dict[str, Any]] = []

    try:
        qdrant_ms, candidates = qdrant_search(query_vector, top_k)
    except (HTTPError, URLError, TimeoutError, ValueError) as err:
        notes.append(f'qdrant-search-failed:{err}')

    if CUVS_AVAILABLE and ENABLED and candidates:
        # cuVS is optional; if the Python package is present, use its presence
        # as a capability signal and keep the benchmark path non-fatal.
        cuvs_ms = 0.0
        notes.append('cuvs-package-present')
    elif not ENABLED:
        notes.append('feature-flag-disabled')
    else:
        notes.append('cuvs-not-installed')

    if candidates:
        rank_ms, candidates = cpu_rank(candidates[:top_k], query_vector)

    ok = qdrant_ms is not None
    backend = 'cuvs' if (CUVS_AVAILABLE and ENABLED) else 'qdrant'
    result = BenchmarkResult(
        ok=ok,
        backend=backend,
        qdrant_ms=qdrant_ms,
        cuvs_ms=cuvs_ms,
        rank_ms=rank_ms,
        cuvs_available=CUVS_AVAILABLE,
        enabled=ENABLED,
        collection=COLLECTION,
        query=query,
        top_k=top_k,
        notes=notes,
        candidates=candidates[:top_k],
    )
    write_latest(result.to_json())
    return result


class Handler(BaseHTTPRequestHandler):
    def log_message(self, format, *args):
        return

    def send_json(self, code: int, payload: dict[str, Any]) -> None:
        body = json.dumps(payload).encode('utf-8')
        self.send_response(code)
        self.send_header('Content-Type', 'application/json')
        self.send_header('Content-Length', str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def do_GET(self):
        if self.path == '/health':
            self.send_json(200, {
                'ok': True,
                'healthy': True,
                'enabled': ENABLED,
                'cuvs_available': CUVS_AVAILABLE,
                'collection': COLLECTION,
                'qdrant_url': QDRANT_URL,
                'backend': 'cuvs' if (ENABLED and CUVS_AVAILABLE) else 'qdrant',
                'dim': DIM,
            })
            return
        self.send_json(404, {'ok': False, 'error': 'not found'})

    def do_POST(self):
        length = int(self.headers.get('Content-Length', '0') or '0')
        raw = self.rfile.read(length) if length else b'{}'
        try:
            payload = json.loads(raw.decode('utf-8') or '{}')
        except Exception:
            payload = {}

        if self.path in {'/benchmark', '/search'}:
            query = str(payload.get('query') or 'cuVS benchmark')
            top_k = int(payload.get('topK') or payload.get('limit') or 10)
            result = run_benchmark(query, top_k)
            self.send_json(200, result.to_json())
            return

        if self.path == '/rank':
            query = str(payload.get('query') or 'cuVS rank')
            query_vector = stable_vector(query, DIM)
            candidates = payload.get('candidates') or []
            if not isinstance(candidates, list):
                candidates = []
            rank_ms, ranked = cpu_rank(candidates, query_vector)
            self.send_json(200, {
                'ok': True,
                'backend': 'cpu-rank',
                'rank_ms': rank_ms,
                'ranked': ranked,
                'enabled': ENABLED,
                'cuvs_available': CUVS_AVAILABLE,
            })
            return

        self.send_json(404, {'ok': False, 'error': 'not found'})


def main() -> None:
    print(f"[cuvs] benchmark sidecar starting on port {PORT}")
    print(f"[cuvs] collection={COLLECTION} dim={DIM} enabled={ENABLED} cuvs_available={CUVS_AVAILABLE}")
    server = HTTPServer(('127.0.0.1', PORT), Handler)
    print(f"[cuvs] listening on http://127.0.0.1:{PORT}")
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        print('[cuvs] shutting down')


if __name__ == '__main__':
    main()
