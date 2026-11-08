#!/usr/bin/env python3
"""
scripts/atlas/openai_facade_materializer_v1.py
---------------------------------------------
Zero-Copy Arrow / Memory-Mapped Loader and OpenAI-Compatible Tool-Calling
Facade Materializer for Agentic Dense Search, ACP (Agent Communication Protocol),
and A2A (Agent-to-Agent) Kanban DAG Prefill.

Features:
1. Zero-copy memory-mapped file reader for 6,527 v2 64-byte records and
   64-D float32 latent vectors (.tmp/atlas/openspec-task-lowrank-keyframes.*).
2. PyArrow Table / RecordBatch zero-copy projection.
3. Canonical 128-bit Crockford ULID generation via pure C-ABI AtlasByteSynthBridge.
4. Materializes top-K retrieved tasks into standard OpenAI /v1/chat/completions
   tool call and response structures.
5. Materializes ACP A2A task envelopes with full provenance and geometric coordinates.
"""

from __future__ import annotations

import argparse
import hashlib
import json
import mmap
import os
import struct
import sys
import time
from pathlib import Path
from typing import Any, Dict, List, Optional, Tuple, Union

try:
    import pyarrow as pa
    PYARROW_AVAILABLE = True
except ImportError:
    pa = None
    PYARROW_AVAILABLE = False

# Import native C-ABI byte synth bridge
sys.path.insert(0, str(Path(__file__).resolve().parents[2]))
from scripts.atlas.c_abi_byte_synth_bridge import AtlasByteSynthBridge

RECORD_FORMAT_V2 = "<IIH2x3fd8f"
RECORD_SIZE_V2 = 64
LATENT_DIM = 64
LATENT_ROW_BYTES = LATENT_DIM * 4  # 256 bytes

REPO_ROOT = Path(__file__).resolve().parents[2]
DEFAULT_RECORDS_PATH = REPO_ROOT / ".tmp" / "atlas" / "openspec-task-lowrank-keyframes.bin"
DEFAULT_LATENTS_PATH = REPO_ROOT / ".tmp" / "atlas" / "openspec-task-lowrank-keyframes.latent64.f32le.bin"


class TaskMmapArrowReader:
    """Zero-copy memory-mapped reader for 64-byte records and 64-D latents."""

    def __init__(
        self,
        records_path: Optional[Path] = None,
        latents_path: Optional[Path] = None,
    ):
        self.records_path = Path(records_path or DEFAULT_RECORDS_PATH)
        self.latents_path = Path(latents_path or DEFAULT_LATENTS_PATH)

        if not self.records_path.is_file():
            raise FileNotFoundError(f"Records fixture not found: {self.records_path}")
        if not self.latents_path.is_file():
            raise FileNotFoundError(f"Latents fixture not found: {self.latents_path}")

        self._rec_file = open(self.records_path, "rb")
        self._lat_file = open(self.latents_path, "rb")

        self._rec_mmap = mmap.mmap(self._rec_file.fileno(), 0, access=mmap.ACCESS_READ)
        self._lat_mmap = mmap.mmap(self._lat_file.fileno(), 0, access=mmap.ACCESS_READ)

        self.record_count = len(self._rec_mmap) // RECORD_SIZE_V2
        expected_lat_len = self.record_count * LATENT_ROW_BYTES

        if len(self._rec_mmap) % RECORD_SIZE_V2 != 0:
            raise ValueError(f"Records file size {len(self._rec_mmap)} not divisible by 64")
        if len(self._lat_mmap) != expected_lat_len:
            raise ValueError(
                f"Latents file size mismatch: expected {expected_lat_len}, got {len(self._lat_mmap)}"
            )

        self.records_view = memoryview(self._rec_mmap)
        self.latents_view = memoryview(self._lat_mmap)

    def close(self) -> None:
        if hasattr(self, "records_view"):
            self.records_view.release()
        if hasattr(self, "latents_view"):
            self.latents_view.release()
        if hasattr(self, "_rec_mmap"):
            self._rec_mmap.close()
        if hasattr(self, "_lat_mmap"):
            self._lat_mmap.close()
        if hasattr(self, "_rec_file"):
            self._rec_file.close()
        if hasattr(self, "_lat_file"):
            self._lat_file.close()

    def __enter__(self) -> "TaskMmapArrowReader":
        return self

    def __exit__(self, exc_type, exc_val, exc_tb) -> None:
        self.close()

    def get_raw_record(self, ordinal: int) -> Tuple[int, int, int, Tuple[float, float, float], float, Tuple[float, ...]]:
        if ordinal < 0 or ordinal >= self.record_count:
            raise IndexError(f"Ordinal {ordinal} out of range 0..{self.record_count - 1}")
        offset = ordinal * RECORD_SIZE_V2
        unpacked = struct.unpack_from(RECORD_FORMAT_V2, self.records_view, offset)
        morton_code = unpacked[0]
        task_ordinal = unpacked[1]
        cluster_id = unpacked[2]
        position = (unpacked[3], unpacked[4], unpacked[5])
        final_score = unpacked[6]
        features = unpacked[7:15]
        return morton_code, task_ordinal, cluster_id, position, final_score, features

    def get_latent_vector(self, ordinal: int) -> List[float]:
        if ordinal < 0 or ordinal >= self.record_count:
            raise IndexError(f"Ordinal {ordinal} out of range 0..{self.record_count - 1}")
        offset = ordinal * LATENT_ROW_BYTES
        return list(struct.unpack_from(f"<{LATENT_DIM}f", self.latents_view, offset))

    def to_arrow_table(self, ordinals: Optional[List[int]] = None) -> Any:
        """Converts selected or all ordinals into a PyArrow Table."""
        if not PYARROW_AVAILABLE:
            raise RuntimeError("PyArrow is not installed or available in this Python environment.")

        target_ordinals = ordinals if ordinals is not None else list(range(self.record_count))

        morton_codes = []
        task_ordinals = []
        cluster_ids = []
        pos_xs = []
        pos_ys = []
        pos_zs = []
        final_scores = []
        latent_vectors = []

        for ord_idx in target_ordinals:
            m_code, t_ord, c_id, pos, score, _ = self.get_raw_record(ord_idx)
            morton_codes.append(m_code)
            task_ordinals.append(t_ord)
            cluster_ids.append(c_id)
            pos_xs.append(pos[0])
            pos_ys.append(pos[1])
            pos_zs.append(pos[2])
            final_scores.append(score)
            latent_vectors.append(self.get_latent_vector(ord_idx))

        return pa.Table.from_arrays(
            [
                pa.array(morton_codes, type=pa.uint32()),
                pa.array(task_ordinals, type=pa.uint32()),
                pa.array(cluster_ids, type=pa.uint16()),
                pa.array(pos_xs, type=pa.float32()),
                pa.array(pos_ys, type=pa.float32()),
                pa.array(pos_zs, type=pa.float32()),
                pa.array(final_scores, type=pa.float64()),
                pa.array(latent_vectors, type=pa.list_(pa.float32(), LATENT_DIM)),
            ],
            names=[
                "morton_code",
                "task_ordinal",
                "cluster_id",
                "position_x",
                "position_y",
                "position_z",
                "final_score",
                "latent_vector",
            ],
        )


class OpenAIFacadeMaterializer:
    """
    Materializes memory-mapped low-rank tasks into standard OpenAI /v1/chat/completions
    tool-call responses and ACP A2A packets with canonical Crockford 128-bit ULIDs.
    """

    TOOL_DECLARATION = {
        "type": "function",
        "function": {
            "name": "execute_kanban_dag_task",
            "description": "Execute or prefill a Parent Atlas Kanban DAG task node with spatial and latent geometry",
            "parameters": {
                "type": "object",
                "properties": {
                    "task_id": {
                        "type": "string",
                        "description": "Canonical 26-character Crockford ULID identifier (first char in 0..7)",
                    },
                    "sequence_id": {
                        "type": "integer",
                        "description": "Global execution sequence ordinal index",
                    },
                    "procedure_id": {
                        "type": "string",
                        "description": "Assigned execution procedure or workflow identifier",
                    },
                    "task_ordinal": {
                        "type": "integer",
                        "description": "Dense ordinal index 0..6526",
                    },
                    "morton_code": {
                        "type": "integer",
                        "description": "30-bit Morton space-filling curve code",
                    },
                    "cluster_id": {
                        "type": "integer",
                        "description": "Louvain community / topological cluster identifier",
                    },
                    "position": {
                        "type": "array",
                        "items": {"type": "number"},
                        "minItems": 3,
                        "maxItems": 3,
                        "description": "[x, y, z] 3D coordinates",
                    },
                    "final_score": {
                        "type": "number",
                        "description": "Calibrated density and relevance ranking score",
                    },
                    "latent_vector": {
                        "type": "array",
                        "items": {"type": "number"},
                        "minItems": 64,
                        "maxItems": 64,
                        "description": "64-dimensional latent embedding vector",
                    },
                },
                "required": [
                    "task_id",
                    "sequence_id",
                    "procedure_id",
                    "task_ordinal",
                    "morton_code",
                    "cluster_id",
                    "position",
                    "final_score",
                ],
            },
        },
    }

    def __init__(
        self,
        reader: TaskMmapArrowReader,
        bridge: Optional[AtlasByteSynthBridge] = None,
    ):
        self.reader = reader
        self.bridge = bridge or AtlasByteSynthBridge()

    def generate_task_ulid(self, task_ordinal: int, morton_code: int, cluster_id: int) -> str:
        """
        Generates canonical 26-char Crockford ULID (128-bit) using C-ABI synthesizer.
        Deterministic timestamp + cluster + ordinal entropy ensures reproducible,
        canonical IDs where the first character is guaranteed 0..7.
        """
        # Epoch timestamp base: 2026-11-08 00:00:00 UTC (1794105600000 ms)
        base_epoch_ms = 1794105600000 + (morton_code & 0xFFFFF)
        # 48-bit timestamp + 16-bit cluster + 32-bit ordinal + 32-bit morton = 128 bits
        ts_hi = (base_epoch_ms >> 32) & 0xFFFF
        ts_lo = base_epoch_ms & 0xFFFFFFFF
        raw_16b = struct.pack(
            ">HIHI I",
            ts_hi,
            ts_lo,
            cluster_id & 0xFFFF,
            task_ordinal & 0xFFFFFFFF,
            morton_code & 0xFFFFFFFF,
        )
        return self.bridge.encode_ulid128(raw_16b)

    def materialize_tool_calls(
        self,
        task_ordinals: List[int],
        procedure_prefix: str = "proc_atlas_dag",
        include_latents: bool = True,
    ) -> List[Dict[str, Any]]:
        """Materializes an array of OpenAI standard function tool calls."""
        tool_calls = []
        for seq_id, ordinal in enumerate(task_ordinals):
            morton_code, task_ord, cluster_id, pos, score, _ = self.reader.get_raw_record(ordinal)
            ulid = self.generate_task_ulid(task_ord, morton_code, cluster_id)

            args: Dict[str, Any] = {
                "task_id": ulid,
                "sequence_id": seq_id + 1,
                "procedure_id": f"{procedure_prefix}_{cluster_id:04d}",
                "task_ordinal": task_ord,
                "morton_code": morton_code,
                "cluster_id": cluster_id,
                "position": [round(float(p), 6) for p in pos],
                "final_score": round(float(score), 6),
            }
            if include_latents:
                latent = self.reader.get_latent_vector(ordinal)
                args["latent_vector"] = [round(float(v), 6) for v in latent]

            tool_calls.append(
                {
                    "id": f"call_{ulid}",
                    "type": "function",
                    "function": {
                        "name": "execute_kanban_dag_task",
                        "arguments": json.dumps(args, separators=(",", ":")),
                    },
                }
            )
        return tool_calls

    def materialize_chat_completion(
        self,
        task_ordinals: List[int],
        model: str = "ornith-1.5-9b",
        procedure_prefix: str = "proc_atlas_dag",
        include_latents: bool = True,
    ) -> Dict[str, Any]:
        """Materializes a complete OpenAI /v1/chat/completions response envelope."""
        tool_calls = self.materialize_tool_calls(
            task_ordinals,
            procedure_prefix=procedure_prefix,
            include_latents=include_latents,
        )
        completion_ulid = self.bridge.encode_ulid128(os.urandom(16))
        return {
            "id": f"chatcmpl-{completion_ulid}",
            "object": "chat.completion",
            "created": int(time.time()),
            "model": model,
            "choices": [
                {
                    "index": 0,
                    "message": {
                        "role": "assistant",
                        "content": None,
                        "tool_calls": tool_calls,
                    },
                    "finish_reason": "tool_calls",
                }
            ],
            "usage": {
                "prompt_tokens": 128 + len(task_ordinals) * 16,
                "completion_tokens": len(tool_calls) * 96,
                "total_tokens": 128 + len(task_ordinals) * 112,
            },
        }

    def materialize_acp_packet(
        self,
        task_ordinals: List[int],
        session_id: str = "session:acp-a2a:dag-prefill:v1",
    ) -> Dict[str, Any]:
        """
        Materializes an Agent Communication Protocol (ACP) / Agent-to-Agent (A2A) packet
        with explicit geometry envelope and schema governance.
        """
        tasks = []
        for ordinal in task_ordinals:
            morton_code, task_ord, cluster_id, pos, score, features = self.reader.get_raw_record(ordinal)
            ulid = self.generate_task_ulid(task_ord, morton_code, cluster_id)
            tasks.append(
                {
                    "taskId": ulid,
                    "taskOrdinal": task_ord,
                    "mortonCode": morton_code,
                    "clusterId": cluster_id,
                    "position": list(pos),
                    "finalScore": score,
                    "features": list(features),
                }
            )

        envelope = {
            "schema": "atlas.acp-a2a-task-packet.v1",
            "sessionId": session_id,
            "timestamp": int(time.time()),
            "taskCount": len(tasks),
            "canonicalAuthority": False,
            "cAbiSynthesizerActive": self.bridge.has_native,
            "tasks": tasks,
        }
        envelope_bytes = json.dumps(envelope, sort_keys=True).encode("utf-8")
        envelope["sha256Digest"] = hashlib.sha256(envelope_bytes).hexdigest()
        return envelope


def main() -> int:
    parser = argparse.ArgumentParser(description="OpenAI Facade Materializer & Arrow Mmap Loader")
    parser.add_argument("--top-k", type=int, default=5, help="Number of tasks to materialize (default: 5)")
    parser.add_argument("--ordinals", type=str, default="", help="Comma-separated task ordinals")
    parser.add_argument("--acp", action="store_true", help="Emit ACP A2A packet format")
    parser.add_argument("--no-latents", action="store_true", help="Omit 64-D latents from tool arguments")
    args = parser.parse_args()

    with TaskMmapArrowReader() as reader:
        materializer = OpenAIFacadeMaterializer(reader)

        if args.ordinals.strip():
            ordinals = [int(x.strip()) for x in args.ordinals.split(",") if x.strip()]
        else:
            ordinals = list(range(min(args.top_k, reader.record_count)))

        if args.acp:
            packet = materializer.materialize_acp_packet(ordinals)
            print(json.dumps(packet, indent=2))
        else:
            completion = materializer.materialize_chat_completion(
                ordinals,
                include_latents=not args.no_latents,
            )
            print(json.dumps(completion, indent=2))

    return 0


if __name__ == "__main__":
    sys.exit(main())
