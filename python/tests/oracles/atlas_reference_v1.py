"""Offline reference oracles, NOT production authorization, ACE or PFB1 wire formats.
No database, network, native GPU, or service lifecycle operations.
"""
from __future__ import annotations

ORACLE_ID = "parent-atlas-reference-oracle"
ORACLE_VERSION = "1.0.0"
ORACLE_SCOPE = "test-only"

from dataclasses import dataclass
from contextlib import contextmanager
from threading import Lock
import hashlib
import json
import math
import re
from collections import deque
from typing import Callable, Iterable, Mapping, Sequence
import numpy as np

BUCKETS = (512, 1024, 2048, 4096, 8192)

@dataclass(frozen=True, order=True)
class SourceKey:
    workspace: str
    revision: str
    packet: str
    source_ref: str
    content_sha256: str

@dataclass(frozen=True)
class Scope:
    """Created ONLY from trusted server-side grant/lineage readback, never request JSON."""
    task: str
    workspace: str
    revision: str
    eligible: frozenset[SourceKey]

    def allows(self, key: SourceKey) -> bool:
        return bool(self.task and self.workspace and self.revision and key.workspace == self.workspace
                    and key.revision == self.revision and key in self.eligible)

@dataclass(frozen=True)
class Representation:
    revision: str
    model_hash: str
    recipe_revision: str  # identifies the paired query/document recipes
    dimensions: int
    dtype: str = 'float32'
    metric: str = 'cosine'
    normalization: str = 'l2'

    def validate(self, other: Representation) -> None:
        if self != other or not all((self.revision, self.model_hash, self.recipe_revision)):
            raise ValueError('INCOMPATIBLE_REPRESENTATION')
        if self.dimensions < 1 or self.dtype != 'float32' or self.metric != 'cosine' or self.normalization != 'l2':
            raise ValueError('UNSUPPORTED_REFERENCE_REPRESENTATION')


def query_hints(text: str) -> dict:
    """Preserve original bytes; hints are not taxonomy or identity decisions."""
    raw = text.encode('utf-8', errors='strict')
    if len(raw) > 65536:
        raise ValueError('QUERY_TOO_LARGE')
    words = re.findall(r'[^\W\d]\w*', text, flags=re.UNICODE)
    symbols = re.findall(r'\b[A-Za-z_]\w*(?:(?:::|\.)[A-Za-z_]\w*)+\b', text)
    return {'bytes': len(raw), 'characters': len(text), 'sha256': hashlib.sha256(raw).hexdigest(),
            'keywords': list(dict.fromkeys(w.casefold() for w in words))[:64],
            'symbol_hints': list(dict.fromkeys(symbols))[:32]}


def prefill_plan(formatted: str, count_tokens: Callable[[str], int], service_cap: int) -> dict:
    """count_tokens must use the actual untruncated processor and special tokens."""
    n = count_tokens(formatted)
    if type(n) is not int or n < 1 or service_cap not in BUCKETS:
        raise ValueError('INVALID_TOKEN_BUDGET')
    bucket = next((b for b in BUCKETS if n <= b <= service_cap), None)
    return {'token_count': n, 'bucket': bucket, 'route': 'SINGLE_PASS' if bucket else 'CHUNK_REQUIRED',
            'truncation_allowed': False}


def normalize_rows(x: np.ndarray) -> np.ndarray:
    a = np.asarray(x, dtype=np.float32)
    if a.ndim != 2 or not np.isfinite(a).all():
        raise ValueError('INVALID_MATRIX')
    # float64 norms in oracle avoid float32 overflow/underflow.
    norms = np.linalg.norm(a.astype(np.float64), axis=1)
    if np.any(norms == 0):
        raise ValueError('ZERO_VECTOR')
    return (a / norms[:, None]).astype(np.float32)


def masked_topk(query: np.ndarray, matrix: np.ndarray, mask: Sequence[bool], k: int,
                block_rows: int = 1024) -> list[tuple[int, float]]:
    """Exact cosine oracle with bounded temporary blocks, deterministic tie order."""
    q = np.asarray(query, dtype=np.float32)
    a = np.asarray(matrix)
    m = np.asarray(mask)
    if q.ndim != 1 or a.ndim != 2 or a.shape[1] != q.size or m.shape != (len(a),) or m.dtype != np.bool_:
        raise ValueError('SHAPE_OR_MASK_MISMATCH')
    if k < 0 or block_rows < 1:
        raise ValueError('INVALID_LIMIT')
    qn = normalize_rows(q[None, :])[0]
    best: list[tuple[int, float]] = []
    if k == 0:
        return best
    for start in range(0, len(a), block_rows):
        idx = np.flatnonzero(m[start:start + block_rows]) + start
        if idx.size == 0:
            continue
        scores = np.clip(normalize_rows(a[idx]) @ qn, -1, 1)
        # Full sort within bounded block as a deterministic oracle, not fastest kernel.
        order = np.lexsort((idx, -scores))[:k]
        best = sorted(best + [(int(idx[i]), float(scores[i])) for i in order],
                      key=lambda hit: (-hit[1], hit[0]))[:k]
    return best


def rrf(lanes: Mapping[str, Sequence[SourceKey]], scope: Scope, k: int = 20,
        rank_constant: int = 60) -> list[tuple[SourceKey, float]]:
    """Reference fusion; remove ineligible/duplicate identities before rank contribution."""
    if k < 0 or rank_constant < 1:
        raise ValueError('INVALID_RRF_LIMIT')
    scores: dict[SourceKey, float] = {}
    for lane in sorted(lanes):
        seen = set()
        rank = 0
        for key in lanes[lane]:
            if key in seen or not scope.allows(key):
                continue
            seen.add(key)
            rank += 1
            scores[key] = scores.get(key, 0.0) + 1.0 / (rank_constant + rank)
    return sorted(scores.items(), key=lambda pair: (-pair[1], pair[0]))[:k]


def pack_codes(codes: Sequence[int], bits: int) -> bytes:
    """Raw LSB-first payload oracle, NOT PFB1/ARPC. Tail bits always zero."""
    if bits not in (1, 2, 4):
        raise ValueError('UNSUPPORTED_BITS')
    per_byte = 8 // bits
    out = bytearray((len(codes) + per_byte - 1) // per_byte)
    for i, code in enumerate(codes):
        if not isinstance(code, (int, np.integer)) or not 0 <= code < (1 << bits):
            raise ValueError('INVALID_CODE')
        out[i // per_byte] |= int(code) << ((i % per_byte) * bits)
    return bytes(out)


def unpack_codes(data: bytes, count: int, bits: int) -> list[int]:
    if bits not in (1, 2, 4) or count < 0:
        raise ValueError('INVALID_ENCODING')
    per_byte = 8 // bits
    if len(data) != (count + per_byte - 1) // per_byte:
        raise ValueError('INVALID_LENGTH')
    if count % per_byte and data[-1] >> ((count % per_byte) * bits):
        raise ValueError('NONZERO_TAIL_BITS')
    return [(data[i // per_byte] >> ((i % per_byte) * bits)) & ((1 << bits) - 1) for i in range(count)]


def quantize_int8(x: np.ndarray) -> tuple[np.ndarray, np.ndarray]:
    """Per-row symmetric scale; raw numeric oracle, not a pgvector wire format."""
    a = np.asarray(x, dtype=np.float32)
    if a.ndim != 2 or a.shape[1] == 0 or not np.isfinite(a).all():
        raise ValueError('INVALID_MATRIX')
    scales = np.max(np.abs(a.astype(np.float64)), axis=1) / 127.0
    scales = np.where(scales == 0, 1, scales)
    return np.rint(a / scales[:, None]).clip(-127, 127).astype(np.int8), scales


def bounded_bfs(seeds: Iterable[SourceKey], neighbors: Mapping[SourceKey, Sequence[SourceKey]],
                scope: Scope, max_depth: int = 2, max_nodes: int = 64,
                fanout: int = 8) -> list[tuple[SourceKey, int]]:
    """Golden graph oracle: only traverse preverified edges in eligible subgraph."""
    if max_depth < 0 or max_nodes < 1 or fanout < 1:
        raise ValueError('INVALID_GRAPH_LIMIT')
    seen: set[SourceKey] = set()
    queue: deque[tuple[SourceKey, int]] = deque()
    for key in sorted(set(seeds)):
        if scope.allows(key) and len(seen) < max_nodes:
            seen.add(key); queue.append((key, 0))
    out = []
    while queue:
        key, depth = queue.popleft()
        out.append((key, depth))
        if depth == max_depth:
            continue
        added = 0
        for nxt in sorted(set(neighbors.get(key, ()))):
            if added >= fanout or len(seen) >= max_nodes:
                break
            if nxt in seen or not scope.allows(nxt):
                continue
            seen.add(nxt); queue.append((nxt, depth + 1)); added += 1
    return out


class ResourceBudget:
    """Single-process admission oracle; not a shared GPU scheduler or durable queue."""
    def __init__(self, capacity_bytes: int, max_active: int):
        if capacity_bytes < 1 or max_active < 1:
            raise ValueError('INVALID_RESOURCE_BUDGET')
        self.capacity_bytes, self.max_active = capacity_bytes, max_active
        self.used, self.active, self.lock = 0, 0, Lock()

    @contextmanager
    def reserve(self, amount: int):
        with self.lock:
            if amount <= 0 or self.used + amount > self.capacity_bytes or self.active >= self.max_active:
                raise RuntimeError('RESOURCE_ADMISSION_REJECTED')
            self.used += amount; self.active += 1
        try:
            yield
        finally:
            with self.lock:
                self.used -= amount; self.active -= 1


def fit_pca(train: np.ndarray, rank: int) -> tuple[np.ndarray, np.ndarray, np.ndarray]:
    """Fit on training split only. Return mean, orthonormal basis, singular values."""
    a = np.asarray(train, dtype=np.float64)
    if a.ndim != 2 or not np.isfinite(a).all() or not 1 <= rank <= min(a.shape[0]-1, a.shape[1]):
        raise ValueError('INVALID_PCA_INPUT')
    mean = a.mean(axis=0)
    _, s, vt = np.linalg.svd(a - mean, full_matrices=False)
    return mean, vt[:rank].T, s


class PairwiseMLP:
    """Small offline NumPy ranker, explicit backprop. No online weight updates."""
    def __init__(self, features: int, hidden: int = 16, seed: int = 0):
        if features < 1 or hidden < 1:
            raise ValueError('INVALID_NETWORK_SHAPE')
        rng = np.random.default_rng(seed)
        self.w1 = rng.normal(0, 1 / math.sqrt(features), (features, hidden))
        self.b1 = np.zeros(hidden)
        self.w2 = rng.normal(0, 1 / math.sqrt(hidden), hidden)

    def _forward(self, x):
        a = np.asarray(x, dtype=np.float64)
        if a.ndim != 2 or a.shape[1] != self.w1.shape[0] or not np.isfinite(a).all():
            raise ValueError('INVALID_FEATURES')
        h = np.tanh(a @ self.w1 + self.b1)
        return a, h, h @ self.w2

    def score(self, x):
        return self._forward(x)[2]

    def loss_grad(self, positive, negative):
        p, hp, sp = self._forward(positive)
        n, hn, sn = self._forward(negative)
        if p.shape != n.shape or len(p) == 0:
            raise ValueError('INVALID_REVIEWED_PAIRS')
        delta = sp - sn
        loss = float(np.logaddexp(0, -delta).mean())
        g = -np.exp(-np.logaddexp(0, delta)) / len(p)
        dp = g[:, None] * self.w2 * (1 - hp**2)
        dn = -g[:, None] * self.w2 * (1 - hn**2)
        return loss, (p.T @ dp + n.T @ dn, dp.sum(axis=0) + dn.sum(axis=0), (hp - hn).T @ g)

    def step(self, positive, negative, lr=0.03):
        if not math.isfinite(lr) or not 0 < lr <= 1:
            raise ValueError('INVALID_LEARNING_RATE')
        loss, grads = self.loss_grad(positive, negative)
        # New gradients every step; never accumulate stale gradients.
        self.w1 -= lr * grads[0]; self.b1 -= lr * grads[1]; self.w2 -= lr * grads[2]
        return loss


def assemble_preview(ranked: Sequence[tuple[SourceKey, str]], scope: Scope,
                     count_tokens: Callable[[str], int], budget: int) -> dict:
    """Local preview only, not ACE packet schema. Verify bytes before serialization."""
    if budget < 1:
        raise ValueError('INVALID_CONTEXT_BUDGET')
    result = {'schema': 'atlas.reference.context-preview.v1', 'task_id': scope.task,
              'workspace': scope.workspace, 'revision': scope.revision, 'items': []}
    def serialize():
        return json.dumps(result, ensure_ascii=False, separators=(',', ':'), sort_keys=True)
    if count_tokens(serialize()) > budget:
        raise ValueError('PACKET_ENVELOPE_OVER_BUDGET')
    seen = set()
    for key, body in ranked:
        if not scope.allows(key) or key in seen or hashlib.sha256(body.encode('utf-8')).hexdigest() != key.content_sha256:
            continue
        seen.add(key)
        result['items'].append({'packet': key.packet, 'source_ref': key.source_ref, 'sha256': key.content_sha256, 'text': body})
        if count_tokens(serialize()) > budget:
            result['items'].pop()
    return result


def csr_from_edges(n: int, edges: Iterable[tuple[int, int]]) -> tuple[np.ndarray, np.ndarray]:
    """Small directed graph oracle: sorted, deduplicated rows; no self edges."""
    if n < 0 or n > np.iinfo(np.uint32).max:
        raise ValueError('INVALID_NODE_COUNT')
    rows = [set() for _ in range(n)]
    for i, j in edges:
        if not 0 <= i < n or not 0 <= j < n:
            raise ValueError('INVALID_EDGE_ENDPOINT')
        if i != j: rows[i].add(j)
    offsets = np.zeros(n+1, dtype=np.uint64)
    columns = []
    for i, row in enumerate(rows):
        columns.extend(sorted(row)); offsets[i+1] = len(columns)
    return offsets, np.asarray(columns, dtype=np.uint32)


def merge_topk(shards: Sequence[Sequence[tuple[int,float]]], k: int) -> list[tuple[int,float]]:
    """Deterministic reduction oracle. Scores must share one metric/representation.
    Input shards should be disjoint candidate ordinals, already eligible and sorted.
    """
    if k < 0: raise ValueError('INVALID_LIMIT')
    seen = set(); result = []
    for shard in shards:
        for idx, score in shard:
            if idx < 0 or idx in seen or not math.isfinite(score):
                raise ValueError('INVALID_SHARD_HIT')
            seen.add(idx)
            result.append((idx,score))
        result.sort(key=lambda x:(-x[1],x[0]))
        del result[k:]
    return result


def givens_rotate(x: np.ndarray, i: int, j: int, angle_rad: float) -> np.ndarray:
    """I/J coordinate-plane rotation oracle; shared rotation preserves cosine.
    Not an IsoQuant implementation and not a KV-cache codec.
    """
    a = np.array(x,dtype=np.float64,copy=True)
    if a.ndim != 2 or not (0 <= i < a.shape[1] and 0 <= j < a.shape[1]) or i == j or not math.isfinite(angle_rad) or not np.isfinite(a).all():
        raise ValueError('INVALID_ROTATION')
    c,s=math.cos(angle_rad),math.sin(angle_rad)
    u,v=a[:,i].copy(),a[:,j].copy()
    a[:,i]=c*u-s*v; a[:,j]=s*u+c*v
    return a
