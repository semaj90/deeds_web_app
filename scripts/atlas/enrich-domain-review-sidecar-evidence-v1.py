from __future__ import annotations

import argparse
import hashlib
import json
import sys
import urllib.error
import urllib.request
from collections import Counter
from pathlib import Path
from typing import Any


ROOT = Path(__file__).resolve().parents[2]
DEFAULT_INPUT = ROOT / "docs/reports/domain-calibration-gold-v2.jsonl"
DEFAULT_OUTPUT = ROOT / "docs/reports/domain-calibration-gold-v2-sidecar-evidence-v1.jsonl"
MAX_SOURCE_BYTES = 1_000_000
LANGUAGE_BY_SUFFIX = {
    ".bash": "bash", ".c": "c", ".cc": "cpp", ".cjs": "javascript",
    ".cmake": "cmake", ".comp": "glsl", ".cpp": "cpp", ".cts": "typescript",
    ".cu": "cpp", ".cxx": "cpp", ".glsl": "glsl", ".go": "go",
    ".hh": "cpp", ".hpp": "cpp", ".java": "java", ".js": "javascript",
    ".jsx": "javascript", ".lua": "lua", ".mjs": "javascript", ".mts": "typescript",
    ".ps1": "powershell", ".psd1": "powershell", ".psm1": "powershell",
    ".py": "python", ".pyi": "python", ".rs": "rust", ".sh": "bash",
    ".sql": "sql", ".svelte": "svelte", ".toml": "toml", ".ts": "typescript",
    ".tsx": "tsx", ".yaml": "yaml", ".yml": "yaml",
}
LEXICAL_SUFFIXES = {".csv", ".json", ".jsonl", ".log", ".markdown", ".md", ".ndjson", ".rst", ".toml", ".txt"}


def sha256(data: bytes) -> str:
    return "sha256:" + hashlib.sha256(data).hexdigest()


def request_json(url: str, payload: dict[str, Any] | None, timeout: float) -> dict[str, Any]:
    data = None if payload is None else json.dumps(payload, ensure_ascii=False).encode("utf-8")
    req = urllib.request.Request(
        url,
        data=data,
        headers={"Content-Type": "application/json"} if data is not None else {},
        method="POST" if data is not None else "GET",
    )
    with urllib.request.urlopen(req, timeout=timeout) as response:
        return json.loads(response.read().decode("utf-8"))


def safe_source_path(source_ref: str) -> Path | None:
    candidate = (ROOT / source_ref.replace("\\", "/")).resolve()
    try:
        candidate.relative_to(ROOT.resolve())
    except ValueError:
        return None
    return candidate


def analyze_row(row: dict[str, Any], base_url: str, health: dict[str, Any], timeout: float) -> dict[str, Any]:
    source_ref = str(row.get("sourceRef") or "")
    result: dict[str, Any] = {
        "schema": "atlas.domain-review-sidecar-evidence.v1",
        "packetKey": row.get("packetKey"),
        "sourceRef": source_ref,
        "status": "NOT_ANALYZED",
        "canonicalAuthority": False,
        "writesPerformed": False,
    }
    path = safe_source_path(source_ref)
    if path is None:
        result.update(status="SOURCE_PATH_OUTSIDE_REPO")
        return result
    if not path.is_file():
        result.update(status="SOURCE_FILE_MISSING")
        return result
    ast_language = LANGUAGE_BY_SUFFIX.get(path.suffix.lower())
    use_lexical = ast_language is None and path.suffix.lower() in LEXICAL_SUFFIXES
    if ast_language is None and not use_lexical:
        result.update(status="UNSUPPORTED_ANALYSIS_TYPE")
        return result
    try:
        source_bytes = path.read_bytes()
    except OSError as exc:
        result.update(status="SOURCE_READ_FAILED", diagnostic=type(exc).__name__)
        return result
    if len(source_bytes) > MAX_SOURCE_BYTES:
        result.update(status="SOURCE_TOO_LARGE")
        return result
    try:
        source = source_bytes.decode("utf-8", errors="strict")
    except UnicodeDecodeError:
        result.update(status="SOURCE_BINARY_OR_INVALID_UTF8")
        return result
    if not source_bytes:
        result.update(status="SOURCE_EMPTY")
        return result

    current_revision = sha256(source_bytes)
    endpoint = "analyze" if use_lexical else "ast/chunk"
    if use_lexical:
        if len(source) > 50_000:
            result.update(status="SOURCE_TOO_LARGE_FOR_LEXICAL_ANALYSIS", currentSourceRevision=current_revision)
            return result
        payload = {
            "text": source,
            "source_type": "docling_markdown" if path.suffix.lower() in {".md", ".markdown"} else "plain_text",
            "sourceRef": source_ref,
            "sourceRevision": current_revision,
            "document_id": "domain-review:" + str(row.get("packetKey") or current_revision[-16:]),
            "max_chars": max(1, len(source)),
            "passes": ["lexical"],
            "extraction_mode": "concepts",
            "grounded_extraction_required": False,
        }
    else:
        payload = {
            "source": source,
            "language": ast_language,
            "filePath": path.relative_to(ROOT).as_posix(),
            "sourceRef": source_ref,
            "sourceRevision": current_revision,
        }
    try:
        response = request_json(f"{base_url}/{endpoint}", payload, timeout)
    except urllib.error.HTTPError as exc:
        result.update(status="SIDECAR_REQUEST_FAILED", diagnostic="HTTP_STATUS_" + str(exc.code))
        return result
    except (urllib.error.URLError, TimeoutError, json.JSONDecodeError) as exc:
        result.update(status="SIDECAR_REQUEST_FAILED", diagnostic=type(exc).__name__)
        return result

    if use_lexical:
        pass_result = next((p for p in response.get("pass_results", []) if p.get("family") == "lexical"), None)
        pass_revision = (pass_result or {}).get("source_revision")
        artifacts = (pass_result or {}).get("artifacts", {})
        terms = artifacts.get("concepts", []) if isinstance(artifacts, dict) else []
        status = "LEXICAL_ANALYSIS_COMPLETE" if pass_result and pass_revision == current_revision else "LEXICAL_ANALYSIS_UNQUALIFIED"
        dataset_rev = row.get("sourceRevision")
        dataset_digest = row.get("bindingContentDigest")
        result.update({
            "status": status,
            "analysisKind": "LEXICAL",
            "currentSourceRevision": current_revision,
            "sidecarSourceRevisionEchoMatches": pass_revision == current_revision,
            "datasetBindingMatchesCurrentBytes": bool(
                dataset_rev and dataset_digest
                and str(dataset_rev).removeprefix("sha256:") == current_revision.removeprefix("sha256:")
                and str(dataset_digest).removeprefix("sha256:") == current_revision.removeprefix("sha256:")
            ),
            "engine": (pass_result or {}).get("backend"),
            "engineVersion": (pass_result or {}).get("backend_version"),
            "passName": (pass_result or {}).get("pass_name"),
            "passRevision": (pass_result or {}).get("pass_revision"),
            "lexicalTerms": [str(term)[:120] for term in terms[:50]],
            "sidecarModules": health.get("runtimeSourceBindings", {}).get("modules", {}),
            "canonicalAuthority": False,
            "writesPerformed": False,
        })
        return result

    response_revision = response.get("source_revision")
    chunks: list[dict[str, Any]] = []
    invalid_spans = 0
    for chunk in response.get("chunks", []):
        start, end = chunk.get("start_byte"), chunk.get("end_byte")
        if not isinstance(start, int) or not isinstance(end, int) or start < 0 or end < start or end > len(source_bytes):
            invalid_spans += 1
            continue
        try:
            excerpt = source_bytes[start:end].decode("utf-8", errors="strict")
        except UnicodeDecodeError:
            invalid_spans += 1
            continue
        if not excerpt:
            invalid_spans += 1
            continue
        chunks.append({
            "kind": chunk.get("kind"),
            "nodeType": chunk.get("node_type"),
            "name": chunk.get("name"),
            "startByte": start,
            "endByte": end,
            "startLine": chunk.get("start_line"),
            "endLine": chunk.get("end_line"),
            "excerpt": excerpt[:1200],
            "excerptSha256": sha256(source_bytes[start:end]),
            "imports": chunk.get("imports", [])[:30],
            "exports": chunk.get("exports", [])[:30],
            "calls": chunk.get("calls", [])[:50],
        })
    edge_counts = Counter(
        str(edge.get("type"))
        for edge in response.get("edges", [])
        if edge.get("type") in {"DEFINES", "IMPORTS", "EXPORTS", "CALLS", "REFERENCES"}
    )
    dataset_rev = row.get("sourceRevision")
    dataset_digest = row.get("bindingContentDigest")
    dataset_binding_matches = bool(
        dataset_rev and dataset_digest
        and str(dataset_rev).removeprefix("sha256:") == current_revision.removeprefix("sha256:")
        and str(dataset_digest).removeprefix("sha256:") == current_revision.removeprefix("sha256:")
    )
    status = "AST_ANALYSIS_COMPLETE" if response_revision == current_revision and not invalid_spans else "AST_ANALYSIS_UNQUALIFIED"
    result.update({
        "status": status,
        "currentSourceRevision": current_revision,
        "datasetBindingMatchesCurrentBytes": dataset_binding_matches,
        "sidecarSourceRevisionEchoMatches": response_revision == current_revision,
        "engine": response.get("engine"),
        "engineVersion": response.get("engine_version"),
        "language": response.get("language"),
        "syntaxStatus": response.get("syntax_status"),
        "scanCompleteness": response.get("scan_completeness"),
        "scanFailure": response.get("scan_failure"),
        "chunkCount": len(response.get("chunks", [])),
        "validatedChunkCount": len(chunks),
        "invalidSpanCount": invalid_spans,
        "chunks": chunks[:20],
        "edgeCounts": dict(sorted(edge_counts.items())),
        "diagnostics": response.get("diagnostics", [])[:10],
        "sidecarModules": health.get("runtimeSourceBindings", {}).get("modules", {}),
        "sidecarProcessStartedMonotonicNs": health.get("processStartedMonotonicNs"),
        "canonicalAuthority": False,
        "writesPerformed": False,
    })
    return result


def main() -> int:
    parser = argparse.ArgumentParser(description="Collect proposal-only 8095 AST/CST observations for domain-review rows.")
    parser.add_argument("--input", type=Path, default=DEFAULT_INPUT)
    parser.add_argument("--output", type=Path, default=DEFAULT_OUTPUT)
    parser.add_argument("--sidecar-url", default="http://127.0.0.1:8095")
    parser.add_argument("--timeout-seconds", type=float, default=20.0)
    args = parser.parse_args()
    if not args.input.is_file():
        print(json.dumps({"status": "INPUT_MISSING", "input": str(args.input)}), file=sys.stderr)
        return 2
    try:
        health = request_json(f"{args.sidecar_url.rstrip('/')}/health", None, args.timeout_seconds)
    except Exception as exc:
        print(json.dumps({"status": "SIDECAR_UNAVAILABLE", "diagnostic": type(exc).__name__}), file=sys.stderr)
        return 3
    if health.get("status") != "ok" or not health.get("capabilities", {}).get("tree_sitter"):
        print(json.dumps({"status": "SIDECAR_AST_NOT_READY"}), file=sys.stderr)
        return 4
    rows = [json.loads(line) for line in args.input.read_text(encoding="utf-8").splitlines() if line.strip()]
    records = [analyze_row(row, args.sidecar_url.rstrip("/"), health, args.timeout_seconds) for row in rows]
    args.output.parent.mkdir(parents=True, exist_ok=True)
    args.output.write_text(
        "".join(json.dumps(record, ensure_ascii=False) + "\n" for record in records),
        encoding="utf-8",
    )
    counts = Counter(record["status"] for record in records)
    receipt = {
        "schema": "atlas.domain-review-sidecar-evidence-receipt.v1",
        "input": args.input.resolve().relative_to(ROOT).as_posix(),
        "output": args.output.resolve().relative_to(ROOT).as_posix(),
        "rowCount": len(rows),
        "statusCounts": dict(sorted(counts.items())),
        "sidecarModules": health.get("runtimeSourceBindings", {}).get("modules", {}),
        "sidecarProcessStartedMonotonicNs": health.get("processStartedMonotonicNs"),
        "canonicalAuthority": False,
        "writesPerformed": False,
    }
    print(json.dumps(receipt, indent=2))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
