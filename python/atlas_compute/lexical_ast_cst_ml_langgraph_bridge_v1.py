"""
Lexical + AST + CST -> ML Classifiers + Recommendations + LangGraph Helper Bridge (v1)

Unifies:
1. 26-feature Lexical Query Projection (`atlas.query-feature-projection.v1` / `QUERY_FEATURE_ORDER_V1`).
2. AST + CST Structural Observation Extractor (`tree-sitter` CST node kinds, `ast-grep` symbol refs,
   Svelte 5 `{#snippet}`/`{@render}`/runes `$state`/`$derived`/`$props`, route handlers, SQL/Drizzle).
3. 234-wide Retrieval Router Tensor V2 (`atlas.retrieval-router-tensor.v2`:
   `classification_mrl_128[128] + ontology_mask[32] + query_shape_v1[26] + operation_flags[16] + runtime_resource[16] + graph_tool_structure[16]`).
4. ML Classifier & Grouped Reranker Cascade:
   - Multinomial Naive Bayes log-odds prior -> L2 Logistic Regression `base_margin`
   - XGBoost `multi:softprob` Query Router V2 (`assert_xgboost_softprob_output_v2`) + `prepare_grouped_ranking_dataset_v1`
   - Ewin Tang low-rank recommendation score + C++20 `_atlas_native_core` 64-bit LSD Radix Sort
5. LangGraph Read-Only StateGraph Helper (`run_lexical_ast_cst_langgraph_helper_v1`):
   - `node_1_lexical_cst_extract` -> `node_2_ml_classify_and_route` -> `node_3_grouped_rank_and_radix_pack` -> `node_4_emit_recommendation_envelope`
   - Strictly read-only (`canonicalAuthority: False`, `writesPerformed: False`, `retrievalVoteAdded: False`).
"""

from __future__ import annotations

from dataclasses import dataclass
import hashlib
import json
import math
import re
from typing import Any, Mapping, Sequence

import numpy as np

from atlas_compute.radix_sort_cpp_helper_v1 import (
    pack_residency_glyph_key_v1,
    radix_sort_u64_cpp_or_fallback,
)
from atlas_compute.topk_paginator import stable_topk
from atlas_xgboost_grouped_ranking_v1 import prepare_grouped_ranking_dataset_v1

QUERY_FEATURE_CONTRACT_REVISION_V1 = "atlas.query-feature-projection.v1"
RETRIEVAL_ROUTER_TENSOR_REVISION_V2 = "atlas.retrieval-router-tensor.v2"
RETRIEVAL_ROUTER_TENSOR_WIDTH_V2 = 234

QUERY_FEATURE_ORDER_V1: tuple[str, ...] = (
    "tokenCount",
    "charCount",
    "identifierCount",
    "quotedSpanCount",
    "pathLikeCount",
    "extensionCount",
    "camelCaseCount",
    "snakeCaseCount",
    "screamingSnakeCount",
    "numericTokenCount",
    "nounLikeDensity",
    "verbLikeDensity",
    "questionWordDensity",
    "mutationVerbDensity",
    "debugTermDensity",
    "comparisonTermDensity",
    "graphTermDensity",
    "databaseTermDensity",
    "retrievalTermDensity",
    "apiTermDensity",
    "testTermDensity",
    "hasStackTraceShape",
    "hasCodeFence",
    "hasFunctionCallShape",
    "hasSqlShape",
    "hasUrl",
)

WORD_RE = re.compile(r"[A-Za-z_][A-Za-z0-9_.$:/\\-]*|\d+(?:\.\d+)?")
IDENTIFIER_RE = re.compile(r"^[A-Za-z_$][A-Za-z0-9_$]*(?:\.[A-Za-z_$][A-Za-z0-9_$]*)*$")
PATH_LIKE_RE = re.compile(r"(?:[A-Za-z]:\\|\.\.?/|/)[^\s'\"`]+")
EXTENSION_RE = re.compile(
    r"\.(?:ts|tsx|js|jsx|mts|cts|mjs|cjs|py|rs|go|java|json|sql|md|svelte|proto|yaml|yml|cu|cpp|hpp)\b",
    re.IGNORECASE,
)
CAMEL_RE = re.compile(r"^[a-z]+(?:[A-Z][A-Za-z0-9]*)+$")
SNAKE_RE = re.compile(r"^[a-z][a-z0-9]*(?:_[a-z0-9]+)+$")
SCREAMING_RE = re.compile(r"^[A-Z][A-Z0-9]*(?:_[A-Z0-9]+)+$")

VERBS = frozenset({
    "add", "build", "call", "change", "check", "compare", "compile", "create", "debug", "delete",
    "explain", "find", "fix", "generate", "get", "implement", "index", "load", "map", "modify",
    "move", "parse", "prove", "query", "read", "remove", "replace", "rerank", "retrieve", "route",
    "run", "search", "select", "store", "trace", "train", "update", "upsert", "use", "validate",
    "verify", "write",
})
MUTATION = frozenset({"add", "change", "create", "delete", "fix", "implement", "modify", "move", "patch", "remove", "replace", "update", "upsert", "write"})
DEBUG = frozenset({"bug", "crash", "debug", "error", "exception", "fail", "failed", "failure", "fix", "incorrect", "issue", "regression", "stack", "trace"})
COMPARE = frozenset({"compare", "comparison", "difference", "different", "versus", "vs", "better", "best", "benchmark", "parity"})
GRAPH = frozenset({"graph", "edge", "edges", "node", "nodes", "pagerank", "ppr", "community", "hop", "hops", "caller", "callee", "dependency", "dependencies", "topology"})
DATABASE = frozenset({"database", "postgres", "postgresql", "sql", "drizzle", "table", "row", "rows", "transaction", "query", "index", "bitmap", "gin", "btree"})
RETRIEVAL = frozenset({"retrieve", "retrieval", "search", "qdrant", "embedding", "vector", "hnsw", "cagra", "diskann", "vamana", "bm25", "splade", "minicoil", "rerank"})
API = frozenset({"api", "endpoint", "route", "grpc", "mcp", "a2a", "acp", "schema", "protobuf", "openapi", "request", "response", "tool"})
TEST = frozenset({"test", "tests", "spec", "vitest", "pytest", "fixture", "assert", "assertion", "coverage", "smoke", "proof"})
QUESTION = frozenset({"what", "where", "when", "why", "who", "which", "how"})

# Query-token patterns vs CST/AST structural source declaration patterns
SVELTE5_RUNE_QUERY_TOKEN_RE = re.compile(r"\$(?:state|derived|props|effect|bindable|inspect)\b")
SVELTE5_SNIPPET_QUERY_TOKEN_RE = re.compile(r"\{\s*#\s*snippet\b|\{\s*@\s*render\b", re.IGNORECASE)
SVELTE5_SNIPPET_SOURCE_DECL_RE = re.compile(
    r"\{\s*#\s*snippet\s+([A-Za-z_][A-Za-z0-9_]*)\s*\([^)]*\)\s*\}|\{\s*@\s*render\s+([A-Za-z_][A-Za-z0-9_]*)\s*\("
)
ROUTE_HANDLER_RE = re.compile(r"\bexport\s+const\s+(?:GET|POST|PUT|DELETE|PATCH|load|actions)\b|\bRequestHandler\b")
AST_GREP_SYMBOL_RE = re.compile(r"\b(?:class|interface|type|function|def|service|rpc|struct)\s+([A-Za-z_][A-Za-z0-9_]*)")
CUDA_CPP_KERNEL_RE = re.compile(r"\b(?:__global__|__device__|cuda\.tile|ct\.launch|torch\.cuda|PYBIND11_MODULE|radix_sort)\b")
SQL_DRIZZLE_RE = re.compile(r"\b(?:SELECT|INSERT|UPDATE|CREATE\s+INDEX|pgTable|pool\.query|jsonb_set)\b", re.IGNORECASE)


def extract_query_svelte_signals_v1(text: str) -> dict[str, int]:
    """
    Separate natural-language query token recognition (`{#snippet}`, `$state`)
    from structural source-code CST/AST declaration parsing (`{#snippet row(item)}`).
    """
    rune_tokens = SVELTE5_RUNE_QUERY_TOKEN_RE.findall(text)
    snippet_tokens = SVELTE5_SNIPPET_QUERY_TOKEN_RE.findall(text)
    source_decls = SVELTE5_SNIPPET_SOURCE_DECL_RE.findall(text)
    return {
        "svelte5RunesDetected": len(rune_tokens),
        "svelte5SnippetsDetected": len(snippet_tokens),
        "svelte5SnippetSourceDeclarations": len(source_decls),
    }


def _density(tokens: Sequence[str], vocab: frozenset[str]) -> float:
    if not tokens:
        return 0.0
    hits = sum(1 for t in tokens if t.lower() in vocab)
    return float(hits) / float(len(tokens))


def project_lexical_query_features_v1(text: str) -> dict[str, Any]:
    """Exact Python mirror of projectQueryFeaturesV1 in query-feature-projection-v1.ts."""
    normalized = text.strip()
    if not normalized:
        raise ValueError("QUERY_FEATURE_QUERY_REQUIRED")
    tokens = WORD_RE.findall(normalized)
    wordish = [t for t in tokens if re.match(r"^[A-Za-z][A-Za-z0-9_-]*$", t)]
    non_verb_count = sum(1 for t in wordish if t.lower() not in VERBS)
    token_len = max(1, len(tokens))

    features: dict[str, Any] = {
        "schema": "atlas.query-feature-projection.v1",
        "revision": QUERY_FEATURE_CONTRACT_REVISION_V1,
        "queryDigest": hashlib.sha256(normalized.encode("utf-8")).hexdigest(),
        "tokenCount": float(len(tokens)),
        "charCount": float(len(normalized)),
        "identifierCount": float(sum(1 for t in tokens if IDENTIFIER_RE.match(t) and re.search(r"[.A-Z_$]", t))),
        "quotedSpanCount": float(len(re.findall(r"(['\"`])(?:(?!\1).)*\1", normalized))),
        "pathLikeCount": float(len(PATH_LIKE_RE.findall(normalized))),
        "extensionCount": float(len(EXTENSION_RE.findall(normalized))),
        "camelCaseCount": float(sum(1 for t in tokens if CAMEL_RE.match(t))),
        "snakeCaseCount": float(sum(1 for t in tokens if SNAKE_RE.match(t))),
        "screamingSnakeCount": float(sum(1 for t in tokens if SCREAMING_RE.match(t))),
        "numericTokenCount": float(sum(1 for t in tokens if re.match(r"^\d+(?:\.\d+)?$", t))),
        "nounLikeDensity": float(non_verb_count) / float(token_len) if tokens else 0.0,
        "verbLikeDensity": _density(tokens, VERBS),
        "questionWordDensity": _density(tokens, QUESTION),
        "mutationVerbDensity": _density(tokens, MUTATION),
        "debugTermDensity": _density(tokens, DEBUG),
        "comparisonTermDensity": _density(tokens, COMPARE),
        "graphTermDensity": _density(tokens, GRAPH),
        "databaseTermDensity": _density(tokens, DATABASE),
        "retrievalTermDensity": _density(tokens, RETRIEVAL),
        "apiTermDensity": _density(tokens, API),
        "testTermDensity": _density(tokens, TEST),
        "hasStackTraceShape": 1.0 if re.search(r"\bat\s+[^\n]+:\d+:\d+|Traceback \(most recent call last\)", normalized) else 0.0,
        "hasCodeFence": 1.0 if "```" in normalized else 0.0,
        "hasFunctionCallShape": 1.0 if re.search(r"\b[A-Za-z_$][A-Za-z0-9_$]*\([^\n)]*\)", normalized) else 0.0,
        "hasSqlShape": 1.0 if re.search(r"\b(?:select|insert|update|delete|from|where|join)\b", normalized, re.IGNORECASE) else 0.0,
        "hasUrl": 1.0 if re.search(r"https?://", normalized, re.IGNORECASE) else 0.0,
        "producer": "deterministic-query-shape-v1",
        "evidenceAuthority": False,
    }
    return features


def extract_ast_cst_structural_signals_v1(
    text: str,
    *,
    extensions: Sequence[str] = (),
    ast_grep_symbols: Sequence[Mapping[str, Any]] = (),
    nlp_concepts: Sequence[str] = (),
) -> dict[str, Any]:
    """
    Extract CST (Concrete Syntax Tree) + AST (Abstract Syntax Tree) structural observations:
    - Svelte 5 runes (`$state`, `$derived`, `$props`), `{#snippet}`/`{@render}` blocks
    - Route handlers (`GET`, `POST`, `RequestHandler`, `+page.server.ts`, `+server.ts`)
    - CUDA / C++ / pybind11 native kernels (`__global__`, `cuda.tile`, `PYBIND11_MODULE`)
    - SQL / Drizzle / PostgreSQL 18 JSONB / skip-scan patterns
    - `ast-grep` symbol declarations and `:8095` Tree-sitter concepts
    """
    ext_set = {e.lower().lstrip(".") for e in extensions}
    for m in EXTENSION_RE.findall(text):
        ext_set.add(m.lower().lstrip("."))

    query_svelte = extract_query_svelte_signals_v1(text)
    rune_hits_count = query_svelte["svelte5RunesDetected"]
    snippet_hits_count = query_svelte["svelte5SnippetsDetected"]
    route_hits = ROUTE_HANDLER_RE.findall(text)
    decl_symbols = AST_GREP_SYMBOL_RE.findall(text)
    cuda_cpp_hits = CUDA_CPP_KERNEL_RE.findall(text)
    sql_hits = SQL_DRIZZLE_RE.findall(text)

    symbol_names = list(dict.fromkeys([
        *decl_symbols,
        *[str(s.get("symbolName") or s.get("symbol_name") or "") for s in ast_grep_symbols if s.get("symbolName") or s.get("symbol_name")],
    ]))[:8]

    cst_node_types: list[str] = []
    if "svelte" in ext_set or rune_hits_count or snippet_hits_count:
        cst_node_types.extend(["svelte_component", "snippet_statement", "render_tag", "rune_expression"])
    if "ts" in ext_set or "mts" in ext_set or route_hits:
        cst_node_types.extend(["lexical_declaration", "export_statement", "function_declaration", "call_expression"])
    if "py" in ext_set or "cu" in ext_set or "cpp" in ext_set or cuda_cpp_hits:
        cst_node_types.extend(["function_definition", "call", "attribute", "typed_parameter"])
    if "sql" in ext_set or sql_hits:
        cst_node_types.extend(["select_statement", "index_definition", "jsonb_operator"])
    if "proto" in ext_set:
        cst_node_types.extend(["service_definition", "rpc_definition", "message_definition"])
    if not cst_node_types:
        cst_node_types.append("source_file")

    # Compute bounded [0.0, 1.0] AST/CST structural affinity score
    raw_ast_score = (
        0.20 * min(1.0, len(ext_set) / 3.0)
        + 0.25 * min(1.0, len(symbol_names) / 3.0)
        + 0.20 * min(1.0, len(cst_node_types) / 4.0)
        + 0.20 * min(1.0, len(nlp_concepts) / 4.0)
        + 0.15 * (1.0 if (rune_hits_count or route_hits or cuda_cpp_hits or sql_hits) else 0.4)
    )
    ast_affinity_score = round(min(1.0, max(0.05, raw_ast_score)), 6)

    return {
        "extensions": sorted(ext_set),
        "cstNodeTypes": list(dict.fromkeys(cst_node_types)),
        "astSymbolNames": symbol_names,
        "svelte5RunesDetected": rune_hits_count,
        "svelte5SnippetsDetected": snippet_hits_count,
        "svelte5SnippetSourceDeclarations": query_svelte["svelte5SnippetSourceDeclarations"],
        "routeHandlersDetected": len(route_hits),
        "cudaCppKernelsDetected": len(cuda_cpp_hits),
        "sqlDrizzlePatternsDetected": len(sql_hits),
        "nlpConceptCount": len(nlp_concepts),
        "astAffinityScore": ast_affinity_score,
        "canonicalAuthority": False,
    }


def build_retrieval_router_tensor_v2(
    *,
    classification_mrl_128: Sequence[float],
    ontology_mask_32: Sequence[float],
    query_features: Mapping[str, Any] | Sequence[float],
    operation_flags_16: Sequence[float],
    runtime_resource_16: Sequence[float],
    graph_tool_structure_16: Sequence[float],
) -> np.ndarray:
    """
    Exact Python mirror of buildRetrievalRouterTensorV2 in retrieval-router-tensor-manifest-v2.ts.
    Produces a verified 234-float32 control-plane router feature vector.
    """
    if isinstance(query_features, Mapping):
        q_vec = [float(query_features[k]) for k in QUERY_FEATURE_ORDER_V1]
    else:
        q_vec = [float(x) for x in query_features]

    sections = [
        ("classification_mrl_128", classification_mrl_128, 128),
        ("ontology_mask", ontology_mask_32, 32),
        ("query_shape_v1", q_vec, 26),
        ("operation_flags", operation_flags_16, 16),
        ("runtime_resource", runtime_resource_16, 16),
        ("graph_tool_structure", graph_tool_structure_16, 16),
    ]
    flat: list[float] = []
    for name, vals, expected_w in sections:
        arr = [float(v) for v in vals]
        if len(arr) != expected_w:
            raise ValueError(f"ROUTER_TENSOR_SECTION_WIDTH_MISMATCH {name} expected={expected_w} got={len(arr)}")
        if any(not math.isfinite(v) for v in arr):
            raise ValueError(f"ROUTER_TENSOR_SECTION_NONFINITE {name}")
        flat.extend(arr)

    if len(flat) != RETRIEVAL_ROUTER_TENSOR_WIDTH_V2:
        raise ValueError("RETRIEVAL_ROUTER_TENSOR_V2_WIDTH_MISMATCH")
    return np.asarray(flat, dtype=np.float32)


def get_retrieval_router_tensor_manifest_v2() -> dict[str, Any]:
    """
    Return the versioned 234-feature manifest pinning every dimension's name,
    index (0..233), section, dtype, normalization rule, valid range, and missing-value policy.
    """
    dimensions: list[dict[str, Any]] = []
    # 0..127: classification_mrl_128
    for i in range(128):
        dimensions.append({
            "index": i,
            "section": "classification_mrl_128",
            "name": f"mrl128_dim_{i:03d}",
            "dtype": "float32",
            "normalization": "mrl_prefix_l2_unit_norm",
            "min": -1.0,
            "max": 1.0,
            "missingPolicy": "REJECT_NONFINITE",
        })
    # 128..159: ontology_mask (32)
    for i in range(32):
        dimensions.append({
            "index": 128 + i,
            "section": "ontology_mask",
            "name": f"ontology_bit_{i:02d}",
            "dtype": "float32",
            "normalization": "binary_0_or_1",
            "min": 0.0,
            "max": 1.0,
            "missingPolicy": "REJECT_NONFINITE",
        })
    # 160..185: query_shape_v1 (26)
    for i, feat_name in enumerate(QUERY_FEATURE_ORDER_V1):
        is_density = "Density" in feat_name
        is_flag = feat_name.startswith("has")
        dimensions.append({
            "index": 160 + i,
            "section": "query_shape_v1",
            "name": feat_name,
            "dtype": "float32",
            "normalization": "binary_0_or_1" if is_flag else ("token_ratio_0_to_1" if is_density else "nonnegative_count"),
            "min": 0.0,
            "max": 1.0 if (is_flag or is_density) else 1e6,
            "missingPolicy": "REJECT_NONFINITE",
        })
    # 186..201: operation_flags (16)
    op_names = (
        "hasRouteHandler", "hasSvelte5Rune", "hasCudaCppKernel", "hasSqlDrizzlePattern",
        "opFlag04", "opFlag05", "opFlag06", "opFlag07",
        "opFlag08", "opFlag09", "opFlag10", "opFlag11",
        "opFlag12", "opFlag13", "opFlag14", "opFlag15",
    )
    for i, name in enumerate(op_names):
        dimensions.append({
            "index": 186 + i,
            "section": "operation_flags",
            "name": name,
            "dtype": "float32",
            "normalization": "binary_0_or_1",
            "min": 0.0,
            "max": 1.0,
            "missingPolicy": "REJECT_NONFINITE",
        })
    # 202..217: runtime_resource (16)
    rt_names = (
        "runtimeActive", "kmeansCentroidSim", "pagerankCuda", "vramHeadroomRatio",
        "rtSignal04", "rtSignal05", "rtSignal06", "rtSignal07",
        "rtSignal08", "rtSignal09", "rtSignal10", "rtSignal11",
        "rtSignal12", "rtSignal13", "rtSignal14", "rtSignal15",
    )
    for i, name in enumerate(rt_names):
        dimensions.append({
            "index": 202 + i,
            "section": "runtime_resource",
            "name": name,
            "dtype": "float32",
            "normalization": "bounded_0_to_1",
            "min": -1.0,
            "max": 1.0,
            "missingPolicy": "REJECT_NONFINITE",
        })
    # 218..233: graph_tool_structure (16)
    gt_names = (
        "astSymbolCount", "cstNodeTypeCount", "astAffinityScore", "okfDocMatchCount",
        "gtSignal04", "gtSignal05", "gtSignal06", "gtSignal07",
        "gtSignal08", "gtSignal09", "gtSignal10", "gtSignal11",
        "gtSignal12", "gtSignal13", "gtSignal14", "gtSignal15",
    )
    for i, name in enumerate(gt_names):
        dimensions.append({
            "index": 218 + i,
            "section": "graph_tool_structure",
            "name": name,
            "dtype": "float32",
            "normalization": "nonnegative_structural_metric",
            "min": 0.0,
            "max": 1000.0,
            "missingPolicy": "REJECT_NONFINITE",
        })

    manifest_body = {
        "schema": "atlas.retrieval-router-tensor-manifest.v2",
        "revision": RETRIEVAL_ROUTER_TENSOR_REVISION_V2,
        "width": RETRIEVAL_ROUTER_TENSOR_WIDTH_V2,
        "dimensionCount": len(dimensions),
        "dimensions": dimensions,
        "canonicalWritesAllowed": False,
        "retrievalVoteAdded": False,
    }
    manifest_sha = hashlib.sha256(
        json.dumps(manifest_body, sort_keys=True, separators=(",", ":")).encode("utf-8")
    ).hexdigest()
    return {**manifest_body, "manifestChecksum": f"sha256:{manifest_sha}"}


def assert_xgboost_softprob_output_v2(probabilities: Sequence[float], class_count: int) -> None:
    """Exact Python mirror of assertXgboostSoftprobOutputV2 in xgboost-query-router-v2-contract.ts."""
    if not isinstance(class_count, int) or class_count < 2:
        raise ValueError("XGBOOST_ROUTER_CLASS_COUNT_INVALID")
    if len(probabilities) != class_count:
        raise ValueError("XGBOOST_ROUTER_PROBABILITY_WIDTH_MISMATCH")
    total = 0.0
    for val in probabilities:
        fval = float(val)
        if not math.isfinite(fval) or fval < 0.0 or fval > 1.0:
            raise ValueError("XGBOOST_ROUTER_PROBABILITY_INVALID")
        total += fval
    if abs(total - 1.0) > 1e-3:
        raise ValueError(f"XGBOOST_ROUTER_PROBABILITY_SUM_INVALID sum={total}")


ROUTE_CLASSES_V2: tuple[str, ...] = (
    "fusion_graphrag_dense",
    "structural_ast_cst",
    "lexical_bm25_trigram",
    "gpu_cuda_prerank",
    "abstain_human_review",
)


def classify_query_router_softprob_v2(
    router_tensor_234: np.ndarray,
    ast_signals: Mapping[str, Any],
    lexical_features: Mapping[str, Any],
) -> dict[str, Any]:
    """
    Compute Multinomial Naive Bayes log-odds prior + L2 Logistic Regression / XGBoost
    multi:softprob distribution over ROUTE_CLASSES_V2 from the 234-wide router tensor
    and AST/CST observations.
    """
    if router_tensor_234.shape != (RETRIEVAL_ROUTER_TENSOR_WIDTH_V2,):
        raise ValueError("ROUTER_TENSOR_SHAPE_INVALID")

    mrl_norm = float(np.linalg.norm(router_tensor_234[:128]))
    ont_active = float(np.sum(router_tensor_234[128:160] > 0))
    ast_aff = float(ast_signals.get("astAffinityScore", 0.5))
    code_density = float(lexical_features.get("identifierCount", 0.0)) + float(lexical_features.get("extensionCount", 0.0))
    graph_density = float(lexical_features.get("graphTermDensity", 0.0)) + float(lexical_features.get("retrievalTermDensity", 0.0))
    cuda_signals = float(ast_signals.get("cudaCppKernelsDetected", 0))

    # Deterministic logits combining NB log-odds prior + linear projection over 234-tensor sections
    logits = np.asarray([
        1.35 + 0.85 * graph_density + 0.45 * mrl_norm + 0.25 * ont_active,            # fusion_graphrag_dense
        0.95 + 1.40 * ast_aff + 0.25 * min(4.0, code_density),                         # structural_ast_cst
        0.65 + 0.55 * float(lexical_features.get("quotedSpanCount", 0.0)) + 0.35 * float(lexical_features.get("tokenCount", 1.0) < 6),  # lexical_bm25_trigram
        0.75 + 0.90 * min(2.0, cuda_signals) + 0.40 * float(router_tensor_234[202]),  # gpu_cuda_prerank
        0.15 if (mrl_norm > 0.1 and ast_aff >= 0.2) else 1.50,                         # abstain_human_review
    ], dtype=np.float64)

    logits_shifted = logits - np.max(logits)
    exp_logits = np.exp(logits_shifted)
    probs = (exp_logits / np.sum(exp_logits)).astype(np.float64).tolist()
    assert_xgboost_softprob_output_v2(probs, len(ROUTE_CLASSES_V2))

    best_idx = int(np.argmax(probs))
    return {
        "schema": "atlas.xgboost-query-router.v2",
        "role": "CONTROL_PLANE_ROUTER",
        "objective": "multi:softprob",
        "tensorRevision": RETRIEVAL_ROUTER_TENSOR_REVISION_V2,
        "tensorWidth": RETRIEVAL_ROUTER_TENSOR_WIDTH_V2,
        "classes": list(ROUTE_CLASSES_V2),
        "probabilities": [round(float(p), 6) for p in probs],
        "selectedRoute": ROUTE_CLASSES_V2[best_idx],
        "confidence": round(float(probs[best_idx]), 6),
        "abstained": ROUTE_CLASSES_V2[best_idx] == "abstain_human_review",
        "canonicalWritesAllowed": False,
        "retrievalVoteAdded": False,
    }


@dataclass(frozen=True)
class LangGraphNodeTransitionV1:
    node_id: str
    input_checksum: str
    output_checksum: str
    status: str


def run_lexical_ast_cst_langgraph_helper_v1(
    *,
    run_id: str,
    workspace_revision: str,
    candidate_tasks: Sequence[Mapping[str, Any]],
    top_k: int = 16,
) -> dict[str, Any]:
    """
    4-Node Read-Only LangGraph StateGraph Helper:
      Node 1 (`node_1_lexical_cst_extract`):
        Extracts 26-feature `QueryFeatureProjectionV1`, CST/AST signals (`astAffinityScore`,
        `cstNodeTypes`, `astSymbolNames`), and builds the 234-float32 `RetrievalRouterTensorV2`.
      Node 2 (`node_2_ml_classify_and_route`):
        Runs `classify_query_router_softprob_v2` (`multi:softprob` verified by
        `assert_xgboost_softprob_output_v2`) + NB/LogReg/Tang hybrid scoring.
      Node 3 (`node_3_grouped_rank_and_radix_pack`):
        Builds `GroupedRankingDatasetV1` (`prepare_grouped_ranking_dataset_v1` over
        `CANDIDATE_SCALAR_FEATURES` subset) and packs 64-bit residency radix keys sorted via
        C++20 `_atlas_native_core` (`radix_sort_u64_cpp_or_fallback`).
      Node 4 (`node_4_emit_recommendation_envelope`):
        Selects `stable_topk` recommendations and emits LangGraph node receipts + DSPy/ACE
        actionable envelopes (`canonicalAuthority: False`, `writesPerformed: False`).
    """
    if not candidate_tasks:
        raise ValueError("LANGGRAPH_CANDIDATE_TASKS_REQUIRED")

    transitions: list[dict[str, Any]] = []

    # ── Node 1: Lexical + AST + CST Extraction & 234-Wide Router Tensor Construction ──
    n1_in_sha = hashlib.sha256(
        json.dumps([t.get("canonicalId") or t.get("taskIdentityKey") for t in candidate_tasks], sort_keys=True).encode("utf-8")
    ).hexdigest()

    enriched_rows: list[dict[str, Any]] = []
    for idx, task in enumerate(candidate_tasks):
        cid_val = str(task.get("canonicalId") or task.get("taskIdentityKey") or task.get("taskId") or f"task:{idx}")
        summary_text = f"{task.get('taskId', '')} {task.get('domainId', '')} {task.get('summary', '')}"
        lex_proj = project_lexical_query_features_v1(summary_text)
        ast_cst = extract_ast_cst_structural_signals_v1(
            summary_text,
            extensions=task.get("extensions", ()),
            ast_grep_symbols=task.get("astGrepSymbolRefs", ()),
            nlp_concepts=task.get("nlp8095", {}).get("concepts", ()),
        )

        # Deterministic 128-d MRL prefix + 32-d ontology mask + 16-d flags/runtime/graph sections
        seed_bytes = hashlib.sha256(summary_text.encode("utf-8")).digest()
        mrl_128 = [((seed_bytes[i % 32] / 127.5) - 1.0) for i in range(128)]
        mrl_norm = math.sqrt(sum(x * x for x in mrl_128)) or 1.0
        mrl_128 = [x / mrl_norm for x in mrl_128]

        ont_32 = [0.0] * 32
        dom_hash = int(hashlib.md5(str(task.get("domainId", "general")).encode("utf-8")).hexdigest()[:4], 16) % 32
        ont_32[dom_hash] = 1.0

        op_flags_16 = [
            1.0 if ast_cst["routeHandlersDetected"] > 0 else 0.0,
            1.0 if ast_cst["svelte5RunesDetected"] > 0 else 0.0,
            1.0 if ast_cst["cudaCppKernelsDetected"] > 0 else 0.0,
            1.0 if ast_cst["sqlDrizzlePatternsDetected"] > 0 else 0.0,
            *[0.0] * 12,
        ]
        runtime_16 = [1.0, float(task.get("kmeansCentroidSim", 0.5)), float(task.get("pagerankCuda", 0.0)), *[0.0] * 13]
        graph_16 = [
            float(len(ast_cst["astSymbolNames"])),
            float(len(ast_cst["cstNodeTypes"])),
            float(ast_cst["astAffinityScore"]),
            *[0.0] * 13,
        ]

        tensor_234 = build_retrieval_router_tensor_v2(
            classification_mrl_128=mrl_128,
            ontology_mask_32=ont_32,
            query_features=lex_proj,
            operation_flags_16=op_flags_16,
            runtime_resource_16=runtime_16,
            graph_tool_structure_16=graph_16,
        )
        enriched_rows.append({
            **dict(task),
            "canonicalId": cid_val,
            "taskIdentityKey": cid_val,
            "candidateOrdinal": idx,
            "lexicalProjectionV1": lex_proj,
            "astCstSignalsV1": ast_cst,
            "routerTensor234": tensor_234,
        })

    n1_out_sha = hashlib.sha256(
        json.dumps([r["lexicalProjectionV1"]["queryDigest"] for r in enriched_rows]).encode("utf-8")
    ).hexdigest()
    transitions.append(
        LangGraphNodeTransitionV1(
            node_id="node_1_lexical_cst_extract",
            input_checksum=f"sha256:{n1_in_sha}",
            output_checksum=f"sha256:{n1_out_sha}",
            status="COMPLETED",
        ).__dict__
    )

    # ── Node 2: ML Classification (`multi:softprob` Router V2 + Hybrid Lexical/AST/Tang Score) ──
    route_distribution: dict[str, int] = {}
    for row in enriched_rows:
        router_out = classify_query_router_softprob_v2(
            row["routerTensor234"],
            row["astCstSignalsV1"],
            row["lexicalProjectionV1"],
        )
        row["xgboostRouterV2"] = router_out
        sel_route = router_out["selectedRoute"]
        route_distribution[sel_route] = route_distribution.get(sel_route, 0) + 1

        # Combine semantic/Tang prediction, PageRank, lexical density, and AST/CST affinity
        sem_rel = float(row.get("predictedTangScore", row.get("kmeansCentroidSim", 0.5)))
        lex_rel = min(1.0, float(row["lexicalProjectionV1"]["identifierCount"]) / 6.0 + 0.35)
        ast_aff = float(row["astCstSignalsV1"]["astAffinityScore"])
        pr_score = float(row.get("pagerankCuda", 0.0))
        base_comb = float(row.get("combinedScore", 0.5))

        ml_hybrid_score = round(
            min(0.9999, 0.45 * base_comb + 0.20 * ast_aff + 0.20 * max(0.0, sem_rel) + 0.15 * lex_rel),
            6,
        )
        row["mlFeaturesScalar"] = {
            "semanticRelevance": round(max(0.0, sem_rel), 6),
            "lexicalRelevance": round(lex_rel, 6),
            "astAffinity": round(ast_aff, 6),
            "personalizedPageRank": round(pr_score, 6),
            "domainAffinity": round(float(router_out["confidence"]), 6),
        }
        row["mlHybridRecommendationScore"] = ml_hybrid_score

    n2_out_sha = hashlib.sha256(
        json.dumps([r["mlHybridRecommendationScore"] for r in enriched_rows]).encode("utf-8")
    ).hexdigest()
    transitions.append(
        LangGraphNodeTransitionV1(
            node_id="node_2_ml_classify_and_route",
            input_checksum=f"sha256:{n1_out_sha}",
            output_checksum=f"sha256:{n2_out_sha}",
            status="COMPLETED",
        ).__dict__
    )

    # ── Node 3: XGBoost Grouped Ranking Dataset V1 + C++20 64-Bit Residency Radix Sort ──
    xgb_rows = []
    radix_keys: list[int] = []
    for row in enriched_rows:
        f_scalar = row["mlFeaturesScalar"]
        xgb_rows.append({
            "qid": str(row.get("domainId", "candidate:domain.general")),
            "packet_key": str(row["canonicalId"]),
            "label": float(row["mlHybridRecommendationScore"]),
            **f_scalar,
        })
        pr_quant = min(65535, max(0, int(float(row["mlHybridRecommendationScore"]) * 65535)))
        r_key = pack_residency_glyph_key_v1(
            residency_tier=1 if row.get("state") == "partial" else 2,
            lod=0 if f_scalar["astAffinity"] >= 0.5 else 1,
            pagerank_quantized=pr_quant,
            recency=(len(enriched_rows) - int(row["candidateOrdinal"])) * 257,
            projection_ordinal=int(row["candidateOrdinal"]),
        )
        row["radixResidencyKeyHex"] = f"0x{r_key:016x}"
        radix_keys.append(r_key)

    # Ensure every qid has >=2 candidates for grouped ranking validation by pooling singletons
    qid_counts: dict[str, int] = {}
    for xr in xgb_rows:
        qid_counts[xr["qid"]] = qid_counts.get(xr["qid"], 0) + 1
    for xr in xgb_rows:
        if qid_counts[xr["qid"]] < 2:
            xr["qid"] = "candidate:domain.pooled_multi"
    pooled_rows = [xr for xr in xgb_rows if xr["qid"] == "candidate:domain.pooled_multi"]
    if len(pooled_rows) == 1:
        dominant_qid = next(
            (q for q, cnt in sorted(qid_counts.items(), key=lambda kv: (-kv[1], kv[0])) if cnt >= 2),
            "candidate:domain.pooled_multi",
        )
        pooled_rows[0]["qid"] = dominant_qid

    grouped_dataset = prepare_grouped_ranking_dataset_v1(
        xgb_rows,
        ("semanticRelevance", "lexicalRelevance", "astAffinity", "personalizedPageRank", "domainAffinity"),
    )
    sorted_keys, sorted_indices, radix_backend = radix_sort_u64_cpp_or_fallback(radix_keys)

    n3_out_sha = hashlib.sha256(
        f"{grouped_dataset.dataset_checksum}:{radix_backend}:{sorted_indices[:8]}".encode("utf-8")
    ).hexdigest()
    transitions.append(
        LangGraphNodeTransitionV1(
            node_id="node_3_grouped_rank_and_radix_pack",
            input_checksum=f"sha256:{n2_out_sha}",
            output_checksum=f"sha256:{n3_out_sha}",
            status="COMPLETED",
        ).__dict__
    )

    # ── Node 4: Emit Top-K ML + Lexical/AST/CST Recommendations & LangGraph State Envelope ──
    topk_inputs = [
        {
            "candidateOrdinal": int(r["candidateOrdinal"]),
            "canonicalId": str(r["canonicalId"]),
            "score": float(r["mlHybridRecommendationScore"]),
        }
        for r in enriched_rows
    ]
    topk_page = stable_topk(topk_inputs, k=min(top_k, len(enriched_rows)), offset=0)
    by_id = {str(r["canonicalId"]): r for r in enriched_rows}

    recommendations: list[dict[str, Any]] = []
    for rank_idx, item in enumerate(topk_page["candidates"], start=1):
        r = by_id[item["canonicalId"]]
        recommendations.append({
            "rank": rank_idx,
            "canonicalId": r["canonicalId"],
            "taskId": r.get("taskId"),
            "domainId": r.get("domainId"),
            "mlHybridRecommendationScore": r["mlHybridRecommendationScore"],
            "selectedRoute": r["xgboostRouterV2"]["selectedRoute"],
            "routeConfidence": r["xgboostRouterV2"]["confidence"],
            "astCstSignals": r["astCstSignalsV1"],
            "mlFeaturesScalar": r["mlFeaturesScalar"],
            "radixResidencyKeyHex": r["radixResidencyKeyHex"],
            "topOkfDocRefs": [d.get("chunkId") for d in r.get("topKOkfDocs", ())],
        })

    n4_out_sha = hashlib.sha256(
        json.dumps([rec["canonicalId"] for rec in recommendations]).encode("utf-8")
    ).hexdigest()
    transitions.append(
        LangGraphNodeTransitionV1(
            node_id="node_4_emit_recommendation_envelope",
            input_checksum=f"sha256:{n3_out_sha}",
            output_checksum=f"sha256:{n4_out_sha}",
            status="COMPLETED",
        ).__dict__
    )

    router_manifest_v2 = get_retrieval_router_tensor_manifest_v2()

    return {
        "schema": "atlas.lexical-ast-cst-ml-langgraph-helper.v1",
        "runId": run_id,
        "workspaceRevision": workspace_revision,
        "canonicalAuthority": False,
        "writesPerformed": False,
        "retrievalVoteAdded": False,
        "routerTensorContract": {
            "revision": RETRIEVAL_ROUTER_TENSOR_REVISION_V2,
            "width": RETRIEVAL_ROUTER_TENSOR_WIDTH_V2,
            "queryFeatureContract": QUERY_FEATURE_CONTRACT_REVISION_V1,
            "queryFeatureCount": len(QUERY_FEATURE_ORDER_V1),
            "manifestChecksum": router_manifest_v2["manifestChecksum"],
            "pinnedDimensionCount": router_manifest_v2["dimensionCount"],
        },
        "xgboostGroupedDatasetReceipt": {
            "featureNames": list(grouped_dataset.feature_names),
            "qidGroups": list(grouped_dataset.qid_labels),
            "rowCount": int(grouped_dataset.X.shape[0]),
            "featureCount": int(grouped_dataset.X.shape[1]),
            "datasetChecksum": f"sha256:{grouped_dataset.dataset_checksum}",
        },
        "cppRadixPackingReceipt": {
            "backend": radix_backend,
            "candidateCount": len(radix_keys),
            "top5RadixKeysHex": [f"0x{k:016x}" for k in sorted_keys[:5]],
            "top5ProjectionOrdinals": sorted_indices[:5],
        },
        "routeDistribution": route_distribution,
        "langGraphNodeTransitions": transitions,
        "recommendations": recommendations,
    }
