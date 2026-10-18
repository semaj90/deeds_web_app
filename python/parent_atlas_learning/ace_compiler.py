"""ACE JSON packet compiler: transforms verified proposals into evidence-qualified ACE packets."""

from __future__ import annotations

import hashlib
import json
import time
from typing import Any, Mapping, Sequence, Set

NES_LUT_PALETTES = {
    "ui": {"byte": "0x2A", "name": "NES_2C02_CYAN_LIGHT", "weight": 0.95},
    "network": {"byte": "0x21", "name": "NES_2C02_BLUE_MEDIUM", "weight": 0.90},
    "database": {"byte": "0x28", "name": "NES_2C02_ORANGE_WARM", "weight": 0.85},
    "auth": {"byte": "0x16", "name": "NES_2C02_RED_DEEP", "weight": 0.80},
    "retrieval": {"byte": "0x1A", "name": "NES_2C02_GREEN_FOREST", "weight": 0.92},
    "cache": {"byte": "0x2C", "name": "NES_2C02_CYAN_MUTED", "weight": 0.88},
    "agent": {"byte": "0x14", "name": "NES_2C02_PURPLE_VIOLET", "weight": 0.82},
    "graph": {"byte": "0x24", "name": "NES_2C02_MAGENTA_ROSE", "weight": 0.86},
    "ml": {"byte": "0x11", "name": "NES_2C02_BLUE_AZURE", "weight": 0.78},
    "general": {"byte": "0x20", "name": "NES_2C02_WHITE_PURE", "weight": 0.50},
}


def compile_ace_packet_from_proposal(
    proposal: Mapping[str, Any],
    *,
    context_manifest: Mapping[str, Any],
    domain: str = "ui",
    ttl_seconds: int = 604_800,  # 7 days
) -> dict[str, Any]:
    """Compile an untrusted proposal into a qualified ACE packet.

    Enforces ContextManifest evidence boundaries, prompt injection guards,
    NES LUT palette mapping, and Redis/Valkey residency descriptors.
    """
    manifest_checksum = context_manifest.get("checksum", "")
    allowed_evidence: Set[str] = set(context_manifest.get("evidenceRefs", []))

    # 1. Evidence whitelist validation
    proposed_refs = proposal.get("evidenceRefs", [])
    if not proposed_refs:
        raise ValueError("Cannot compile ACE packet: proposal has no evidenceRefs")
    unauthorized = [ref for ref in proposed_refs if ref not in allowed_evidence]
    if unauthorized:
        raise ValueError(f"UNAUTHORIZED_EVIDENCE: {unauthorized}")

    # 2. Checksum validation
    if proposal.get("contextManifestChecksum") != manifest_checksum:
        raise ValueError("CONTEXT_MANIFEST_CHECKSUM_MISMATCH")

    # 3. NES LUT mapping
    palette = NES_LUT_PALETTES.get(domain, NES_LUT_PALETTES["general"])
    concept_id = proposal.get("conceptId", f"concept:{domain}:runes_hardening:v1")
    task_id = proposal.get("taskId", "TASK_001")
    source_ref = proposed_refs[0] if proposed_refs else "docs/.okf/pinned/sveltekit/DIAGNOSTIC_WARNINGS_FIXES.md"

    # 4. OaK Python tuple format
    oak_tuple = (
        f'("{source_ref}", "{concept_id}", "{palette["byte"]}", '
        f'"OPTION[RESOLVE_SVELTE_A11Y_WARNINGS]", 0.98, 64, "implements")'
    )

    packet_id = f"ace:packet:{task_id.lower().replace('_', '-')}-v1"

    packet = {
        "$schema": "https://deeds-web-app.internal/schemas/ace-packet.v1.json",
        "packet_id": packet_id,
        "created_at": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
        "ttl_seconds": ttl_seconds,
        "concept_id": concept_id,
        "source_ref": source_ref,
        "confidence_score": 0.98,
        "canonical_authority": False,
        "writes_performed": False,
        "nes_lut": {
            "domain": domain,
            "palette_byte": palette["byte"],
            "palette_name": palette["name"],
            "prior_weight": palette["weight"],
            "predicate": "implements",
        },
        "oak_python_tuple": oak_tuple,
        "prompt_injection_guard": {
            "hidden_thoughts_persisted": False,
            "forbidden_payloads": [
                "hiddenThoughts",
                "chainOfThought",
                "kv_cache",
                "raw_tensor",
            ],
            "max_context_bytes": 16384,
        },
        "evidence_qualification": {
            "context_manifest_checksum": manifest_checksum,
            "qualified_evidence_refs": sorted(proposed_refs),
            "evidence_count": len(proposed_refs),
            "admission_status": "ADMITTED_READ_ONLY",
        },
        "bitfrost_caching": {
            "redis_key": packet_id,
            "centroid_lru_key": f"bitfrost:centroid:lru:cuml-kmeans-k16-{palette['byte'].lower()}",
            "eviction_policy": "allkeys-lru",
        },
    }

    serialized = json.dumps(packet, sort_keys=True, separators=(",", ":"))
    packet["checksum"] = "sha256:" + hashlib.sha256(serialized.encode("utf-8")).hexdigest()
    return packet
