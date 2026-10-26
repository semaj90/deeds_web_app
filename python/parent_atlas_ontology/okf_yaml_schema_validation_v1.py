"""Read-only YAML and JSON Schema validation for Parent Atlas OKF documents."""

from __future__ import annotations

import hashlib
import json
from pathlib import Path
from typing import Any

import yaml
from jsonschema import Draft202012Validator
from jsonschema.exceptions import SchemaError
from yaml.constructor import ConstructorError


class UniqueKeyLoader(yaml.SafeLoader):
    def construct_mapping(self, node: yaml.MappingNode, deep: bool = False) -> dict[Any, Any]:
        self.flatten_mapping(node)
        mapping: dict[Any, Any] = {}
        for key_node, value_node in node.value:
            key = self.construct_object(key_node, deep=deep)
            if key in mapping:
                raise ConstructorError(
                    "while constructing a mapping",
                    node.start_mark,
                    f"OKF_YAML_DUPLICATE_KEY: {key!r}",
                    key_node.start_mark,
                )
            mapping[key] = self.construct_object(value_node, deep=deep)
        return mapping


def parse_yaml_document(document_bytes: bytes) -> dict[str, Any]:
    try:
        text = document_bytes.decode("utf-8")
    except UnicodeDecodeError as exc:
        raise ValueError("OKF_YAML_UTF8_INVALID") from exc
    try:
        document = yaml.load(text, Loader=UniqueKeyLoader)
    except ConstructorError as exc:
        if "OKF_YAML_DUPLICATE_KEY" in str(exc):
            raise ValueError("OKF_YAML_DUPLICATE_KEY") from exc
        raise ValueError("OKF_YAML_INVALID") from exc
    except yaml.YAMLError as exc:
        raise ValueError("OKF_YAML_INVALID") from exc
    if not isinstance(document, dict):
        raise ValueError("OKF_YAML_ROOT_MUST_BE_OBJECT")
    return document


def validate_yaml_document(document_bytes: bytes, schema_bytes: bytes) -> dict[str, Any]:
    document_hash = hashlib.sha256(document_bytes).hexdigest()
    schema_hash = hashlib.sha256(schema_bytes).hexdigest()
    try:
        schema = json.loads(schema_bytes.decode("utf-8"))
        Draft202012Validator.check_schema(schema)
    except (UnicodeDecodeError, json.JSONDecodeError, SchemaError, ValueError):
        return {
            "status": "REJECTED",
            "reason": "OKF_JSON_SCHEMA_INVALID",
            "documentSha256": document_hash,
            "schemaSha256": schema_hash,
            "errors": [],
            "canonicalAuthority": False,
            "writesPerformed": False,
        }
    try:
        document = parse_yaml_document(document_bytes)
    except ValueError as exc:
        return {
            "status": "REJECTED",
            "reason": str(exc),
            "documentSha256": document_hash,
            "schemaSha256": schema_hash,
            "errors": [],
            "canonicalAuthority": False,
            "writesPerformed": False,
        }
    validator = Draft202012Validator(schema)
    errors = sorted(
        validator.iter_errors(document),
        key=lambda error: (list(error.absolute_path), error.message),
    )
    return {
        "status": "VALID" if not errors else "REJECTED",
        "reason": None if not errors else "OKF_SCHEMA_VALIDATION_FAILED",
        "documentSha256": document_hash,
        "schemaSha256": schema_hash,
        "errors": [
            f"/{'/'.join(str(part) for part in error.absolute_path)}: {error.message}"
            for error in errors
        ],
        "canonicalAuthority": False,
        "writesPerformed": False,
    }


def validate_paths(document_path: Path, schema_path: Path) -> dict[str, Any]:
    document_bytes = document_path.read_bytes()
    schema_bytes = schema_path.read_bytes()
    result = validate_yaml_document(document_bytes, schema_bytes)
    result["schema"] = "atlas.okf-yaml-schema-validation-receipt.v1"
    result["documentPath"] = document_path.as_posix()
    result["schemaPath"] = schema_path.as_posix()
    return result
