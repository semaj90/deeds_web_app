"""Build a deterministic, non-authoritative whole-worktree language inventory."""

from __future__ import annotations

import argparse
import gzip
import hashlib
import json
import os
import re
import shutil
import subprocess
import stat
import tempfile
from pathlib import Path, PurePosixPath
from typing import Any, Callable, Iterable

from .language_catalog_v1 import validate_catalog


SCHEMA = "atlas.language-coverage-inventory.v2"
BINARY_SUFFIXES = {
    ".7z", ".a", ".avi", ".bin", ".bmp", ".class", ".dll", ".dylib", ".exe", ".gif",
    ".gguf", ".gz", ".ico", ".jpeg", ".jpg", ".lib", ".mp3", ".mp4", ".o", ".pdf",
    ".png", ".pt", ".pth", ".so", ".sqlite", ".tar", ".wasm", ".webp", ".zip",
}
DEPENDENCY_DIRS = {"node_modules", "vendor", "third_party"}
TEMP_DIRS = {".tmp", ".cache", ".pytest_cache", ".mypy_cache", "__pycache__", ".venv", "venv"}
BUILD_DIRS = {"build", "dist", "coverage", "target", ".svelte-kit", ".next"}
# Virtual environments and bundled interpreters (e.g. .venv-cu130, .venv-gemma4, .python311).
VIRTUAL_ENV_PATTERN = re.compile(r"^(\.?venv[-\w.]*|\.python\d+)$", re.IGNORECASE)


def _canonical_bytes(value: Any) -> bytes:
    return json.dumps(value, ensure_ascii=False, sort_keys=True, separators=(",", ":")).encode("utf-8")


def _sha256(value: bytes) -> str:
    return hashlib.sha256(value).hexdigest()


def _write_path_manifest(path_spool: Any, path_output: Path, compression: str) -> dict[str, Any]:
    path_spool.seek(0, os.SEEK_END)
    uncompressed_bytes = path_spool.tell()
    path_spool.seek(0)
    with path_output.open("xb") as stored_file:
        if compression == "gzip":
            with gzip.GzipFile(fileobj=stored_file, mode="wb", filename="", mtime=0) as output_file:
                shutil.copyfileobj(path_spool, output_file)
        elif compression == "none":
            shutil.copyfileobj(path_spool, stored_file)
        else:
            raise ValueError("LANGUAGE_COVERAGE_PATH_MANIFEST_COMPRESSION_INVALID")
    digest = hashlib.sha256()
    with path_output.open("rb") as stored_file:
        for chunk in iter(lambda: stored_file.read(1024 * 1024), b""):
            digest.update(chunk)
    return {
        "compression": compression,
        "storedBytes": path_output.stat().st_size,
        "storedSha256": digest.hexdigest(),
        "uncompressedBytes": uncompressed_bytes,
    }


def _read_profiles(profile_dir: Path) -> tuple[dict[str, str], list[dict[str, str]], dict[str, list[str]]]:
    extension_rows: dict[str, list[tuple[str, str]]] = {}
    sources: list[dict[str, str]] = []
    for profile_path in sorted(profile_dir.glob("*.yaml"), key=lambda item: item.name.casefold()):
        text = profile_path.read_text(encoding="utf-8")
        language_match = re.search(r"(?m)^language:\s*([A-Za-z0-9_.+-]+)\s*$", text)
        extensions_match = re.search(r"(?ms)^extensions:\s*\n((?:^[ \t]+-\s*[^\n]+\n?)+)", text)
        if not language_match or not extensions_match:
            continue
        language_id = language_match.group(1).casefold()
        digest = _sha256(profile_path.read_bytes())
        sources.append({"profile": profile_path.name, "languageId": language_id, "sha256": digest})
        for line in extensions_match.group(1).splitlines():
            extension = line.split("-", 1)[1].strip().strip("\"'").casefold()
            if extension.startswith(".") and len(extension) > 1:
                extension_rows.setdefault(extension, []).append((language_id, profile_path.name))
    mappings = {
        extension: rows[0][0]
        for extension, rows in extension_rows.items()
        if len({language for language, _ in rows}) == 1
    }
    ambiguous = {
        extension: sorted({language for language, _ in rows})
        for extension, rows in extension_rows.items()
        if len({language for language, _ in rows}) > 1
    }
    return mappings, sources, ambiguous


def _is_link_or_junction(path: Path) -> bool:
    if path.is_symlink():
        return True
    is_junction = getattr(path, "is_junction", None)
    if is_junction and is_junction():
        return True
    try:
        attributes = getattr(path.lstat(), "st_file_attributes", 0)
    except OSError:
        return False
    return bool(attributes & getattr(stat, "FILE_ATTRIBUTE_REPARSE_POINT", 0x400))


def _iter_paths(root: Path, scan_errors: list[dict[str, str]]) -> Iterable[tuple[Path, str]]:
    def onerror(error: OSError) -> None:
        scan_errors.append({"path": str(getattr(error, "filename", "")), "error": type(error).__name__})

    for current, directory_names, file_names in os.walk(root, topdown=True, followlinks=False, onerror=onerror):
        current_path = Path(current)
        yield current_path, "DIRECTORY"
        retained_directories = []
        for name in sorted(directory_names, key=str.casefold):
            candidate = current_path / name
            if _is_link_or_junction(candidate):
                yield candidate, "SYMLINK_OR_JUNCTION"
            else:
                retained_directories.append(name)
        directory_names[:] = retained_directories
        for name in sorted(file_names, key=str.casefold):
            candidate = current_path / name
            yield candidate, "SYMLINK_OR_JUNCTION" if _is_link_or_junction(candidate) else "FILE"


def _extension_for(filename: str, known_extensions: Iterable[str]) -> str | None:
    lowered = filename.casefold()
    matches = [extension for extension in known_extensions if lowered.endswith(extension)]
    if matches:
        return max(matches, key=len)
    suffix = Path(filename).suffix.casefold()
    return suffix if suffix and suffix != filename.casefold() else None


def _path_role(relative: str, entry_kind: str, extension: str | None) -> str:
    parts = PurePosixPath(relative).parts
    folded = {part.casefold() for part in parts}
    if entry_kind == "SYMLINK_OR_JUNCTION":
        return "LINK_ONLY"
    if ".git" in folded or ".hg" in folded or ".svn" in folded:
        return "REPOSITORY_METADATA"
    if folded & DEPENDENCY_DIRS:
        return "DEPENDENCY_TREE"
    if any(VIRTUAL_ENV_PATTERN.match(part) for part in parts):
        return "VIRTUAL_ENVIRONMENT"
    if folded & TEMP_DIRS:
        return "CACHE_OR_TEMP"
    if "models" in folded or (extension and extension.casefold() in BINARY_SUFFIXES):
        return "MODEL_OR_BINARY_ARTIFACT"
    if folded & BUILD_DIRS:
        return "GENERATED_OR_BUILD_ARTIFACT"
    if entry_kind == "DIRECTORY":
        return "DIRECTORY"
    return "WORKTREE_FILE"


def _is_dot_path(relative: str) -> bool:
    return any(part.startswith(".") for part in PurePosixPath(relative).parts if part not in {".", ".."})


def _normalized_path(value: str) -> str:
    normalized = value.replace("\\", "/").strip("/")
    parts = [part for part in PurePosixPath(normalized).parts if part not in {"", "."}]
    if any(part == ".." for part in parts):
        raise ValueError("GRAPHIFY_MEMBERSHIP_PATH_TRAVERSAL")
    return "/".join(parts)


def load_graphify_overlay(repository_root: Path, authority_receipt_path: Path) -> dict[str, Any]:
    receipt_bytes = authority_receipt_path.read_bytes()
    receipt = json.loads(receipt_bytes.decode("utf-8"))
    source_snapshot = receipt.get("sourceSnapshot")
    if not isinstance(source_snapshot, dict):
        raise ValueError("GRAPHIFY_AUTHORITY_SOURCE_SNAPSHOT_MISSING")
    manifest_reference = source_snapshot.get("snapshotManifestPath")
    if not isinstance(manifest_reference, str) or not manifest_reference:
        raise ValueError("GRAPHIFY_SNAPSHOT_MANIFEST_PATH_MISSING")
    manifest_path = Path(manifest_reference)
    if not manifest_path.is_absolute():
        manifest_path = repository_root / manifest_path
    root = repository_root.resolve(strict=True)
    manifest_path = manifest_path.resolve(strict=True)
    if manifest_path != root and root not in manifest_path.parents:
        raise ValueError("GRAPHIFY_SNAPSHOT_MANIFEST_OUTSIDE_REPOSITORY")
    manifest_bytes = manifest_path.read_bytes()
    manifest = json.loads(manifest_bytes.decode("utf-8"))
    sources = manifest.get("sources")
    repositories = manifest.get("repositories")
    if not isinstance(sources, list) or not isinstance(repositories, list):
        raise ValueError("GRAPHIFY_SNAPSHOT_MEMBERSHIP_INVALID")
    repository_paths = {
        _normalized_path(row.get("relativePath", ""))
        for row in repositories if isinstance(row, dict) and isinstance(row.get("relativePath", ""), str)
    }
    memberships: dict[str, list[dict[str, Any]]] = {}
    for row in sources:
        if not isinstance(row, dict):
            continue
        repository_id = row.get("repositoryId")
        relative_path = row.get("repositoryRelativePath") or row.get("sourceRef")
        if not isinstance(repository_id, str) or not isinstance(relative_path, str):
            continue
        raw_prefix = row.get("repositoryPath", "")
        if not isinstance(raw_prefix, str):
            continue
        prefix = _normalized_path(raw_prefix)
        if prefix not in repository_paths:
            continue
        normalized = "/".join(part for part in (prefix, _normalized_path(relative_path)) if part)
        memberships.setdefault(normalized.casefold(), []).append({
            "sourceRef": row.get("sourceRef"),
            "sourceRevision": row.get("sourceRevision"),
            "contentDigest": row.get("contentDigest"),
            "repositoryId": repository_id,
        })
    manifest_status = manifest.get("status")
    qualified = (
        receipt.get("status") == "CURRENT_SNAPSHOT_PROVEN"
        and source_snapshot.get("workspaceRevision") is not None
        and manifest_status in {"COMPLETED", "SNAPSHOT_CAPTURED"}
        and manifest.get("canonicalAuthority") is True
        and manifest.get("datastoreWritesPerformed") is False
    )
    return {
        "authorityReceiptPath": authority_receipt_path.relative_to(root).as_posix(),
        "authorityReceiptSha256": _sha256(receipt_bytes),
        "authorityStatus": receipt.get("status"),
        "snapshotManifestPath": manifest_path.relative_to(root).as_posix(),
        "snapshotManifestSha256": _sha256(manifest_bytes),
        "snapshotStatus": manifest_status,
        "workspaceRevision": source_snapshot.get("workspaceRevision"),
        "snapshotRevision": source_snapshot.get("snapshotRevision"),
        "sourceMembershipChecksumReported": manifest.get("sourceMembershipChecksum"),
        "sourceCountReported": len(sources),
        "qualificationStatus": "QUALIFIED_MEMBERSHIP_ONLY" if qualified else "UNQUALIFIED_SNAPSHOT_MEMBERSHIP",
        "pathMembershipSemantics": "SOURCE_SNAPSHOT_MEMBERSHIP_NOT_SYMBOL_PARSE_STATUS",
        "memberships": memberships,
    }


def build_language_coverage_v2(
    *,
    grammar_catalog: dict[str, Any],
    repository_root: Path,
    profile_dir: Path,
    workspace_revision: str | None = None,
    sample_limit: int = 3,
    graphify_overlay: dict[str, Any] | None = None,
    path_writer: Callable[[dict[str, Any]], None] | None = None,
    source_scope: set[str] | None = None,
) -> dict[str, Any]:
    if not isinstance(sample_limit, int) or not 1 <= sample_limit <= 20:
        raise ValueError("LANGUAGE_COVERAGE_SAMPLE_LIMIT_INVALID")
    if grammar_catalog.get("schema") != "atlas.okf-tree-sitter-language-catalog.v1":
        raise ValueError("LANGUAGE_COVERAGE_CATALOG_SCHEMA_INVALID")
    validate_catalog(grammar_catalog)
    catalog_source = grammar_catalog.get("source")
    catalog_entries = grammar_catalog.get("entries")
    if not isinstance(catalog_source, dict) or not isinstance(catalog_entries, list):
        raise ValueError("LANGUAGE_COVERAGE_CATALOG_INVALID")
    grammar_ids = sorted({
        entry["grammarId"].casefold()
        for entry in catalog_entries
        if isinstance(entry, dict) and isinstance(entry.get("grammarId"), str) and entry["grammarId"].strip()
    })
    if len(grammar_ids) != len(catalog_entries):
        raise ValueError("LANGUAGE_COVERAGE_CATALOG_ENTRY_INVALID")

    root = repository_root.resolve(strict=True)
    extension_map, profile_sources, ambiguous_map = _read_profiles(profile_dir)
    known_extensions = set(extension_map) | set(ambiguous_map)
    extensions: dict[str, dict[str, Any]] = {}
    observed_languages: dict[str, dict[str, Any]] = {}
    role_counts: dict[str, int] = {}
    graphify_counts: dict[str, int] = {}
    path_manifest_hasher = hashlib.sha256()
    path_count = file_count = directory_count = symlink_count = extensionless_count = dot_path_count = 0
    scan_errors: list[dict[str, str]] = []
    membership_index = (graphify_overlay or {}).get("memberships", {})

    for path, entry_kind in _iter_paths(root, scan_errors):
        relative = "." if path == root else path.relative_to(root).as_posix()
        extension = _extension_for(path.name, known_extensions) if entry_kind == "FILE" else None
        outside_scope = entry_kind == "FILE" and source_scope is not None and relative not in source_scope
        dot_path = _is_dot_path(relative)
        role = _path_role(relative, entry_kind, extension)
        size_bytes = None
        try:
            info = path.lstat()
            if entry_kind != "DIRECTORY":
                size_bytes = info.st_size
        except OSError as error:
            scan_errors.append({"path": relative, "error": type(error).__name__})
        if entry_kind == "FILE":
            file_count += 1
            if extension is None:
                extensionless_count += 1
            else:
                row = extensions.setdefault(extension, {"fileCount": 0, "mappedLanguageIds": set(), "auditOnlyCount": 0, "samples": []})
                row["fileCount"] += 1
                if dot_path:
                    row["auditOnlyCount"] += 1
                language_id = extension_map.get(extension)
                if language_id:
                    row["mappedLanguageIds"].add(language_id)
                    language = observed_languages.setdefault(language_id, {"fileCount": 0, "parserCandidateFiles": 0, "auditOnlyFiles": 0, "extensions": set(), "samples": []})
                    language["fileCount"] += 1
                    language["extensions"].add(extension)
                    if dot_path:
                        language["auditOnlyFiles"] += 1
                    elif role == "WORKTREE_FILE":
                        language["parserCandidateFiles"] += 1
                    if len(language["samples"]) < sample_limit:
                        language["samples"].append(relative)
                if len(row["samples"]) < sample_limit:
                    row["samples"].append(relative)
        elif entry_kind == "DIRECTORY":
            directory_count += 1
        else:
            symlink_count += 1
        if dot_path:
            dot_path_count += 1
        role_counts[role] = role_counts.get(role, 0) + 1

        membership_rows = membership_index.get(relative.casefold(), []) if entry_kind == "FILE" else []
        if entry_kind != "FILE":
            membership_status = "NOT_APPLICABLE"
        elif len(membership_rows) > 1:
            membership_status = "DUPLICATE_SNAPSHOT_MEMBERSHIP"
        elif membership_rows:
            membership_status = "SNAPSHOT_MEMBER_UNQUALIFIED" if (graphify_overlay or {}).get("qualificationStatus") != "QUALIFIED_MEMBERSHIP_ONLY" else "SNAPSHOT_MEMBER_CURRENT_BYTES_UNCHECKED"
        else:
            membership_status = "NOT_LISTED_IN_UNQUALIFIED_SNAPSHOT" if graphify_overlay else "UNAVAILABLE_NO_LOCAL_SNAPSHOT"
        graphify_counts[membership_status] = graphify_counts.get(membership_status, 0) + 1

        observed_extension = extension
        row = {
            "relativePath": relative,
            "entryKind": entry_kind,
            "sizeBytes": size_bytes,
            "extension": extension,
            "observedExtension": observed_extension,
            "role": role,
            "indexingStatus": (
                "NOT_IN_GIT_SOURCE_SCOPE" if outside_scope else "IN_GIT_SOURCE_SCOPE"
            ) if source_scope is not None and entry_kind == "FILE" else "NOT_APPLICABLE" if entry_kind != "FILE" else "GIT_SCOPE_NOT_PROVIDED",
            "dotPath": dot_path,
            "editPolicy": "AUDIT_ONLY_NEVER_EDIT" if dot_path else "INVENTORY_ONLY_NEVER_EDIT",
            "parserEligibility": "AUDIT_ONLY" if dot_path else "PROFILE_CANDIDATE" if entry_kind == "FILE" and role == "WORKTREE_FILE" and extension in extension_map else "NOT_PARSER_INPUT",
            "mappedLanguageId": extension_map.get(extension) if extension else None,
            "graphifyMembership": membership_status,
            "snapshotRows": membership_rows if membership_status in {"DUPLICATE_SNAPSHOT_MEMBERSHIP", "SNAPSHOT_MEMBER_UNQUALIFIED", "SNAPSHOT_MEMBER_CURRENT_BYTES_UNCHECKED"} else [],
        }
        encoded = _canonical_bytes(row) + b"\n"
        path_manifest_hasher.update(encoded)
        path_count += 1
        if path_writer:
            path_writer(row)

    language_rows = []
    profile_by_language: dict[str, list[dict[str, str]]] = {}
    for profile in profile_sources:
        profile_by_language.setdefault(profile["languageId"], []).append(profile)
    for language_id, row in sorted(observed_languages.items()):
        language_rows.append({
            "languageId": language_id,
            "fileCountInCorpus": row["fileCount"],
            "parserCandidateFiles": row["parserCandidateFiles"],
            "dotPathAuditOnlyFiles": row["auditOnlyFiles"],
            "extensions": sorted(row["extensions"]),
            "samplePaths": sorted(row["samples"])[:sample_limit],
            "grammarCatalogMatch": language_id if language_id in grammar_ids else None,
            "grammarAvailability": "CATALOG_CANDIDATE_NOT_RUNTIME_PROOF" if language_id in grammar_ids else "NOT_IN_CATALOG",
            "profileEvidence": profile_by_language.get(language_id, []),
            "parserOwner": None,
            "parserOwnerStatus": "NOT_JOINED_TO_INVENTORY",
            "parserVersion": None,
            "parserFixtureStatus": "NOT_JOINED_TO_RUN_EVIDENCE",
            "spanValidationStatus": "NOT_JOINED_TO_RUN_EVIDENCE",
            "compilerLspStatus": "NOT_JOINED_TO_RUN_EVIDENCE",
        })
    unknown_extensions = [
        {
            "extension": extension,
            "fileCount": row["fileCount"],
            "auditOnlyCount": row["auditOnlyCount"],
            "samplePaths": sorted(row["samples"])[:sample_limit],
            "mappingStatus": "AMBIGUOUS_PROFILE_MAPPING" if extension in ambiguous_map else "UNMAPPED",
            "candidateLanguageIds": ambiguous_map.get(extension, []),
        }
        for extension, row in sorted(extensions.items()) if extension not in extension_map
    ]
    extension_rows = [
        {"extension": extension, "fileCount": row["fileCount"], "auditOnlyCount": row["auditOnlyCount"], "mappedLanguageIds": sorted(row["mappedLanguageIds"])}
        for extension, row in sorted(extensions.items())
    ]
    overlay_summary = None
    if graphify_overlay:
        overlay_summary = {key: value for key, value in graphify_overlay.items() if key != "memberships"}
        overlay_summary.setdefault("pathMembershipSemantics", "SOURCE_SNAPSHOT_MEMBERSHIP_NOT_SYMBOL_PARSE_STATUS")
        overlay_summary["joinedPathStatuses"] = dict(sorted(graphify_counts.items()))
        overlay_summary["snapshotMembershipRows"] = sum(len(rows) for rows in membership_index.values())

    body: dict[str, Any] = {
        "schema": SCHEMA,
        "authority": "DERIVED_ADVISORY",
        "workspace": {
            "rootLabel": ".",
            "workspaceRevision": workspace_revision,
            "revisionStatus": "PROVIDED_UNVERIFIED" if workspace_revision else "NOT_PROVIDED",
            "enumerationPolicy": "ALL_FILESYSTEM_PATHS_UNDER_ROOT_NO_LINK_FOLLOWING",
            "enumerationStatus": "COMPLETE" if not scan_errors else "PARTIAL_SCAN_ERRORS",
            "enumeratedPathCount": path_count,
            "fileCount": file_count,
            "directoryCountIncludingRoot": directory_count,
            "linkOnlyEntryCount": symlink_count,
            "dotPathCount": dot_path_count,
            "filesWithExtensions": file_count - extensionless_count,
            "filesWithoutExtension": extensionless_count,
            "roleCounts": dict(sorted(role_counts.items())),
            "scanErrors": scan_errors,
            "pathManifestSha256": path_manifest_hasher.hexdigest(),
            "pathManifestSemantics": "canonical JSONL metadata rows; no source file contents read or hashed",
        },
        "graphifyOverlay": overlay_summary,
        "grammarCatalog": {
            "catalogId": grammar_catalog.get("catalogId"),
            "packageName": catalog_source.get("packageName"),
            "packageVersion": catalog_source.get("packageVersion"),
            "manifestSha256": catalog_source.get("manifestSha256"),
            "catalogEntries": len(grammar_ids),
            "entries": [
                {
                    "grammarId": grammar_id,
                    "catalogStatus": "CANDIDATE",
                    "observedFileCount": observed_languages.get(grammar_id, {}).get("fileCount", 0),
                    "runtimeAvailability": "NOT_PROBED",
                    "parserFixtureStatus": "NOT_JOINED_TO_RUN_EVIDENCE",
                    "spanValidationStatus": "NOT_JOINED_TO_RUN_EVIDENCE",
                    "compilerLspStatus": "NOT_JOINED_TO_RUN_EVIDENCE",
                }
                for grammar_id in grammar_ids
            ],
        },
        "languageProfiles": profile_sources,
        "languageMatrix": language_rows,
        "observedExtensions": extension_rows,
        "unmappedExtensions": unknown_extensions,
        "coverageCounts": {
            "grammarCatalogCandidates": len(grammar_ids),
            "repositoryMappedLanguages": len(language_rows),
            "repositoryUnmappedOrAmbiguousExtensions": len(unknown_extensions),
            "parserOwnersJoined": 0,
            "parserFixturesVerified": 0,
            "spanValidationVerified": 0,
            "compilerLspBindingsVerified": 0,
            "fullPathEnumeration": not scan_errors,
        },
        "canonicalAuthority": False,
        "writesPerformed": False,
    }
    return {**body, "inventorySha256": _sha256(_canonical_bytes(body))}


def verify_language_coverage_v2(inventory: dict[str, Any], *, require_complete: bool = True) -> None:
    if inventory.get("schema") != SCHEMA or inventory.get("canonicalAuthority") is not False or inventory.get("writesPerformed") is not False:
        raise ValueError("LANGUAGE_COVERAGE_AUTHORITY_INVALID")
    digest = inventory.get("inventorySha256")
    body = {key: value for key, value in inventory.items() if key != "inventorySha256"}
    if not isinstance(digest, str) or _sha256(_canonical_bytes(body)) != digest:
        raise ValueError("LANGUAGE_COVERAGE_CHECKSUM_MISMATCH")
    workspace = inventory.get("workspace", {})
    if require_complete and workspace.get("enumerationStatus") != "COMPLETE":
        raise ValueError("LANGUAGE_COVERAGE_ENUMERATION_INCOMPLETE")
    if any(row.get("runtimeAvailability") != "NOT_PROBED" for row in inventory.get("grammarCatalog", {}).get("entries", [])):
        raise ValueError("LANGUAGE_COVERAGE_RUNTIME_PROMOTION_BLOCKED")


def build_language_coverage_evidence_join_v1(
    inventory: dict[str, Any], parser_fixture_receipt: dict[str, Any], *,
    inventory_path: str | None = None, parser_fixture_receipt_path: str | None = None,
) -> dict[str, Any]:
    """Join independently checksummed parser fixtures without promoting support."""
    verify_language_coverage_v2(inventory)
    if parser_fixture_receipt.get("schema") != "atlas.language-coverage-live-parser-fixtures.v1":
        raise ValueError("LANGUAGE_COVERAGE_PARSER_RECEIPT_SCHEMA_INVALID")
    if parser_fixture_receipt.get("authority") != {"canonicalAuthority": False, "productionWrites": False}:
        raise ValueError("LANGUAGE_COVERAGE_PARSER_RECEIPT_AUTHORITY_INVALID")
    receipt_digest = parser_fixture_receipt.get("receiptSha256")
    receipt_body = {key: value for key, value in parser_fixture_receipt.items() if key != "receiptSha256"}
    if not isinstance(receipt_digest, str) or _sha256(_canonical_bytes(receipt_body)) != receipt_digest:
        raise ValueError("LANGUAGE_COVERAGE_PARSER_RECEIPT_CHECKSUM_MISMATCH")

    sidecar = parser_fixture_receipt.get("sidecar") or {}
    if not sidecar.get("languageAuthorityOwner") or not sidecar.get("treeSitterChunkerVersion"):
        raise ValueError("LANGUAGE_COVERAGE_PARSER_OWNER_VERSION_MISSING")
    fixtures = parser_fixture_receipt.get("results")
    if not isinstance(fixtures, list) or not fixtures:
        raise ValueError("LANGUAGE_COVERAGE_PARSER_FIXTURES_MISSING")

    extension_counts = {row["extension"]: row for row in inventory.get("observedExtensions", [])}
    seen_languages: set[str] = set()
    joined_fixtures = []
    for fixture in fixtures:
        language_id = str(fixture.get("language", "")).casefold()
        extension = str(fixture.get("extension", "")).casefold()
        if not language_id or language_id in seen_languages or not extension.startswith("."):
            raise ValueError("LANGUAGE_COVERAGE_PARSER_FIXTURE_IDENTITY_INVALID")
        seen_languages.add(language_id)
        if fixture.get("status") != "FIXTURE_PASSED" or fixture.get("spanValidation") != "STRICT_UTF8_BOUNDARIES_VERIFIED":
            raise ValueError("LANGUAGE_COVERAGE_PARSER_FIXTURE_NOT_QUALIFIED")
        if fixture.get("authorityOwner") != sidecar["languageAuthorityOwner"] or fixture.get("authorityRevision") != sidecar.get("languageAuthorityRevision"):
            raise ValueError("LANGUAGE_COVERAGE_PARSER_AUTHORITY_MISMATCH")
        source_revision = fixture.get("sourceRevision")
        if not isinstance(source_revision, str) or not re.fullmatch(r"sha256:[0-9a-f]{64}", source_revision):
            raise ValueError("LANGUAGE_COVERAGE_PARSER_SOURCE_REVISION_INVALID")
        spans = fixture.get("spans")
        if not isinstance(spans, list) or not spans or any(span.get("valid") is not True for span in spans):
            raise ValueError("LANGUAGE_COVERAGE_PARSER_SPANS_INVALID")
        extension_row = extension_counts.get(extension)
        joined_fixtures.append({
            "languageId": language_id,
            "extension": extension,
            "repositoryFileCount": extension_row["fileCount"] if extension_row else 0,
            "repositoryParserCandidateFiles": max(0, (extension_row["fileCount"] - extension_row["auditOnlyCount"])) if extension_row else 0,
            "fixtureStatus": fixture["status"],
            "parserOwner": sidecar["languageAuthorityOwner"],
            "parserOwnerRevision": sidecar.get("languageAuthorityRevision"),
            "parserVersion": sidecar["treeSitterChunkerVersion"],
            "spanValidationStatus": fixture["spanValidation"],
            "fixtureSourceRevision": source_revision,
            "fixtureChunkCount": fixture.get("chunkCount"),
            "compilerLspStatus": "NOT_TESTED",
        })

    fixture_by_language = {row["languageId"]: row for row in joined_fixtures}
    language_matrix = []
    for row in inventory["languageMatrix"]:
        updated = dict(row)
        evidence = fixture_by_language.get(row["languageId"])
        if evidence:
            updated.update({
                "parserOwner": evidence["parserOwner"],
                "parserOwnerStatus": "FIXTURE_OWNER_REVISION_BOUND",
                "parserVersion": evidence["parserVersion"],
                "parserFixtureStatus": evidence["fixtureStatus"],
                "spanValidationStatus": evidence["spanValidationStatus"],
                "compilerLspStatus": evidence["compilerLspStatus"],
                "fixtureSourceRevision": evidence["fixtureSourceRevision"],
            })
        language_matrix.append(updated)

    body = {
        "schema": "atlas.language-coverage-evidence-join.v1",
        "authority": "DERIVED_ADVISORY",
        "canonicalAuthority": False,
        "writesPerformed": False,
        "baseInventorySha256": inventory["inventorySha256"],
        "pathManifestSha256": inventory["workspace"]["pathManifestSha256"],
        "parserFixtureReceiptSha256": receipt_digest,
        "inputArtifactPaths": {
            "inventory": inventory_path,
            "parserFixtureReceipt": parser_fixture_receipt_path,
        },
        "languageMatrix": language_matrix,
        "runtimeParserFixtures": joined_fixtures,
        "coverageCounts": {
            "repositoryMappedLanguages": inventory["coverageCounts"]["repositoryMappedLanguages"],
            "fixtureLanguagesPassed": len(joined_fixtures),
            "fixtureLanguagesWithStrictSpanValidation": sum(row["spanValidationStatus"] == "STRICT_UTF8_BOUNDARIES_VERIFIED" for row in joined_fixtures),
            "compilerLspLanguagesVerified": 0,
            "wholeRepositoryParserCoverage": "NOT_ESTABLISHED_BY_CONTROLLED_FIXTURES",
        },
        "limitations": [
            "Controlled fixtures prove parser invocation and fixture-span checks only; they do not prove full-language conformance or whole-repository parse coverage.",
            "Compiler/LSP validation remains separate and untested in this join.",
            "Grammar catalog availability remains a candidate signal, not runtime support or canonical authority.",
        ],
    }
    joined = {**body, "joinSha256": _sha256(_canonical_bytes(body))}
    verify_language_coverage_evidence_join_v1(joined)
    return joined


def verify_language_coverage_evidence_join_v1(joined: dict[str, Any]) -> None:
    if joined.get("schema") != "atlas.language-coverage-evidence-join.v1":
        raise ValueError("LANGUAGE_COVERAGE_JOIN_SCHEMA_INVALID")
    if joined.get("authority") != "DERIVED_ADVISORY" or joined.get("canonicalAuthority") is not False or joined.get("writesPerformed") is not False:
        raise ValueError("LANGUAGE_COVERAGE_JOIN_AUTHORITY_INVALID")
    digest = joined.get("joinSha256")
    body = {key: value for key, value in joined.items() if key != "joinSha256"}
    if not isinstance(digest, str) or _sha256(_canonical_bytes(body)) != digest:
        raise ValueError("LANGUAGE_COVERAGE_JOIN_CHECKSUM_MISMATCH")
    counts = joined.get("coverageCounts") or {}
    fixtures = joined.get("runtimeParserFixtures")
    if not isinstance(fixtures, list) or counts.get("fixtureLanguagesPassed") != len(fixtures):
        raise ValueError("LANGUAGE_COVERAGE_JOIN_COUNTS_MISMATCH")
    if counts.get("wholeRepositoryParserCoverage") != "NOT_ESTABLISHED_BY_CONTROLLED_FIXTURES":
        raise ValueError("LANGUAGE_COVERAGE_JOIN_SUPPORT_PROMOTION_BLOCKED")


def build_language_coverage_evidence_join_v2(
    inventory: dict[str, Any], parser_fixture_receipts: list[dict[str, Any]], *,
    repository_root: Path, inventory_path: str | None = None,
    parser_fixture_receipt_paths: list[str] | None = None,
) -> dict[str, Any]:
    """Combine live and source-test fixtures without promoting runtime support."""
    if not isinstance(parser_fixture_receipts, list) or not parser_fixture_receipts:
        raise ValueError("LANGUAGE_COVERAGE_PARSER_RECEIPTS_MISSING")
    if parser_fixture_receipt_paths is not None and len(parser_fixture_receipt_paths) != len(parser_fixture_receipts):
        raise ValueError("LANGUAGE_COVERAGE_PARSER_RECEIPT_PATH_COUNT_MISMATCH")
    if parser_fixture_receipt_paths is not None and len(parser_fixture_receipt_paths) != 2:
        raise ValueError("LANGUAGE_COVERAGE_PARSER_RECEIPT_PATH_COUNT_MISMATCH")
    if parser_fixture_receipt_paths is not None and len(set(parser_fixture_receipt_paths)) != len(parser_fixture_receipt_paths):
        raise ValueError("LANGUAGE_COVERAGE_PARSER_RECEIPT_PATH_DUPLICATE")

    live_receipts = [row for row in parser_fixture_receipts if row.get("schema") == "atlas.language-coverage-live-parser-fixtures.v1"]
    source_receipts = [row for row in parser_fixture_receipts if row.get("schema") == "atlas.parser-fixture-e2e-receipt.v1"]
    if len(live_receipts) != 1 or len(source_receipts) != 1 or len(parser_fixture_receipts) != 2:
        raise ValueError("LANGUAGE_COVERAGE_PARSER_RECEIPT_SET_INVALID")

    source_fixture_receipt = source_receipts[0]
    if source_fixture_receipt.get("canonicalAuthority") is not False or source_fixture_receipt.get("writesPerformed") is not False:
        raise ValueError("LANGUAGE_COVERAGE_SOURCE_FIXTURE_AUTHORITY_INVALID")
    source_receipt_digest = source_fixture_receipt.get("receiptSha256")
    source_receipt_body = {key: value for key, value in source_fixture_receipt.items() if key != "receiptSha256"}
    source_receipt_bytes = json.dumps(source_receipt_body, ensure_ascii=False, separators=(",", ":")).encode("utf-8")
    if not isinstance(source_receipt_digest, str) or _sha256(source_receipt_bytes) != source_receipt_digest:
        raise ValueError("LANGUAGE_COVERAGE_SOURCE_FIXTURE_CHECKSUM_MISMATCH")

    sidecar = source_fixture_receipt.get("sidecar") or {}
    fixtures = source_fixture_receipt.get("fixtures")
    if source_fixture_receipt.get("status") != "SOURCE_FIXTURES_PASS_DEPLOYMENT_PENDING" \
        or sidecar.get("status") != "ok" \
        or sidecar.get("processRestarted") is not False \
        or not sidecar.get("liveBindingRevision") \
        or not sidecar.get("languagePackVersion") \
        or not sidecar.get("chunkerVersion") \
        or not isinstance(fixtures, list) \
        or not fixtures \
        or source_fixture_receipt.get("fixtureCount") != len(fixtures) \
        or source_fixture_receipt.get("allSyntaxClean") is not True \
        or source_fixture_receipt.get("allScansComplete") is not True \
        or source_fixture_receipt.get("allByteSpansValid") is not True:
        raise ValueError("LANGUAGE_COVERAGE_SOURCE_FIXTURE_RECEIPT_UNQUALIFIED")

    root = repository_root.resolve(strict=True)
    source_hashes = source_fixture_receipt.get("sourceSha256")
    if not isinstance(source_hashes, dict) or not source_hashes:
        raise ValueError("LANGUAGE_COVERAGE_SOURCE_FIXTURE_PRODUCER_HASHES_MISSING")
    for source_path, expected_digest in sorted(source_hashes.items()):
        relative_path = PurePosixPath(str(source_path))
        if relative_path.is_absolute() or ".." in relative_path.parts or not re.fullmatch(r"[0-9a-f]{64}", str(expected_digest)):
            raise ValueError("LANGUAGE_COVERAGE_SOURCE_FIXTURE_PRODUCER_PATH_INVALID")
        resolved_path = (root / Path(*relative_path.parts)).resolve(strict=True)
        if root not in resolved_path.parents:
            raise ValueError("LANGUAGE_COVERAGE_SOURCE_FIXTURE_PRODUCER_PATH_INVALID")
        if _sha256(resolved_path.read_bytes()) != expected_digest:
            raise ValueError(f"LANGUAGE_COVERAGE_SOURCE_FIXTURE_PRODUCER_CHECKSUM_MISMATCH:{source_path}")

    base = build_language_coverage_evidence_join_v1(
        inventory,
        live_receipts[0],
        inventory_path=inventory_path,
        parser_fixture_receipt_path=(parser_fixture_receipt_paths[parser_fixture_receipts.index(live_receipts[0])] if parser_fixture_receipt_paths else None),
    )
    extension_profiles: dict[str, list[str]] = {}
    for profile in inventory.get("languageMatrix", []):
        for extension in profile.get("extensions", []):
            extension_profiles.setdefault(extension.casefold(), []).append(profile["languageId"])

    source_rows = []
    seen_fixture_paths: set[str] = set()
    for fixture in fixtures:
        file_path = str(fixture.get("filePath", ""))
        fixture_path = PurePosixPath(file_path)
        extension = fixture_path.suffix.casefold()
        revision = fixture.get("sourceRevision")
        chunk_count = fixture.get("chunkCount")
        if not file_path or "\\" in file_path or fixture_path.is_absolute() or ".." in fixture_path.parts \
            or file_path in seen_fixture_paths or not extension.startswith(".") \
            or fixture.get("syntaxStatus") != "CLEAN" \
            or fixture.get("scanCompleteness") != "COMPLETE" \
            or fixture.get("byteSpansValid") is not True \
            or not isinstance(chunk_count, int) or isinstance(chunk_count, bool) or chunk_count < 1 \
            or not isinstance(revision, str) or not re.fullmatch(r"sha256:[0-9a-f]{64}", revision):
            raise ValueError("LANGUAGE_COVERAGE_SOURCE_FIXTURE_ROW_INVALID")
        seen_fixture_paths.add(file_path)
        profile_ids = extension_profiles.get(extension, [])
        profile_status = "UNMAPPED_PROFILE" if not profile_ids else "MAPPED_PROFILE" if len(profile_ids) == 1 else "AMBIGUOUS_PROFILE"
        if profile_status != "MAPPED_PROFILE":
            raise ValueError(f"LANGUAGE_COVERAGE_SOURCE_FIXTURE_PROFILE_UNRESOLVED:{extension}")
        profile = next(row for row in inventory["languageMatrix"] if row["languageId"] == profile_ids[0])
        extension_counts = {row["extension"]: row for row in inventory.get("observedExtensions", [])}
        observed = extension_counts.get(extension)
        source_rows.append({
            "languageId": profile_ids[0],
            "fixtureLanguageLabel": fixture.get("language"),
            "extension": extension,
            "repositoryFileCount": observed["fileCount"] if observed else 0,
            "repositoryParserCandidateFiles": max(0, observed["fileCount"] - observed["auditOnlyCount"]) if observed else 0,
            "fixtureStatus": "SOURCE_FIXTURE_PASSED_DEPLOYMENT_PENDING",
            "evidenceKind": "SOURCE_TEST_FIXTURE",
            "parserOwner": "python/miniforge_nlp_sidecar.py::_AST_LANGUAGE_EXTENSIONS",
            "parserOwnerRevision": sidecar["liveBindingRevision"],
            "parserVersion": sidecar["chunkerVersion"],
            "parserRuntimeVersion": sidecar["languagePackVersion"],
            "spanValidationStatus": "BYTE_SPANS_VALIDATED_BY_SOURCE_FIXTURE",
            "fixtureSourceRevision": revision,
            "fixtureChunkCount": chunk_count,
            "compilerLspStatus": "NOT_TESTED",
            "runtimeActivationStatus": "DEPLOYMENT_PENDING",
        })

    joined = {key: value for key, value in base.items() if key != "joinSha256"}
    joined["schema"] = "atlas.language-coverage-evidence-join.v2"
    live_rows = base["runtimeParserFixtures"]
    combined_rows = live_rows + source_rows
    joined["runtimeParserFixtures"] = combined_rows
    joined["parserFixtureReceiptSha256s"] = [row.get("receiptSha256") for row in parser_fixture_receipts]
    joined["inputArtifactPaths"] = {
        "inventory": inventory_path,
        "parserFixtureReceipts": parser_fixture_receipt_paths,
    }
    joined["languageMatrix"] = []
    for profile in base["languageMatrix"]:
        updated = dict(profile)
        evidence_rows = [row for row in combined_rows if row["languageId"] == profile["languageId"]]
        updated["parserFixtureEvidence"] = evidence_rows
        if evidence_rows and profile["parserFixtureStatus"] == "NOT_JOINED_TO_RUN_EVIDENCE":
            updated.update({
                "parserFixtureStatus": "SOURCE_FIXTURE_PASSED_DEPLOYMENT_PENDING",
                "parserOwner": evidence_rows[0]["parserOwner"],
                "parserOwnerStatus": "SOURCE_FIXTURE_RECEIPT_BOUND",
                "parserVersion": evidence_rows[0]["parserVersion"],
                "spanValidationStatus": evidence_rows[0]["spanValidationStatus"],
                "compilerLspStatus": "NOT_TESTED",
                "runtimeActivationStatus": "DEPLOYMENT_PENDING",
            })
        joined["languageMatrix"].append(updated)
    joined["coverageCounts"] = {
        **base["coverageCounts"],
        "fixtureLanguagesPassed": len({row["languageId"] for row in combined_rows}),
        "liveParserFixtureCount": len(live_rows),
        "sourceTestFixtureCount": len(source_rows),
        "sourceFixtureLanguagesPassed": len({row["languageId"] for row in source_rows}),
        "fixtureLanguagesWithStrictSpanValidation": sum(row["spanValidationStatus"] == "STRICT_UTF8_BOUNDARIES_VERIFIED" for row in live_rows),
        "sourceFixtureRowsWithValidByteSpans": sum(row["spanValidationStatus"] == "BYTE_SPANS_VALIDATED_BY_SOURCE_FIXTURE" for row in source_rows),
        "compilerLspLanguagesVerified": 0,
        "wholeRepositoryParserCoverage": "NOT_ESTABLISHED_BY_CONTROLLED_FIXTURES",
    }
    joined["limitations"] = [
        *base["limitations"],
        "Source-test fixtures use a code-side test receipt; deployment remains pending and does not prove the running sidecar exposes the new bindings.",
        "Fixture language labels are mapped through the inventory's unique extension profile; they do not establish whole-language conformance or canonical symbol resolution.",
    ]
    body = {key: value for key, value in joined.items() if key != "joinSha256"}
    joined["joinSha256"] = _sha256(_canonical_bytes(body))
    verify_language_coverage_evidence_join_v2(joined)
    return joined


def verify_language_coverage_evidence_join_v2(joined: dict[str, Any]) -> None:
    if joined.get("schema") != "atlas.language-coverage-evidence-join.v2":
        raise ValueError("LANGUAGE_COVERAGE_JOIN_SCHEMA_INVALID")
    if joined.get("authority") != "DERIVED_ADVISORY" or joined.get("canonicalAuthority") is not False or joined.get("writesPerformed") is not False:
        raise ValueError("LANGUAGE_COVERAGE_JOIN_AUTHORITY_INVALID")
    digest = joined.get("joinSha256")
    body = {key: value for key, value in joined.items() if key != "joinSha256"}
    if not isinstance(digest, str) or _sha256(_canonical_bytes(body)) != digest:
        raise ValueError("LANGUAGE_COVERAGE_JOIN_CHECKSUM_MISMATCH")
    fixtures = joined.get("runtimeParserFixtures")
    counts = joined.get("coverageCounts") or {}
    if not isinstance(fixtures, list) or counts.get("fixtureLanguagesPassed") != len({row.get("languageId") for row in fixtures}):
        raise ValueError("LANGUAGE_COVERAGE_JOIN_COUNTS_MISMATCH")
    if counts.get("wholeRepositoryParserCoverage") != "NOT_ESTABLISHED_BY_CONTROLLED_FIXTURES":
        raise ValueError("LANGUAGE_COVERAGE_JOIN_SUPPORT_PROMOTION_BLOCKED")
    for row in fixtures:
        if row.get("evidenceKind") == "SOURCE_TEST_FIXTURE" and row.get("runtimeActivationStatus") != "DEPLOYMENT_PENDING":
            raise ValueError("LANGUAGE_COVERAGE_SOURCE_FIXTURE_PROMOTION_BLOCKED")


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--catalog", type=Path, required=True)
    parser.add_argument("--repo", type=Path, required=True)
    parser.add_argument("--profiles", type=Path, required=True)
    parser.add_argument("--output", type=Path, required=True)
    parser.add_argument("--path-manifest-output", type=Path)
    parser.add_argument("--path-manifest-compression", choices=("none", "gzip"), default="none")
    parser.add_argument("--graphify-authority-receipt", type=Path)
    parser.add_argument("--workspace-revision")
    parser.add_argument(
        "--no-git-scope",
        action="store_true",
        help="Disable the default source scope (git ls-files --cached --others --exclude-standard).",
    )
    args = parser.parse_args()
    output = args.output.resolve()
    default_path_name = "paths.jsonl.gz" if args.path_manifest_compression == "gzip" else "paths.jsonl"
    path_output = (args.path_manifest_output or output.with_name(default_path_name)).resolve()
    if output.exists() or path_output.exists():
        raise FileExistsError("LANGUAGE_COVERAGE_OUTPUT_ALREADY_EXISTS")
    root = args.repo.resolve(strict=True)
    if root not in output.parents or root not in path_output.parents:
        raise ValueError("LANGUAGE_COVERAGE_OUTPUT_OUTSIDE_REPOSITORY")
    source_scope = None
    if not args.no_git_scope:
        listed = subprocess.run(
            ["git", "-C", str(root), "ls-files", "--cached", "--others", "--exclude-standard", "-z"],
            capture_output=True, check=False,
        )
        if listed.returncode != 0:
            raise RuntimeError("LANGUAGE_COVERAGE_SOURCE_SCOPE_UNAVAILABLE")
        source_scope = {item for item in listed.stdout.decode("utf-8").split("\0") if item}
    graphify_overlay = None
    if args.graphify_authority_receipt:
        authority_path = args.graphify_authority_receipt.resolve(strict=True)
        graphify_overlay = load_graphify_overlay(root, authority_path)
    with tempfile.TemporaryFile(mode="w+b") as path_spool:
        def write_path(row: dict[str, Any]) -> None:
            path_spool.write(json.dumps(row, ensure_ascii=False, sort_keys=True, separators=(",", ":")).encode("utf-8") + b"\n")

        inventory = build_language_coverage_v2(
            grammar_catalog=json.loads(args.catalog.read_text(encoding="utf-8")),
            repository_root=root,
            profile_dir=args.profiles,
            workspace_revision=args.workspace_revision,
            graphify_overlay=graphify_overlay,
            path_writer=write_path,
            source_scope=source_scope,
        )
        verify_language_coverage_v2(inventory, require_complete=False)
        path_output.parent.mkdir(parents=True, exist_ok=True)
        output.parent.mkdir(parents=True, exist_ok=True)
        storage = _write_path_manifest(path_spool, path_output, args.path_manifest_compression)
    inventory["workspace"]["pathManifestPath"] = path_output.relative_to(root).as_posix()
    if args.path_manifest_compression != "none":
        inventory["workspace"]["pathManifestStorage"] = storage
    body = {key: value for key, value in inventory.items() if key != "inventorySha256"}
    inventory["inventorySha256"] = _sha256(_canonical_bytes(body))
    with output.open("x", encoding="utf-8", newline="\n") as result:
        result.write(json.dumps(inventory, ensure_ascii=False, indent=2) + "\n")
    print(json.dumps({
        "schema": SCHEMA,
        "enumerationStatus": inventory["workspace"]["enumerationStatus"],
        "enumeratedPathCount": inventory["workspace"]["enumeratedPathCount"],
        "fileCount": inventory["workspace"]["fileCount"],
        "languageRows": len(inventory["languageMatrix"]),
        "graphifyOverlayStatus": (inventory.get("graphifyOverlay") or {}).get("qualificationStatus", "UNAVAILABLE"),
        "inventorySha256": inventory["inventorySha256"],
        "pathManifestSha256": inventory["workspace"]["pathManifestSha256"],
        "output": str(output),
        "pathManifest": str(path_output),
    }))
    return 0 if inventory["workspace"]["enumerationStatus"] == "COMPLETE" else 2


if __name__ == "__main__":
    raise SystemExit(main())
