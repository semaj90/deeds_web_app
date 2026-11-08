#!/usr/bin/env python3
"""
scripts/atlas/ast_uuid_batch_repair_bridge.py

AST-Span + Derived UUIDv7 Batch Document & Code Updater:
1. Queries the :8095 Miniforge sidecar (Tree-sitter CST + AST-grep + ts-morph) for exact UTF-8 spans.
2. Generates deterministic RFC 9562 UUIDv7 replacements (derive_deterministic_uuidv7).
3. Applies replacements in strict reverse byte order (end -> start) to keep earlier offsets and CRLF/LF line endings intact.
"""

from __future__ import annotations
import hashlib
import json
import urllib.request
from dataclasses import dataclass, asdict
from pathlib import Path
from typing import List, Dict, Any, Optional

REPO_ROOT = Path(__file__).resolve().parents[2]
MINIFORGE_AST_URL = "http://127.0.0.1:8095/ast/locate-spans"


@dataclass(frozen=True)
class ByteSpanSwapOp:
    file_rel_path: str
    start_byte: int
    end_byte: int
    line_number: int
    original_token: str
    derived_uuidv7: str
    seed_key: str
    ast_node_kind: str  # e.g. "StringLiteral" | "TemplateSubstitution" | "MarkdownToken"


def derive_deterministic_uuidv7(seed_key: str, fixed_epoch_ms: int = 1762540800000) -> str:
    """
    Deterministic RFC 9562 UUIDv7 (48-bit timestamp + version 7 + variant 0b10 + 74-bit SHA-256 entropy).
    Guarantees idempotent UUID generation across repeated batch document updates.
    """
    digest = hashlib.sha256(seed_key.encode("utf-8")).digest()
    ts_48 = fixed_epoch_ms & ((1 << 48) - 1)

    rand_a = int.from_bytes(digest[0:2], "big") & 0x0FFF
    ver_rand_a = (0x7 << 12) | rand_a

    rand_b_hi = (int.from_bytes(digest[2:4], "big") & 0x3FFF) | 0x8000
    rand_b_lo = int.from_bytes(digest[4:10], "big")

    hex_32 = f"{ts_48:012x}{ver_rand_a:04x}{rand_b_hi:04x}{rand_b_lo:012x}"
    return f"{hex_32[0:8]}-{hex_32[8:12]}-{hex_32[12:16]}-{hex_32[16:20]}-{hex_32[20:32]}"


def query_miniforge_ast_spans(file_rel_path: str, source_text: str) -> Optional[List[Dict[str, Any]]]:
    """
    Queries the :8095 Miniforge sidecar (Tree-sitter CST + AST-grep + ts-morph)
    for exact UTF-8 byte spans of placeholder string literals. Returns None if :8095 is offline.
    """
    payload = json.dumps({"file": file_rel_path, "content": source_text}).encode("utf-8")
    req = urllib.request.Request(
        MINIFORGE_AST_URL,
        data=payload,
        headers={"Content-Type": "application/json"},
        method="POST",
    )
    try:
        with urllib.request.urlopen(req, timeout=2.0) as resp:
            if resp.status == 200:
                return json.loads(resp.read().decode("utf-8")).get("spans", [])
    except Exception:
        return None
    return None


def apply_reverse_byte_span_swaps(raw_bytes: bytes, ops: List[ByteSpanSwapOp]) -> bytes:
    """
    Applies UTF-8 byte-span replacements strictly in reverse byte order (end -> start)
    so earlier offsets and CRLF/LF line endings are never invalidated.
    """
    sorted_ops = sorted(ops, key=lambda op: op.start_byte, reverse=True)
    buf = bytearray(raw_bytes)

    for op in sorted_ops:
        actual_slice = bytes(buf[op.start_byte : op.end_byte]).decode("utf-8", errors="replace")
        if actual_slice != op.original_token:
            raise ValueError(
                f"Span mismatch in {op.file_rel_path} at [{op.start_byte}:{op.end_byte}]: "
                f"expected '{op.original_token}', found '{actual_slice}'"
            )
        replacement_bytes = op.derived_uuidv7.encode("utf-8")
        buf[op.start_byte : op.end_byte] = replacement_bytes

    return bytes(buf)


def main():
    print("[AST UUID Bridge] Testing deterministic UUIDv7 and reverse byte-span splicing...")
    test_seed = "openspec/changes/parent-atlas-spz-detective-renderer/tasks.md:120:{{SCENE_ID}}"
    uuid_val = derive_deterministic_uuidv7(test_seed)
    print(f"Derived UUIDv7: {uuid_val}")
    assert uuid_val.split("-")[2].startswith("7"), "Must be UUID version 7"
    assert uuid_val.split("-")[3][0] in "89ab", "Must be RFC 9562 variant (10xx)"

    # Test reverse byte span application
    sample_text = "const sceneId = '{{SCENE_ID}}';\nconst taskId = '{{TASK_ID}}';\n".encode("utf-8")
    ops = [
        ByteSpanSwapOp(
            file_rel_path="test.ts",
            start_byte=17,
            end_byte=29,
            line_number=1,
            original_token="{{SCENE_ID}}",
            derived_uuidv7=uuid_val,
            seed_key=test_seed,
            ast_node_kind="StringLiteral",
        ),
        ByteSpanSwapOp(
            file_rel_path="test.ts",
            start_byte=48,
            end_byte=59,
            line_number=2,
            original_token="{{TASK_ID}}",
            derived_uuidv7=derive_deterministic_uuidv7("test:task:1"),
            seed_key="test:task:1",
            ast_node_kind="StringLiteral",
        ),
    ]

    result_bytes = apply_reverse_byte_span_swaps(sample_text, ops)
    result_str = result_bytes.decode("utf-8")
    print(f"Spliced Result:\n{result_str}")
    assert "{{SCENE_ID}}" not in result_str
    assert "{{TASK_ID}}" not in result_str
    print("[AST UUID Bridge] ALL TESTS PASSED.")


if __name__ == "__main__":
    main()
