#!/usr/bin/env python3
"""
Maintained CLI for Phase 94 task surfaces.

This replaces the removed one-off backend registry/query scripts by wrapping
the live services that still exist in the repo today:
- Redis cached Phase 89/94 error data
- FastMCP HTTP discovery endpoints
- Local file analysis / offline-safe recommendations
"""

from __future__ import annotations

import argparse
import asyncio
import json
import os
import re
import sys
from collections import Counter
from pathlib import Path
from typing import Any, Iterable, Optional

try:
    import httpx
except ImportError:
    httpx = None

try:
    import psycopg2
except ImportError:
    psycopg2 = None

try:
    import redis.asyncio as aioredis
except ImportError:
    aioredis = None

try:
    from qdrant_client import QdrantClient
except ImportError:
    QdrantClient = None


SCRIPT_DIR = Path(__file__).resolve().parent
WORKSPACE_ROOT = SCRIPT_DIR.parent.parent
FRONTEND_ROOT = SCRIPT_DIR.parent

DEFAULT_REDIS_URL = os.getenv("REDIS_URL", "redis://localhost:6379/0")
DEFAULT_QDRANT_URL = os.getenv("QDRANT_URL", "http://localhost:6333")
DEFAULT_OLLAMA_URL = os.getenv("OLLAMA_URL", "http://localhost:11434")
DEFAULT_POSTGRES_DSN = os.getenv("POSTGRES_DSN", "postgresql://user:pass@localhost:5434/legal")
DEFAULT_LLM_MODEL = os.getenv("LLM_MODEL", "gemma3-legal:latest")
DEFAULT_ERROR_KEY_PATTERN = os.getenv("PHASE94_REDIS_ERROR_PATTERN", "phase89:error:*")
DEFAULT_ERROR_COLLECTION = os.getenv("PHASE94_ERROR_COLLECTION", "phase89_error_chunks")
DEFAULT_FASTMCP_BASES = [
    os.getenv("PHASE94_FASTMCP_URL"),
    os.getenv("FASTMCP_URL"),
    "http://localhost:8090",
    "http://localhost:3003",
    "http://localhost:3002",
    "http://localhost:3007",
]

COMMON_WORDS = {
    "type",
    "types",
    "error",
    "errors",
    "argument",
    "module",
    "cannot",
    "corresponding",
    "declarations",
    "property",
    "assignable",
    "does",
    "exist",
    "name",
    "file",
    "line",
}


def normalize_path(path: str) -> str:
    return path.replace("\\", "/")


def resolve_workspace_path(path_str: str) -> Path:
    candidate = Path(path_str)
    if candidate.is_absolute():
        return candidate

    workspace_candidate = (WORKSPACE_ROOT / candidate).resolve()
    if workspace_candidate.exists():
        return workspace_candidate

    frontend_candidate = (FRONTEND_ROOT / candidate).resolve()
    if frontend_candidate.exists():
        return frontend_candidate

    return workspace_candidate


def detect_file_role(path: Path) -> str:
    normalized = normalize_path(str(path))
    name = path.name

    if "/src/routes/api/" in normalized and name.startswith("+"):
        return "api_route"
    if "/src/routes/" in normalized and name.startswith("+page"):
        return "page_route"
    if path.suffix == ".svelte":
        return "component"
    if "/scripts/" in normalized:
        return "script"
    return "module"


def tokenize_error_type(error_type: str) -> list[str]:
    tokens = [token for token in re.split(r"[^a-z0-9]+", error_type.lower()) if token]
    return [token for token in tokens if len(token) >= 4 and token not in COMMON_WORDS]


def emit(result: dict[str, Any], json_only: bool) -> None:
    text = json.dumps(result, indent=2)
    print(text)


async def open_redis() -> tuple[Any, Optional[str]]:
    if aioredis is None:
        return None, "redis package not installed"

    try:
        client = aioredis.from_url(DEFAULT_REDIS_URL, decode_responses=True)
        await client.ping()
        return client, None
    except Exception as exc:
        return None, str(exc)


async def close_redis(client: Any) -> None:
    if client is None:
        return
    if hasattr(client, "aclose"):
        await client.aclose()
        return
    close_result = client.close()
    if asyncio.iscoroutine(close_result):
        await close_result


def qdrant_collection_stats() -> dict[str, Any]:
    if QdrantClient is None:
        return {"reachable": False, "error": "qdrant-client package not installed"}

    try:
        client = QdrantClient(url=DEFAULT_QDRANT_URL)
        info = client.get_collection(DEFAULT_ERROR_COLLECTION)
        return {
            "reachable": True,
            "collection": DEFAULT_ERROR_COLLECTION,
            "points": info.points_count,
        }
    except Exception as exc:
        return {"reachable": False, "collection": DEFAULT_ERROR_COLLECTION, "error": str(exc)}


async def fetch_json(url: str) -> dict[str, Any] | list[Any]:
    if httpx is None:
        raise RuntimeError("httpx package not installed")

    async with httpx.AsyncClient(timeout=5.0) as client:
        response = await client.get(url)
        response.raise_for_status()
        return response.json()


def fastmcp_tool_urls() -> list[str]:
    urls: list[str] = []
    seen: set[str] = set()

    for raw_base in DEFAULT_FASTMCP_BASES:
        if not raw_base:
            continue

        base = raw_base.rstrip("/")
        if base.endswith("/mcp/tools") or base.endswith("/tools"):
            candidates = [base]
        else:
            candidates = [f"{base}/mcp/tools", f"{base}/tools"]

        for candidate in candidates:
            if candidate not in seen:
                seen.add(candidate)
                urls.append(candidate)

    return urls


def fastmcp_health_urls() -> list[str]:
    urls: list[str] = []
    seen: set[str] = set()

    for raw_base in DEFAULT_FASTMCP_BASES:
        if not raw_base:
            continue

        base = raw_base.rstrip("/")
        if base.endswith("/mcp/tools"):
            base = base[: -len("/mcp/tools")]
        elif base.endswith("/tools"):
            base = base[: -len("/tools")]

        candidate = f"{base}/health"
        if candidate not in seen:
            seen.add(candidate)
            urls.append(candidate)

    return urls


def normalize_tools_payload(payload: Any) -> list[dict[str, Any]]:
    if isinstance(payload, dict):
        tools = payload.get("tools", payload)
        if isinstance(tools, dict):
            normalized = []
            for name, value in tools.items():
                if isinstance(value, dict):
                    normalized.append({"name": name, **value})
                else:
                    normalized.append({"name": name, "description": str(value)})
            return normalized
        if isinstance(tools, list):
            return [tool if isinstance(tool, dict) else {"name": str(tool)} for tool in tools]

    if isinstance(payload, list):
        return [tool if isinstance(tool, dict) else {"name": str(tool)} for tool in payload]

    return []


async def discover_fastmcp_tools() -> dict[str, Any]:
    failures = []

    for url in fastmcp_tool_urls():
        try:
            payload = await fetch_json(url)
            tools = normalize_tools_payload(payload)
            return {
                "reachable": True,
                "url": url,
                "toolCount": len(tools),
                "tools": tools,
            }
        except Exception as exc:
            failures.append({"url": url, "error": str(exc)})

    return {
        "reachable": False,
        "toolCount": 0,
        "tools": [],
        "failures": failures,
    }


async def discover_fastmcp_health() -> dict[str, Any]:
    failures = []

    for url in fastmcp_health_urls():
        try:
            payload = await fetch_json(url)
            return {
                "reachable": True,
                "url": url,
                "payload": payload,
            }
        except Exception as exc:
            failures.append({"url": url, "error": str(exc)})

    return {"reachable": False, "failures": failures}


async def redis_error_entries(limit: Optional[int] = None) -> list[tuple[str, dict[str, Any]]]:
    client, error = await open_redis()
    if client is None:
        raise RuntimeError(error or "Redis unavailable")

    entries: list[tuple[str, dict[str, Any]]] = []
    try:
        async for key in client.scan_iter(match=DEFAULT_ERROR_KEY_PATTERN):
            raw_value = await client.get(key)
            if not raw_value:
                continue
            try:
                parsed = json.loads(raw_value)
            except json.JSONDecodeError:
                continue
            entries.append((key, parsed))
            if limit is not None and len(entries) >= limit:
                break
    finally:
        await close_redis(client)

    return entries


async def file_cached_errors(abs_path: Path, limit: int = 10) -> list[dict[str, Any]]:
    normalized_abs = normalize_path(str(abs_path))
    basename = abs_path.name
    matches = []

    for key, payload in await redis_error_entries(limit=None):
        source_file = normalize_path(str(payload.get("file", "")))
        if source_file == normalized_abs or source_file.endswith(basename):
            matches.append({"key": key, **payload})
            if len(matches) >= limit:
                break

    return matches


def analyze_text_file(path: Path) -> dict[str, Any]:
    text = path.read_text(encoding="utf-8", errors="replace")
    lines = text.splitlines()

    imports = re.findall(r"^\s*import\s+.*?from\s+['\"]([^'\"]+)['\"]", text, re.MULTILINE)
    fetch_routes = re.findall(r"fetch\(\s*['\"](/api/[^'\"]+)['\"]", text)
    goto_routes = re.findall(r"goto\(\s*['\"]([^'\"]+)['\"]", text)
    endpoint_methods = re.findall(r"export const (GET|POST|PUT|PATCH|DELETE|OPTIONS)\b", text)
    rune_counts = {
        "$state": len(re.findall(r"\$state\(", text)),
        "$derived": len(re.findall(r"\$derived(?:\.by)?\(", text)),
        "$effect": len(re.findall(r"\$effect\(", text)),
        "$props": len(re.findall(r"\$props\(", text)),
    }

    warning_signals = []
    normalized_path = normalize_path(str(path))
    if "./$types" in text and "/src/routes/" in normalized_path:
        warning_signals.append("Generated SvelteKit route types depend on running svelte-kit sync before validation.")
    if fetch_routes and path.suffix == ".svelte":
        warning_signals.append("UI-side fetch calls should be checked for a reachable trigger path, not just route existence.")

    return {
        "path": normalized_path,
        "exists": True,
        "role": detect_file_role(path),
        "extension": path.suffix,
        "lineCount": len(lines),
        "importsCount": len(imports),
        "exportsCount": len(re.findall(r"^\s*export\s+", text, re.MULTILINE)),
        "functionLikeCount": len(re.findall(r"\bfunction\b|=>|^\s*async def\s+|^\s*def\s+", text, re.MULTILINE)),
        "fetchCount": len(fetch_routes),
        "apiRoutesReferenced": sorted(set(fetch_routes)),
        "gotoTargets": sorted(set(goto_routes)),
        "endpointMethods": sorted(set(endpoint_methods)),
        "runes": rune_counts,
        "importsPreview": imports[:10],
        "warningSignals": warning_signals,
    }


def fallback_actions_for_error(error_type: str, file_analysis: Optional[dict[str, Any]]) -> list[str]:
    lowered = error_type.lower()
    actions: list[str] = []

    if "./$types" in lowered:
        actions.append("Run `svelte-kit sync` before `svelte-check`; generated route types are required for `./$types` imports.")
        actions.append("Keep the file under `src/routes/**` and make sure the frontend tsconfig extends `./.svelte-kit/tsconfig.json`.")

    if "cannot find module" in lowered:
        actions.append("Verify the import path and extension. In SvelteKit TypeScript, many source imports intentionally use `.js` specifiers that resolve to `.ts` files.")

    if "cannot find name" in lowered or "ts2304" in lowered:
        actions.append("Check for a missing import, missing generated global, or a file that moved without its symbol references being updated.")

    if "not assignable" in lowered or "argument of type" in lowered:
        actions.append("Re-check the exact data contract at the call site. These errors usually mean a payload shape or callback signature drifted from the current interface.")

    if "property" in lowered and "does not exist" in lowered:
        actions.append("Treat this as a contract mismatch first: compare the actual loader/API payload to the consuming component shape before adding type assertions.")

    if "object literal" in lowered and "known properties" in lowered:
        actions.append("Remove stale object keys or update the interface/schema. Do not widen the type until the canonical payload is confirmed.")

    if "no overload matches" in lowered:
        actions.append("Check whether the library API changed. Compare the current call against the installed version’s accepted parameter shapes.")

    if "sveltehtml" in lowered:
        actions.append("This usually points to missing/generated Svelte typing context. Rebuild generated types and verify the file is being checked with the SvelteKit tsconfig.")

    if file_analysis and file_analysis.get("apiRoutesReferenced"):
        actions.append("Verify each referenced `/api/...` route exists and that a real UI/lifecycle trigger can actually reach the fetch path.")

    if file_analysis and file_analysis.get("role") == "api_route":
        actions.append("For route handlers, prefer fixing the root generated-type/import issue over suppressing the `RequestHandler` type or removing `./$types`.")

    if not actions:
        actions.append("Start by comparing the failing symbol or payload shape against the current source of truth, then validate after a clean `svelte-kit sync` + `svelte-check` pass.")

    deduped: list[str] = []
    seen: set[str] = set()
    for action in actions:
        if action not in seen:
            seen.add(action)
            deduped.append(action)
    return deduped


async def maybe_ollama_recommendation(prompt: str) -> Optional[str]:
    if httpx is None:
        return None

    try:
        async with httpx.AsyncClient(timeout=20.0) as client:
            health = await client.get(f"{DEFAULT_OLLAMA_URL}/api/tags")
            if health.status_code != 200:
                return None

            response = await client.post(
                f"{DEFAULT_OLLAMA_URL}/api/generate",
                json={
                    "model": DEFAULT_LLM_MODEL,
                    "prompt": prompt,
                    "stream": False,
                    "options": {"temperature": 0.2, "top_p": 0.9},
                },
            )
            response.raise_for_status()
            return response.json().get("response")
    except Exception:
        return None


async def command_health(args: argparse.Namespace) -> int:
    redis_client, redis_error = await open_redis()
    if redis_client is not None:
        await close_redis(redis_client)

    fastmcp_health = await discover_fastmcp_health()

    ollama_status = {"reachable": False}
    if httpx is not None:
        try:
            async with httpx.AsyncClient(timeout=3.0) as client:
                response = await client.get(f"{DEFAULT_OLLAMA_URL}/api/tags")
                response.raise_for_status()
                models = [model.get("name") for model in response.json().get("models", [])]
                ollama_status = {"reachable": True, "models": models[:5]}
        except Exception as exc:
            ollama_status = {"reachable": False, "error": str(exc)}
    else:
        ollama_status = {"reachable": False, "error": "httpx package not installed"}

    if psycopg2 is not None:
        try:
            conn = psycopg2.connect(DEFAULT_POSTGRES_DSN)
            conn.close()
            postgres_status = {"reachable": True}
        except Exception as exc:
            postgres_status = {"reachable": False, "error": str(exc)}
    else:
        postgres_status = {"reachable": False, "error": "psycopg2 not installed"}

    result = {
        "command": "health",
        "services": {
            "ollama": ollama_status,
            "redis": {"reachable": redis_error is None, "error": redis_error},
            "qdrant": qdrant_collection_stats(),
            "postgres": postgres_status,
            "fastmcp": fastmcp_health,
        },
    }
    emit(result, args.json)
    return 0


async def command_redis_stats(args: argparse.Namespace) -> int:
    try:
        entries = await redis_error_entries(limit=None)
    except Exception as exc:
        emit({"command": "redis-stats", "reachable": False, "error": str(exc)}, args.json)
        return 1

    cluster_counts = Counter()
    files = Counter()
    for _, payload in entries:
        cluster_counts[str(payload.get("cluster_id", "unknown"))] += 1
        source_file = payload.get("file")
        if source_file:
            files[source_file] += 1

    result = {
        "command": "redis-stats",
        "reachable": True,
        "redisUrl": DEFAULT_REDIS_URL,
        "errorKeys": len(entries),
        "clusterCounts": dict(cluster_counts.most_common(10)),
        "topFiles": [{"file": file_name, "count": count} for file_name, count in files.most_common(10)],
        "qdrant": qdrant_collection_stats(),
    }
    emit(result, args.json)
    return 0


async def command_query_cluster(args: argparse.Namespace) -> int:
    try:
        entries = await redis_error_entries(limit=None)
    except Exception as exc:
        emit({"command": "query-cluster", "reachable": False, "error": str(exc)}, args.json)
        return 1

    cluster_id = str(args.cluster)
    matches = []
    for key, payload in entries:
        if str(payload.get("cluster_id")) != cluster_id:
            continue
        matches.append({"key": key, **payload})
        if len(matches) >= args.limit:
            break

    result = {
        "command": "query-cluster",
        "cluster": cluster_id,
        "count": len(matches),
        "errors": matches,
    }
    emit(result, args.json)
    return 0


async def command_list_tools(args: argparse.Namespace) -> int:
    result = await discover_fastmcp_tools()
    result["command"] = "list-tools"
    emit(result, args.json)
    return 0 if result.get("reachable") else 1


async def command_analyze_file(args: argparse.Namespace) -> int:
    path = resolve_workspace_path(args.file)
    if not path.exists():
        emit({"command": "analyze-file", "file": {"path": normalize_path(str(path)), "exists": False}}, args.json)
        return 1

    analysis = analyze_text_file(path)
    analysis["cachedErrors"] = await file_cached_errors(path, limit=10)
    emit({"command": "analyze-file", "file": analysis}, args.json)
    return 0


async def command_recommend(args: argparse.Namespace) -> int:
    analysis = None
    if args.file:
        path = resolve_workspace_path(args.file)
        if path.exists():
            analysis = analyze_text_file(path)
            analysis["cachedErrors"] = await file_cached_errors(path, limit=5)

    try:
        entries = await redis_error_entries(limit=None)
        error_tokens = tokenize_error_type(args.error_type)
        matching_errors = []
        for key, payload in entries:
            haystack = " ".join(
                [
                    payload.get("message", ""),
                    payload.get("file", ""),
                    " ".join(payload.get("tags", [])),
                ]
            ).lower()
            if args.error_type.lower() in haystack or any(token in haystack for token in error_tokens):
                matching_errors.append({"key": key, **payload})
            if len(matching_errors) >= 5:
                break
    except Exception:
        matching_errors = []

    actions = fallback_actions_for_error(args.error_type, analysis)
    prompt = json.dumps(
        {
            "language": args.language,
            "error_type": args.error_type,
            "context": args.context,
            "file_analysis": analysis,
            "matching_errors": matching_errors,
            "instructions": "Return 3-5 concise corrective actions for the current codebase.",
        },
        indent=2,
    )
    llm_recommendation = await maybe_ollama_recommendation(prompt)

    result = {
        "command": "recommend",
        "mode": "heuristic+ollama" if llm_recommendation else "heuristic",
        "language": args.language,
        "errorType": args.error_type,
        "context": args.context,
        "actions": actions,
        "matchingErrors": matching_errors,
        "file": analysis,
    }
    if llm_recommendation:
        result["llmRecommendation"] = llm_recommendation.strip()

    emit(result, args.json)
    return 0


def add_json_flag(parser: argparse.ArgumentParser) -> None:
    parser.add_argument("--json", action="store_true", help="Output machine-readable JSON")


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(description="Phase 94 maintained task CLI")
    subparsers = parser.add_subparsers(dest="command", required=True)

    health = subparsers.add_parser("health", help="Show live Phase 94 service health")
    add_json_flag(health)
    health.set_defaults(func=command_health)

    redis_stats = subparsers.add_parser("redis-stats", help="Summarize Redis-backed error cache state")
    add_json_flag(redis_stats)
    redis_stats.set_defaults(func=command_redis_stats)

    query_cluster = subparsers.add_parser("query-cluster", help="Show cached errors for one cluster id")
    query_cluster.add_argument("--cluster", required=True, help="Cluster id to inspect")
    query_cluster.add_argument("--limit", type=int, default=25, help="Maximum cached errors to print")
    add_json_flag(query_cluster)
    query_cluster.set_defaults(func=command_query_cluster)

    list_tools = subparsers.add_parser("list-tools", help="List live FastMCP tools from reachable HTTP endpoints")
    add_json_flag(list_tools)
    list_tools.set_defaults(func=command_list_tools)

    analyze_file = subparsers.add_parser("analyze-file", help="Analyze a file using local, offline-safe heuristics")
    analyze_file.add_argument("--file", required=True, help="Workspace-relative or absolute file path")
    add_json_flag(analyze_file)
    analyze_file.set_defaults(func=command_analyze_file)

    recommend = subparsers.add_parser("recommend", help="Suggest fix actions using heuristics, cache context, and Ollama when available")
    recommend.add_argument("--language", default="typescript", help="Primary language of the failing file")
    recommend.add_argument("--error-type", required=True, help="The error type or message to reason about")
    recommend.add_argument("--context", default="", help="Short human-readable context, such as the file basename")
    recommend.add_argument("--file", help="Workspace-relative or absolute file path for deeper context")
    add_json_flag(recommend)
    recommend.set_defaults(func=command_recommend)

    return parser


async def async_main(argv: list[str]) -> int:
    parser = build_parser()
    args = parser.parse_args(argv)
    return await args.func(args)


def main(argv: list[str]) -> int:
    try:
        return asyncio.run(async_main(argv))
    except KeyboardInterrupt:
        return 130


if __name__ == "__main__":
    raise SystemExit(main(sys.argv[1:]))