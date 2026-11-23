"""DuckDB + BYTEA/MsgPack-compatible binary RPC packet alignment and bounded PUCT scorer.

Provides:
1. `encode_rpc_packet_v1` / `decode_rpc_packet_v1`: deterministic `ARPC` binary
   envelope (uses `msgpack` when installed, otherwise canonical UTF-8 JSON bytes)
   compatible with PostgreSQL `BYTEA` and DuckDB `BLOB`, with a fail-closed guard
   rejecting forbidden runtime-state keys (`hiddenThoughts`, `chainOfThought`,
   `kv_cache`, `device_ptr`, `hidden_state`).
2. `query_duckdb_arrow_bytea_alignment_v1`: in-memory DuckDB join over
   `feature_matrix_5.arrow` + packed `BLOB`/`BYTEA` packets, emitting a compact
   SSR-to-CSR Web Worker residency descriptor (`canonicalAuthority: False`,
   `writesPerformed: False`, `hiddenStatePersisted: False`).
3. `score_agentic_repair_puct_v1`: bounded AlphaGo-style PUCT candidate ordering
   over verified claims only (fails closed on `verifiedClaim != True`; never
   authorizes mutation).
"""
from __future__ import annotations

import hashlib
import json
import math
import sqlite3
import struct
from pathlib import Path
from typing import Any

import pyarrow.ipc as ipc

try:
    import duckdb as _duckdb  # type: ignore
    _HAS_DUCKDB = callable(getattr(_duckdb, "connect", None))
except ImportError:
    _duckdb = None
    _HAS_DUCKDB = False

try:
    import msgpack as _msgpack  # type: ignore
except ImportError:
    _msgpack = None

RPC_MAGIC = b"ARPC"
RPC_VERSION = 1
FORBIDDEN_RUNTIME_KEYS = frozenset(
    {"hiddenthoughts", "chainofthought", "kv_cache", "kvcache", "hidden_state", "hiddenstate", "device_ptr"}
)


def _assert_no_forbidden_keys(obj: Any) -> None:
    if isinstance(obj, dict):
        for k, v in obj.items():
            if str(k).strip().lower() in FORBIDDEN_RUNTIME_KEYS:
                raise ValueError(f"FORBIDDEN_RUNTIME_STATE_KEY:{k}")
            _assert_no_forbidden_keys(v)
    elif isinstance(obj, list):
        for item in obj:
            _assert_no_forbidden_keys(item)


def encode_rpc_packet_v1(payload: dict[str, Any]) -> bytes:
    """Encode a bounded payload into an `ARPC` BYTEA/BLOB packet with SHA-256 checksum."""
    _assert_no_forbidden_keys(payload)
    if _msgpack is not None:
        codec_id = 1
        body = _msgpack.packb(payload, use_bin_type=True)
    else:
        codec_id = 0
        body = json.dumps(payload, sort_keys=True, separators=(",", ":"), ensure_ascii=True).encode("utf-8")
    digest = hashlib.sha256(body).digest()
    header = struct.pack("<4sBBI", RPC_MAGIC, RPC_VERSION, codec_id, len(body))
    return header + body + digest


def decode_rpc_packet_v1(blob: bytes) -> dict[str, Any]:
    """Decode and SHA-256-verify an `ARPC` BYTEA/BLOB packet."""
    if len(blob) < 10 + 32:
        raise ValueError("RPC_PACKET_TRUNCATED")
    magic, version, codec_id, body_len = struct.unpack("<4sBBI", blob[:10])
    if magic != RPC_MAGIC or version != RPC_VERSION:
        raise ValueError("RPC_PACKET_HEADER_INVALID")
    if len(blob) != 10 + body_len + 32:
        raise ValueError("RPC_PACKET_LENGTH_MISMATCH")
    body = blob[10 : 10 + body_len]
    expected_digest = blob[10 + body_len :]
    if hashlib.sha256(body).digest() != expected_digest:
        raise ValueError("RPC_PACKET_CHECKSUM_MISMATCH")
    if codec_id == 1:
        if _msgpack is None:
            raise RuntimeError("RPC_MSGPACK_CODEC_UNAVAILABLE")
        decoded = _msgpack.unpackb(body, raw=False)
    elif codec_id == 0:
        decoded = json.loads(body.decode("utf-8"))
    else:
        raise ValueError(f"RPC_CODEC_UNKNOWN:{codec_id}")
    _assert_no_forbidden_keys(decoded)
    return decoded


def query_duckdb_arrow_bytea_alignment_v1(
    arrow_path: str | Path = "docs/reports/feature_matrix_5.arrow",
    *,
    limit: int = 16,
) -> dict[str, Any]:
    """Align Arrow FeatureMatrix rows with encoded BYTEA/BLOB RPC packets in DuckDB."""
    table = ipc.open_file(str(arrow_path)).read_all()
    chunk_ids = table["chunk_id"].to_pylist()[:limit]
    source_refs = table["source_ref"].to_pylist()[:limit]
    revisions = table["source_revision"].to_pylist()[:limit]
    hashes = table["chunk_sha256"].to_pylist()[:limit]

    packet_rows = []
    total_bytes = 0
    for idx, (cid, sref, rev, chash) in enumerate(zip(chunk_ids, source_refs, revisions, hashes)):
        pkt_bytes = encode_rpc_packet_v1(
            {
                "candidateOrdinal": idx,
                "chunkId": cid,
                "sourceRef": sref,
                "sourceRevision": rev,
                "chunkSha256": chash,
                "fsmState": "CPU_STAGED",
            }
        )
        total_bytes += len(pkt_bytes)
        packet_rows.append((idx, cid, chash, pkt_bytes))

    if _HAS_DUCKDB and _duckdb is not None:
        sql_engine = "duckdb"
        con = _duckdb.connect(":memory:")
        try:
            con.register("arrow_fm", table)
            con.execute("CREATE TABLE rpc_packets (ordinal INTEGER, chunk_id VARCHAR, chunk_sha256 VARCHAR, payload BLOB)")
            con.executemany("INSERT INTO rpc_packets VALUES (?, ?, ?, ?)", packet_rows)
            joined = con.execute(
                """
                SELECT p.ordinal, p.chunk_id, a.source_ref, octet_length(p.payload) AS byte_len
                FROM rpc_packets p
                JOIN arrow_fm a
                  ON a.chunk_id = p.chunk_id AND a.chunk_sha256 = p.chunk_sha256
                ORDER BY p.ordinal
                """
            ).fetchall()
        finally:
            con.close()
    else:
        sql_engine = "sqlite3_in_memory"
        con = sqlite3.connect(":memory:")
        try:
            con.execute("CREATE TABLE arrow_fm (chunk_id TEXT, source_ref TEXT, chunk_sha256 TEXT)")
            con.executemany(
                "INSERT INTO arrow_fm VALUES (?, ?, ?)",
                list(zip(chunk_ids, source_refs, hashes)),
            )
            con.execute("CREATE TABLE rpc_packets (ordinal INTEGER, chunk_id TEXT, chunk_sha256 TEXT, payload BLOB)")
            con.executemany("INSERT INTO rpc_packets VALUES (?, ?, ?, ?)", packet_rows)
            joined = con.execute(
                """
                SELECT p.ordinal, p.chunk_id, a.source_ref, length(p.payload) AS byte_len
                FROM rpc_packets p
                JOIN arrow_fm a
                  ON a.chunk_id = p.chunk_id AND a.chunk_sha256 = p.chunk_sha256
                ORDER BY p.ordinal
                """
            ).fetchall()
        finally:
            con.close()

    manifest_hash = "sha256:" + hashlib.sha256(
        json.dumps([(r[0], r[1], r[3]) for r in joined], separators=(",", ":")).encode("utf-8")
    ).hexdigest()

    return {
        "schema": "atlas.duckdb-bytea-rpc-alignment.v1",
        "canonicalAuthority": False,
        "writesPerformed": False,
        "hiddenStatePersisted": False,
        "sqlEngine": sql_engine,
        "codec": "msgpack" if _msgpack is not None else "json_utf8",
        "alignedRowCount": len(joined),
        "totalPayloadBytes": total_bytes,
        "ssrToCsrResidencyDescriptor": {
            "manifestChecksum": manifest_hash,
            "tileCount": len(joined),
            "byteBudget": total_bytes,
            "fsmState": "CPU_STAGED",
            "transferComplete": False,
        },
    }


def score_agentic_repair_puct_v1(
    candidates: list[dict[str, Any]],
    *,
    c_puct: float = 1.4,
) -> list[dict[str, Any]]:
    """Rank verified KernelDagCandidate repair options via PUCT without authorizing mutation."""
    if not candidates:
        return []
    total_visits = sum(max(0, int(c.get("visits", 0))) for c in candidates) + 1
    scored: list[dict[str, Any]] = []
    for c in candidates:
        if c.get("verifiedClaim") is not True:
            raise ValueError(f"UNVERIFIED_CLAIM_REJECTED:{c.get('candidateId')}")
        q_val = float(c.get("meanReward", 0.0))
        prior = max(0.0, min(1.0, float(c.get("prior", 0.5))))
        visits = max(0, int(c.get("visits", 0)))
        puct = q_val + c_puct * prior * math.sqrt(total_visits) / (1.0 + visits)
        scored.append(
            {
                "candidateId": str(c["candidateId"]),
                "puctScore": round(puct, 6),
                "authorizationRequired": True,
                "mutationAuthorized": False,
            }
        )
    scored.sort(key=lambda item: (-item["puctScore"], item["candidateId"]))
    return scored
