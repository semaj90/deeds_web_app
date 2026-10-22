"""Build a deterministic, non-authoritative language coverage inventory."""

from __future__ import annotations

import argparse
import hashlib
import json
import re
from pathlib import Path
from typing import Any, Iterable

from .language_catalog_v1 import validate_catalog


SCHEMA = "atlas.language-coverage-inventory.v1"
EXCLUDED_DIRECTORY_NAMES = {
    ".git", ".hg", ".svn", ".tmp", ".venv", "venv", "node_modules", ".archive", "archive",
    "__pycache__", ".pytest_cache", ".mypy_cache", ".svelte-kit", "build",
    "dist", "coverage", "logs", "target", ".cache", ".proofs", "models",
    "qdrant-windows", "third_party", "vendor",
}


def _canonical_bytes(value: Any) -> bytes:
    return json.dumps(value, ensure_ascii=False, sort_keys=True, separators=(",", ":")).encode("utf-8")


def _sha256(value: bytes) -> str:
    return hashlib.sha256(value).hexdigest()


def _read_profiles(profile_dir: Path) -> tuple[dict[str, str], list[dict[str, str]]]:
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
    return mappings, sources


def _iter_files(root: Path) -> Iterable[Path]:
    for current, directory_names, file_names in __import__("os").walk(root, followlinks=False):
        directory_names[:] = sorted(
            name for name in directory_names
            if name.casefold() not in EXCLUDED_DIRECTORY_NAMES
            and not name.casefold().startswith("backup-")
            and not name.casefold().startswith((".venv", "venv", ".python", ".archive-", "archive-", "build-"))
            and not name.casefold().startswith(("llama-cpp-", "model-weights"))
        )
        for name in sorted(file_names, key=str.casefold):
            path = Path(current, name)
            if path.is_file() and not path.is_symlink():
                yield path


def _extension_for(filename: str, known_extensions: Iterable[str]) -> str | None:
    lowered = filename.casefold()
    matches = [extension for extension in known_extensions if lowered.endswith(extension)]
    if matches:
        return max(matches, key=len)
    suffix = Path(filename).suffix.casefold()
    return suffix if suffix and suffix != filename.casefold() else None


def build_language_coverage_v1(
    *,
    grammar_catalog: dict[str, Any],
    repository_root: Path,
    profile_dir: Path,
    workspace_revision: str | None = None,
    sample_limit: int = 3,
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
    extension_map, profile_sources = _read_profiles(profile_dir)
    extensions: dict[str, dict[str, Any]] = {}
    census_paths: list[str] = []
    unclassified = 0
    for path in _iter_files(root):
        relative = path.relative_to(root).as_posix()
        extension = _extension_for(path.name, extension_map)
        if extension is None:
            unclassified += 1
            continue
        row = extensions.setdefault(extension, {"fileCount": 0, "languageIds": set(), "samples": []})
        row["fileCount"] += 1
        if extension in extension_map:
            row["languageIds"].add(extension_map[extension])
        row["samples"].append(relative)
        census_paths.append(f"{relative}\0{extension}\n")

    observed_languages: dict[str, dict[str, Any]] = {}
    for extension, row in sorted(extensions.items()):
        for language_id in sorted(row["languageIds"]):
            language = observed_languages.setdefault(language_id, {"fileCount": 0, "extensions": [], "samples": []})
            language["fileCount"] += row["fileCount"]
            language["extensions"].append(extension)
            language["samples"].extend(row["samples"][:sample_limit])

    observed = [
        {
            "languageId": language_id,
            "fileCount": row["fileCount"],
            "extensions": sorted(set(row["extensions"])),
            "samplePaths": sorted(set(row["samples"]))[:sample_limit],
            "grammarCatalogMatch": language_id if language_id in grammar_ids else None,
            "grammarRuntimeAvailability": "NOT_PROBED",
            "parserFixtureStatus": "NOT_RUN",
            "astChunkCoverage": "NOT_MEASURED",
            "compilerLspStatus": "NOT_BOUND",
        }
        for language_id, row in sorted(observed_languages.items())
    ]
    unknown_extensions = [
        {
            "extension": extension,
            "fileCount": row["fileCount"],
            "samplePaths": sorted(set(row["samples"]))[:sample_limit],
            "mappingStatus": "UNMAPPED_OR_AMBIGUOUS",
        }
        for extension, row in sorted(extensions.items()) if not row["languageIds"]
    ]
    normalized_census = "".join(sorted(census_paths)).encode("utf-8")
    body: dict[str, Any] = {
        "schema": SCHEMA,
        "authority": "DERIVED_ADVISORY",
        "workspace": {
            "rootLabel": ".",
            "workspaceRevision": workspace_revision,
            "revisionStatus": "PROVIDED_UNVERIFIED" if workspace_revision else "NOT_PROVIDED",
            "excludedDirectoryPolicy": sorted(EXCLUDED_DIRECTORY_NAMES),
            "censusSha256": _sha256(normalized_census),
            "censusSemantics": "relative paths and detected extensions only; source contents are not hashed",
            "filesWithRecognizedOrUnknownExtensions": len(census_paths),
            "filesWithoutExtension": unclassified,
        },
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
                    "extensionMappingStatus": "MAPPED_FROM_PROFILE" if grammar_id in observed_languages else "NOT_OBSERVED_OR_MAPPED",
                    "runtimeAvailability": "NOT_PROBED",
                    "parserFixtureStatus": "NOT_RUN",
                    "astChunkCoverage": "NOT_MEASURED",
                    "compilerLspStatus": "NOT_BOUND",
                }
                for grammar_id in grammar_ids
            ],
        },
        "languageProfiles": profile_sources,
        "observedLanguages": observed,
        "observedExtensions": [
            {"extension": extension, "fileCount": row["fileCount"], "mappedLanguageIds": sorted(row["languageIds"])}
            for extension, row in sorted(extensions.items())
        ],
        "unmappedExtensions": unknown_extensions,
        "coverageCounts": {
            "grammarCatalogCandidates": len(grammar_ids),
            "repositoryMappedLanguages": len(observed),
            "repositoryUnmappedExtensions": len(unknown_extensions),
            "parserFixturesPassed": 0,
            "astChunkCoverageMeasured": 0,
            "compilerLspBindingsVerified": 0,
        },
        "canonicalAuthority": False,
        "writesPerformed": False,
    }
    return {**body, "inventorySha256": _sha256(_canonical_bytes(body))}


def verify_language_coverage_v1(inventory: dict[str, Any]) -> None:
    if inventory.get("schema") != SCHEMA or inventory.get("canonicalAuthority") is not False or inventory.get("writesPerformed") is not False:
        raise ValueError("LANGUAGE_COVERAGE_AUTHORITY_INVALID")
    digest = inventory.get("inventorySha256")
    body = {key: value for key, value in inventory.items() if key != "inventorySha256"}
    if not isinstance(digest, str) or _sha256(_canonical_bytes(body)) != digest:
        raise ValueError("LANGUAGE_COVERAGE_CHECKSUM_MISMATCH")
    if any(row.get("runtimeAvailability") != "NOT_PROBED" for row in inventory.get("grammarCatalog", {}).get("entries", [])):
        raise ValueError("LANGUAGE_COVERAGE_RUNTIME_PROMOTION_BLOCKED")


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--catalog", type=Path, required=True)
    parser.add_argument("--repo", type=Path, required=True)
    parser.add_argument("--profiles", type=Path, required=True)
    parser.add_argument("--output", type=Path, required=True)
    parser.add_argument("--workspace-revision")
    args = parser.parse_args()
    inventory = build_language_coverage_v1(
        grammar_catalog=json.loads(args.catalog.read_text(encoding="utf-8")),
        repository_root=args.repo,
        profile_dir=args.profiles,
        workspace_revision=args.workspace_revision,
    )
    verify_language_coverage_v1(inventory)
    args.output.parent.mkdir(parents=True, exist_ok=True)
    with args.output.open("x", encoding="utf-8", newline="\n") as output:
        output.write(json.dumps(inventory, ensure_ascii=False, indent=2) + "\n")
    print(json.dumps({
        "schema": SCHEMA,
        "catalogCandidates": inventory["coverageCounts"]["grammarCatalogCandidates"],
        "observedLanguages": inventory["coverageCounts"]["repositoryMappedLanguages"],
        "unmappedExtensions": inventory["coverageCounts"]["repositoryUnmappedExtensions"],
        "inventorySha256": inventory["inventorySha256"],
        "output": str(args.output),
    }))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
