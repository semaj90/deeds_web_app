"""Immutable Directory Inventory Manifest & Enrichment Hint v2 (read-only, byte-exact).

Implements the `revisionContract` in `docs/reports/directory-card-projection-safety-review-v1.json`
with exact canonical JSON (`sort_keys=True, separators=(',', ':')`) matching
`packages/parent-atlas/src/core/knowledge/stable-json-v1.ts` and
`packages/parent-atlas/src/core/knowledge/directory-enrichment-hint-v2.ts`.
"""

from __future__ import annotations

import concurrent.futures
import hashlib
import json
import os
import re
from pathlib import Path
from typing import Any, Callable, Mapping, Sequence

SCHEMA_INVENTORY_MANIFEST_V2 = "atlas.directory-inventory-manifest.v2"
SCHEMA_ENRICHMENT_HINT_V2 = "atlas.directory-enrichment-hint.v2"
_SHA256_RE = re.compile(r"^sha256:[0-9a-f]{64}$")


def stable_json_v1(value: Any) -> str:
    """Canonical JSON serialization matching `packages/parent-atlas/.../stable-json-v1.ts`."""
    return json.dumps(value, sort_keys=True, separators=(",", ":"), ensure_ascii=False)


def sha256_json_v1(value: Any) -> str:
    return "sha256:" + hashlib.sha256(stable_json_v1(value).encode("utf-8")).hexdigest()


def directory_of_source_ref_v2(source_ref: str) -> str:
    norm = source_ref.replace("\\", "/")
    if norm.startswith("./"):
        norm = norm[2:]
    idx = norm.rfind("/")
    return "." if idx <= 0 else norm[:idx]


def compute_producer_revision_v2(
    producer_paths: Sequence[str | Path],
    policy_config: Mapping[str, Any],
) -> str:
    """Compute sha256 over exact producer source bytes and extraction/exclusion policy."""
    sources: list[dict[str, Any]] = []
    for p in sorted(str(Path(x)) for x in producer_paths):
        path = Path(p)
        raw = path.read_bytes() if path.is_file() else b""
        sources.append(
            {
                "path": path.as_posix(),
                "sha256": "sha256:" + hashlib.sha256(raw).hexdigest(),
                "byteLength": len(raw),
            }
        )
    return sha256_json_v1({"sources": sources, "policy": policy_config})


def resolve_admitted_workspace_revision_v2(receipt_path: str | Path | None) -> str | None:
    """Copy `workspace_revision` ONLY if a workspace-frame receipt proves current authority & no refresh needed."""
    if not receipt_path:
        return None
    p = Path(receipt_path)
    if not p.is_file():
        return None
    try:
        data = json.loads(p.read_text(encoding="utf-8"))
    except Exception:
        return None
    sa = data.get("sourceAuthority") or {}
    if (
        data.get("status") == "CURRENT_WORKSPACE_FRAME_PROVEN"
        and data.get("cohortLineageWorkspaceRevisionMatchesSelector") is True
        and sa.get("safeToPromote") is True
        and sa.get("requiresSnapshotRefresh") is False
        and isinstance(data.get("admittedWorkspaceRevision"), str)
        and _SHA256_RE.match(data["admittedWorkspaceRevision"])
    ):
        return str(data["admittedWorkspaceRevision"])
    return None


def compute_inventory_manifest_digest_v2(manifest_body: Mapping[str, Any]) -> str:
    members = sorted(
        manifest_body.get("members") or [],
        key=lambda m: (str(m["sourceRef"]), str(m["sourceIdentityKey"])),
    )
    exclusions = sorted(
        manifest_body.get("exclusions") or [],
        key=lambda e: (str(e["path"]), str(e["reason"])),
    )
    canonical = {
        "schema": SCHEMA_INVENTORY_MANIFEST_V2,
        "repositoryScope": manifest_body["repositoryScope"],
        "workspaceRevision": manifest_body["workspaceRevision"],
        "members": members,
        "exclusions": exclusions,
    }
    return sha256_json_v1(canonical)


def compute_directory_evidence_digest_v2(
    *,
    directory_path: str,
    workspace_revision: str | None,
    inventory_manifest_digest: str,
    members: Sequence[Mapping[str, Any]],
    producer_revision: str,
    card_content_digest: str,
) -> str:
    sorted_members = sorted(
        members,
        key=lambda m: (str(m["sourceRef"]), str(m["sourceIdentityKey"])),
    )
    return sha256_json_v1(
        {
            "directory_path": directory_path,
            "workspace_revision": workspace_revision,
            "inventory_manifest_digest": inventory_manifest_digest,
            "members": sorted_members,
            "producer_revision": producer_revision,
            "card_content_digest": card_content_digest,
        }
    )


def build_inventory_manifest_and_hints_v2(
    repo_root: str | Path,
    dir_to_files: Mapping[str, Sequence[str]],
    *,
    card_digest_by_dir: Mapping[str, str],
    producer_revision: str,
    embedding_representation_revision: str | None,
    workspace_revision: str | None = None,
    repository_scope: str = "deeds-web-app",
    exclusions: Sequence[Mapping[str, str]] = (),
    max_workers: int | None = None,
) -> tuple[dict[str, Any], list[dict[str, Any]]]:
    """Hash exact member file bytes in parallel and emit immutable manifest v2 + hints v2."""
    root = Path(repo_root).resolve()
    all_files = sorted({f for files in dir_to_files.values() for f in files})

    def _hash_member(rel_path: str) -> tuple[dict[str, Any] | None, dict[str, str] | None]:
        abs_p = root / rel_path
        try:
            raw = abs_p.read_bytes()
        except OSError as exc:
            return None, {"path": rel_path, "reason": f"unreadable:{type(exc).__name__}"}
        digest = "sha256:" + hashlib.sha256(raw).hexdigest()
        return {
            "sourceIdentityKey": f"file:{rel_path}",
            "sourceRef": rel_path,
            "sourceRevision": digest,
            "contentDigest": digest,
            "byteLength": len(raw),
        }, None

    workers = max_workers or min(16, max(2, (os.cpu_count() or 8)))
    with concurrent.futures.ThreadPoolExecutor(max_workers=workers) as pool:
        hashed_results = list(pool.map(_hash_member, all_files))

    members = [m for m, _ in hashed_results if m is not None]
    extra_exclusions = [ex for _, ex in hashed_results if ex is not None]
    sorted_exclusions = sorted(
        [*[{"path": str(e["path"]), "reason": str(e["reason"])} for e in exclusions], *extra_exclusions],
        key=lambda e: (e["path"], e["reason"]),
    )
    manifest_body = {
        "schema": SCHEMA_INVENTORY_MANIFEST_V2,
        "repositoryScope": repository_scope,
        "workspaceRevision": workspace_revision,
        "members": sorted(members, key=lambda m: (m["sourceRef"], m["sourceIdentityKey"])),
        "exclusions": sorted_exclusions,
    }
    inv_digest = compute_inventory_manifest_digest_v2(manifest_body)
    manifest = {**manifest_body, "inventoryManifestDigest": inv_digest}

    by_dir_members: dict[str, list[dict[str, Any]]] = {}
    for m in manifest["members"]:
        d = directory_of_source_ref_v2(m["sourceRef"])
        by_dir_members.setdefault(d, []).append(m)

    hints: list[dict[str, Any]] = []
    for d in sorted(by_dir_members.keys()):
        d_members = by_dir_members[d]
        card_digest = card_digest_by_dir.get(d, "sha256:" + ("0" * 64))
        ev_digest = compute_directory_evidence_digest_v2(
            directory_path=d,
            workspace_revision=workspace_revision,
            inventory_manifest_digest=inv_digest,
            members=d_members,
            producer_revision=producer_revision,
            card_content_digest=card_digest,
        )
        hints.append(
            {
                "schema": SCHEMA_ENRICHMENT_HINT_V2,
                "directory_path": d,
                "status": "HINT",
                "packet_identity": None,
                "workspace_revision": workspace_revision,
                "inventory_manifest_digest": inv_digest,
                "producer_revision": producer_revision,
                "embedding_representation_revision": embedding_representation_revision,
                "card_content_digest": card_digest,
                "evidence_digest": ev_digest,
                "member_count": len(d_members),
                "canonicalAuthority": False,
                "writesPerformed": False,
            }
        )
    return manifest, hints


def verify_directory_hint_readback_v2(
    hint: Mapping[str, Any],
    resolve_manifest_by_digest: Callable[[str], Mapping[str, Any] | None],
    *,
    require_admitted_workspace_revision: bool = False,
) -> dict[str, Any]:
    """Resolve immutable inventory manifest by digest and recompute per-directory evidence_digest."""
    def _fail(code: str) -> dict[str, Any]:
        return {
            "ok": False,
            "status": "REFUSED_READBACK_DEFECT",
            "errorCode": code,
            "directoryPath": hint.get("directory_path"),
            "canonicalAuthority": False,
        }

    if hint.get("schema") != SCHEMA_ENRICHMENT_HINT_V2 or hint.get("canonicalAuthority") is not False:
        return _fail("HINT_SCHEMA_OR_AUTHORITY_INVALID")
    inv_digest = hint.get("inventory_manifest_digest")
    if not isinstance(inv_digest, str) or not _SHA256_RE.match(inv_digest):
        return _fail("INVENTORY_MANIFEST_DIGEST_MALFORMED")

    manifest = resolve_manifest_by_digest(inv_digest)
    if not manifest:
        return _fail("INVENTORY_MANIFEST_NOT_FOUND")
    if compute_inventory_manifest_digest_v2(manifest) != inv_digest or manifest.get("inventoryManifestDigest") != inv_digest:
        return _fail("INVENTORY_DIGEST_MISMATCH")
    if manifest.get("workspaceRevision") != hint.get("workspace_revision"):
        return _fail("WORKSPACE_REVISION_MISMATCH")

    members = [
        m for m in (manifest.get("members") or [])
        if directory_of_source_ref_v2(str(m.get("sourceRef", ""))) == hint.get("directory_path")
    ]
    if len(members) != hint.get("member_count") or not members:
        return _fail("DIRECTORY_MEMBER_COUNT_MISMATCH")

    recomputed_ev = compute_directory_evidence_digest_v2(
        directory_path=str(hint["directory_path"]),
        workspace_revision=hint.get("workspace_revision"),
        inventory_manifest_digest=inv_digest,
        members=members,
        producer_revision=str(hint["producer_revision"]),
        card_content_digest=str(hint["card_content_digest"]),
    )
    if recomputed_ev != hint.get("evidence_digest"):
        return _fail("EVIDENCE_DIGEST_MISMATCH")

    if hint.get("workspace_revision") is None:
        if require_admitted_workspace_revision:
            return _fail("WORKSPACE_REVISION_UNBOUND")
        return {
            "ok": True,
            "status": "PROPOSAL_UNBOUND_LOCAL_WORKTREE",
            "errorCode": None,
            "directoryPath": hint["directory_path"],
            "memberCount": len(members),
            "recomputedEvidenceDigest": recomputed_ev,
            "canonicalAuthority": False,
        }

    return {
        "ok": True,
        "status": "QUALIFIED_ADMITTED_READBACK_PROVEN",
        "errorCode": None,
        "directoryPath": hint["directory_path"],
        "memberCount": len(members),
        "recomputedEvidenceDigest": recomputed_ev,
        "canonicalAuthority": False,
    }


def verify_directory_hints_batch_v2(
    hints: Sequence[Mapping[str, Any]],
    resolve_manifest_by_digest: Callable[[str], Mapping[str, Any] | None],
    *,
    require_admitted_workspace_revision: bool = False,
) -> dict[str, Any]:
    """O(M + N) batch readback verifier: validates each immutable manifest once and checks every directory hint."""
    manifest_cache: dict[str, tuple[str | None, Mapping[str, Any] | None, dict[str, list[dict[str, Any]]]]] = {}
    verified_count = 0
    proposal_count = 0
    defects: list[dict[str, Any]] = []

    for hint in hints:
        inv_digest = hint.get("inventory_manifest_digest")
        if not isinstance(inv_digest, str) or not _SHA256_RE.match(inv_digest):
            defects.append({"dir": hint.get("directory_path"), "code": "INVENTORY_MANIFEST_DIGEST_MALFORMED"})
            continue

        if inv_digest not in manifest_cache:
            m = resolve_manifest_by_digest(inv_digest)
            if not m:
                manifest_cache[inv_digest] = ("INVENTORY_MANIFEST_NOT_FOUND", None, {})
            elif compute_inventory_manifest_digest_v2(m) != inv_digest or m.get("inventoryManifestDigest") != inv_digest:
                manifest_cache[inv_digest] = ("INVENTORY_DIGEST_MISMATCH", None, {})
            else:
                grouped: dict[str, list[dict[str, Any]]] = {}
                for member in m.get("members") or []:
                    grouped.setdefault(directory_of_source_ref_v2(str(member.get("sourceRef", ""))), []).append(member)
                manifest_cache[inv_digest] = (None, m, grouped)

        err_code, m, grouped = manifest_cache[inv_digest]
        if err_code or m is None:
            defects.append({"dir": hint.get("directory_path"), "code": err_code or "INVENTORY_MANIFEST_NOT_FOUND"})
            continue
        if hint.get("schema") != SCHEMA_ENRICHMENT_HINT_V2 or hint.get("canonicalAuthority") is not False:
            defects.append({"dir": hint.get("directory_path"), "code": "HINT_SCHEMA_OR_AUTHORITY_INVALID"})
            continue
        if m.get("workspaceRevision") != hint.get("workspace_revision"):
            defects.append({"dir": hint.get("directory_path"), "code": "WORKSPACE_REVISION_MISMATCH"})
            continue

        d_path = str(hint.get("directory_path", ""))
        members = grouped.get(d_path, [])
        if len(members) != hint.get("member_count") or not members:
            defects.append({"dir": d_path, "code": "DIRECTORY_MEMBER_COUNT_MISMATCH"})
            continue

        recomputed_ev = compute_directory_evidence_digest_v2(
            directory_path=d_path,
            workspace_revision=hint.get("workspace_revision"),
            inventory_manifest_digest=inv_digest,
            members=members,
            producer_revision=str(hint["producer_revision"]),
            card_content_digest=str(hint["card_content_digest"]),
        )
        if recomputed_ev != hint.get("evidence_digest"):
            defects.append({"dir": d_path, "code": "EVIDENCE_DIGEST_MISMATCH"})
            continue

        if hint.get("workspace_revision") is None:
            if require_admitted_workspace_revision:
                defects.append({"dir": d_path, "code": "WORKSPACE_REVISION_UNBOUND"})
            else:
                proposal_count += 1
        else:
            verified_count += 1

    return {
        "ok": len(defects) == 0,
        "totalHints": len(hints),
        "qualifiedAdmittedCount": verified_count,
        "proposalUnboundCount": proposal_count,
        "defectCount": len(defects),
        "defects": defects[:20],
        "canonicalAuthority": False,
    }
