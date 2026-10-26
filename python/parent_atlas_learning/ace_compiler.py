"""ACE JSON packet compiler: transforms verified proposals into evidence-qualified ACE packets."""

from __future__ import annotations

import hashlib
import json
import re
import time
from typing import Any, Mapping
from atlas_compute.nes_lut_palette import load_nes_lut_palette

_PALETTE = load_nes_lut_palette()
NES_LUT_PALETTES = _PALETTE["domains"]


def compile_ace_packet_from_proposal(
    proposal: Mapping[str, Any],
    *,
    context_manifest: Mapping[str, Any],
    domain: str = "ui",
    ttl_seconds: int = 604_800,  # 7 days
    created_at: str | None = None,
) -> dict[str, Any]:
    """Compile a bounded, review-only packet descriptor from an untrusted proposal.

    Palette bytes and colors come from the shared versioned artifact. This
    helper does not admit packets or write to a store.
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
        f"({json.dumps(source_ref)}, {json.dumps(concept_id)}, {json.dumps(palette['nesHex'])}, "
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
            "lut_byte": palette["lutByte"],
            "nes_hex": palette["nesHex"],
            "palette_byte": palette["nesHex"],
            "palette_name": palette["label"],
            "prior_weight": palette["priorWeight"],
            "mapping_status": (
                "EXACT_SHARED_PALETTE" if resolved_domain == domain else "UNKNOWN_DOMAIN_FALLBACK_GENERAL"
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
            "centroid_lru_key": f"bitfrost:centroid:lru:cuml-kmeans-k16-nes-domain-palette-v1-{palette['nesHex'].lower()}",
            "eviction_policy": "allkeys-lru",
        },
    }

    serialized = json.dumps(packet, sort_keys=True, separators=(",", ":"))
    packet["checksum"] = "sha256:" + hashlib.sha256(serialized.encode("utf-8")).hexdigest()
    return packet
