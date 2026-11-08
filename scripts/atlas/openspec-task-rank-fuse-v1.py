#!/usr/bin/env python3
"""
openspec-task-rank-fuse-v1.py

Fuses three advisory signals over every OPEN task from openspec-task-extract-v1
with Reciprocal Rank Fusion (RRF) and writes a paginated ranking.

Signals (each produces its own ranking, fused by RRF):
  citation  PageRank over the explicit task->task citation graph (from extract)
  theme     number of keyword themes matched; THEMES is imported from the
            existing owner scripts/atlas/rank-open-tasks-v1.mjs (not copied)
  knn       PageRank over a top-k cosine kNN graph built from TF-IDF of each
            task's text (graph RAG-style neighbourhood structure, no LLM)

RRF: score(d) = sum_s 1 / (RRF_K + rank_s(d)), RRF_K = 60 (Cormack et al.).

Read-only with respect to all sources and stores. Writes only new report files.
Advisory: canonicalAuthority false; nothing here selects or dispatches a task.

Usage (repo root):
  python scripts/atlas/openspec-task-rank-fuse-v1.py --in docs/reports/<extract>.all-open.jsonl \
      --out-dir docs/reports --k 10 --page-size 100
"""
import argparse
import datetime as dt
import hashlib
import json
import os
import re
import subprocess
import sys
import time
from collections import Counter, defaultdict

import networkx as nx
import numpy as np

RRF_K = 60
STOP = set("""a an and are as at be by for from has have in into is it its of on or that the this to with
will was were when which who not no but if then than so such can each per via use using based any all
task tasks add new make ensure keep do does done open""".split())
TOKEN = re.compile(r"[a-z][a-z0-9_]{2,}")

# 1. Canonical 10-Domain Task Taxonomy (Revision: openspec-task-taxonomy-v2)
#    Explicitly bridged at the classification boundary to `nes-domain-palette-v1`
#    (scripts/atlas/data/nes-domain-palette-v1.json) and `20261018_atlas_nes_lut_v1.sql`.
TASK_TAXONOMY_REVISION = "openspec-task-taxonomy-v2"
CANONICAL_PALETTE_REVISION = "nes-domain-palette-v1"
TASK_DOMAIN_COUNT = 10
VALID_TASK_DOMAIN_MASK = (1 << TASK_DOMAIN_COUNT) - 1  # 0x03FF = 1023

CANONICAL_NES_PALETTE_V1 = {
    "auth":      {"jsonLutByte": 1,  "sqlSeedLutByte": 1, "nesHex": "0x16", "label": "DOM_AUTH_GUARD"},
    "ui":        {"jsonLutByte": 2,  "sqlSeedLutByte": 2, "nesHex": "0x2A", "label": "DOM_UI_SVELTE5_RUNES"},
    "retrieval": {"jsonLutByte": 3,  "sqlSeedLutByte": 3, "nesHex": "0x21", "label": "DOM_RETRIEVAL_ANN_RRF"},
    "network":   {"jsonLutByte": 4,  "sqlSeedLutByte": 4, "nesHex": "0x2C", "label": "DOM_NETWORK_HTTP_TRPC"},
    "database":  {"jsonLutByte": 5,  "sqlSeedLutByte": 5, "nesHex": "0x12", "label": "DOM_PG18_DRIZZLE"},
    "cache":     {"jsonLutByte": 6,  "sqlSeedLutByte": 6, "nesHex": "0x27", "label": "DOM_VALKEY_BITFROST_LRU"},
    "agent":     {"jsonLutByte": 7,  "sqlSeedLutByte": 7, "nesHex": "0x24", "label": "DOM_AGENT_OAK_RLM_DSPY"},
    "graph":     {"jsonLutByte": 8,  "sqlSeedLutByte": 8, "nesHex": "0x1A", "label": "DOM_GRAPH_CUGRAPH_PAGERANK"},
    "ml":        {"jsonLutByte": 9,  "sqlSeedLutByte": 9, "nesHex": "0x14", "label": "DOM_ML_ATEN_TENSORRT_GEMM"},
    "general":   {"jsonLutByte": 10, "sqlSeedLutByte": 0, "nesHex": "0x0F", "label": "DOM_GENERAL_FALLBACK"},
}

DOMAIN_TAXONOMY = [
    (1,  "0x01", "WHO_IDENTITY_AUTH",    "WHO",    "auth",      re.compile(r"\b(auth\w*|session|user|person\w*|witness|biometric|fre\s*901|ownership|guard|permission)\b", re.I)),
    (2,  "0x02", "WHAT_STATUTE_CORPUS",  "WHAT",   "retrieval", re.compile(r"\b(statut\w*|u\.s\.c|corpus|glossary|indictment|citation|fre\s*\d+|clause|license|sbom)\b", re.I)),
    (3,  "0x03", "WHY_LEDGER_MOTIVE",    "WHY",    "cache",     re.compile(r"\b(ledger|wire|financial|audit|telemetry|metric\w*|otel|opentelemetry|receipt\w*)\b", re.I)),
    (4,  "0x04", "HOW_SCENE_3D_GLB",     "HOW",    "graph",     re.compile(r"\b(glb|gltf|blender|mesh\w*|rig\w*|bone\w*|mixamo|primitive\w*|caliper|obb|three\.?js|shader\w*|wgsl|glsl)\b", re.I)),
    (5,  "0x05", "STORAGE_SEAWEED_S3",   "INGEST", "network",   re.compile(r"\b(seaweed\w*|bucket\w*|s3|upload\w*|multipart|sha-?256|mime|blob|artifact\w*)\b", re.I)),
    (6,  "0x06", "DATA_PG18_DRIZZLE",    "DATA",   "database",  re.compile(r"\b(postgres\w*|pg18|drizzle|pgvector|qdrant|sql|migration\w*|schema\w*|bytea|bitset|jsonb|valkey|redis)\b", re.I)),
    (7,  "0x07", "ENGINE_BVH_N64_ARENA", "ENGINE", "ml",        re.compile(r"\b(bvh|raycast\w*|tlas|blas|n64|arena|slot\w*|fsm|xstate|stride)\b", re.I)),
    (8,  "0x08", "SPLAT_SPZ_SOG_LOD",    "RENDER", "general",   re.compile(r"\b(spz|sog|splat\w*|playcanvas|lod|supersplat|gaussian)\b", re.I)),
    (9,  "0x09", "AGENT_ORNITH_RAG_GPU", "AGENT",  "agent",     re.compile(r"\b(ornith|gemma\w*|llm|dspy|turbovec|cuda|aten|onnx|tensorrt|cuvs|knn|pagerank|graphify|bitfrost|mcp)\b", re.I)),
    (10, "0x0A", "UI_SVELTE5_BOARD",     "UI",     "ui",        re.compile(r"\b(svelte\w*|board|canvas|modal|carousel|inspector|playwright|chromium|vitest|route\w*|viewport)\b", re.I)),
]


def encode_task_domains(codes: list[int]) -> int:
    mask = 0
    for code in codes:
        if not isinstance(code, int) or code < 1 or code > TASK_DOMAIN_COUNT:
            raise ValueError(f"Unknown task-domain code: {code}")
        mask |= 1 << (code - 1)
    return mask


def decode_task_domains(mask: int) -> list[int]:
    if not isinstance(mask, int) or mask < 0 or (mask & ~VALID_TASK_DOMAIN_MASK) != 0:
        raise ValueError(f"Invalid task-domain bitmask: {mask}")
    return [code for code in range(1, TASK_DOMAIN_COUNT + 1) if (mask & (1 << (code - 1))) != 0]


def classify_domain_taxonomy_fanout(row: dict) -> dict:
    """
    Multi-label domain classification & fanout with audited translation to `nes-domain-palette-v1`.
    Strictly separates:
      - primaryLutByte / primaryLut (task-domain code in `openspec-task-taxonomy-v2`)
      - domainBitmask (uint16 10-bit membership mask)
      - nesHex (canonical hardware color byte in `nes-domain-palette-v1`)
    """
    haystack = f"{row.get('change_id', '')} {row.get('section', '')} {row.get('text', '')}"
    matched = []
    matched_codes = []

    for code, lut_hex, domain_key, pillar, canon_domain, pattern in DOMAIN_TAXONOMY:
        hits = pattern.findall(haystack)
        if hits:
            matched_codes.append(code)
            matched.append((len(hits), code, lut_hex, domain_key, pillar, canon_domain))

    if not matched:
        # Default fallback: task-domain 0x0A (UI_SVELTE5_BOARD), bridged to canonical palette `ui` (lutByte=2, nesHex=0x2A)
        canon = CANONICAL_NES_PALETTE_V1["ui"]
        bitmask = encode_task_domains([10])
        return {
            "taskTaxonomyRevision": TASK_TAXONOMY_REVISION,
            "primaryLutByte": 10,
            "primaryLut": "0x0A",
            "primaryDomain": "UI_SVELTE5_BOARD",
            "pillar": "UI",
            "domainFanout": ["UI_SVELTE5_BOARD"],
            "domainBitmask": bitmask,
            "canonicalPalette": {
                "lutRevision": CANONICAL_PALETTE_REVISION,
                "domainKey": "ui",
                "jsonLutByte": canon["jsonLutByte"],
                "sqlSeedLutByte": canon["sqlSeedLutByte"],
                "nesHex": canon["nesHex"],
                "label": canon["label"],
            },
        }

    # Sort descending by keyword hit density, tie-break by LUT order
    matched.sort(key=lambda item: (-item[0], item[1]))
    top = matched[0]
    canon = CANONICAL_NES_PALETTE_V1[top[5]]
    bitmask = encode_task_domains(matched_codes)
    return {
        "taskTaxonomyRevision": TASK_TAXONOMY_REVISION,
        "primaryLutByte": top[1],
        "primaryLut": top[2],
        "primaryDomain": top[3],
        "pillar": top[4],
        "domainFanout": [m[3] for m in matched],
        "domainBitmask": bitmask,
        "canonicalPalette": {
            "lutRevision": CANONICAL_PALETTE_REVISION,
            "domainKey": top[5],
            "jsonLutByte": canon["jsonLutByte"],
            "sqlSeedLutByte": canon["sqlSeedLutByte"],
            "nesHex": canon["nesHex"],
            "label": canon["label"],
        },
    }


def louvain_resolution_sweep(G, X, terms, resolutions=(1.0, 2.0, 2.5, 3.0), chosen_res=2.0, seed=0, top_terms=6):
    """
    Sweeps Louvain resolution parameters to split oversized mega-communities
    (e.g., shrinking the 651-task cluster into focused ~120-200 task sub-communities).
    """
    sweep_report = []
    chosen_parts = None

    for res in resolutions:
        parts = nx.community.louvain_communities(G, weight="weight", seed=seed, resolution=res)
        parts = sorted((sorted(p) for p in parts), key=lambda p: (-len(p), p[0]))
        mod = nx.community.modularity(G, parts, weight="weight")
        max_size = len(parts[0]) if parts else 0
        sweep_report.append({
            "resolution": res,
            "communityCount": len(parts),
            "maxCommunitySize": max_size,
            "modularity": round(float(mod), 6),
        })
        if res == chosen_res or chosen_parts is None:
            chosen_parts = parts

    return chosen_parts, sweep_report


def build_pageindex_section_tree(rows: list, rrf_scores, order_rank_of, page_size: int, comm_of, domain_records: list) -> tuple[list, list]:
    """
    Builds a PageIndex-style 3-level hierarchy:
      change_id -> section -> [task entries]
    Returns (bounded_top25_tree, full_navigable_tree) where full_navigable_tree preserves all 6,527 tasks.
    """
    tree = defaultdict(lambda: defaultdict(list))
    for idx, r in enumerate(rows):
        change_id = r.get("change_id") or "uncategorized"
        section = (r.get("section") or "root").strip()
        tree[change_id][section].append(idx)

    bounded_nodes = []
    full_nodes = []
    for change_id, sections in tree.items():
        bounded_sec_nodes = []
        full_sec_nodes = []
        all_change_indices = []
        for sec_title, indices in sections.items():
            all_change_indices.extend(indices)
            sorted_idx = sorted(indices, key=lambda i: (-rrf_scores[i], rows[i]["id"]))
            best_idx = sorted_idx[0]
            sec_base = {
                "section": sec_title,
                "openTaskCount": len(indices),
                "topTaskId": rows[best_idx]["id"],
                "maxRrf": round(float(rrf_scores[best_idx]), 6),
                "primaryDomain": domain_records[best_idx]["primaryDomain"],
                "dominantCommunity": int(comm_of[best_idx]),
            }
            bounded_sec_nodes.append(sec_base)
            full_sec_nodes.append({
                **sec_base,
                "tasks": [
                    {
                        "id": rows[i]["id"],
                        "rank": int(order_rank_of[i]),
                        "page": int((order_rank_of[i] - 1) // page_size + 1),
                        "rrf": round(float(rrf_scores[i]), 8),
                        "primaryLut": domain_records[i]["primaryLut"],
                        "domainBitmask": domain_records[i]["domainBitmask"],
                    }
                    for i in sorted_idx
                ],
            })
        bounded_sec_nodes.sort(key=lambda s: (-s["maxRrf"], s["section"]))
        full_sec_nodes.sort(key=lambda s: (-s["maxRrf"], s["section"]))
        best_change_idx = min(all_change_indices, key=lambda i: (-rrf_scores[i], rows[i]["id"]))
        change_header = {
            "changeId": change_id,
            "totalOpenTasks": len(all_change_indices),
            "sectionCount": len(bounded_sec_nodes),
            "maxRrf": round(float(rrf_scores[best_change_idx]), 6),
        }
        bounded_nodes.append({**change_header, "sections": bounded_sec_nodes[:15]})
        full_nodes.append({**change_header, "sections": full_sec_nodes})

    bounded_nodes.sort(key=lambda c: (-c["maxRrf"], -c["totalOpenTasks"], c["changeId"]))
    full_nodes.sort(key=lambda c: (-c["maxRrf"], -c["totalOpenTasks"], c["changeId"]))
    return bounded_nodes, full_nodes


def load_themes(root):
    """Import THEMES from the owner module via node; returns {name: compiled_re}."""
    js = ("import {THEMES} from './scripts/atlas/rank-open-tasks-v1.mjs';"
          "const o={};for(const[k,re]of Object.entries(THEMES))o[k]={source:re.source,flags:re.flags};"
          "console.log(JSON.stringify(o));")
    out = subprocess.run(["node", "--input-type=module", "-e", js], cwd=root,
                         capture_output=True, text=True, check=True).stdout
    raw = json.loads(out)
    return {k: re.compile(v["source"], re.IGNORECASE if "i" in v["flags"] else 0) for k, v in raw.items()}


def tfidf_matrix(docs):
    df = Counter()
    toks = []
    for d in docs:
        t = [w for w in TOKEN.findall(d.lower()) if w not in STOP]
        toks.append(t)
        df.update(set(t))
    n = len(docs)
    vocab = {w: i for i, w in enumerate(sorted(w for w, c in df.items() if c >= 2 and c < n))}
    X = np.zeros((n, len(vocab)), dtype=np.float32)
    idf = np.array([np.log((1 + n) / (1 + df[w])) + 1.0 for w in vocab], dtype=np.float32)
    for i, t in enumerate(toks):
        for w, c in Counter(t).items():
            j = vocab.get(w)
            if j is not None:
                X[i, j] = (1.0 + np.log(c)) * idf[j]
    norms = np.linalg.norm(X, axis=1, keepdims=True)
    norms[norms == 0] = 1.0
    terms = sorted(vocab, key=vocab.get)
    return X / norms, terms


def communities_from_knn(n, nbrs, sims, X, terms, ids, seed=0, top_terms=6, chosen_res=2.0):
    """GraphRAG-style communities: Louvain on the undirected, similarity-weighted kNN graph.
    Deterministic for a fixed seed. Labels = top mean-TF-IDF terms per community.
    Also computes Gate P2 reproducibility hashes and repeated-seed stability metrics."""
    G = nx.Graph()
    G.add_nodes_from(range(n))
    for i in range(n):
        for j, s in zip(nbrs[i], sims[i]):
            j = int(j)
            w = float(s)
            if G.has_edge(i, j):
                G[i][j]["weight"] = max(G[i][j]["weight"], w)
            else:
                G.add_edge(i, j, weight=w)

    # Gate P2: Canonical node-set and edge-set SHA-256 digests
    node_set_digest = hashlib.sha256("\n".join(ids).encode("utf-8")).hexdigest()
    canonical_edges = sorted(
        (min(u, v), max(u, v), round(float(d["weight"]), 6))
        for u, v, d in G.edges(data=True)
    )
    edge_set_digest = hashlib.sha256(
        "\n".join(f"{u}:{v}:{w:.6f}" for u, v, w in canonical_edges).encode("utf-8")
    ).hexdigest()

    parts, sweep_report = louvain_resolution_sweep(
        G, X, terms, resolutions=(1.0, 2.0, 2.5, 3.0), chosen_res=chosen_res, seed=seed, top_terms=top_terms
    )
    comm_of = np.zeros(n, dtype=np.int64)
    summary = []
    for cid, members in enumerate(parts, start=1):
        for m in members:
            comm_of[m] = cid
        centroid = X[members].mean(axis=0)
        top = [terms[t] for t in np.argsort(-centroid)[:top_terms] if centroid[t] > 0]
        summary.append({"community": cid, "size": len(members), "label": " ".join(top[:top_terms])})
    modularity = nx.community.modularity(G, parts, weight="weight")

    partition_digest = hashlib.sha256(
        "\n".join(f"{ids[i]}:{int(comm_of[i])}" for i in range(n)).encode("utf-8")
    ).hexdigest()

    # Repeated-seed stability check:
    # 1. Re-run with identical seed to prove deterministic replay (0 tasks move).
    parts_replay = sorted(
        (sorted(p) for p in nx.community.louvain_communities(G, weight="weight", seed=seed, resolution=chosen_res)),
        key=lambda p: (-len(p), p[0]),
    )
    comm_replay = np.zeros(n, dtype=np.int64)
    for cid, members in enumerate(parts_replay, start=1):
        for m in members:
            comm_replay[m] = cid
    same_seed_moved = int(np.sum(comm_of != comm_replay))

    # 2. Run with perturbed seed (seed + 1) and measure kNN edge co-membership stability
    parts_alt = sorted(
        (sorted(p) for p in nx.community.louvain_communities(G, weight="weight", seed=seed + 1, resolution=chosen_res)),
        key=lambda p: (-len(p), p[0]),
    )
    comm_alt = np.zeros(n, dtype=np.int64)
    for cid, members in enumerate(parts_alt, start=1):
        for m in members:
            comm_alt[m] = cid
    same_comm_seed0 = np.array([comm_of[u] == comm_of[v] for u, v, _ in canonical_edges])
    same_comm_seed1 = np.array([comm_alt[u] == comm_alt[v] for u, v, _ in canonical_edges])
    edge_co_membership_agreement = float(np.mean(same_comm_seed0 == same_comm_seed1)) if len(canonical_edges) else 1.0

    reproducibility_gate = {
        "networkxVersion": nx.__version__,
        "seed": seed,
        "resolution": chosen_res,
        "graphNodeSetSha256": node_set_digest,
        "graphEdgeSetSha256": edge_set_digest,
        "partitionSha256": partition_digest,
        "sameSeedReplayTasksMoved": same_seed_moved,
        "sameSeedDeterministicVerified": same_seed_moved == 0,
        "crossSeedEdgeCoMembershipAgreement": round(edge_co_membership_agreement, 6),
        "advisoryNote": "Community similarity is topical only and never implies execution dependency or authorization.",
    }
    return comm_of, summary, float(modularity), G.number_of_edges(), sweep_report, reproducibility_gate


def knn_graph(X, k, chunk=1024):
    n = X.shape[0]
    nbrs = np.zeros((n, k), dtype=np.int64)
    sims = np.zeros((n, k), dtype=np.float32)
    for s in range(0, n, chunk):
        e = min(n, s + chunk)
        S = X[s:e] @ X.T
        for r in range(e - s):
            S[r, s + r] = -np.inf  # no self-loops
        idx = np.argpartition(-S, k, axis=1)[:, :k]
        part = np.take_along_axis(S, idx, axis=1)
        order = np.argsort(-part, axis=1)
        nbrs[s:e] = np.take_along_axis(idx, order, axis=1)
        sims[s:e] = np.take_along_axis(part, order, axis=1)
    return nbrs, sims


def pagerank_adj(n, adj, damping=0.85, max_iter=200, tol=1e-10):
    """adj: list of out-neighbour index lists. Power iteration, uniform dangling redistribution."""
    if n == 0:
        return np.array([])
    out_deg = np.array([len(a) for a in adj], dtype=np.float64)
    rank = np.full(n, 1.0 / n)
    teleport = (1.0 - damping) / n
    src = np.repeat(np.arange(n), [len(a) for a in adj])
    dst = np.array([j for a in adj for j in a], dtype=np.int64)
    for _ in range(max_iter):
        contrib = np.zeros(n)
        mask = out_deg[src] > 0
        np.add.at(contrib, dst[mask], rank[src[mask]] / out_deg[src[mask]])
        dangling = damping * rank[out_deg == 0].sum() / n
        new = teleport + dangling + damping * contrib
        if np.abs(new - rank).sum() < tol:
            rank = new
            break
        rank = new
    return rank / rank.sum()


def ranks_from_scores(scores, ids):
    """1-based rank, higher score better; ties broken by stable id."""
    order = sorted(range(len(ids)), key=lambda i: (-scores[i], ids[i]))
    r = np.empty(len(ids), dtype=np.int64)
    for pos, i in enumerate(order, start=1):
        r[i] = pos
    return r


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--root", default=".")
    ap.add_argument("--in", dest="inp", required=True)
    ap.add_argument("--out-dir", default="docs/reports")
    ap.add_argument("--k", type=int, default=10, help="kNN neighbours per task")
    ap.add_argument("--page-size", type=int, default=100)
    ap.add_argument("--resolution", type=float, default=2.5, help="Chosen Louvain resolution from sweep")
    ap.add_argument("--stamp", default=dt.datetime.now(dt.timezone.utc).strftime("%Y%m%dT%H%M%SZ"))
    args = ap.parse_args()

    root = os.path.abspath(args.root)
    src_path = os.path.join(root, args.inp) if not os.path.isabs(args.inp) else args.inp
    t_start = time.perf_counter()
    with open(src_path, "rb") as raw_fh:
        source_sha256 = hashlib.sha256(raw_fh.read()).hexdigest()
    with open(src_path, encoding="utf-8") as fh:
        all_input_rows = [json.loads(line) for line in fh if line.strip()]
    rows = [r for r in all_input_rows if r.get("status") == "open"]
    t_parse = time.perf_counter()
    n = len(rows)
    ids = [r["id"] for r in rows]
    if n == 0:
        print("no open rows", file=sys.stderr)
        return 1

    themes = load_themes(root)
    theme_hits = []
    for r in rows:
        hit = [name for name, rx in themes.items() if rx.search(f"{r['change_id']} {r['text']}")]
        r["themes"] = hit
        theme_hits.append(len(hit))
    t_themes = time.perf_counter()

    docs = [f"{r['section']} {r['text']}" for r in rows]
    X, terms = tfidf_matrix(docs)
    vocab_size = len(terms)
    nbrs, sims = knn_graph(X, args.k)
    knn_adj = [list(map(int, nbrs[i])) for i in range(n)]
    knn_pr = pagerank_adj(n, knn_adj)
    t_knn = time.perf_counter()
    comm_of, comm_summary, modularity, kg_edges, sweep_report, reproducibility_gate = communities_from_knn(
        n, nbrs, sims, X, terms, ids, chosen_res=args.resolution
    )
    t_louvain = time.perf_counter()

    # Classify every open task across the 10 NES LUT / Prosecutor 5W1H domains
    domain_records = [classify_domain_taxonomy_fanout(r) for r in rows]
    t_classify = time.perf_counter()

    # Row-level audit of primary-domain counts and multi-label fanout memberships
    domain_fanout_counts = defaultdict(int)
    domain_primary_counts = defaultdict(int)
    total_fanout_memberships = 0
    bitmask_roundtrip_failures = 0
    primary_in_fanout_failures = 0

    for d in domain_records:
        domain_primary_counts[d["primaryDomain"]] += 1
        if d["primaryDomain"] not in d["domainFanout"]:
            primary_in_fanout_failures += 1
        fanout_len = len(d["domainFanout"])
        total_fanout_memberships += fanout_len
        decoded_codes = decode_task_domains(d["domainBitmask"])
        if len(decoded_codes) != fanout_len or encode_task_domains(decoded_codes) != d["domainBitmask"]:
            bitmask_roundtrip_failures += 1
        for dom in d["domainFanout"]:
            domain_fanout_counts[dom] += 1

    # citation PageRank was computed by openspec-task-extract-v1 and is read from the row
    citation = np.array([r.get("pagerank", 0.0) for r in rows], dtype=np.float64)

    r_cit = ranks_from_scores(citation, ids)
    r_theme = ranks_from_scores(np.array(theme_hits, dtype=np.float64), ids)
    r_knn = ranks_from_scores(knn_pr, ids)

    rrf = (1.0 / (RRF_K + r_cit) + 1.0 / (RRF_K + r_theme) + 1.0 / (RRF_K + r_knn))
    order = sorted(range(n), key=lambda i: (-rrf[i], ids[i]))
    order_rank_of = np.empty(n, dtype=np.int64)
    for pos, i in enumerate(order, start=1):
        order_rank_of[i] = pos

    # Build PageIndex change -> section -> task hierarchy (bounded top-25 + full navigable 6,527-task index)
    section_tree, full_section_tree = build_pageindex_section_tree(
        rows, rrf, order_rank_of, args.page_size, comm_of, domain_records
    )
    t_rrf_pageindex = time.perf_counter()

    stem = f"openspec-task-rank-fuse-v1.{args.stamp}"
    out_dir = os.path.join(root, args.out_dir)
    os.makedirs(out_dir, exist_ok=True)
    out_path = os.path.join(out_dir, f"{stem}.jsonl")
    pageindex_path = os.path.join(out_dir, f"{stem}.pageindex.json")
    manifest_path = os.path.join(out_dir, f"{stem}.manifest.json")

    with open(pageindex_path, "w", encoding="utf-8", newline="\n") as pfh:
        json.dump(
            {
                "schema": "atlas.openspec-pageindex-full.v1",
                "sourceSha256": source_sha256,
                "canonicalAuthority": False,
                "totalChanges": len(full_section_tree),
                "totalSections": int(sum(c["sectionCount"] for c in full_section_tree)),
                "totalOpenTasks": int(sum(c["totalOpenTasks"] for c in full_section_tree)),
                "changes": full_section_tree,
            },
            pfh,
            indent=2,
        )
        pfh.write("\n")

    with open(out_path, "w", encoding="utf-8", newline="\n") as fh:
        for pos, i in enumerate(order, start=1):
            r = rows[i]
            rec = {
                "rank": pos,
                "page": (pos - 1) // args.page_size + 1,
                "rrf": round(float(rrf[i]), 8),
                "signals": {
                    "citationRank": int(r_cit[i]),
                    "themeRank": int(r_theme[i]),
                    "knnRank": int(r_knn[i]),
                },
                "id": r["id"],
                "change_id": r["change_id"],
                "file": r["file"],
                "line": r["line"],
                "task_code": r.get("task_code"),
                "themes": r["themes"],
                "taskTaxonomyRevision": domain_records[i]["taskTaxonomyRevision"],
                "primaryLutByte": domain_records[i]["primaryLutByte"],
                "primaryLut": domain_records[i]["primaryLut"],
                "primaryDomain": domain_records[i]["primaryDomain"],
                "pillar": domain_records[i]["pillar"],
                "domainFanout": domain_records[i]["domainFanout"],
                "domainBitmask": domain_records[i]["domainBitmask"],
                "canonicalPalette": domain_records[i]["canonicalPalette"],
                "citationPagerank": r.get("pagerank"),
                "knnPagerank": round(float(knn_pr[i]), 10),
                "knnNeighbours": [ids[j] for j in knn_adj[i][:3]],
                "knnTopSim": round(float(sims[i][0]), 4),
                "community": int(comm_of[i]),
                "communityLabel": comm_summary[int(comm_of[i]) - 1]["label"],
                "text": r["text"],
            }
            fh.write(json.dumps(rec, ensure_ascii=False) + "\n")

    t_serialize = time.perf_counter()

    def sha(p):
        h = hashlib.sha256()
        with open(p, "rb") as f:
            h.update(f.read())
        return h.hexdigest()

    distinct_id_count = len(set(ids))
    monotonic_ranks_verified = bool(np.array_equal(np.sort(order_rank_of), np.arange(1, n + 1)))

    manifest = {
        "schema": "atlas.openspec-task-rank-fuse.v1",
        "generatedAt": dt.datetime.now(dt.timezone.utc).isoformat(),
        "canonicalAuthority": False,
        "source": os.path.relpath(src_path, root).replace("\\", "/"),
        "sourceSha256": source_sha256,
        "params": {
            "rrfK": RRF_K,
            "knnK": args.k,
            "knnMetric": "cosine over TF-IDF (log tf, smoothed idf, df>=2 and df<N)",
            "knnPagerankDamping": 0.85,
            "themesSource": "scripts/atlas/rank-open-tasks-v1.mjs#THEMES (imported)",
            "pageSize": args.page_size,
            "louvainResolution": args.resolution,
        },
        "counts": {
            "openTasks": n,
            "vocab": vocab_size,
            "pages": (n + args.page_size - 1) // args.page_size,
            "tasksWithAnyTheme": int(sum(1 for c in theme_hits if c > 0)),
            "tasksWithCitationIn": int(sum(1 for r in rows if r.get("in_degree", 0) > 0)),
            "knnMeanTopSim": round(float(sims[:, 0].mean()), 4),
        },
        "outputs": {
            os.path.basename(out_path): sha(out_path),
            os.path.basename(pageindex_path): sha(pageindex_path),
        },
        "taskOutputValidationGate": {
            "totalOpenTasks": n,
            "distinctTaskIds": distinct_id_count,  # distinct task ids; rows carry NO source revision (Tier B)
            "allIdsDistinctVerified": distinct_id_count == n,
            "allRowsOpenStatusVerified": all(r.get("status") == "open" for r in rows),
            "singlePrimaryDomainPerRowVerified": int(sum(domain_primary_counts.values())) == n,
            "primaryInFanoutFailures": int(primary_in_fanout_failures),
            "primaryInFanoutVerified": primary_in_fanout_failures == 0,
            "bitmaskRoundTripFailures": int(bitmask_roundtrip_failures),
            "bitmaskRoundTripVerified": bitmask_roundtrip_failures == 0,
            "monotonicStableRanksVerified": monotonic_ranks_verified,
            "sourceSha256": source_sha256,
        },
        "reproducibilityGate": reproducibility_gate,
        "stageTimingProfileMs": {
            "parseInputMs": round((t_parse - t_start) * 1000.0, 2),
            "themeMatchingMs": round((t_themes - t_parse) * 1000.0, 2),
            "tfidfAndKnnGraphMs": round((t_knn - t_themes) * 1000.0, 2),
            "louvainAndStabilitySweepMs": round((t_louvain - t_knn) * 1000.0, 2),
            "domainTaxonomyAndBitmaskMs": round((t_classify - t_louvain) * 1000.0, 2),
            "rrfAndPageIndexBuildMs": round((t_rrf_pageindex - t_classify) * 1000.0, 2),
            "serializeOutputsMs": round((t_serialize - t_rrf_pageindex) * 1000.0, 2),
            "totalPipelineMs": round((t_serialize - t_start) * 1000.0, 2),
        },
    }
    manifest["communities"] = {
        "algorithm": f"networkx louvain_communities (seed 0, resolution {args.resolution}) on undirected kNN graph, weight=cosine",
        "count": len(comm_summary),
        "kNNEdgesUndirected": kg_edges,
        "modularity": round(modularity, 6),
        "resolutionSweep": sweep_report,
        "summary": comm_summary,  # all communities; IDs are per-run, route by label + manifest checksum
    }
    manifest["domainTaxonomy"] = {
        "taskTaxonomyRevision": TASK_TAXONOMY_REVISION,
        "canonicalPaletteRevision": CANONICAL_PALETTE_REVISION,
        "primaryCounts": dict(sorted(domain_primary_counts.items(), key=lambda kv: -kv[1])),
        "fanoutCounts": dict(sorted(domain_fanout_counts.items(), key=lambda kv: -kv[1])),
        "fanoutMembershipAudit": {
            "totalOpenTasks": n,
            "primarySum": int(sum(domain_primary_counts.values())),
            "totalFanoutMemberships": int(total_fanout_memberships),
            "fanoutCountsSum": int(sum(domain_fanout_counts.values())),
            "bitmaskRoundTripFailures": int(bitmask_roundtrip_failures),
            "bitmaskRoundTripVerified": bitmask_roundtrip_failures == 0,
        },
    }
    manifest["pageIndexTreeSummary"] = {
        "fullPageIndexFile": os.path.basename(pageindex_path),
        "totalChangesIndexed": len(full_section_tree),
        "totalSectionsIndexed": int(sum(c["sectionCount"] for c in full_section_tree)),
        "totalOpenTasksIndexed": int(sum(c["totalOpenTasks"] for c in full_section_tree)),
    }
    manifest["pageIndexTreeTop25"] = section_tree[:25]
    with open(manifest_path, "w", encoding="utf-8", newline="\n") as fh:
        json.dump(manifest, fh, indent=2)
        fh.write("\n")

    print(json.dumps({"out": os.path.relpath(out_path, root), "manifest": os.path.relpath(manifest_path, root),
                      "counts": manifest["counts"]}, indent=2))
    return 0


if __name__ == "__main__":
    sys.exit(main())
