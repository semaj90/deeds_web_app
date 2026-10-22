"""ACE JSON packet compiler: transforms verified proposals into evidence-qualified ACE packets."""

from __future__ import annotations

import hashlib
import json
import re
import time
from typing import Any, Mapping

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
    created_at: str | None = None,
) -> dict[str, Any]:
    """Compile a bounded, review-only packet descriptor from an untrusted proposal.

    This helper does not admit packets or write to a store. Legacy palette
    values remain proposal-only and are not LUT ordinals.
    """
    manifest_checksum = context_manifest.get("checksum", "")
    if not isinstance(manifest_checksum, str) or not manifest_checksum.strip():
        raise ValueError("INVALID_CONTEXT_MANIFEST_CHECKSUM")
    manifest_refs = context_manifest.get("evidenceRefs")
    if not isinstance(manifest_refs, list) or any(not isinstance(ref, str) or not ref.strip() for ref in manifest_refs):
        raise ValueError("INVALID_CONTEXT_MANIFEST_EVIDENCE_REFS")
    allowed_evidence = set(manifest_refs)

    # 1. Evidence whitelist validation
    if proposal.get("schema") != "atlas.ace-packet-proposal.v1":
        raise ValueError("UNSUPPORTED_PROPOSAL_SCHEMA")
    proposed_refs = proposal.get("evidenceRefs", [])
    if not isinstance(proposed_refs, list) or not proposed_refs or any(not isinstance(ref, str) or not ref.strip() for ref in proposed_refs):
        raise ValueError("Cannot compile ACE packet: proposal has no evidenceRefs")
    if len(set(proposed_refs)) != len(proposed_refs):
        raise ValueError("DUPLICATE_EVIDENCE_REFS")
    unauthorized = [ref for ref in proposed_refs if ref not in allowed_evidence]
    if unauthorized:
        raise ValueError(f"UNAUTHORIZED_EVIDENCE: {unauthorized}")

    if proposal.get("contextManifestChecksum") != manifest_checksum:
        raise ValueError("CONTEXT_MANIFEST_CHECKSUM_MISMATCH")
    if proposal.get("writesPerformed") is True:
        raise ValueError("PROPOSAL_CLAIMS_WRITES_PERFORMED")

    task_id = proposal.get("taskId")
    if not isinstance(task_id, str) or not re.fullmatch(r"[A-Za-z0-9][A-Za-z0-9_-]{0,127}", task_id):
        raise ValueError("INVALID_TASK_ID")
    concept_id = proposal.get("conceptId")
    if not isinstance(concept_id, str) or not concept_id.strip():
        raise ValueError("INVALID_CONCEPT_ID")
    instruction = proposal.get("instruction")
    if not isinstance(instruction, str) or not instruction.strip():
        raise ValueError("INVALID_INSTRUCTION")
    if isinstance(ttl_seconds, bool) or not isinstance(ttl_seconds, int) or ttl_seconds <= 0:
        raise ValueError("INVALID_TTL_SECONDS")
    confidence_score = proposal.get("confidenceScore")
    if confidence_score is not None and (isinstance(confidence_score, bool) or not isinstance(confidence_score, (int, float)) or not 0 <= confidence_score <= 1):
        raise ValueError("INVALID_CONFIDENCE_SCORE")
    timestamp = created_at if created_at is not None else time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime())
    if not isinstance(timestamp, str) or not timestamp.strip():
        raise ValueError("INVALID_CREATED_AT")

    if not isinstance(domain, str) or not domain.strip():
        raise ValueError("INVALID_DOMAIN")
    resolved_domain = domain if domain in NES_LUT_PALETTES else "general"
    palette = NES_LUT_PALETTES[resolved_domain]
    source_ref = sorted(proposed_refs)[0]

    oak_tuple = (
        f"({json.dumps(source_ref)}, {json.dumps(concept_id)}, {json.dumps(palette['byte'])}, "
        f"{json.dumps(instruction)}, {confidence_score if confidence_score is not None else 'None'}, 64, "
        f'"implements")'
    )

    proposal_identity = {
        "taskId": task_id,
        "conceptId": concept_id,
        "evidenceRefs": sorted(proposed_refs),
        "instruction": instruction,
        "contextManifestChecksum": manifest_checksum,
        "domain": domain,
    }
    proposal_digest = hashlib.sha256(
        json.dumps(proposal_identity, sort_keys=True, separators=(",", ":")).encode("utf-8")
    ).hexdigest()[:16]
    packet_id = f"ace:packet:{task_id.lower().replace('_', '-')}-{proposal_digest}-v1"

    packet = {
        "$schema": "https://deeds-web-app.internal/schemas/ace-packet.v1.json",
        "packet_id": packet_id,
        "created_at": timestamp,
        "ttl_seconds": ttl_seconds,
        "concept_id": concept_id,
        "source_ref": source_ref,
        "confidence_score": confidence_score,
        "canonical_authority": False,
        "writes_performed": False,
        "nes_lut": {
            "domain": domain,
            "resolved_domain": resolved_domain,
            "lut_byte": None,
            "nes_hex": palette["byte"],
            "palette_byte": palette["byte"],
            "palette_name": palette["name"],
            "prior_weight": palette["weight"],
            "mapping_status": (
                "LEGACY_CONFLICT_UNRESOLVED" if resolved_domain == domain else "UNKNOWN_DOMAIN_FALLBACK_GENERAL"
            ),
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
            "admission_status": "PROPOSED_NOT_ADMITTED",
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
