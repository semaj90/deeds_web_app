"""Read the generated, versioned NES domain palette shared with Atlas tooling."""

from __future__ import annotations

import json
import hashlib
from pathlib import Path
from typing import Any

_ROOT = Path(__file__).resolve().parents[2]
_PALETTE_PATH = _ROOT / "scripts" / "atlas" / "data" / "nes-domain-palette-v1.json"


def load_nes_lut_palette(path: Path = _PALETTE_PATH) -> dict[str, Any]:
    payload = json.loads(path.read_text(encoding="utf-8"))
    if payload.get("schema") != "atlas.nes-domain-palette.v1":
        raise ValueError("NES_LUT_PALETTE_SCHEMA_INVALID")
    checksum = payload.get("checksum")
    unsigned_payload = {key: value for key, value in payload.items() if key != "checksum"}
    expected_checksum = "sha256:" + hashlib.sha256(
        json.dumps(unsigned_payload, separators=(",", ":"), ensure_ascii=False).encode("utf-8")
    ).hexdigest()
    if checksum != expected_checksum:
        raise ValueError("NES_LUT_PALETTE_CHECKSUM_MISMATCH")
    domains = payload.get("domains")
    unresolved = payload.get("unresolved")
    if not isinstance(domains, dict) or not isinstance(unresolved, dict) or unresolved.get("lutByte") != 0:
        raise ValueError("NES_LUT_PALETTE_CONTRACT_INVALID")
    lut_bytes = [entry.get("lutByte") for entry in domains.values()]
    if any(not isinstance(value, int) or value <= 0 or value > 0xFF for value in lut_bytes):
        raise ValueError("NES_LUT_DOMAIN_BYTE_INVALID")
    if len(lut_bytes) != len(set(lut_bytes)):
        raise ValueError("NES_LUT_DOMAIN_BYTE_COLLISION")
    return payload

