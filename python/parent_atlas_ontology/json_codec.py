"""Bounded JSON/NDJSON codec for Parent Atlas ontology sidecar payloads.

Small control-plane JSON uses the Python stdlib/Pydantic path.  If the optional
``simdjson`` Python module is installed, bulk JSON/NDJSON decoding may use it;
absence never blocks correctness.  This keeps SIMD parsing an accelerator, not
an authority or mandatory hop.
"""

from __future__ import annotations

import json
from typing import Any, Iterable


MAX_JSON_BYTES_DEFAULT = 4 * 1024 * 1024
MAX_NDJSON_LINE_BYTES_DEFAULT = 2 * 1024 * 1024
MAX_NDJSON_ROWS_DEFAULT = 10_000


def _optional_simdjson_parser():
    try:
        import simdjson  # type: ignore
    except ImportError:
        return None
    return simdjson.Parser()


def json_backend_name() -> str:
    return "simdjson" if _optional_simdjson_parser() is not None else "stdlib-json"


def decode_json_bytes(
    payload: bytes,
    *,
    max_bytes: int = MAX_JSON_BYTES_DEFAULT,
    prefer_simdjson: bool = True,
) -> Any:
    if len(payload) > max_bytes:
        raise ValueError("JSON_PAYLOAD_TOO_LARGE")
    parser = _optional_simdjson_parser() if prefer_simdjson else None
    if parser is not None:
        try:
            parsed = parser.parse(payload)
            # recursive=True detaches values from the parser buffer.
            return parsed.as_dict() if hasattr(parsed, "as_dict") else parsed
        except Exception as exc:  # noqa: BLE001 - normalize parser-specific errors
            raise ValueError("JSON_INVALID") from exc
    try:
        return json.loads(payload)
    except (json.JSONDecodeError, UnicodeDecodeError) as exc:
        raise ValueError("JSON_INVALID") from exc


def decode_ndjson_bytes(
    payload: bytes,
    *,
    max_rows: int = MAX_NDJSON_ROWS_DEFAULT,
    max_line_bytes: int = MAX_NDJSON_LINE_BYTES_DEFAULT,
    prefer_simdjson: bool = True,
) -> tuple[Any, ...]:
    rows: list[Any] = []
    for line_number, raw_line in enumerate(payload.splitlines(), start=1):
        line = raw_line.strip()
        if not line:
            continue
        if len(line) > max_line_bytes:
            raise ValueError(f"NDJSON_LINE_TOO_LARGE:{line_number}")
        if len(rows) >= max_rows:
            raise ValueError("NDJSON_ROW_LIMIT_EXCEEDED")
        try:
            rows.append(decode_json_bytes(line, max_bytes=max_line_bytes, prefer_simdjson=prefer_simdjson))
        except ValueError as exc:
            raise ValueError(f"NDJSON_INVALID_LINE:{line_number}:{exc}") from exc
    return tuple(rows)


def encode_ndjson_rows(rows: Iterable[dict[str, Any]]) -> bytes:
    return ("\n".join(json.dumps(row, sort_keys=True, separators=(",", ":"), ensure_ascii=False) for row in rows) + "\n").encode("utf-8")
