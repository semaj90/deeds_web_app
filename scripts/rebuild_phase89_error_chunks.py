#!/usr/bin/env python3
"""
Rebuild phase89_error_chunks Qdrant Collection
===============================================
Recreates the destroyed phase89_error_chunks collection from scratch by:

  1. Running svelte-check to harvest live errors from the codebase
  2. Querying Neo4j for G21-G25 Svelte 5 violation nodes + file-level metadata
  3. Merging svelte-check messages with Neo4j graph insights
  4. Embedding via embeddinggemma:latest (768-dim)
  5. GPU-accelerated k-means clustering (torch CUDA → CPU fallback)
  6. Upserting cluster centroids into Qdrant phase89_error_chunks with:
       - cluster_id, member_count, dominant error_type
       - summary (LLM-generated)
       - fix_hint mapped from KNOWN_FIXERS
       - neo4j_violations dict (files, counts per G21-G25 gate)

Usage:
    python scripts/rebuild_phase89_error_chunks.py [--dry-run] [--no-neo4j] [--max N]

Flags:
    --dry-run    Embed + cluster but skip Qdrant upsert
    --no-neo4j   Skip Neo4j query (no graph enrichment)
    --max N      Limit errors processed (default: all)
"""

import argparse
import base64
import hashlib
import json
import os
import re
import subprocess
import sys
import time
import urllib.request
import urllib.error
from collections import Counter, defaultdict
from pathlib import Path

try:
    from langchain_core.messages import HumanMessage, SystemMessage
    from langchain_ollama import ChatOllama
    LANGCHAIN_OLLAMA_AVAILABLE = True
except ImportError:
    LANGCHAIN_OLLAMA_AVAILABLE = False

# ── Config ────────────────────────────────────────────────────────────────────

WORKSPACE_ROOT = Path(__file__).resolve().parent.parent
FRONTEND_DIR = WORKSPACE_ROOT / "sveltekit-frontend"

QDRANT_URL  = os.getenv("QDRANT_URL",  "http://localhost:6333")
OLLAMA_URL  = os.getenv("OLLAMA_URL",  "http://localhost:11434")
NEO4J_URL   = os.getenv("NEO4J_HTTP",  "http://localhost:7474")
NEO4J_USER  = os.getenv("NEO4J_USER",  "neo4j")
NEO4J_PASS  = os.getenv("NEO4J_PASSWORD", "neo4j123")

EMBED_MODEL = os.getenv("EMBED_MODEL", "embeddinggemma:latest")
CHAT_MODEL  = os.getenv("LLM_MODEL",   "gemma4-legal:latest")
SUMMARY_MODEL = os.getenv("SUMMARY_MODEL", os.getenv("SVELTE5_MODEL", "gemma4-legal-fast:latest"))

QDRANT_COLLECTION = "phase89_error_chunks"
EMBED_DIM = 768
DEFAULT_PHASE78_FILE = FRONTEND_DIR / ".phase78-collection.json"

AUTO_DIAGNOSTIC_GLOBS = [
    ".phase78-collection.json",
    "svelte-check*.txt",
    "check_out*.txt",
    "check*.txt",
    "errors*.txt",
    "errors*.jsonl",
    "errors*.ndjson",
    "errors*.json",
]

# Maps dominant error keywords → KNOWN_FIXERS key + fix_hint
ERROR_TYPE_FIXERS: dict[str, tuple[str, str]] = {
    "export let":           ("fix-svelte5-events",    "Replace export let with $props() rune"),
    "on:click":             ("fix-svelte5-events",    "Replace on:click with onclick directive"),
    "on:submit":            ("fix-svelte5-events",    "Replace on:submit with onsubmit directive"),
    "on:change":            ("fix-svelte5-events",    "Replace on:change with onchange directive"),
    "createEventDispatcher":("fix-svelte5-all",       "Remove createEventDispatcher, use callback props"),
    "$:":                   ("fix-svelte5-all",       "Replace $: reactive declarations with $derived/$effect"),
    "import:":              ("fix-import-corruption", "Fix corrupted import: {x} from: 'y' syntax"),
    "from:":                ("fix-import-corruption", "Fix corrupted from: 'y' in import statement"),
    "import { x: x }":     ("phase74-import-fixer",  "Fix import { x: x } shorthand corruption"),
    "Declaration or statement expected": ("fix-colon-corruption", "Fix colon-as-separator corruption in TS files"),
    "Unexpected token":     ("fix-colon-corruption",  "Fix colon-as-separator corruption in TS files"),
    "Type '":               ("phase108-batch-fixer",  "Fix TypeScript type mismatch errors"),
    "Cannot find module":   ("phase108-batch-fixer",  "Fix missing module imports"),
    "Property '":           ("phase108-batch-fixer",  "Fix missing property / type narrowing"),
    "is not assignable":    ("phase108-batch-fixer",  "Fix type assignability errors"),
    "Object is possibly":   ("phase108-batch-fixer",  "Add null checks for possibly null/undefined"),
    "Expected":             ("phase108-batch-fixer",  "Fix argument count / signature mismatches"),
}

ERROR_SIGNATURE_RULES: list[dict[str, object]] = [
    {
        "label": "svelte props migration",
        "patterns": [r"\bexport let\b"],
        "fixer_key": "fix-svelte5-events",
        "fix_hint": "Replace export let with $props() rune",
    },
    {
        "label": "svelte event migration",
        "patterns": [r"\bon:(?:click|submit|change|input)\b"],
        "fixer_key": "fix-svelte5-events",
        "fix_hint": "Replace Svelte 4 event directives with DOM event props",
    },
    {
        "label": "legacy dispatcher migration",
        "patterns": [r"createEventDispatcher"],
        "fixer_key": "fix-svelte5-all",
        "fix_hint": "Remove createEventDispatcher and use callback props",
    },
    {
        "label": "legacy reactive statement",
        "patterns": [r"(^|\s)\$:(?=\s|$)", r"\$derived", r"\$effect"],
        "fixer_key": "fix-svelte5-all",
        "fix_hint": "Replace legacy reactive statements with $derived or $effect",
    },
    {
        "label": "corrupted import syntax",
        "patterns": [r"import:\s*\{", r"\bfrom:\s*['\"]"],
        "fixer_key": "fix-import-corruption",
        "fix_hint": "Repair corrupted import and from syntax",
    },
    {
        "label": "import shorthand corruption",
        "patterns": [r"import\s*\{\s*[^}]+:\s*[^}]+\s*\}"],
        "fixer_key": "phase74-import-fixer",
        "fix_hint": "Repair duplicated import shorthand aliases",
    },
    {
        "label": "statement syntax corruption",
        "patterns": [r"Declaration or statement expected"],
        "fixer_key": "fix-colon-corruption",
        "fix_hint": "Repair syntax corruption around declarations and separators",
    },
    {
        "label": "token syntax corruption",
        "patterns": [r"Unexpected token", r"',' expected", r"';' expected", r"'\)' expected", r"'}' expected", r"']' expected"],
        "fixer_key": "fix-colon-corruption",
        "fix_hint": "Repair syntax corruption around separators and punctuation",
    },
    {
        "label": "argument count mismatch",
        "patterns": [r"Expected \d+ arguments?, but got \d+", r"No overload matches this call"],
        "fixer_key": "phase108-batch-fixer",
        "fix_hint": "Fix argument count and call signature mismatches",
    },
    {
        "label": "module export mismatch",
        "patterns": [r"has no exported member", r"Cannot find module", r"Cannot find name"],
        "fixer_key": "phase108-batch-fixer",
        "fix_hint": "Fix module paths, exports, and imported symbol names",
    },
    {
        "label": "unknown object property",
        "patterns": [r"Object literal may only specify known properties"],
        "fixer_key": "phase108-batch-fixer",
        "fix_hint": "Fix object literals that include properties absent from the target type",
    },
    {
        "label": "missing property on type",
        "patterns": [r"Property '.+?' does not exist on type"],
        "fixer_key": "phase108-batch-fixer",
        "fix_hint": "Fix property access or update the target type definition",
    },
    {
        "label": "type assignability mismatch",
        "patterns": [r"is not assignable to type", r"incorrectly extends interface"],
        "fixer_key": "phase108-batch-fixer",
        "fix_hint": "Fix incompatible TypeScript assignments and interface shapes",
    },
    {
        "label": "nullability guard needed",
        "patterns": [r"Object is possibly", r"possibly 'null'", r"possibly 'undefined'"],
        "fixer_key": "phase108-batch-fixer",
        "fix_hint": "Add null or undefined guards before access",
    },
    {
        "label": "duplicate declaration",
        "patterns": [r"Cannot redeclare block-scoped variable", r"has already been declared"],
        "fixer_key": "phase108-batch-fixer",
        "fix_hint": "Remove duplicate declarations or rename conflicting symbols",
    },
]

# ── Args ──────────────────────────────────────────────────────────────────────

parser = argparse.ArgumentParser(description="Rebuild phase89_error_chunks Qdrant collection")
parser.add_argument("--dry-run",   action="store_true", help="Skip Qdrant upsert")
parser.add_argument("--no-neo4j", action="store_true", help="Skip Neo4j graph enrichment")
parser.add_argument("--max",      type=int, default=None, help="Max errors to embed")
parser.add_argument("--diagnostics-file", type=str, default=None,
                    help="Path to saved diagnostics (.phase78-collection.json, JSONL, or svelte-check text)")
parser.add_argument("--no-llm",   action="store_true", help="Skip LLM summaries (use deterministic fallback, much faster)")
args = parser.parse_args()

print("=" * 70)
print("🔧 Rebuild: phase89_error_chunks")
print(f"   Qdrant : {QDRANT_URL}")
print(f"   Neo4j  : {NEO4J_URL}  (skip={args.no_neo4j})")
print(f"   Model  : {EMBED_MODEL}")
print(f"   {'🔍 DRY RUN — Qdrant upsert skipped' if args.dry_run else '✅ LIVE — will write to Qdrant'}")
print("=" * 70)

# ── HTTP helpers ──────────────────────────────────────────────────────────────

def _req(method: str, url: str, payload: dict | None = None, headers: dict | None = None, timeout: int = 30) -> dict:
    data = json.dumps(payload).encode() if payload is not None else None
    h = {"Content-Type": "application/json"}
    if headers:
        h.update(headers)
    req = urllib.request.Request(url, data=data, headers=h, method=method)
    with urllib.request.urlopen(req, timeout=timeout) as resp:
        return json.loads(resp.read())


def http_get(url: str, headers: dict | None = None, timeout: int = 10) -> dict:
    return _req("GET", url, headers=headers, timeout=timeout)


def http_post(url: str, payload: dict, headers: dict | None = None, timeout: int = 60) -> dict:
    return _req("POST", url, payload, headers=headers, timeout=timeout)


def http_put(url: str, payload: dict, timeout: int = 10) -> None:
    data = json.dumps(payload).encode()
    req = urllib.request.Request(url, data=data, headers={"Content-Type": "application/json"}, method="PUT")
    with urllib.request.urlopen(req, timeout=timeout):
        pass


def strip_ansi(text: str) -> str:
    return re.sub(r"\x1b\[[0-9;]*m", "", text)


def make_error_entry(file_path: str, line: int, message: str, severity: str = "error", tool: str = "diagnostics") -> dict:
    normalized_file = file_path.replace("\\", "/").strip()
    normalized_message = message.strip()
    return {
        "id": hashlib.md5(f"{normalized_file}:{line}:{normalized_message}".encode()).hexdigest()[:12],
        "file": normalized_file,
        "line": int(line) if line else 0,
        "message": normalized_message,
        "severity": severity.lower(),
        "tool": tool,
    }


def parse_inline_error_lines(output: str, tool: str) -> list[dict]:
    entries: list[dict] = []
    for raw_line in strip_ansi(output).splitlines():
        line = raw_line.strip()
        if not line:
            continue
        match = re.match(r"(ERROR|WARNING)\s+(src/\S+?)(?::(\d+)(?::\d+)?)?\s+(.+)$", line)
        if match:
            severity, filepath, lineno, message = match.groups()
            entries.append(make_error_entry(filepath, int(lineno) if lineno else 0, message, severity, tool))
    return entries


def looks_like_code_line(text: str) -> bool:
    stripped = text.strip()
    if not stripped:
        return False
    if stripped.startswith(("//", "import ", "export ", "const ", "let ", "var ", "function ", "class ", "interface ", "type ", "<", "{#", "{:", "{/", "}", ")", "]")):
        return True
    if "$lib/" in stripped or "=>" in stripped:
        return True
    if re.search(r"\bfrom\s+['\"]", stripped):
        return True
    if stripped.endswith(("{", "}", ";")) and not stripped.endswith("."):
        return True
    return False


def parse_svelte_check_human_output(output: str, tool: str = "svelte-check") -> list[dict]:
    entries: list[dict] = []
    lines = [strip_ansi(line) for line in output.splitlines()]
    index = 0

    while index < len(lines):
        line = lines[index].strip()
        file_match = re.match(r"^(.+?):(\d+):(\d+)\s*$", line)
        if not file_match:
            index += 1
            continue

        file_path, line_num, _column_num = file_match.groups()
        severity = "error"
        message_parts: list[str] = []
        index += 1

        while index < len(lines):
            current = lines[index].strip()
            if re.match(r"^.+?:\d+:\d+\s*$", current):
                break
            severity_match = re.match(r"^(Error|Warn|Warning|Hint):\s*(.*)$", current, re.IGNORECASE)
            if severity_match:
                severity = "warning" if severity_match.group(1).lower().startswith("warn") else "error"
                if severity_match.group(2):
                    message_parts.append(severity_match.group(2).strip())
                index += 1
                continue
            if current.startswith("http") or current.startswith("If you") or current.startswith("Did you") or current.startswith("See http"):
                index += 1
                continue
            if looks_like_code_line(current):
                index += 1
                continue
            if current:
                current = re.sub(r"\s*\((ts|svelte|css|js)\)\s*$", "", current, flags=re.IGNORECASE).strip()
                if current:
                    message_parts.append(current)
            index += 1

        message = " ".join(part for part in message_parts if part).strip()
        if message:
            entries.append(make_error_entry(file_path, int(line_num), message, severity, tool))

    return entries


def normalize_diagnostic_record(record: dict, tool: str) -> dict | None:
    file_path = record.get("file") or record.get("path") or record.get("filepath") or record.get("source")
    message = record.get("message") or record.get("text") or record.get("summary") or record.get("detail")
    if not file_path or not message:
        return None
    line = record.get("line") or record.get("lineNum") or record.get("line_number") or 0
    severity = record.get("severity") or record.get("level") or "error"
    record_tool = record.get("tool") or record.get("kind") or tool
    return make_error_entry(str(file_path), int(line) if str(line).isdigit() else 0, str(message), str(severity), str(record_tool))


def find_latest_saved_diagnostics() -> Path | None:
    candidates: list[Path] = []
    for pattern in AUTO_DIAGNOSTIC_GLOBS:
        candidates.extend(path for path in FRONTEND_DIR.glob(pattern) if path.is_file())

    unique_candidates = sorted({path.resolve() for path in candidates}, key=lambda path: path.stat().st_mtime, reverse=True)
    for candidate in unique_candidates:
        try:
            if candidate.stat().st_size == 0:
                continue
            entries, _ = load_errors_from_diagnostics_file(candidate)
            if entries:
                return candidate
        except Exception:
            continue
    return None


def load_errors_from_diagnostics_file(file_path: Path) -> tuple[list[dict], str]:
    raw_text = file_path.read_text(encoding="utf-8", errors="replace")
    suffix = file_path.suffix.lower()

    if suffix in {".json", ".jsonl", ".ndjson"}:
        records: list[dict] = []
        if suffix == ".json":
            payload = json.loads(raw_text)
            if isinstance(payload, dict):
                if isinstance(payload.get("events"), list):
                    records = [item for item in payload["events"] if isinstance(item, dict)]
                elif isinstance(payload.get("errors"), list):
                    records = [item for item in payload["errors"] if isinstance(item, dict)]
                elif all(key in payload for key in ("file", "message")):
                    records = [payload]
            elif isinstance(payload, list):
                records = [item for item in payload if isinstance(item, dict)]
        else:
            for line in raw_text.splitlines():
                line = line.strip()
                if not line:
                    continue
                try:
                    item = json.loads(line)
                except json.JSONDecodeError:
                    continue
                if isinstance(item, dict):
                    records.append(item)

        normalized = [entry for item in records if (entry := normalize_diagnostic_record(item, file_path.name))]
        return normalized, raw_text

    parsed = parse_svelte_check_human_output(raw_text, tool=file_path.name)
    if parsed:
        return parsed, raw_text

    parsed = parse_inline_error_lines(raw_text, tool=file_path.name)
    return parsed, raw_text

# ── Stage 1: svelte-check ─────────────────────────────────────────────────────

print("\n━━━ Stage 1: svelte-check ━━━")
diagnostics_path: Path | None = None
if args.diagnostics_file:
    candidate = Path(args.diagnostics_file)
    diagnostics_path = candidate if candidate.is_absolute() else (WORKSPACE_ROOT / candidate)

error_lines: list[dict] = []
raw_output = ""
reported_count = 0

if diagnostics_path:
    print(f"   Loading diagnostics from {diagnostics_path}")
    error_lines, raw_output = load_errors_from_diagnostics_file(diagnostics_path)
    reported_count = len(error_lines)
    print(f"   Loaded {len(error_lines)} errors from saved diagnostics")
else:
    ps_cmd = f'cd "{FRONTEND_DIR}"; npx svelte-check --threshold error 2>&1'
    result = subprocess.run(
        ["powershell", "-NoProfile", "-Command", ps_cmd],
        capture_output=True, text=True, timeout=300
    )
    raw_output = (result.stdout or "") + (result.stderr or "")
    error_lines = parse_inline_error_lines(raw_output, "svelte-check")
    if not error_lines:
        error_lines = parse_svelte_check_human_output(raw_output, "svelte-check")
    match = re.search(r"(\d+)\s+error", raw_output)
    reported_count = int(match.group(1)) if match else len(error_lines)
    print(f"   Parsed {len(error_lines)} individual error lines  (svelte-check reports {reported_count} errors)")

if not error_lines and not diagnostics_path and DEFAULT_PHASE78_FILE.exists():
    print(f"   ℹ️  No live errors found — loading saved Phase 78 diagnostics from {DEFAULT_PHASE78_FILE}")
    error_lines, raw_output = load_errors_from_diagnostics_file(DEFAULT_PHASE78_FILE)
    reported_count = len(error_lines)
    print(f"   Loaded {len(error_lines)} errors from saved Phase 78 diagnostics")

if not error_lines and not diagnostics_path:
    latest_saved = find_latest_saved_diagnostics()
    if latest_saved:
        print(f"   ℹ️  No live errors found — loading newest saved diagnostics from {latest_saved}")
        error_lines, raw_output = load_errors_from_diagnostics_file(latest_saved)
        reported_count = len(error_lines)
        print(f"   Loaded {len(error_lines)} errors from saved diagnostics artifact")

if not error_lines:
    # Minimal synthetic seed so collection isn't empty
    print("   ℹ️  No errors found — seeding with synthetic demo entries")
    error_lines = [
        {"id": f"seed-{i}", "file": f, "line": 0, "message": msg, "severity": "error", "tool": "svelte-check"}
        for i, (f, msg) in enumerate([
            ("src/routes/+layout.svelte",           "export let data — use $props() rune (G21)"),
            ("src/lib/components/Card.svelte",      "on:click handler — use onclick (G23)"),
            ("src/lib/components/Dialog.svelte",    "createEventDispatcher — use callback prop (G24)"),
            ("src/routes/api/chat/+server.ts",      "Type 'string | undefined' not assignable to 'string'"),
            ("src/lib/server/db/client.ts",         "Object is possibly null — add null guard"),
            ("src/lib/components/Table.svelte",     "$: reactive — use $derived (G22)"),
            ("src/routes/api/evidence/+server.ts",  "Cannot find module '$lib/utils'"),
            ("src/lib/models/ChatSession.svelte.ts","import: {x} from: 'y' corruption"),
        ])
    ]

if args.max:
    error_lines = error_lines[: args.max]

print(f"   Processing {len(error_lines)} errors")

# ── Stage 2: Neo4j graph enrichment ──────────────────────────────────────────

neo4j_violations: dict[str, dict] = {}  # file → {hasSvelte4Props, hasSvelte4Events, ...}
neo4j_summary: dict = {}

if not args.no_neo4j:
    print("\n━━━ Stage 2: Neo4j G21-G25 graph query ━━━")
    auth = base64.b64encode(f"{NEO4J_USER}:{NEO4J_PASS}".encode()).decode()
    neo4j_headers = {
        "Authorization": f"Basic {auth}",
        "Content-Type":  "application/json",
    }

    cypher_violations = """
        MATCH (n:CodebaseFile)
        WHERE n.hasSvelte4Props = true
           OR n.hasSvelte4Events = true
           OR n.hasSvelte4Reactive = true
           OR n.hasRunesInPlainTs = true
        RETURN n.path AS path,
               n.hasSvelte4Props    AS g21,
               n.hasSvelte4Reactive AS g22,
               n.hasSvelte4Events   AS g23,
               n.hasRunesInPlainTs  AS g25,
               n.errorCount        AS errorCount
        LIMIT 500
    """

    cypher_summary = """
        MATCH (n:CodebaseFile)
        RETURN
          count(n) AS totalFiles,
          sum(CASE WHEN n.hasSvelte4Props    THEN 1 ELSE 0 END) AS g21_files,
          sum(CASE WHEN n.hasSvelte4Reactive THEN 1 ELSE 0 END) AS g22_files,
          sum(CASE WHEN n.hasSvelte4Events   THEN 1 ELSE 0 END) AS g23_files,
          sum(CASE WHEN n.hasRunesInPlainTs  THEN 1 ELSE 0 END) AS g25_files
    """

    try:
        resp = http_post(
            f"{NEO4J_URL}/db/neo4j/tx/commit",
            {"statements": [
                {"statement": cypher_violations},
                {"statement": cypher_summary},
            ]},
            headers=neo4j_headers,
            timeout=20,
        )

        results = resp.get("results", [])

        # Violations by file
        if len(results) > 0:
            cols = results[0].get("columns", [])
            for row in results[0].get("data", []):
                vals = dict(zip(cols, row.get("row", [])))
                path = vals.get("path") or ""
                neo4j_violations[path] = {
                    "g21": bool(vals.get("g21")),
                    "g22": bool(vals.get("g22")),
                    "g23": bool(vals.get("g23")),
                    "g25": bool(vals.get("g25")),
                    "errorCount": vals.get("errorCount") or 0,
                }

        # Summary
        if len(results) > 1 and results[1].get("data"):
            cols = results[1].get("columns", [])
            row = results[1]["data"][0].get("row", [])
            neo4j_summary = dict(zip(cols, row))

        print(f"   Graph: {len(neo4j_violations)} files with Svelte 5 violations")
        if neo4j_summary:
            print(f"   G21(export let): {neo4j_summary.get('g21_files',0)} files")
            print(f"   G22($: reactive): {neo4j_summary.get('g22_files',0)} files")
            print(f"   G23(on:event):   {neo4j_summary.get('g23_files',0)} files")
            print(f"   G25(runes in .ts): {neo4j_summary.get('g25_files',0)} files")

    except Exception as e:
        print(f"   ⚠️  Neo4j query failed: {e} — continuing without graph data")
else:
    print("\n━━━ Stage 2: Neo4j skipped (--no-neo4j) ━━━")

# ── Stage 3: Embed ────────────────────────────────────────────────────────────

print(f"\n━━━ Stage 3: Embedding {len(error_lines)} errors ━━━")
t0 = time.time()

def embed_text(text: str) -> list[float]:
    payload = json.dumps({"model": EMBED_MODEL, "prompt": text[:2000]}).encode()
    req = urllib.request.Request(
        f"{OLLAMA_URL}/api/embeddings",
        data=payload,
        headers={"Content-Type": "application/json"},
        method="POST",
    )
    try:
        with urllib.request.urlopen(req, timeout=60) as resp:
            return json.loads(resp.read()).get("embedding", [0.0] * EMBED_DIM)
    except Exception as ex:
        print(f"   ⚠️  Embed failed: {ex}")
        return [0.0] * EMBED_DIM

texts_to_embed = []
for e in error_lines:
    # Enrich embed text with Neo4j graph context if available
    graph_ctx = ""
    rel_path = e["file"].lstrip("/").lstrip("\\")
    for npath, ndata in neo4j_violations.items():
        if rel_path in npath or npath in rel_path:
            flags = [g for g in ("g21","g22","g23","g25") if ndata.get(g)]
            if flags:
                graph_ctx = f" [graph: {','.join(flags)}]"
            break
    texts_to_embed.append(f"{e['tool']} | {e['file']} | {e['message']}{graph_ctx}")

all_embeddings: list[list[float]] = []
BATCH = 10
for i in range(0, len(texts_to_embed), BATCH):
    batch = texts_to_embed[i:i+BATCH]
    for t in batch:
        all_embeddings.append(embed_text(t))
    pct = min(100, int((i + len(batch)) / len(texts_to_embed) * 100))
    print(f"   {pct}%  {i + len(batch)}/{len(texts_to_embed)}")

valid_idx = [i for i, v in enumerate(all_embeddings) if any(x != 0.0 for x in v)]
valid_embeddings = [all_embeddings[i] for i in valid_idx]
valid_errors = [error_lines[i] for i in valid_idx]
print(f"   ✅ {len(valid_idx)} valid embeddings in {time.time()-t0:.1f}s")

# ── Stage 4: GPU k-means clustering ──────────────────────────────────────────

print(f"\n━━━ Stage 4: GPU clustering {len(valid_idx)} points ━━━")

def cluster_gpu(embeddings: list[list[float]]) -> list[int]:
    n = len(embeddings)
    if n == 0:
        return []
    try:
        import torch
        cuda = torch.cuda.is_available()
        print(f"   {'✅ CUDA' if cuda else '⚠️  CPU'} — {n} vectors, torch {torch.__version__}")
        t = torch.tensor(embeddings, dtype=torch.float32)
        if cuda:
            t = t.cuda()
        t = t / t.norm(dim=1, keepdim=True).clamp(min=1e-8)
        k = max(3, min(int(n**0.5) + 1, 40))
        centroids = t[torch.randperm(n)[:k]]
        for _ in range(30):
            sims = torch.mm(t, centroids.T)
            labels = sims.argmax(dim=1)
            new_c = torch.zeros_like(centroids)
            for c in range(k):
                mask = labels == c
                new_c[c] = t[mask].mean(0) if mask.any() else centroids[c]
            if (new_c - centroids).norm() < 1e-4:
                break
            centroids = new_c
        result = labels.cpu().tolist()
        print(f"   {len(set(result))} clusters")
        return result
    except ImportError:
        print("   torch not installed — using simple cosine grouping")
    except Exception as ex:
        print(f"   ⚠️  GPU error: {ex} — falling back")

    # CPU fallback: cosine-based greedy grouping
    import random
    k = max(3, min(int(n**0.5) + 1, 40))
    centroids_cpu = [embeddings[i] for i in random.sample(range(n), k)]
    def dot(a, b): return sum(x*y for x,y in zip(a,b))
    def norm(a): return sum(x*x for x in a)**0.5
    labels_cpu = [0]*n
    for _ in range(20):
        for i, emb in enumerate(embeddings):
            na = norm(emb)
            scores = [dot(emb, c) / (na * norm(c) + 1e-8) for c in centroids_cpu]
            labels_cpu[i] = scores.index(max(scores))
        for c in range(k):
            members = [embeddings[i] for i,l in enumerate(labels_cpu) if l==c]
            if members:
                centroids_cpu[c] = [sum(col)/len(members) for col in zip(*members)]
    print(f"   CPU: {len(set(labels_cpu))} clusters")
    return labels_cpu

cluster_labels = cluster_gpu(valid_embeddings)
clusters: dict[int, list] = defaultdict(list)
for err, label in zip(valid_errors, cluster_labels):
    clusters[int(label)].append(err)

# ── Stage 5: LLM summarize + map fix_hints ───────────────────────────────────

print(f"\n━━━ Stage 5: Summarise {len(clusters)} clusters ━━━")


def extract_signal_terms(text: str) -> list[str]:
    clean = strip_ansi(text)
    counter: Counter[str] = Counter()

    def add(term: str) -> None:
        candidate = term.strip().strip(".,:;()[]{}")
        if len(candidate) < 3 or len(candidate) > 80:
            return
        if candidate.lower() in {"type", "error", "warning", "module", "property", "object", "string", "number", "boolean", "unknown", "never"}:
            return
        counter[candidate] += 1

    for match in re.finditer(r"'([^'\n]{2,80})'|`([^`\n]{2,80})`", clean):
        add(match.group(1) or match.group(2) or "")
    for match in re.finditer(r"\bTS\d{4,5}\b", clean):
        add(match.group(0))
    for match in re.finditer(r"\$lib/[A-Za-z0-9_./-]+", clean):
        add(match.group(0))
    for match in re.finditer(r"\bon:[a-z]+\b", clean):
        add(match.group(0))
    for match in re.finditer(r"\b(?:[A-Z][A-Za-z0-9]+(?:\.[A-Z][A-Za-z0-9]+)*|[a-z][A-Za-z0-9]+(?:Service|Store|Panel|Editor|Response|Event|State|Embedding|Evidence|Summary|Dialog|Canvas|Case))\b", clean):
        add(match.group(0))
    return [term for term, _count in counter.most_common(12)]

def detect_error_type(messages: list[str]) -> tuple[str, str, str]:
    """Return (error_type, fixer_key, fix_hint) by scoring cluster messages against signature rules."""
    combined = " ".join(messages)
    best_rule: dict[str, object] | None = None
    best_score = 0

    for rule in ERROR_SIGNATURE_RULES:
        patterns = rule["patterns"]
        score = sum(1 for pattern in patterns if re.search(str(pattern), combined, re.IGNORECASE))
        if score > best_score:
            best_rule = rule
            best_score = score

    if best_rule and best_score > 0:
        return str(best_rule["label"]), str(best_rule["fixer_key"]), str(best_rule["fix_hint"])

    for keyword, (fk, fh) in ERROR_TYPE_FIXERS.items():
        if keyword.lower() in combined.lower():
            return keyword, fk, fh
    return "general-ts-error", "phase108-batch-fixer", "Review TypeScript errors and apply targeted fixes"

def llm_summarize(messages: list[str], error_type: str, graph_ctx: str) -> str:
    sample = "\n".join(f"- {m}" for m in messages[:5])
    graph_line = f"Graph context: {graph_ctx}\n" if graph_ctx else ""

    if LANGCHAIN_OLLAMA_AVAILABLE:
        try:
            llm = ChatOllama(model=SUMMARY_MODEL, base_url=OLLAMA_URL, temperature=0.1)
            messages_in = [
                SystemMessage(
                    content=(
                        "You are a software maintenance assistant. Summarize TypeScript and Svelte error clusters "
                        "in 1-2 sentences, identify the common root cause, and use the provided fixer guidance exactly. "
                        "Do not invent new fixers, package-install steps, or legal analysis. Do not ask questions."
                    )
                ),
                HumanMessage(
                    content=(
                        f"Error type: {error_type}\n"
                        f"{graph_line}"
                        f"Messages:\n{sample}"
                    )
                ),
            ]
            resp = llm.invoke(messages_in)
            content = getattr(resp, "content", "")
            if isinstance(content, str) and content.strip():
                return content.strip()
        except Exception:
            pass

    fallback = sample.splitlines()[0][2:] if sample else error_type
    if graph_ctx:
        return f"Cluster centers on {error_type} and should use the mapped fixer. Graph context: {graph_ctx}. Example: {fallback}"
    return f"Cluster centers on {error_type} and should use the mapped fixer. Example: {fallback}"

# ── Stage 6: Qdrant upsert ────────────────────────────────────────────────────

print(f"\n━━━ Stage 6: Qdrant upsert ━━━")

def recreate_collection():
    """Recreate phase89_error_chunks with the expected default vector schema."""
    try:
        info = http_get(f"{QDRANT_URL}/collections/{QDRANT_COLLECTION}")
        pts = info.get("result", {}).get("points_count", 0)
        _req("DELETE", f"{QDRANT_URL}/collections/{QDRANT_COLLECTION}")
        print(f"   Dropped existing collection ({pts} points)")
    except Exception:
        pass

    http_put(
        f"{QDRANT_URL}/collections/{QDRANT_COLLECTION}",
        {"vectors": {"size": EMBED_DIM, "distance": "Cosine"}},
    )
    print(f"   ✅ Created: {QDRANT_COLLECTION} (768-dim Cosine, default vector)")

qdrant_points: list[dict] = []

for cluster_id, members in clusters.items():
    # Centroid = mean of member embeddings
    member_vecs = [valid_embeddings[valid_errors.index(m)] for m in members if m in valid_errors]
    if not member_vecs:
        continue
    dim = len(member_vecs[0])
    centroid = [sum(v[d] for v in member_vecs) / len(member_vecs) for d in range(dim)]

    messages = [m["message"] for m in members]
    files = list({m["file"] for m in members})
    match_terms = []
    term_counter: Counter[str] = Counter()
    for message in messages:
        term_counter.update(extract_signal_terms(message))
    for file_path in files:
        term_counter.update(extract_signal_terms(Path(file_path).name))
    match_terms = [term for term, _count in term_counter.most_common(12)]

    error_type, fixer_key, fix_hint = detect_error_type(messages)

    # Gather Neo4j flags for files in this cluster
    g21 = g22 = g23 = g25 = 0
    for f in files:
        for npath, ndata in neo4j_violations.items():
            if f in npath or npath in f:
                g21 += int(bool(ndata.get("g21")))
                g22 += int(bool(ndata.get("g22")))
                g23 += int(bool(ndata.get("g23")))
                g25 += int(bool(ndata.get("g25")))
                break
    graph_ctx = f"G21={g21} G22={g22} G23={g23} G25={g25}" if any([g21,g22,g23,g25]) else ""

    print(f"   Cluster {cluster_id:2d}: {len(members):3d} errors  type={error_type:<25}  {graph_ctx}")
    if args.no_llm:
        fallback_example = messages[0][:120] if messages else error_type
        if graph_ctx:
            summary = f"Cluster centers on {error_type} and should use the mapped fixer. Graph context: {graph_ctx}. Example: {fallback_example}"
        else:
            summary = f"Cluster centers on {error_type} and should use the mapped fixer. Example: {fallback_example}"
    else:
        summary = llm_summarize(messages, error_type, graph_ctx)
    if fixer_key not in summary and fix_hint not in summary:
        summary = f"{summary} Recommended fixer: {fixer_key}. {fix_hint}."

    point_id = int(hashlib.md5(f"cluster-{cluster_id}-v2".encode()).hexdigest()[:8], 16) % (2**31)
    qdrant_points.append({
        "id": point_id,
        "vector": centroid,
        "payload": {
            "cluster_id":    cluster_id,
            "member_count":  len(members),
            "error_type":    error_type,
            "summary":       summary,
            "fix_hint":      fix_hint,
            "fixer_key":     fixer_key,
            "files":         files[:10],
            "sample_errors": messages[:3],
            "match_terms":   match_terms,
            "neo4j_g21":     g21,
            "neo4j_g22":     g22,
            "neo4j_g23":     g23,
            "neo4j_g25":     g25,
            "neo4j_summary": neo4j_summary,
            "source":        "svelte-check+neo4j-graph",
        },
    })

if args.dry_run:
    print(f"\n🔍 DRY RUN — would upsert {len(qdrant_points)} cluster points")
else:
    if not qdrant_points:
        print("   ⚠️  No cluster points generated — preserving existing collection")
    else:
        recreate_collection()
    batch_size = 50
    total_upserted = 0
    for i in range(0, len(qdrant_points), batch_size):
        batch = qdrant_points[i:i+batch_size]
        try:
            _req(
                "PUT",
                f"{QDRANT_URL}/collections/{QDRANT_COLLECTION}/points?wait=true",
                {"points": batch},
                timeout=30,
            )
            total_upserted += len(batch)
        except urllib.error.HTTPError as ex:
            body = ex.read().decode("utf-8", errors="replace")
            print(f"   ⚠️  Upsert batch {i}-{i+len(batch)} failed: HTTP {ex.code} {ex.reason} :: {body}")
        except Exception as ex:
            print(f"   ⚠️  Upsert batch {i}-{i+len(batch)} failed: {ex}")
    print(f"   ✅ Upserted {total_upserted} cluster points")

# ── Summary ───────────────────────────────────────────────────────────────────

print("\n" + "=" * 70)
print("✅ Rebuild Complete")
print(f"   Errors processed  : {len(error_lines)}")
print(f"   Valid embeddings  : {len(valid_idx)}")
print(f"   Clusters created  : {len(clusters)}")
print(f"   Neo4j violations  : {len(neo4j_violations)} files enriched")
print(f"   Qdrant collection : {QDRANT_COLLECTION}  ({'DRY RUN' if args.dry_run else 'WRITTEN'})")
if neo4j_summary:
    print(f"   Graph snapshot    : {neo4j_summary}")
print("=" * 70)
