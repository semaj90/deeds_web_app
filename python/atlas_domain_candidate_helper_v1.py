"""Candidate signal normalization and revision resolution helper for Parent Atlas.

This module provides deterministic binding of candidate selection signals
to exact source file revisions (SHA-256), text evidence spans, and database
packet keys. It operates with read-only source access and enforces strict
canonical provenance rules.
"""

from __future__ import annotations

import hashlib
from pathlib import Path, PurePosixPath
from typing import Any, Optional


SCHEMA_V1 = "atlas.domain-calibration-example.v1"
SCHEMA_DRAFT = "atlas.domain-calibration-example.draft.v1"


def compute_source_revision(file_path: Path) -> Optional[str]:
    """Compute the sha256: digest of a source file's bytes."""
    try:
        if not file_path.is_file():
            return None
        content = file_path.read_bytes()
        return "sha256:" + hashlib.sha256(content).hexdigest()
    except OSError:
        return None


def _resolve_workspace_source(workspace_root: Path, source_ref: str) -> Path | None:
    normalized = source_ref.replace("\\", "/")
    relative = PurePosixPath(normalized)
    if (
        not normalized
        or relative.is_absolute()
        or ":" in normalized
        or "\x00" in normalized
        or any(part in {"", ".", ".."} for part in relative.parts)
    ):
        return None

    try:
        root = workspace_root.resolve(strict=True)
        candidates = [root.joinpath(*relative.parts)]
        candidates.append(root / "sveltekit-frontend" / Path(*relative.parts))
        for candidate in candidates:
            resolved = candidate.resolve(strict=True)
            if resolved.is_relative_to(root) and resolved.is_file():
                return resolved
    except (OSError, RuntimeError):
        return None
    return None


def verify_text_evidence(source_text: str, text_evidence: str) -> dict[str, Any]:
    """Verify whether text_evidence is an exact substring within source_text."""
    cleaned_evidence = text_evidence.strip()
    if not cleaned_evidence:
        return {"found": False, "start_char": None, "end_char": None, "exact_match": False}

    idx = source_text.find(cleaned_evidence)
    if idx != -1:
        return {
            "found": True,
            "start_char": idx,
            "end_char": idx + len(cleaned_evidence),
            "exact_match": True,
        }

    # If partial/truncated snippet, try first non-empty line
    lines = [ln.strip() for ln in cleaned_evidence.splitlines() if ln.strip()]
    if lines:
        first_line = lines[0]
        if len(first_line) >= 15:
            idx_line = source_text.find(first_line)
            if idx_line != -1:
                return {
                    "found": True,
                    "start_char": idx_line,
                    "end_char": idx_line + len(first_line),
                    "exact_match": False,
                    "partial_match_length": len(first_line),
                }

    # Progressive prefix fallback
    for prefix_len in (60, 40, 20):
        if len(cleaned_evidence) >= prefix_len:
            prefix = cleaned_evidence[:prefix_len]
            idx_prefix = source_text.find(prefix)
            if idx_prefix != -1:
                return {
                    "found": True,
                    "start_char": idx_prefix,
                    "end_char": idx_prefix + prefix_len,
                    "exact_match": False,
                    "partial_match_length": prefix_len,
                }

    return {"found": False, "start_char": None, "end_char": None, "exact_match": False}


def bind_candidate_record(
    candidate: dict[str, Any],
    workspace_root: Path,
) -> dict[str, Any]:
    """Attach local diagnostic hashes without asserting canonical identity."""
    source_ref = candidate.get("sourceRef") or candidate.get("source_ref") or ""
    bound = {
        key: value
        for key, value in candidate.items()
        if key not in {
            "packetKey",
            "packet_key",
            "sourceRevision",
            "source_revision",
            "workspaceRevision",
            "workspace_revision",
            "canonicalId",
            "canonical_id",
        }
    }
    if candidate.get("packetKey") is not None:
        bound["unverifiedPacketKey"] = candidate["packetKey"]
    if candidate.get("sourceRevision") is not None or candidate.get("source_revision") is not None:
        bound["unverifiedSourceRevision"] = candidate.get("sourceRevision", candidate.get("source_revision"))
    if candidate.get("workspaceRevision") is not None or candidate.get("workspace_revision") is not None:
        bound["unverifiedWorkspaceRevision"] = candidate.get("workspaceRevision", candidate.get("workspace_revision"))
    if candidate.get("canonicalId") is not None or candidate.get("canonical_id") is not None:
        bound["unverifiedCanonicalId"] = candidate.get("canonicalId", candidate.get("canonical_id"))
    bound["packetKey"] = None
    bound["sourceRevision"] = None
    bound["workspaceRevision"] = None
    bound["canonicalId"] = None
    bound["canonicalAuthority"] = False
    bound["writesPerformed"] = False

    if not source_ref:
        bound["revisionResolution"] = "UNRESOLVED"
        return bound
    if not isinstance(source_ref, str):
        bound["revisionResolution"] = "SOURCE_REF_INVALID_OR_NOT_FOUND"
        return bound

    full_path = _resolve_workspace_source(workspace_root, str(source_ref))
    if full_path is None:
        bound["revisionResolution"] = "SOURCE_REF_INVALID_OR_NOT_FOUND"
        return bound

    content_hash = compute_source_revision(full_path)
    if content_hash is None:
        bound["revisionResolution"] = "SOURCE_READ_FAILED"
        return bound

    bound["sourceContentHash"] = content_hash
    bound["revisionResolution"] = "CONTENT_HASH_OBSERVED_NOT_ADMITTED"
    bound["resolvedFilePath"] = full_path.relative_to(workspace_root.resolve()).as_posix()
    try:
        source_text = full_path.read_text(encoding="utf-8", errors="strict")
        bound["evidenceSpanCheck"] = verify_text_evidence(source_text, candidate.get("textEvidence", ""))
    except (OSError, UnicodeError):
        bound["evidenceSpanCheck"] = {
            "found": False,
            "start_char": None,
            "end_char": None,
            "exact_match": False,
            "status": "SOURCE_TEXT_UNREADABLE",
        }

    return bound
