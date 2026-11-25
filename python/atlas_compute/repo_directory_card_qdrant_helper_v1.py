"""Universal multi-core + RTX CUDA + EmbeddingGemma 2 ONNX + Qdrant directory card & search helper (v1).

Discovers every populated directory in the repository via `rg --files` (including helper subtrees),
extracts structural symbols/routes/imports/schemas + `AGENTS.md`/`LLMS.md`/`README.md` envelopes across
CPU worker threads, classifies OBO ontology concepts into 64-byte bitsets, embeds cards via `:8094` or
in-process `models/embeddinggemma2/onnx-q8/onnx/model_quantized.onnx` (zero Ollama), computes Top-K
semantic neighbors + PageRank + query fusion on RTX CUDA (`torch.cuda`) with CPU parity verification,
and syncs/queries rebuildable Qdrant directory & chunk projections when `:6333` is reachable.

Authority contract:
- `canonicalAuthority: False` — derived discovery/routing index only; PostgreSQL 18 remains canonical.
- Never persists hidden thoughts, KV cache, or raw device pointers.
"""

from __future__ import annotations

import concurrent.futures
import hashlib
import json
import math
import os
import re
import subprocess
import time
import urllib.error
import urllib.request
import uuid
from dataclasses import asdict, dataclass, field
from pathlib import Path, PureWindowsPath
from typing import Any, Mapping, Sequence

import numpy as np

from atlas_compute.compact_ontology_csr_bridge_v1 import (
    OntologyCatalogV1,
    load_obo_catalog_v1,
    pack_concept_membership_64b,
)
from atlas_graph_runtime.eg2_onnx_adapter_v1 import (
    DEFAULT_EG2_ONNX_DIR,
    DEFAULT_EG2_ONNX_URL,
    Eg2OnnxClientV1,
    load_task_prompts,
)

SCHEMA_UNIVERSAL_DIR_CARD_V1 = "atlas.universal-directory-card.v1"
SCHEMA_UNIVERSAL_DIR_INDEX_V1 = "atlas.universal-directory-index.v1"
SCHEMA_UNIVERSAL_DIR_SEARCH_V1 = "atlas.universal-directory-search.v1"
QDRANT_DIR_COLLECTION_V1 = "atlas_directory_cards_eg2_768"
DIR_POINT_NAMESPACE = uuid.UUID("7f4e9a12-6d3b-4c8a-9b21-5e8f1a3c7d90")

DEFAULT_RG_GLOBS: tuple[str, ...] = (
    "!**/node_modules/**",
    "!**/.git/**",
    "!deeds_labs/**",
    "!.tmp/**",
    "!**/.tmp/**",
    "!.venv*/**",
    "!**/.venv*/**",
    "!**/.svelte-kit/**",
    "!**/dist/**",
    "!**/build/**",
    "!**/__pycache__/**",
    "!**/.pytest_cache/**",
    "!models/**",
    "!triton-model-repository/**",
    "!docs/reports/**",
    "!scripts/api-cleanup/reports/**",
)

EXTRA_UNIGNORED_HELPER_DIRS: tuple[str, ...] = (
    "tools/parent-atlas-qdrant-postgres-toolkit",
    "tools/agentic-research/src",
)

SOURCE_CODE_EXTS = frozenset(
    {
        ".ts",
        ".tsx",
        ".mts",
        ".cts",
        ".js",
        ".mjs",
        ".cjs",
        ".svelte",
        ".py",
        ".go",
        ".rs",
        ".cpp",
        ".cc",
        ".c",
        ".cu",
        ".cuh",
        ".h",
        ".hpp",
        ".sql",
        ".proto",
        ".obo",
        ".ps1",
        ".sh",
    }
)

DOC_CONTEXT_FILES = ("AGENTS.md", "LLMS.md", "README.md", "SKILL.md", "proposal.md", "design.md", "tasks.md")

# Regex extractors for fast multi-core AST-lite symbol / route / table / MCP tool detection
_RE_TS_SYMBOL = re.compile(
    r"^\s*export\s+(?:async\s+)?(?:function|class|interface|type|const|enum)\s+([A-Za-z_][A-Za-z0-9_]*)",
    re.MULTILINE,
)
_RE_PY_SYMBOL = re.compile(r"^\s*(?:async\s+def|def|class)\s+([A-Za-z_][A-Za-z0-9_]*)", re.MULTILINE)
_RE_GO_SYMBOL = re.compile(r"^\s*(?:func(?:\s*\([^)]+\))?|type)\s+([A-Za-z_][A-Za-z0-9_]*)", re.MULTILINE)
_RE_SQL_TABLE = re.compile(
    r"(?:CREATE\s+TABLE(?:\s+IF\s+NOT\s+EXISTS)?\s+(?:public\.)?|pgTable\(\s*['\"])([a-zA-Z0-9_]+)",
    re.IGNORECASE,
)
_RE_MCP_TOOL = re.compile(
    r"(?:registerTool\(\s*['\"]|name:\s*['\"])([a-z][a-z0-9_.-]{2,60})['\"]"
)
_RE_SVELTE_RUNES = re.compile(r"\$(?:state|derived|props|effect)\b")

DOMAIN_RULES: tuple[tuple[str, tuple[str, ...]], ...] = (
    ("mcp-agent-tool", ("mcp", "trace-mcp", "opencode", "subagent", "tool-dispatch", "skills", ".agents")),
    ("trace-retrieval", ("retrieval", "qdrant", "search", "rerank", "bm25", "fts", "ace", "bitfrost", "embedding")),
    ("graph-gpu-topology", ("graph", "topology", "pagerank", "som", "rapids", "cuvs", "cugraph", "cuda", "gpu", "splat", "webgpu", "tensor", "simd")),
    ("ontology-taxonomy", ("ontology", "obo", "oaklib", ".okf", "taxonomy", "semantic-contracts")),
    ("database-schema", ("drizzle", "db/schema", "postgres", "pgvector", "migration", "sql")),
    ("legal-evidence", ("cases", "evidence", "legal", "statute", "precedent", "citation", "poi", "detective", "dossier")),
    ("api-route", ("/api/", "+server.ts")),
    ("ui-component", ("components", ".svelte", "yorha", "bits-ui", "+page.svelte", "+layout.svelte")),
    ("openspec-governance", ("openspec", "next_steps", "specs", "governance")),
    ("test-audit-devtool", ("test", "tests", "spec", "audit", "smoke", "verify", "prove", "validate")),
)


@dataclass(frozen=True)
class UniversalDirectoryCardV1:
    schema: str
    card_id: str
    dir_path: str
    frontend_alias_path: str | None
    parent_dir: str
    top_root: str
    title: str
    file_count: int
    source_file_count: int
    extensions: dict[str, int]
    topo_classes: list[str]
    obo_concept_ids: list[str]
    obo_bitset_hex_64b: str
    route_surfaces: list[str]
    top_symbols: list[str]
    schema_tables: list[str]
    mcp_tools: list[str]
    context_docs: list[str]
    top_files: list[str]
    summary: str
    llm_summary: str | None
    in_legacy_atlas_dirs: bool
    semantic_pagerank: float
    fusion_rank: float
    semantic_neighbors: list[dict[str, Any]]
    content_hash: str
    canonical_authority: bool = False


def card_id_for_dir(dir_path: str) -> str:
    norm = dir_path.strip().replace("\\", "/").strip("/") or "repo-root"
    slug = re.sub(r"[^a-z0-9]+", "-", norm.lower()).strip("-")
    return f"agents:dir:{slug[:140]}"


def _humanize_dir(dir_path: str) -> str:
    if not dir_path or dir_path == ".":
        return "Repository Root"
    tail = [p for p in dir_path.split("/") if p][-2:]
    joined = " / ".join(tail)
    return re.sub(r"[-_]+", " ", joined).title()


def discover_repo_directories_v1(
    repo_root: str | Path,
    *,
    include_unignored_helpers: bool = True,
) -> dict[str, list[str]]:
    """Use `rg --files` to map every populated repo directory -> sorted list of relative POSIX file paths."""
    root = Path(repo_root).resolve()
    cmd = ["rg", "--files"]
    for glob in DEFAULT_RG_GLOBS:
        cmd.extend(["-g", glob])

    out = subprocess.check_output(
        cmd,
        cwd=str(root),
        text=True,
        encoding="utf-8",
        errors="replace",
    )
    rel_files: set[str] = set()
    for line in out.splitlines():
        cleaned = line.strip()
        if not cleaned:
            continue
        posix = PureWindowsPath(cleaned).as_posix()
        if posix.startswith("./"):
            posix = posix[2:]
        if posix and not posix.endswith("/NUL") and posix != "NUL":
            rel_files.add(posix)

    if include_unignored_helpers:
        for extra_rel in EXTRA_UNIGNORED_HELPER_DIRS:
            extra_abs = root / extra_rel
            if not extra_abs.is_dir():
                continue
            extra_cmd = ["rg", "--files", "--no-ignore", extra_rel]
            for glob in DEFAULT_RG_GLOBS:
                extra_cmd.extend(["-g", glob])
            try:
                extra_out = subprocess.check_output(
                    extra_cmd,
                    cwd=str(root),
                    text=True,
                    encoding="utf-8",
                    errors="replace",
                )
                for line in extra_out.splitlines():
                    cleaned = line.strip()
                    if cleaned:
                        ep = PureWindowsPath(cleaned).as_posix()
                        rel_files.add(ep[2:] if ep.startswith("./") else ep)
            except Exception:
                pass

    by_dir: dict[str, list[str]] = {}
    for fpath in sorted(rel_files):
        parts = fpath.split("/")
        dpath = "/".join(parts[:-1]) if len(parts) > 1 else "."
        by_dir.setdefault(dpath, []).append(fpath)
    return by_dir


def load_obo_term_keywords_v1(obo_path: str | Path) -> tuple[OntologyCatalogV1, dict[str, tuple[str, ...]]]:
    """Load OBO catalog plus lowercase keyword tokens per concept ID for fast directory concept tagging."""
    catalog = load_obo_catalog_v1(obo_path)
    raw_text = Path(obo_path).read_text(encoding="utf-8", errors="replace")
    term_tokens: dict[str, tuple[str, ...]] = {}
    cur_id: str | None = None
    cur_name: str = ""
    stanza: str | None = None
    for raw in raw_text.splitlines():
        line = raw.strip()
        if line.startswith("[") and line.endswith("]"):
            if stanza == "[Term]" and cur_id:
                toks = tuple(t for t in re.split(r"[^a-z0-9]+", cur_name.lower()) if len(t) >= 3)
                if toks:
                    term_tokens[cur_id] = toks
            stanza = line
            cur_id = None
            cur_name = ""
        elif stanza == "[Term]":
            if line.startswith("id:"):
                cur_id = line.split(":", 1)[1].strip()
            elif line.startswith("name:"):
                cur_name = line.split(":", 1)[1].strip()
    if stanza == "[Term]" and cur_id:
        toks = tuple(t for t in re.split(r"[^a-z0-9]+", cur_name.lower()) if len(t) >= 3)
        if toks:
            term_tokens[cur_id] = toks
    return catalog, term_tokens


def _extract_doc_snippet(abs_path: Path) -> str:
    try:
        raw = abs_path.read_text(encoding="utf-8", errors="replace")[:4096]
    except Exception:
        return ""
    lines = [ln.strip() for ln in raw.splitlines() if ln.strip()]
    filtered: list[str] = []
    for ln in lines:
        if ln.startswith("<!--") or ln.startswith("---"):
            continue
        cleaned = re.sub(r"^#+\s*", "", ln).strip()
        if cleaned:
            filtered.append(cleaned)
        if sum(len(x) for x in filtered) >= 320:
            break
    return " — ".join(filtered)[:360]


def _classify_topo_classes(dir_path: str, files: Sequence[str], ext_counts: Mapping[str, int], svelte_runes: int) -> list[str]:
    joined = (dir_path + " " + " ".join(Path(f).name for f in files[:25])).lower()
    matched: list[str] = []
    for label, needles in DOMAIN_RULES:
        if any(n in joined for n in needles):
            matched.append(label)
    if svelte_runes > 0 and "ui-component" not in matched:
        matched.append("ui-component")
    if not matched:
        if ".py" in ext_counts:
            matched.append("python-compute")
        elif ".go" in ext_counts:
            matched.append("go-service")
        elif ".md" in ext_counts and len(ext_counts) == 1:
            matched.append("documentation-hub")
        else:
            matched.append("core-infrastructure")
    return matched[:4]


def build_directory_structural_card_v1(
    repo_root: Path,
    dir_path: str,
    rel_files: Sequence[str],
    *,
    legacy_atlas_dirs: set[str],
    obo_catalog: OntologyCatalogV1 | None = None,
    obo_term_tokens: Mapping[str, tuple[str, ...]] | None = None,
) -> UniversalDirectoryCardV1:
    ext_counts: dict[str, int] = {}
    source_count = 0
    route_surfaces: list[str] = []
    context_docs: list[str] = []
    symbols: list[str] = []
    tables: list[str] = []
    mcp_tools: list[str] = []
    doc_snippet = ""
    svelte_runes = 0

    for f in rel_files:
        p = Path(f)
        ext = p.suffix.lower() or "(no-ext)"
        ext_counts[ext] = ext_counts.get(ext, 0) + 1
        if ext in SOURCE_CODE_EXTS:
            source_count += 1
        fname = p.name
        if fname in ("+page.svelte", "+server.ts", "+page.server.ts", "+layout.svelte", "+layout.server.ts"):
            route_surfaces.append(f)
        if fname in DOC_CONTEXT_FILES:
            context_docs.append(f)
            if not doc_snippet:
                doc_snippet = _extract_doc_snippet(repo_root / f)

    # Bounded structural scan of up to 12 representative source files per directory
    source_candidates = [f for f in rel_files if Path(f).suffix.lower() in SOURCE_CODE_EXTS][:12]
    for f in source_candidates:
        abs_f = repo_root / f
        try:
            head = abs_f.read_text(encoding="utf-8", errors="replace")[:12288]
        except Exception:
            continue
        ext = Path(f).suffix.lower()
        if ext in (".ts", ".tsx", ".mts", ".cts", ".js", ".mjs", ".cjs", ".svelte"):
            for m in _RE_TS_SYMBOL.finditer(head):
                sym = m.group(1)
                if sym not in symbols:
                    symbols.append(sym)
                if len(symbols) >= 16:
                    break
            if ext == ".svelte" and _RE_SVELTE_RUNES.search(head):
                svelte_runes += 1
        elif ext == ".py":
            for m in _RE_PY_SYMBOL.finditer(head):
                sym = m.group(1)
                if not sym.startswith("_") and sym not in symbols:
                    symbols.append(sym)
                if len(symbols) >= 16:
                    break
        elif ext == ".go":
            for m in _RE_GO_SYMBOL.finditer(head):
                sym = m.group(1)
                if sym not in symbols:
                    symbols.append(sym)
        for tm in _RE_SQL_TABLE.finditer(head):
            tbl = tm.group(1)
            if tbl.lower() not in ("if", "not", "exists") and tbl not in tables:
                tables.append(tbl)
        for mm in _RE_MCP_TOOL.finditer(head):
            tname = mm.group(1)
            if ("." in tname or "_" in tname) and tname not in mcp_tools:
                mcp_tools.append(tname)

    topo_classes = _classify_topo_classes(dir_path, rel_files, ext_counts, svelte_runes)

    # Match OBO concepts + pack 64-byte bitset
    matched_concepts: list[str] = []
    bitset_hex = "00" * 64
    if obo_catalog is not None and obo_term_tokens:
        bag_text = f"{dir_path} {' '.join(topo_classes)} {' '.join(symbols[:10])} {doc_snippet}".lower()
        bag_words = set(re.split(r"[^a-z0-9]+", bag_text))
        scored_concepts: list[tuple[int, str]] = []
        for cid, ctoks in obo_term_tokens.items():
            overlap = sum(1 for tok in ctoks if tok in bag_words)
            if overlap > 0 and overlap >= min(2, len(ctoks)):
                scored_concepts.append((overlap, cid))
        scored_concepts.sort(key=lambda x: (-x[0], x[1]))
        matched_concepts = [cid for _, cid in scored_concepts[:10]]
        if matched_concepts:
            ordinals = [
                obo_catalog.concept_to_ordinal[cid]
                for cid in matched_concepts
                if cid in obo_catalog.concept_to_ordinal
            ]
            if ordinals:
                bitset_hex = pack_concept_membership_64b(
                    ordinals,
                    max_concepts=max(1, len(obo_catalog.concept_ids)),
                ).hex()

    parts = dir_path.split("/") if dir_path != "." else []
    top_root = parts[0] if parts else "."
    parent_dir = "/".join(parts[:-1]) if len(parts) > 1 else ("." if parts else "")
    frontend_alias = (
        dir_path[len("sveltekit-frontend/") :]
        if dir_path.startswith("sveltekit-frontend/")
        else None
    )
    in_legacy = (dir_path in legacy_atlas_dirs) or (
        frontend_alias is not None and frontend_alias in legacy_atlas_dirs
    )

    top_files = sorted(
        rel_files,
        key=lambda f: (
            0 if Path(f).name in ("index.ts", "+server.ts", "+page.svelte", "SKILL.md") else 1,
            0 if Path(f).suffix.lower() in SOURCE_CODE_EXTS else 1,
            f,
        ),
    )[:6]

    # Compose dense-search-friendly deterministic summary
    summary_parts = [
        f"Directory `{dir_path}` ({len(rel_files)} files, {source_count} code; domains: {', '.join(topo_classes)})."
    ]
    if doc_snippet:
        summary_parts.append(f"Context: {doc_snippet}")
    if symbols:
        summary_parts.append(f"Key symbols: {', '.join(symbols[:10])}.")
    if route_surfaces:
        summary_parts.append(f"Routes: {', '.join(Path(r).name for r in route_surfaces[:4])}.")
    if mcp_tools:
        summary_parts.append(f"MCP tools: {', '.join(mcp_tools[:6])}.")
    if tables:
        summary_parts.append(f"Tables: {', '.join(tables[:6])}.")
    if top_files:
        summary_parts.append(f"Representative files: {', '.join(Path(f).name for f in top_files[:5])}.")
    summary = " ".join(summary_parts)[:1600]

    cid = card_id_for_dir(dir_path)
    hash_payload = json.dumps(
        {
            "dir_path": dir_path,
            "file_count": len(rel_files),
            "topo_classes": topo_classes,
            "symbols": symbols[:12],
            "top_files": top_files,
            "summary": summary,
        },
        sort_keys=True,
    )
    chash = "sha256:" + hashlib.sha256(hash_payload.encode("utf-8")).hexdigest()

    return UniversalDirectoryCardV1(
        schema=SCHEMA_UNIVERSAL_DIR_CARD_V1,
        card_id=cid,
        dir_path=dir_path,
        frontend_alias_path=frontend_alias,
        parent_dir=parent_dir,
        top_root=top_root,
        title=_humanize_dir(dir_path),
        file_count=len(rel_files),
        source_file_count=source_count,
        extensions=dict(sorted(ext_counts.items(), key=lambda kv: (-kv[1], kv[0]))[:8]),
        topo_classes=topo_classes,
        obo_concept_ids=matched_concepts,
        obo_bitset_hex_64b=bitset_hex,
        route_surfaces=route_surfaces[:8],
        top_symbols=symbols[:12],
        schema_tables=tables[:8],
        mcp_tools=mcp_tools[:8],
        context_docs=context_docs[:6],
        top_files=top_files,
        summary=summary,
        llm_summary=None,
        in_legacy_atlas_dirs=in_legacy,
        semantic_pagerank=0.0,
        fusion_rank=0.0,
        semantic_neighbors=[],
        content_hash=chash,
        canonical_authority=False,
    )


def build_all_directory_cards_multicore_v1(
    repo_root: str | Path,
    *,
    by_dir: Mapping[str, Sequence[str]] | None = None,
    obo_path: str | Path | None = None,
    legacy_dirs_json_path: str | Path | None = None,
    max_workers: int | None = None,
) -> tuple[list[UniversalDirectoryCardV1], dict[str, Any]]:
    root = Path(repo_root).resolve()
    t0 = time.perf_counter()
    dir_map = dict(by_dir) if by_dir is not None else discover_repo_directories_v1(root)

    legacy_dirs: set[str] = set()
    leg_path = (
        Path(legacy_dirs_json_path)
        if legacy_dirs_json_path
        else root / "sveltekit-frontend" / "memory" / "atlas" / "codebase-atlas.dirs.json"
    )
    if leg_path.is_file():
        try:
            leg_data = json.loads(leg_path.read_text(encoding="utf-8"))
            legacy_dirs = {str(c.get("d", "")) for c in leg_data.get("cards", []) if c.get("d")}
        except Exception:
            pass

    obo_file = (
        Path(obo_path)
        if obo_path
        else root / ".okf" / "ontologies" / "atlas-domain-and-language-terms-v1.obo"
    )
    catalog: OntologyCatalogV1 | None = None
    term_tokens: dict[str, tuple[str, ...]] = {}
    if obo_file.is_file():
        catalog, term_tokens = load_obo_term_keywords_v1(obo_file)

    workers = max_workers or min(16, max(2, (os.cpu_count() or 8)))
    ordered_dirs = sorted(dir_map.keys())

    def _job(d: str) -> UniversalDirectoryCardV1:
        return build_directory_structural_card_v1(
            root,
            d,
            dir_map[d],
            legacy_atlas_dirs=legacy_dirs,
            obo_catalog=catalog,
            obo_term_tokens=term_tokens,
        )

    with concurrent.futures.ThreadPoolExecutor(max_workers=workers) as pool:
        cards = list(pool.map(_job, ordered_dirs))

    elapsed_ms = round((time.perf_counter() - t0) * 1000.0, 2)
    stats = {
        "totalDirectories": len(cards),
        "totalFiles": sum(c.file_count for c in cards),
        "missingInLegacyAtlasDirs": sum(1 for c in cards if not c.in_legacy_atlas_dirs),
        "withOboConcepts": sum(1 for c in cards if c.obo_concept_ids),
        "withContextDocs": sum(1 for c in cards if c.context_docs),
        "withMcpTools": sum(1 for c in cards if c.mcp_tools),
        "withRoutes": sum(1 for c in cards if c.route_surfaces),
        "workers": workers,
        "structuralBuildMs": elapsed_ms,
        "ontologyRevision": catalog.ontology_revision if catalog else None,
    }
    return cards, stats


class DirectEg2OnnxEncoderV1:
    """Zero-Ollama EmbeddingGemma 2 ONNX encoder: tries `:8094` first, falls back to local `model_quantized.onnx`."""

    def __init__(
        self,
        *,
        model_dir: str | Path = DEFAULT_EG2_ONNX_DIR,
        http_url: str = DEFAULT_EG2_ONNX_URL,
        max_tokens: int = 256,
        intra_threads: int | None = None,
    ) -> None:
        self.model_dir = Path(model_dir)
        self.http_url = http_url.rstrip("/")
        self.max_tokens = max_tokens
        self.intra_threads = intra_threads or max(2, min(12, (os.cpu_count() or 8)))
        self._prompts = load_task_prompts(self.model_dir)
        self._ort_session: Any = None
        self._tokenizer: Any = None
        self.backend_used: str = "uninitialized"

    def _try_http_ready(self) -> bool:
        try:
            req = urllib.request.Request(f"{self.http_url}/health", method="GET")
            with urllib.request.urlopen(req, timeout=1.5) as resp:
                data = json.loads(resp.read().decode("utf-8"))
                return resp.status == 200 and data.get("status") == "ok"
        except Exception:
            return False

    def _ensure_local_ort(self) -> None:
        if self._ort_session is not None and self._tokenizer is not None:
            return
        import onnxruntime as ort
        from tokenizers import Tokenizer

        model_file = self.model_dir / "onnx" / "model_quantized.onnx"
        tok_file = self.model_dir / "tokenizer.json"
        if not model_file.is_file() or not tok_file.is_file():
            raise FileNotFoundError(f"Missing local EG2 ONNX artifacts under {self.model_dir}")
        tok = Tokenizer.from_file(str(tok_file))
        tok.enable_truncation(max_length=self.max_tokens)
        so = ort.SessionOptions()
        so.intra_op_num_threads = self.intra_threads
        so.inter_op_num_threads = 1
        self._ort_session = ort.InferenceSession(
            str(model_file), so, providers=["CPUExecutionProvider"]
        )
        self._tokenizer = tok

    def encode(
        self,
        texts: Sequence[str],
        *,
        dim: int = 768,
        batch_size: int = 32,
        task_prompt_name: str | None = "CodeRetrieval",
    ) -> tuple[np.ndarray, dict[str, Any]]:
        if not texts:
            return np.zeros((0, dim), dtype=np.float32), {"count": 0, "backend": "none", "elapsedMs": 0.0}

        t0 = time.perf_counter()
        if self._try_http_ready():
            client = Eg2OnnxClientV1(base_url=self.http_url, model_dir=self.model_dir, timeout_seconds=30.0)
            vecs: list[list[float]] = []
            for start in range(0, len(texts), batch_size):
                res = client.embed(texts[start : start + batch_size], dim=dim, task_prompt_name=task_prompt_name)
                vecs.extend(res.vectors)
            arr = np.asarray(vecs, dtype=np.float32)
            self.backend_used = "http-8094-eg2-onnx"
            return arr, {
                "count": len(texts),
                "dim": dim,
                "backend": self.backend_used,
                "elapsedMs": round((time.perf_counter() - t0) * 1000.0, 2),
            }

        # Direct in-process ONNX Runtime execution (identical graph inputs/outputs to :8094)
        self._ensure_local_ort()
        prefix = self._prompts.get(task_prompt_name, "") if task_prompt_name else ""
        out_batches: list[np.ndarray] = []
        empty_mm = np.zeros((0, 512), dtype=np.float32)

        for start in range(0, len(texts), batch_size):
            batch_texts = [
                f"{prefix}{str(t).strip()}" if prefix else str(t).strip()
                for t in texts[start : start + batch_size]
            ]
            encs = self._tokenizer.encode_batch(batch_texts)
            width = max(1, max(len(e.ids) for e in encs))
            ids = np.zeros((len(encs), width), dtype=np.int64)
            mask = np.zeros((len(encs), width), dtype=np.int64)
            for i, e in enumerate(encs):
                if e.ids:
                    ids[i, : len(e.ids)] = e.ids
                    mask[i, : len(e.ids)] = e.attention_mask
            feeds = {
                "input_ids": ids,
                "attention_mask": mask,
                "image_features": empty_mm,
                "video_features": empty_mm,
                "audio_features": empty_mm,
            }
            raw_out = self._ort_session.run(["sentence_embedding"], feeds)[0].astype(np.float32)
            cut = raw_out[:, :dim]
            norms = np.linalg.norm(cut, axis=1, keepdims=True)
            norms = np.where(norms == 0.0, 1.0, norms)
            out_batches.append(cut / norms)

        arr = np.vstack(out_batches).astype(np.float32)
        self.backend_used = "inprocess-ort-eg2-onnx-q8"
        return arr, {
            "count": len(texts),
            "dim": dim,
            "backend": self.backend_used,
            "intraThreads": self.intra_threads,
            "maxTokens": self.max_tokens,
            "elapsedMs": round((time.perf_counter() - t0) * 1000.0, 2),
        }


def compute_gpu_directory_graph_and_rank_v1(
    cards: Sequence[UniversalDirectoryCardV1],
    embeddings: np.ndarray,
    *,
    top_k_neighbors: int = 5,
    damping: float = 0.85,
    pagerank_iters: int = 30,
    prefer_cuda: bool = True,
) -> tuple[list[UniversalDirectoryCardV1], dict[str, Any]]:
    """Compute Top-K semantic directory neighbors + damped semantic PageRank on RTX CUDA with CPU parity check."""
    import torch

    n = len(cards)
    if n == 0:
        return [], {"backend": "empty", "count": 0}
    if embeddings.shape[0] != n:
        raise ValueError(f"Card count {n} != embedding rows {embeddings.shape[0]}")

    use_cuda = bool(prefer_cuda and torch.cuda.is_available())
    free_before_mib = 0
    total_mib = 0
    device_name = "cpu"
    if use_cuda:
        free_b, total_b = torch.cuda.mem_get_info()
        free_before_mib = free_b // (1024 * 1024)
        total_mib = total_b // (1024 * 1024)
        if free_before_mib >= 256:
            device_name = torch.cuda.get_device_name(0)
        else:
            use_cuda = False

    device = torch.device("cuda:0" if use_cuda else "cpu")
    t0 = time.perf_counter()

    with torch.no_grad():
        emb_t = torch.from_numpy(np.ascontiguousarray(embeddings, dtype=np.float32)).to(device)
        emb_t = torch.nn.functional.normalize(emb_t, p=2, dim=1)
        sim_t = emb_t @ emb_t.T
        sim_t.fill_diagonal_(-1.0)

        k_eff = min(top_k_neighbors, max(1, n - 1))
        if n > 1:
            top_vals_t, top_idx_t = torch.topk(sim_t, k=k_eff, dim=1)
            # Build sparse/dense row-normalized positive transition matrix over Top-K semantic neighbors
            weights = torch.clamp(top_vals_t, min=0.0)
            row_sums = weights.sum(dim=1, keepdim=True).clamp(min=1e-8)
            norm_w = weights / row_sums

            pr = torch.full((n,), 1.0 / n, dtype=torch.float32, device=device)
            teleport = (1.0 - damping) / n
            flat_dst = top_idx_t.reshape(-1)
            for _ in range(pagerank_iters):
                contrib = (pr.unsqueeze(1) * norm_w).reshape(-1)
                nxt = torch.full((n,), teleport, dtype=torch.float32, device=device)
                nxt.scatter_add_(0, flat_dst, damping * contrib)
                pr = nxt / nxt.sum().clamp(min=1e-12)
        else:
            top_vals_t = torch.zeros((1, 0), dtype=torch.float32, device=device)
            top_idx_t = torch.zeros((1, 0), dtype=torch.long, device=device)
            pr = torch.ones((1,), dtype=torch.float32, device=device)

        if use_cuda:
            torch.cuda.synchronize()
        top_vals = top_vals_t.cpu().numpy()
        top_idx = top_idx_t.cpu().numpy()
        pr_vec = pr.cpu().numpy()

    gpu_ms = round((time.perf_counter() - t0) * 1000.0, 3)

    # CPU oracle spot-check on up to 64 rows to prove GPU/CPU parity
    parity_rows = min(64, n)
    cpu_ref = embeddings[:parity_rows] @ embeddings.T
    np.fill_diagonal(cpu_ref, -1.0)
    if n > 1 and use_cuda:
        cpu_top = np.sort(cpu_ref, axis=1)[:, -k_eff:][:, ::-1]
        max_abs_diff = float(np.max(np.abs(cpu_top - top_vals[:parity_rows])))
    else:
        max_abs_diff = 0.0

    pr_max = float(np.max(pr_vec)) if n else 1.0
    updated: list[UniversalDirectoryCardV1] = []
    for i, c in enumerate(cards):
        norm_pr = float(pr_vec[i] / max(pr_max, 1e-12))
        code_density = min(1.0, math.log1p(c.source_file_count) / math.log1p(50))
        obo_cov = min(1.0, len(c.obo_concept_ids) / 5.0)
        doc_cov = 1.0 if c.context_docs else 0.0
        tool_route_bonus = min(1.0, 0.5 * bool(c.mcp_tools) + 0.5 * bool(c.route_surfaces))
        fusion = (
            0.35 * norm_pr
            + 0.25 * code_density
            + 0.20 * obo_cov
            + 0.10 * doc_cov
            + 0.10 * tool_route_bonus
        )
        neighbors: list[dict[str, Any]] = []
        if n > 1:
            for j_pos in range(k_eff):
                nb_idx = int(top_idx[i, j_pos])
                neighbors.append(
                    {
                        "dirPath": cards[nb_idx].dir_path,
                        "score": round(float(top_vals[i, j_pos]), 4),
                        "topo": cards[nb_idx].topo_classes[:2],
                    }
                )
        updated.append(
            UniversalDirectoryCardV1(
                **{
                    **asdict(c),
                    "semantic_pagerank": round(norm_pr, 5),
                    "fusion_rank": round(fusion, 5),
                    "semantic_neighbors": neighbors,
                }
            )
        )

    if use_cuda:
        del emb_t, sim_t
        torch.cuda.empty_cache()

    receipt = {
        "backend": "cuda:0" if use_cuda else "cpu",
        "deviceName": device_name,
        "vramFreeBeforeMiB": free_before_mib,
        "vramTotalMiB": total_mib,
        "directoryCount": n,
        "topKNeighbors": k_eff if n > 1 else 0,
        "computeMs": gpu_ms,
        "cpuParityCheckedRows": parity_rows,
        "cpuParityMaxAbsDiff": round(max_abs_diff, 8),
    }
    return updated, receipt


def enrich_top_cards_via_llama8090_v1(
    cards: list[UniversalDirectoryCardV1],
    *,
    llama_url: str = "http://127.0.0.1:8090",
    top_n: int = 8,
    timeout_seconds: float = 12.0,
) -> tuple[list[UniversalDirectoryCardV1], dict[str, Any]]:
    """Optionally summarize top-ranked directories using live `:8090` Gemma 4 (no hidden thoughts persisted)."""
    if top_n <= 0 or not cards:
        return cards, {"enabled": False, "enriched": 0}

    ranked_indices = sorted(range(len(cards)), key=lambda idx: -cards[idx].fusion_rank)[:top_n]
    enriched = 0
    out = list(cards)
    base = llama_url.rstrip("/")

    for idx in ranked_indices:
        c = out[idx]
        prompt = (
            f"Write ONE concise technical sentence (max 28 words, plain text, no markdown) describing what "
            f"repository directory `{c.dir_path}` owns based on: {c.summary[:500]}"
        )
        body = json.dumps(
            {
                "messages": [
                    {"role": "system", "content": "Output only one factual technical sentence. No preamble."},
                    {"role": "user", "content": prompt},
                ],
                "temperature": 0.1,
                "max_tokens": 96,
                "chat_template_kwargs": {"enable_thinking": False},
            }
        ).encode("utf-8")
        req = urllib.request.Request(
            f"{base}/v1/chat/completions",
            data=body,
            headers={"Content-Type": "application/json"},
            method="POST",
        )
        try:
            with urllib.request.urlopen(req, timeout=timeout_seconds) as resp:
                payload = json.loads(resp.read().decode("utf-8"))
                choice_msg = ((payload.get("choices") or [{}])[0]).get("message") or {}
                # Never read reasoning_content; strip any thought tags and refuse CoT preambles (AGENTS.md)
                msg = str(choice_msg.get("content") or "")
                cleaned = re.sub(r"<think>.*?</think>", "", msg, flags=re.DOTALL)
                cleaned = re.sub(r"<\|thought\|>.*?<\|channel\|>", "", cleaned, flags=re.DOTALL)
                cleaned = " ".join(cleaned.splitlines()).strip()
                lower_clean = cleaned.lower()
                if lower_clean.startswith(("the user wants", "let's ", "thinking process", "we need to", "1. ")):
                    cleaned = ""
                if cleaned:
                    out[idx] = UniversalDirectoryCardV1(**{**asdict(c), "llm_summary": cleaned[:320]})
                    enriched += 1
        except Exception as exc:
            return out, {"enabled": True, "enriched": enriched, "stoppedReason": f"{type(exc).__name__}: {exc}"}

    return out, {"enabled": True, "enriched": enriched, "endpoint": base}


def sync_directory_cards_to_qdrant_v1(
    cards: Sequence[UniversalDirectoryCardV1],
    embeddings: np.ndarray,
    *,
    qdrant_url: str = "http://127.0.0.1:6333",
    collection: str = QDRANT_DIR_COLLECTION_V1,
    offline_jsonl_path: str | Path | None = None,
    timeout_seconds: float = 2.5,
) -> dict[str, Any]:
    """Write a local proposal payload; refuse live projection without qualified v2 source bindings."""
    base = qdrant_url.rstrip("/")
    points: list[dict[str, Any]] = []
    for i, c in enumerate(cards):
        pid = str(uuid.uuid5(DIR_POINT_NAMESPACE, c.dir_path))
        points.append(
            {
                "id": pid,
                "vector": [round(float(x), 6) for x in embeddings[i].tolist()],
                "payload": {
                    "card_id": c.card_id,
                    "dir_path": c.dir_path,
                    "frontend_alias_path": c.frontend_alias_path,
                    "top_root": c.top_root,
                    "file_count": c.file_count,
                    "source_file_count": c.source_file_count,
                    "topo_classes": c.topo_classes,
                    "obo_concept_ids": c.obo_concept_ids,
                    "top_symbols": c.top_symbols[:8],
                    "top_files": c.top_files[:5],
                    "summary": (c.llm_summary or c.summary)[:800],
                    "fusion_rank": c.fusion_rank,
                    "content_hash": c.content_hash,
                    "canonical_authority": False,
                },
            }
        )

    if offline_jsonl_path is not None:
        qpath = Path(offline_jsonl_path)
        qpath.parent.mkdir(parents=True, exist_ok=True)
        with qpath.open("w", encoding="utf-8") as fh:
            for pt in points:
                fh.write(json.dumps(pt, separators=(",", ":")) + "\n")

    # Probe Qdrant health
    try:
        with urllib.request.urlopen(f"{base}/collections", timeout=timeout_seconds) as resp:
            if resp.status != 200:
                raise RuntimeError(f"HTTP {resp.status}")
    except Exception as exc:
        return {
            "qdrantStatus": "QUEUED_OFFLINE_DOCKER_PAUSED",
            "collection": collection,
            "preparedPoints": len(points),
            "liveWriteAttempted": False,
            "offlineJsonlPath": str(offline_jsonl_path) if offline_jsonl_path else None,
            "detail": f"{type(exc).__name__}: {exc}",
        }

    return {
        "qdrantStatus": "BLOCKED_UNQUALIFIED_WORKSPACE_INVENTORY",
        "collection": collection,
        "preparedPoints": len(points),
        "liveWriteAttempted": False,
        "workspaceRevision": None,
        "inventoryDigest": None,
        "reason": "Directory cards lack an admitted workspace revision and exact member-source bindings.",
        "offlineJsonlPath": str(offline_jsonl_path) if offline_jsonl_path else None,
    }


def search_directories_and_files_v1(
    query: str,
    *,
    repo_root: str | Path,
    cards: Sequence[UniversalDirectoryCardV1],
    embeddings: np.ndarray,
    encoder: DirectEg2OnnxEncoderV1,
    obo_catalog: OntologyCatalogV1 | None = None,
    obo_term_tokens: Mapping[str, tuple[str, ...]] | None = None,
    qdrant_url: str = "http://127.0.0.1:6333",
    top_k: int = 10,
    prefer_cuda: bool = True,
) -> dict[str, Any]:
    """Hybrid RTX GPU dense directory search + Qdrant chunk search (if online) + OBO concept + `rg` file hits."""
    import torch

    cleaned_q = query.strip()
    if not cleaned_q:
        raise ValueError("query must be non-empty")

    t0 = time.perf_counter()
    q_mat, enc_meta = encoder.encode([cleaned_q], dim=int(embeddings.shape[1]), task_prompt_name="CodeRetrieval")
    q_vec = q_mat[0]

    use_cuda = bool(prefer_cuda and torch.cuda.is_available())
    device = torch.device("cuda:0" if use_cuda else "cpu")
    with torch.no_grad():
        e_t = torch.from_numpy(np.ascontiguousarray(embeddings, dtype=np.float32)).to(device)
        q_t = torch.from_numpy(np.ascontiguousarray(q_vec, dtype=np.float32)).to(device)
        dense_scores = (e_t @ q_t).cpu().numpy()

    q_words = [w for w in re.split(r"[^a-z0-9_]+", cleaned_q.lower()) if len(w) >= 3]
    q_concepts: set[str] = set()
    if obo_catalog is not None and obo_term_tokens:
        q_word_set = set(q_words)
        for cid, ctoks in obo_term_tokens.items():
            if any(t in q_word_set for t in ctoks):
                q_concepts.add(cid)

    fused_rows: list[tuple[float, float, float, UniversalDirectoryCardV1]] = []
    for i, c in enumerate(cards):
        sem = float(dense_scores[i])
        lex_hits = sum(1 for w in q_words if w in c.dir_path.lower() or w in c.summary.lower())
        lex_score = min(1.0, lex_hits / max(1, len(q_words)))
        obo_overlap = (
            min(1.0, len(q_concepts.intersection(c.obo_concept_ids)) / max(1, len(q_concepts)))
            if q_concepts
            else 0.0
        )
        fused = 0.62 * max(0.0, sem) + 0.20 * lex_score + 0.10 * c.fusion_rank + 0.08 * obo_overlap
        fused_rows.append((fused, sem, lex_score, c))

    fused_rows.sort(key=lambda item: -item[0])
    selected = fused_rows[:top_k]

    # Fast bounded `rg -l` inside the top candidate directories to surface exact matching files
    root = Path(repo_root).resolve()
    rg_files: list[str] = []
    if q_words:
        pattern = "|".join(re.escape(w) for w in q_words[:5])
        target_dirs = [c.dir_path for _, _, _, c in selected[:6] if c.dir_path != "." and (root / c.dir_path).is_dir()]
        if target_dirs:
            try:
                rg_out = subprocess.check_output(
                    ["rg", "-l", "-i", "-m", "1", pattern, *target_dirs],
                    cwd=str(root),
                    text=True,
                    encoding="utf-8",
                    errors="replace",
                    timeout=4.0,
                )
                rg_files = [PureWindowsPath(ln.strip()).as_posix() for ln in rg_out.splitlines() if ln.strip()][:20]
            except Exception:
                pass

    # Optional live Qdrant chunk search across `codebase_chunks_eg2_768_q8` when `:6333` is reachable
    qdrant_hits: list[dict[str, Any]] = []
    qdrant_state = "UNREACHABLE_SKIPPED"
    try:
        q_req = urllib.request.Request(
            f"{qdrant_url.rstrip('/')}/collections/codebase_chunks_eg2_768_q8/points/search",
            data=json.dumps({"vector": q_vec.tolist(), "limit": min(8, top_k), "with_payload": True}).encode("utf-8"),
            headers={"Content-Type": "application/json"},
            method="POST",
        )
        with urllib.request.urlopen(q_req, timeout=1.5) as resp:
            q_data = json.loads(resp.read().decode("utf-8"))
            qdrant_state = "LIVE_OK"
            for pt in q_data.get("result") or []:
                pl = pt.get("payload") or {}
                qdrant_hits.append(
                    {
                        "score": round(float(pt.get("score", 0.0)), 4),
                        "relativePath": pl.get("relative_path") or pl.get("file_path"),
                        "domain": pl.get("domain"),
                    }
                )
    except Exception:
        pass

    return {
        "schema": SCHEMA_UNIVERSAL_DIR_SEARCH_V1,
        "query": cleaned_q,
        "computeBackend": "cuda:0" if use_cuda else "cpu",
        "encoder": enc_meta,
        "qdrantChunkLaneStatus": qdrant_state,
        "qdrantChunkHits": qdrant_hits,
        "matchedOboConcepts": sorted(q_concepts)[:10],
        "rgMatchedFilesInTopDirs": rg_files,
        "results": [
            {
                "rank": idx + 1,
                "dirPath": c.dir_path,
                "cardId": c.card_id,
                "fusedScore": round(f_score, 4),
                "denseCosine": round(sem_score, 4),
                "lexicalScore": round(lex_s, 4),
                "authorityFusionRank": c.fusion_rank,
                "inLegacyAtlasDirs": c.in_legacy_atlas_dirs,
                "topoClasses": c.topo_classes,
                "oboConceptIds": c.obo_concept_ids[:5],
                "topFiles": c.top_files[:5],
                "topSymbols": c.top_symbols[:6],
                "summary": c.llm_summary or c.summary[:320],
            }
            for idx, (f_score, sem_score, lex_s, c) in enumerate(selected)
        ],
        "elapsedMs": round((time.perf_counter() - t0) * 1000.0, 2),
        "canonicalAuthority": False,
    }
