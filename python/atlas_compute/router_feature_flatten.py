"""Deterministic CPU flattening for the revisioned router feature-row contract."""

from __future__ import annotations

import json
import math
from pathlib import Path
from typing import Any, Mapping


_CONTRACT_PATH = Path(__file__).with_name("retrieval_router_feature_order_v1.json")


def _contract() -> dict[str, Any]:
    with _CONTRACT_PATH.open("r", encoding="utf-8") as source:
        value = json.load(source)
    if value.get("schema") != "atlas.retrieval-router-feature-order.v1":
        raise ValueError("ROUTER_FEATURE_ORDER_SCHEMA_MISMATCH")
    if value.get("nullableEncoding") != "value_then_presence":
        raise ValueError("ROUTER_FEATURE_NULL_ENCODING_UNSUPPORTED")
    return value


def _get_path(row: Mapping[str, Any], path: str) -> Any:
    value: Any = row
    for part in path.split("."):
        if not isinstance(value, Mapping) or part not in value:
            raise ValueError(f"ROUTER_FEATURE_PATH_MISSING:{path}")
        value = value[part]
    return value


def _finite_number(value: Any, path: str) -> float:
    if isinstance(value, bool) or not isinstance(value, (int, float)):
        raise ValueError(f"ROUTER_FEATURE_NUMBER_INVALID:{path}")
    converted = float(value)
    if not math.isfinite(converted):
        raise ValueError(f"ROUTER_FEATURE_NUMBER_NONFINITE:{path}")
    return converted


def flatten_router_feature_row_v1(row: Mapping[str, Any]) -> tuple[float, ...]:
    """Return a fixed-order numeric vector; missing nullable values retain presence bits."""
    if row.get("schema") != "atlas.retrieval-router-feature-row.v1":
        raise ValueError("ROUTER_FEATURE_ROW_SCHEMA_MISMATCH")

    output: list[float] = []
    for field in _contract()["fields"]:
        path = field["path"]
        kind = field["kind"]
        value = _get_path(row, path)
        nullable = field.get("nullable", False)

        if kind == "boolean":
            if not isinstance(value, bool):
                raise ValueError(f"ROUTER_FEATURE_BOOLEAN_INVALID:{path}")
            output.append(1.0 if value else 0.0)
        elif kind == "bit_array":
            length = field["length"]
            if not isinstance(value, (list, tuple)) or len(value) != length:
                raise ValueError(f"ROUTER_FEATURE_ARRAY_LENGTH_INVALID:{path}")
            for bit in value:
                if type(bit) is not int or bit not in (0, 1):
                    raise ValueError(f"ROUTER_FEATURE_BIT_INVALID:{path}")
                output.append(float(bit))
        elif kind == "number":
            if value is None and nullable:
                output.extend((0.0, 0.0))
            else:
                output.append(_finite_number(value, path))
                if nullable:
                    output.append(1.0)
        elif kind == "number_array":
            length = field["length"]
            if value is None and nullable:
                output.extend([0.0] * length)
                output.append(0.0)
                continue
            if not isinstance(value, (list, tuple)) or len(value) != length:
                raise ValueError(f"ROUTER_FEATURE_ARRAY_LENGTH_INVALID:{path}")
            output.extend(_finite_number(item, path) for item in value)
            if nullable:
                output.append(1.0)
        else:
            raise ValueError(f"ROUTER_FEATURE_KIND_UNSUPPORTED:{kind}")

    return tuple(output)


def router_feature_order_revision_v1() -> str:
    """Expose the layout revision so downstream receipts can bind their input shape."""
    return str(_contract()["revision"])
