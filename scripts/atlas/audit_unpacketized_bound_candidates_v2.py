#!/usr/bin/env python3
"""
Phase 2 — Dry-Run PacketKeyV2 (packet:<uuidv5>) Audit for the 70 Unpacketized Bound Files.

Implements the exact canonical PacketKeyV2 derivation from
sveltekit-frontend/src/lib/server/atlas/identity/packet-key-v2.ts:
  PACKET_AGGREGATE_NAMESPACE_V1 = 'b8186da8-3b20-509f-84ea-2440f93ff22f'
  canonicalName = "packet:v2\0" + repositoryScope + "\0" + canonicalSourceRef + "\0" + packetKind
  packet_key    = "packet:" + UUIDv5(PACKET_AGGREGATE_NAMESPACE_V1, canonicalName)

Inspects the 149 SHA-256 bound candidates in docs/reports/domain-calibration-draft-v3.jsonl,
identifies the 70 bound workspace files whose legacy packetKey is null, and produces a
read-only dry-run PacketKeyV2 manifest qualified by each file's verified sourceRevision.
"""

from __future__ import annotations

import hashlib
import json
import re
import uuid
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

WORKSPACE_ROOT = Path(__file__).resolve().parents[2]
BOUND_CANDIDATES_PATH = WORKSPACE_ROOT / "docs" / "reports" / "domain-calibration-draft-v3.jsonl"
DEFAULT_REPORT_PATH = (
    WORKSPACE_ROOT / "docs" / "reports" / "unpacketized-bound-candidates-packetkeyv2-dryrun-v1.json"
)

PACKET_AGGREGATE_NAMESPACE_V1 = uuid.UUID("b8186da8-3b20-509f-84ea-2440f93ff22f")
PACKET_KEY_V2_RE = re.compile(
    r"^packet:[0-9a-f]{8}-[0-9a-f]{4}-5[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$"
)
SHA256_RE = re.compile(r"^sha256:[0-9a-f]{64}$")
NUL = "\u0000"


def assert_canonical_source_ref_v2(source_ref: str) -> str:
    if not isinstance(source_ref, str) or not source_ref.strip():
        raise ValueError("PACKET_KEY_V2_INPUT_INVALID:SOURCE_REF_EMPTY")
    if NUL in source_ref:
        raise ValueError("PACKET_KEY_V2_INPUT_INVALID:SOURCE_REF_NUL")
    if (
        source_ref != source_ref.strip()
        or "\\" in source_ref
        or source_ref.startswith("./")
        or any(seg in ("", ".", "..") for seg in source_ref.split("/"))
    ):
        raise ValueError(f"PACKET_KEY_V2_INPUT_INVALID:SOURCE_REF_NOT_ALREADY_CANONICAL:{source_ref}")
    return source_ref


def compute_packet_key_v2(
    source_ref: str,
    repository_scope: str = "repo:root",
    packet_kind: str = "SOURCE_FILE",
) -> str:
    if not repository_scope.startswith("repo:") or NUL in repository_scope:
        raise ValueError("PACKET_KEY_V2_INPUT_INVALID:REPOSITORY_SCOPE_INVALID")
    if packet_kind != "SOURCE_FILE":
        raise ValueError("PACKET_KEY_V2_INPUT_INVALID:PACKET_KIND_UNSUPPORTED")
    canonical_ref = assert_canonical_source_ref_v2(source_ref)
    canonical_name = NUL.join(["packet:v2", repository_scope, canonical_ref, packet_kind])
    derived_uuid = uuid.uuid5(PACKET_AGGREGATE_NAMESPACE_V1, canonical_name)
    packet_key = f"packet:{derived_uuid}"
    if not PACKET_KEY_V2_RE.match(packet_key):
        raise ValueError(f"PACKET_KEY_V2_INVALID_OUTPUT:{packet_key}")
    return packet_key


def run_unpacketized_dryrun_audit(
    candidates_path: Path = BOUND_CANDIDATES_PATH,
    output_path: Path = DEFAULT_REPORT_PATH,
) -> dict[str, Any]:
    rows = [
        json.loads(line)
        for line in candidates_path.read_text(encoding="utf-8").splitlines()
        if line.strip()
    ]

    bound_rows = [r for r in rows if r.get("revisionResolution") == "BINDING_EXACT"]
    already_packetized = [r for r in bound_rows if r.get("packetKey")]
    unpacketized_bound = [r for r in bound_rows if not r.get("packetKey")]

    dryrun_entries: list[dict[str, Any]] = []
    unique_v2_keys: set[str] = set()

    for r in unpacketized_bound:
        canonical_ref = str(r.get("resolvedFilePath") or r.get("sourceRef")).replace("\\", "/")
        source_rev = str(r.get("sourceRevision") or "")
        if not SHA256_RE.match(source_rev):
            raise ValueError(f"SOURCE_REVISION_INVALID:{source_rev}")

        packet_key_v2 = compute_packet_key_v2(
            source_ref=canonical_ref,
            repository_scope="repo:root",
            packet_kind="SOURCE_FILE",
        )
        unique_v2_keys.add(packet_key_v2)

        dryrun_entries.append(
            {
                "canonicalSourceRef": canonical_ref,
                "originalSourceRef": r.get("sourceRef"),
                "sourceRevision": source_rev,
                "repositoryScope": "repo:root",
                "packetKind": "SOURCE_FILE",
                "proposedPacketKeyV2": packet_key_v2,
                "legacyPacketKey": None,
                "selectionSignalDomain": r.get("selectionSignalDomain"),
                "evidenceSpanVerified": bool(r.get("evidenceSpanCheck", {}).get("found")),
                "dryRunOnly": True,
                "writesPerformed": False,
            }
        )

    payload_without_checksum = {
        "schema": "atlas.unpacketized-bound-candidates-packetkeyv2-dryrun.v1",
        "generatedAt": datetime.now(timezone.utc).isoformat(),
        "namespaceUuid": str(PACKET_AGGREGATE_NAMESPACE_V1),
        "dryRunOnly": True,
        "writesPerformed": False,
        "summary": {
            "totalIngested": len(rows),
            "totalSourceRevisionBound": len(bound_rows),
            "alreadyJoinedInAtlasPackets": len(already_packetized),
            "unpacketizedBoundFiles": len(unpacketized_bound),
            "uniqueProposedPacketKeyV2Count": len(unique_v2_keys),
        },
        "unpacketizedCandidates": dryrun_entries,
    }

    canonical_bytes = json.dumps(payload_without_checksum, sort_keys=True, separators=(",", ":")).encode("utf-8")
    receipt_checksum = f"sha256:{hashlib.sha256(canonical_bytes).hexdigest()}"
    report = {**payload_without_checksum, "receiptChecksum": receipt_checksum}

    output_path.parent.mkdir(parents=True, exist_ok=True)
    output_path.write_text(json.dumps(report, indent=2) + "\n", encoding="utf-8")
    return report


if __name__ == "__main__":
    res = run_unpacketized_dryrun_audit()
    print(
        json.dumps(
            {
                "schema": res["schema"],
                "namespaceUuid": res["namespaceUuid"],
                "summary": res["summary"],
                "sampleProposedPacketKeyV2": res["unpacketizedCandidates"][0] if res["unpacketizedCandidates"] else None,
                "receiptChecksum": res["receiptChecksum"],
            },
            indent=2,
        )
    )
