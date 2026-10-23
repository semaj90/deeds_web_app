"""Read-only validation for Parent Atlas language syntax profiles."""

from __future__ import annotations

import argparse
import hashlib
import json
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

import yaml
from jsonschema import Draft202012Validator
from yaml.constructor import ConstructorError


class _UniqueKeyLoader(yaml.SafeLoader):
    def construct_mapping(self, node: yaml.MappingNode, deep: bool = False) -> dict[Any, Any]:
        self.flatten_mapping(node)
        mapping: dict[Any, Any] = {}
        for key_node, value_node in node.value:
            key = self.construct_object(key_node, deep=deep)
            if key in mapping:
                raise ConstructorError(
                    "while constructing a mapping",
                    node.start_mark,
                    f"LANGUAGE_PROFILE_DUPLICATE_KEY: {key!r}",
                    key_node.start_mark,
                )
            mapping[key] = self.construct_object(value_node, deep=deep)
        return mapping


def parse_profile(text: str) -> dict[str, Any]:
    try:
        value = yaml.load(text, Loader=_UniqueKeyLoader)
    except ConstructorError as exc:
        if "LANGUAGE_PROFILE_DUPLICATE_KEY" in str(exc):
            raise ValueError("LANGUAGE_PROFILE_DUPLICATE_KEY") from exc
        raise ValueError("LANGUAGE_PROFILE_YAML_INVALID") from exc
    except yaml.YAMLError as exc:
        raise ValueError("LANGUAGE_PROFILE_YAML_INVALID") from exc
    if not isinstance(value, dict):
        raise ValueError("LANGUAGE_PROFILE_ROOT_MUST_BE_OBJECT")
    return value


def validate_profile(profile: dict[str, Any], schema: dict[str, Any]) -> list[str]:
    Draft202012Validator.check_schema(schema)
    validator = Draft202012Validator(schema)
    errors = sorted(validator.iter_errors(profile), key=lambda error: (list(error.absolute_path), error.message))
    return [
        f"/{'/'.join(str(part) for part in error.absolute_path)}: {error.message}"
        for error in errors
    ]


def validate_profile_directory(
    profile_dir: Path,
    schema_path: Path,
    profile_names: list[str] | None = None,
) -> dict[str, Any]:
    schema_bytes = schema_path.read_bytes()
    schema = json.loads(schema_bytes)
    Draft202012Validator.check_schema(schema)
    profiles = []
    errors = []
    input_hashes = []
    profile_paths = (
        [profile_dir / name for name in profile_names]
        if profile_names is not None
        else list(profile_dir.glob("*.yaml"))
    )
    for path in sorted(profile_paths, key=lambda item: item.name.casefold()):
        profile_bytes = path.read_bytes()
        input_hashes.append({"path": path.as_posix(), "sha256": hashlib.sha256(profile_bytes).hexdigest()})
        try:
            profile = parse_profile(profile_bytes.decode("utf-8"))
            profile_errors = validate_profile(profile, schema)
        except ValueError as exc:
            profile = {}
            profile_errors = [str(exc)]
        profiles.append(
            {
                "path": path.as_posix(),
                "sha256": hashlib.sha256(profile_bytes).hexdigest(),
                "language": profile.get("language"),
                "symbolKindCount": len(profile.get("symbol_kinds", {})) if isinstance(profile.get("symbol_kinds"), dict) else 0,
                "featureRuleCount": len(profile.get("features", {})) if isinstance(profile.get("features"), dict) else 0,
                "valid": not profile_errors,
                "errors": profile_errors,
            }
        )
        errors.extend({"path": path.as_posix(), "error": error} for error in profile_errors)
    schema_sha256 = hashlib.sha256(schema_bytes).hexdigest()
    snapshot = {
        "schemaSha256": schema_sha256,
        "profiles": input_hashes,
    }
    snapshot_sha256 = hashlib.sha256(
        json.dumps(snapshot, ensure_ascii=False, sort_keys=True, separators=(",", ":")).encode("utf-8")
    ).hexdigest()
    return {
        "schema": "atlas.language-profile-validation-receipt.v1",
        "createdAtUtc": datetime.now(timezone.utc).isoformat().replace("+00:00", "Z"),
        "schemaSha256": schema_sha256,
        "snapshotSha256": snapshot_sha256,
        "profileCount": len(profiles),
        "validCount": sum(profile["valid"] for profile in profiles),
        "errorCount": len(errors),
        "profiles": profiles,
        "errors": errors,
        "canonicalAuthority": False,
        "canonicalDataWritesPerformed": False,
        "serviceCallsPerformed": False,
    }


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--profile-dir", type=Path, required=True)
    parser.add_argument("--schema", type=Path, required=True)
    parser.add_argument("--manifest", type=Path)
    parser.add_argument("--output", type=Path)
    args = parser.parse_args()
    profile_names = None
    if args.manifest:
        manifest = parse_profile(args.manifest.read_text(encoding="utf-8"))
        profile_names = manifest["registries"]["languages"]["schemas"]
    result = validate_profile_directory(args.profile_dir, args.schema, profile_names)
    result["reportPath"] = args.output.as_posix() if args.output else None
    result["reportWritten"] = args.output is not None
    rendered = json.dumps(result, ensure_ascii=False, sort_keys=True, indent=2) + "\n"
    if args.output:
        args.output.parent.mkdir(parents=True, exist_ok=True)
        args.output.write_text(rendered, encoding="utf-8")
    print(rendered, end="")
    return 0 if result["errorCount"] == 0 and result["profileCount"] > 0 else 1


if __name__ == "__main__":
    raise SystemExit(main())
