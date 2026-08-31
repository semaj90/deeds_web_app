"""Stable JSON + sha256 helpers, deliberately mirroring the exact
algorithm every TS file in packages/parent-atlas/src/core/ uses (key-sort
every object recursively, then JSON.stringify) — so a Python-computed
checksum is comparable in principle to a TS-computed one for the same
logical content, not just internally self-consistent.

Normalization rule (stated explicitly, not silently assumed): keys whose
value is None/null are DROPPED before hashing on both sides of any
parity check. This matters because Zod's `.optional()` (not `.nullable()`)
fields are entirely ABSENT from `JSON.stringify` output when unset, while
Python's `to_dict()` always emits every field (as `None` when unset) for
simplicity. Dropping None-valued keys before hashing makes `{x: undefined
in TS}` and `{x: None in Python}` compare as equal, which is the correct
semantic equivalence — but it is a normalization, not a byte-identical
JSON match, and this file says so rather than leaving it implicit.
"""

from __future__ import annotations

import hashlib
import json
from typing import Any


def _drop_none(value: Any) -> Any:
    if isinstance(value, dict):
        return {k: _drop_none(v) for k, v in value.items() if v is not None}
    if isinstance(value, list):
        return [_drop_none(v) for v in value]
    return value


def _sort_keys(value: Any) -> Any:
    if isinstance(value, dict):
        return {k: _sort_keys(value[k]) for k in sorted(value.keys())}
    if isinstance(value, list):
        return [_sort_keys(v) for v in value]
    return value


def stable_json(value: Any) -> str:
    normalized = _sort_keys(_drop_none(value))
    return json.dumps(normalized, separators=(",", ":"), ensure_ascii=False)


def sha256_hex(value: Any) -> str:
    return hashlib.sha256(stable_json(value).encode("utf-8")).hexdigest()
