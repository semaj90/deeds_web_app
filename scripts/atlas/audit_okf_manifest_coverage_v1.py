#!/usr/bin/env python3
"""Audit filesystem references in the repository-local OKF manifest."""

from __future__ import annotations

import argparse
import hashlib
import json
from pathlib import Path, PureWindowsPath
from typing import Any

import yaml


SCHEMA = "atlas.okf.manifest-coverage-audit.v1"
STRUCTURED_SUFFIXES = {".json", ".yaml", ".yml"}


class UniqueKeyLoader(yaml.SafeLoader):
    pass


def _construct_unique_mapping(loader: UniqueKeyLoader, node: yaml.MappingNode, deep: bool = False) -> dict[Any, Any]:
    mapping: dict[Any, Any] = {}
    for key_node, value_node in node.value:
        key = loader.construct_object(key_node, deep=deep)
        try:
            duplicate = key in mapping
        except TypeError as error:
            raise yaml.constructor.ConstructorError(
                "while constructing a mapping",
                node.start_mark,
                "found an unhashable mapping key",
                key_node.start_mark,
            ) from error
        if duplicate:
            raise yaml.constructor.ConstructorError(
                "while constructing a mapping",
                node.start_mark,
                f"found duplicate key {key!r}",
                key_node.start_mark,
            )
        mapping[key] = loader.construct_object(value_node, deep=deep)
    return mapping


UniqueKeyLoader.add_constructor(
    yaml.resolver.BaseResolver.DEFAULT_MAPPING_TAG,
    _construct_unique_mapping,
)


def _resolve_reference(okf_root: Path, base: Path, raw_path: Any) -> tuple[Path | None, str | None]:
    if not isinstance(raw_path, str) or not raw_path.strip():
        return None, "INVALID_PATH_VALUE"
    if PureWindowsPath(raw_path).is_absolute():
        return None, "ABSOLUTE_PATH_NOT_ALLOWED"
    normalized = raw_path.replace("\\", "/")
    try:
        target = (base / normalized).resolve()
        target.relative_to(okf_root.resolve())
    except (OSError, ValueError):
        return None, "PATH_ESCAPES_OKF_ROOT"
    return target, None


def audit_okf_manifest(root: Path) -> dict[str, Any]:
    repository_root = root.resolve()
    okf_root = repository_root / ".okf"
    manifest_path = okf_root / "manifest.yaml"
    if not manifest_path.is_file():
        return {
            "schema": SCHEMA,
            "status": "OKF_MANIFEST_NOT_FOUND",
            "manifest": ".okf/manifest.yaml",
            "manifestSha256": None,
            "registryCount": 0,
            "declaredReferenceCount": 0,
            "resolvedReferenceCount": 0,
            "missingReferences": [],
            "unsafeReferences": [],
            "missingRegistryDirectories": [],
            "additionalStructuredFiles": [],
            "unregisteredStructuredFiles": [],
            "canonicalAuthority": False,
            "writesPerformed": False,
        }

    manifest_bytes = manifest_path.read_bytes()
    base_result = {
        "schema": SCHEMA,
        "manifest": ".okf/manifest.yaml",
        "manifestSha256": hashlib.sha256(manifest_bytes).hexdigest(),
        "canonicalAuthority": False,
        "writesPerformed": False,
    }
    try:
        manifest = yaml.load(manifest_bytes, Loader=UniqueKeyLoader)
    except yaml.YAMLError as error:
        return {
            **base_result,
            "status": "OKF_MANIFEST_INVALID_YAML",
            "registryCount": 0,
            "declaredReferenceCount": 0,
            "resolvedReferenceCount": 0,
            "missingReferences": [],
            "unsafeReferences": [],
            "missingRegistryDirectories": [],
            "additionalStructuredFiles": [],
            "unregisteredStructuredFiles": [],
            "errors": [str(error)],
        }

    if not isinstance(manifest, dict) or not isinstance(manifest.get("registries"), dict):
        return {
            **base_result,
            "status": "OKF_MANIFEST_INVALID_SHAPE",
            "registryCount": 0,
            "declaredReferenceCount": 0,
            "resolvedReferenceCount": 0,
            "missingReferences": [],
            "unsafeReferences": [],
            "missingRegistryDirectories": [],
            "additionalStructuredFiles": [],
            "unregisteredStructuredFiles": [],
        }

    missing: list[dict[str, str]] = []
    unsafe: list[dict[str, str]] = []
    missing_directories: list[str] = []
    declared_files: set[Path] = set()
    registry_directories: dict[str, Path] = {}
    declared_reference_count = 0
    resolved_reference_count = 0

    def check_file(registry: str, kind: str, reference: Any, base: Path) -> Path | None:
        nonlocal declared_reference_count, resolved_reference_count
        declared_reference_count += 1
        target, error = _resolve_reference(okf_root, base, reference)
        if error is not None or target is None:
            unsafe.append({"registry": registry, "kind": kind, "reference": str(reference), "reason": error or "INVALID_PATH_VALUE"})
            return None
        if not target.is_file():
            missing.append({"registry": registry, "kind": kind, "reference": str(reference), "path": target.relative_to(okf_root.resolve()).as_posix()})
            return None
        resolved_reference_count += 1
        declared_files.add(target)
        return target

    for registry_name, registry in manifest["registries"].items():
        if not isinstance(registry_name, str) or not isinstance(registry, dict):
            unsafe.append({"registry": str(registry_name), "kind": "registry", "reference": str(registry), "reason": "INVALID_REGISTRY_ENTRY"})
            continue
        registry_path, error = _resolve_reference(okf_root, okf_root, registry.get("path"))
        if error is not None or registry_path is None:
            unsafe.append({"registry": registry_name, "kind": "directory", "reference": str(registry.get("path")), "reason": error or "INVALID_PATH_VALUE"})
            continue
        registry_directories[registry_name] = registry_path
        if not registry_path.is_dir():
            missing_directories.append(registry_path.relative_to(okf_root.resolve()).as_posix())

        schema_refs = registry.get("schemas", [])
        if not isinstance(schema_refs, list):
            unsafe.append({"registry": registry_name, "kind": "schemas", "reference": str(schema_refs), "reason": "SCHEMAS_NOT_A_LIST"})
            schema_refs = []
        for reference in schema_refs:
            check_file(registry_name, "schema", reference, registry_path)

        if "schema_file" in registry:
            check_file(registry_name, "schema_file", registry["schema_file"], registry_path)

        schema_files = registry.get("schema_files", {})
        if not isinstance(schema_files, dict):
            unsafe.append({"registry": registry_name, "kind": "schema_files", "reference": str(schema_files), "reason": "SCHEMA_FILES_NOT_A_MAPPING"})
            schema_files = {}
        declared_schema_members: set[str] = set()
        for reference in schema_refs:
            member = reference if isinstance(reference, str) else reference.get("path", reference.get("file")) if isinstance(reference, dict) else None
            if isinstance(member, str):
                declared_schema_members.add(member)
        for member, schema_reference in schema_files.items():
            if not isinstance(member, str) or member not in declared_schema_members:
                unsafe.append({"registry": registry_name, "kind": "schema_files_member", "reference": str(member), "reason": "SCHEMA_MEMBER_NOT_DECLARED"})
                continue
            check_file(registry_name, "schema_file_for_member", schema_reference, registry_path)

        catalogs = registry.get("candidateCatalogs", [])
        if not isinstance(catalogs, list):
            unsafe.append({"registry": registry_name, "kind": "candidateCatalogs", "reference": str(catalogs), "reason": "CATALOGS_NOT_A_LIST"})
            catalogs = []
        for catalog in catalogs:
            if not isinstance(catalog, dict):
                unsafe.append({"registry": registry_name, "kind": "candidateCatalog", "reference": str(catalog), "reason": "INVALID_CATALOG_ENTRY"})
                continue
            catalog_path = check_file(registry_name, "candidateCatalog", catalog.get("path"), okf_root)
            if catalog.get("schema") is not None:
                schema_base = catalog_path.parent if catalog_path is not None else okf_root
                check_file(registry_name, "candidateCatalogSchema", catalog["schema"], schema_base)

    additional: set[str] = set()
    registry_roots = [directory.resolve() for directory in registry_directories.values()]
    for registry_path in registry_directories.values():
        if not registry_path.is_dir():
            continue
        for candidate in registry_path.rglob("*"):
            if candidate.is_file() and candidate.suffix.lower() in STRUCTURED_SUFFIXES and candidate not in declared_files:
                additional.add(candidate.relative_to(okf_root.resolve()).as_posix())

    unregistered: set[str] = set()
    for candidate in okf_root.rglob("*"):
        if not candidate.is_file() or candidate.suffix.lower() not in STRUCTURED_SUFFIXES:
            continue
        relative = candidate.relative_to(okf_root.resolve())
        if relative.parts[0] in {"docs", "schemas"} or relative.as_posix() == "manifest.yaml" or candidate.name.endswith(".schema.json"):
            continue
        if candidate.resolve() in declared_files:
            continue
        if not any(candidate.resolve().is_relative_to(directory) for directory in registry_roots):
            unregistered.add(relative.as_posix())

    has_drift = bool(missing or unsafe or missing_directories or unregistered)
    return {
        **base_result,
        "status": "OKF_MANIFEST_REFERENCES_STALE" if has_drift else "OKF_MANIFEST_REFERENCES_PROVEN",
        "registryCount": len(manifest["registries"]),
        "declaredReferenceCount": declared_reference_count,
        "resolvedReferenceCount": resolved_reference_count,
        "missingReferences": missing,
        "unsafeReferences": unsafe,
        "missingRegistryDirectories": sorted(set(missing_directories)),
        "additionalStructuredFiles": sorted(additional),
        "unregisteredStructuredFiles": sorted(unregistered),
    }


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--root", type=Path, default=Path(__file__).resolve().parents[2])
    args = parser.parse_args()
    result = audit_okf_manifest(args.root)
    print(json.dumps(result, indent=2, sort_keys=True))
    return 0 if result["status"] == "OKF_MANIFEST_REFERENCES_PROVEN" else 2


if __name__ == "__main__":
    raise SystemExit(main())
