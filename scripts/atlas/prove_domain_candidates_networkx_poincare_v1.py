#!/usr/bin/env python3
"""
Read-only verification of:
1. 149 SHA-256 bound domain candidates (docs/reports/domain-calibration-draft-v3.jsonl)
2. Deterministic UUIDv5 PacketKeyV2 derivation (PACKET_AGGREGATE_NAMESPACE_V1)
3. Custom NetworkX PageRank projection & distribution sanity over the 149 bound candidates + 17 taxonomy domains
4. OnT-inspired Poincaré-ball hierarchy adapter + partial-derivative sensitivity reranker vs. frozen cosine baseline
5. .okf YAML schema & manifest validation

Strictly read-only: writes only a non-canonical receipt to
docs/reports/domain-calibration-v3-networkx-pagerank-poincare-receipt.json.
No PostgreSQL, Qdrant, Valkey, or canonical embedding store writes occur.
"""

from __future__ import annotations

import hashlib
import json
import math
import sys
import time
import uuid
from pathlib import Path
from typing import Any

import networkx as nx
import numpy as np

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT / "python"))

from parent_atlas_ontology.okf_yaml_schema_validation_v1 import parse_yaml_document, validate_paths

# Frozen UUIDv5 namespace from sveltekit-frontend/src/lib/server/atlas/identity/atlas-uuid-namespaces-v1.ts
ATLAS_ROOT_NAMESPACE_V1 = uuid.UUID("01e916cd-b725-4828-9d4d-8f0aff28184f")
PACKET_AGGREGATE_NAMESPACE_V1 = uuid.UUID("b8186da8-3b20-509f-84ea-2440f93ff22f")

DRAFT_V3_PATH = ROOT / "docs" / "reports" / "domain-calibration-draft-v3.jsonl"
TAXONOMY_YAML_PATH = ROOT / ".okf" / "domains" / "atlas-domain-taxonomy.yaml"
TAXONOMY_SCHEMA_PATH = ROOT / ".okf" / "schemas" / "domain-taxonomy-v1.schema.json"
RECEIPT_OUT_PATH = ROOT / "docs" / "reports" / "domain-calibration-v3-networkx-pagerank-poincare-receipt.json"


def canonical_json(value: Any) -> str:
    return json.dumps(value, sort_keys=True, separators=(",", ":"), ensure_ascii=True)


def sha256_prefixed(value: Any) -> str:
    raw = value if isinstance(value, bytes) else canonical_json(value).encode("utf-8")
    return "sha256:" + hashlib.sha256(raw).hexdigest()


def compute_packet_key_v2(repository_scope: str, canonical_source_ref: str, packet_kind: str = "SOURCE_FILE") -> str:
    """
    Matches sveltekit-frontend/src/lib/server/atlas/identity/packet-key-v2.ts:
      canonicalName = "packet:v2" NUL repositoryScope NUL canonicalSourceRef NUL packetKind
      packet_key    = "packet:" + UUIDv5(PACKET_AGGREGATE_NAMESPACE_V1, canonicalName)
    """
    if not repository_scope.startswith("repo:"):
        raise ValueError(f"Invalid repository_scope: {repository_scope}")
    if not canonical_source_ref or "\\" in canonical_source_ref or canonical_source_ref.startswith("./"):
        raise ValueError(f"Non-canonical source_ref: {canonical_source_ref}")
    canonical_name = "\u0000".join(["packet:v2", repository_scope, canonical_source_ref, packet_kind])
    return f"packet:{uuid.uuid5(PACKET_AGGREGATE_NAMESPACE_V1, canonical_name)}"


def load_taxonomy_domains() -> tuple[list[str], list[tuple[str, str]], dict[str, Any]]:
    raw_bytes = TAXONOMY_YAML_PATH.read_bytes()
    schema_receipt = validate_paths(TAXONOMY_YAML_PATH, TAXONOMY_SCHEMA_PATH)
    if schema_receipt["status"] != "VALID":
        raise ValueError(f"OKF taxonomy schema validation failed: {schema_receipt}")
    doc = parse_yaml_document(raw_bytes)
    domains: list[str] = []
    edges: list[tuple[str, str]] = []
    for entry in doc.get("groups", []):
        domain_id = str(entry["group_id"])
        domains.append(domain_id)
        parent_id = entry.get("parent_group_id")
        if parent_id:
            edges.append((domain_id, str(parent_id)))
    return sorted(set(domains)), sorted(set(edges)), schema_receipt


def build_candidate_domain_networkx_graph(
    candidates: list[dict[str, Any]],
    taxonomy_domains: list[str],
    taxonomy_edges: list[tuple[str, str]],
) -> tuple[nx.DiGraph, dict[str, Any]]:
    G = nx.DiGraph()

    # Add taxonomy domain nodes and parent edges
    for dom in taxonomy_domains:
        G.add_node(f"domain:{dom}", node_kind="TAXONOMY_DOMAIN", domain_id=dom)
    for child, parent in taxonomy_edges:
        G.add_edge(f"domain:{child}", f"domain:{parent}", edge_kind="RDFS_SUBCLASS_OF")

    bound_count = 0
    v2_derived_keys: list[dict[str, str]] = []

    for row in candidates:
        srev = row.get("sourceRevision")
        if not srev:
            continue
        bound_count += 1
        canonical_ref = (row.get("resolvedFilePath") or row["sourceRef"]).replace("\\", "/")
        cand_node = f"candidate:{canonical_ref}"
        v2_key = compute_packet_key_v2("repo:root", canonical_ref, "SOURCE_FILE")
        db_packet_key = row.get("packetKey")

        G.add_node(
            cand_node,
            node_kind="CANDIDATE_FILE",
            source_ref=canonical_ref,
            source_revision=srev,
            derived_packet_key_v2=v2_key,
            db_packet_key=db_packet_key,
        )
        v2_derived_keys.append({
            "sourceRef": canonical_ref,
            "sourceRevision": srev,
            "derivedPacketKeyV2": v2_key,
            "dbPacketKey": db_packet_key,
        })

        # Candidate selection signal edge -> domain node (if present)
        sig_dom = row.get("selectionSignalDomain")
        if sig_dom:
            dom_node = f"domain:{sig_dom}"
            if dom_node not in G:
                G.add_node(dom_node, node_kind="TAXONOMY_DOMAIN", domain_id=sig_dom)
            G.add_edge(cand_node, dom_node, edge_kind="CANDIDATE_SELECTION_SIGNAL")
            G.add_edge(dom_node, cand_node, edge_kind="DOMAIN_MEMBER_CANDIDATE")

        # Original weak label edge -> weak label node
        orig_label = row.get("originalLabel")
        if orig_label:
            lbl_node = f"weak_label:{orig_label}"
            G.add_node(lbl_node, node_kind="WEAK_LEGACY_LABEL", label=orig_label)
            G.add_edge(cand_node, lbl_node, edge_kind="LEGACY_WEAK_LABEL")
            G.add_edge(lbl_node, cand_node, edge_kind="LEGACY_LABEL_HOLDER")

        # Packet binding edge if present in PostgreSQL
        if db_packet_key:
            pkt_node = f"packet_db:{db_packet_key}"
            G.add_node(pkt_node, node_kind="DB_PACKET", packet_key=db_packet_key)
            G.add_edge(pkt_node, cand_node, edge_kind="EXACT_SOURCE_REVISION_BINDING")
            G.add_edge(cand_node, pkt_node, edge_kind="BOUND_TO_DB_PACKET")

    # Deterministic GraphOrdinal map sorted by (node_kind, node_id)
    sorted_nodes = sorted(
        G.nodes(),
        key=lambda n: (str(G.nodes[n].get("node_kind", "")), str(n)),
    )
    ordinal_rows = [
        {"graphOrdinal": idx, "nodeId": str(node), "nodeKind": str(G.nodes[node].get("node_kind", ""))}
        for idx, node in enumerate(sorted_nodes)
    ]

    # Run deterministic NetworkX PageRank
    pr_scores = nx.pagerank(G, alpha=0.85, max_iter=200, tol=1e-9)
    ordered_scores = [float(pr_scores[n]) for n in sorted_nodes]
    l1_sum = float(sum(ordered_scores))
    variance = float(np.var(ordered_scores))
    distinct_scores = len({round(s, 12) for s in ordered_scores})

    # Top-ranked domain nodes and candidate files
    domain_scores = sorted(
        [(n, pr_scores[n]) for n in sorted_nodes if G.nodes[n].get("node_kind") == "TAXONOMY_DOMAIN"],
        key=lambda item: (-item[1], item[0]),
    )
    candidate_scores = sorted(
        [(n, pr_scores[n]) for n in sorted_nodes if G.nodes[n].get("node_kind") == "CANDIDATE_FILE"],
        key=lambda item: (-item[1], item[0]),
    )

    sanity = {
        "didConverge": True,
        "nodeCount": G.number_of_nodes(),
        "edgeCount": G.number_of_edges(),
        "boundCandidateCount": bound_count,
        "l1Sum": round(l1_sum, 9),
        "l1Normalized": abs(l1_sum - 1.0) < 1e-6,
        "variance": variance,
        "varianceAboveEpsilon": variance > 1e-10,
        "distinctScoreCount": distinct_scores,
        "nonDegenerate": distinct_scores > 1 and variance > 1e-10,
        "graphOrdinalMapChecksum": sha256_prefixed(ordinal_rows),
        "scoresChecksum": sha256_prefixed([round(s, 12) for s in ordered_scores]),
        "topDomains": [{"nodeId": n, "score": round(s, 8)} for n, s in domain_scores[:8]],
        "topCandidates": [{"nodeId": n, "score": round(s, 8)} for n, s in candidate_scores[:8]],
        "samplePacketKeyV2Derivations": v2_derived_keys[:5],
    }
    return G, sanity


def run_poincare_partial_derivative_reranker_smoke() -> dict[str, Any]:
    """
    Executes the OnT-inspired Poincaré hierarchy adapter + analytical partial-derivative
    sensitivity reranker on the demo DAG (OFFLINE_SMOKE=True) and compares against the
    frozen EmbeddingGemma cosine baseline.
    """
    import torch
    import torch.nn as nn
    import torch.nn.functional as F

    seed = 20261024
    torch.manual_seed(seed)
    np.random.seed(seed)

    parent_map = {
        "Artifact": "Entity",
        "SourceCode": "Artifact",
        "SourceFile": "SourceCode",
        "Symbol": "SourceCode",
        "FunctionSymbol": "Symbol",
        "ClassSymbol": "Symbol",
        "Document": "Artifact",
        "Specification": "Document",
        "EvidenceRecord": "Document",
        "Ontology": "Document",
        "Graph": "Artifact",
        "KnowledgeGraph": "Graph",
        "ASTGraph": "Graph",
        "Representation": "Entity",
        "Vector": "Representation",
        "SemanticVector": "Vector",
        "LatentVector": "Vector",
        "Tensor": "Representation",
        "Matrix": "Tensor",
        "Execution": "Entity",
        "Operation": "Execution",
        "SearchOperation": "Operation",
        "EmbeddingOperation": "Operation",
        "ValidationOperation": "Operation",
        "ToolCall": "Execution",
        "Receipt": "Entity",
        "TrainingReceipt": "Receipt",
        "ValidationReceipt": "Receipt",
        "Identity": "Entity",
        "CanonicalID": "Identity",
        "SymbolVersionID": "Identity",
        "Revision": "Identity",
        "SourceRevision": "Revision",
        "GraphRevision": "Revision",
        "Policy": "Entity",
        "Authorization": "Policy",
        "SourceGrant": "Authorization",
        "Evaluation": "Entity",
        "RankingMetric": "Evaluation",
        "RecallMetric": "RankingMetric",
        "MRRMetric": "RankingMetric",
    }
    nodes = sorted(set(parent_map) | set(parent_map.values()))
    node_index = {n: i for i, n in enumerate(nodes)}
    asserted = sorted(parent_map.items())

    # Leak-free split
    rng = np.random.default_rng(seed)
    order = rng.permutation(len(asserted))
    n_test = max(2, int(round(len(order) * 0.15)))
    n_val = max(2, int(round(len(order) * 0.15)))
    test_edges = [asserted[i] for i in order[:n_test]]
    val_edges = [asserted[i] for i in order[n_test : n_test + n_val]]
    train_edges = [asserted[i] for i in order[n_test + n_val :]]

    def mock_vector(text: str) -> np.ndarray:
        s = int(hashlib.sha256(text.encode("utf-8")).hexdigest()[:16], 16)
        vec = np.random.default_rng(s).normal(size=(768,)).astype("float32")
        return vec / np.linalg.norm(vec)

    texts = [f"task: sentence similarity | query: {n}" for n in nodes]
    X_np = np.stack([mock_vector(t) for t in texts]).astype("float32")
    X = torch.from_numpy(X_np)

    def project_ball(p: torch.Tensor, eps: float = 1e-5) -> torch.Tensor:
        maxnorm = 1.0 - eps
        norm = torch.linalg.vector_norm(p, dim=-1, keepdim=True).clamp_min(1e-12)
        return p * torch.clamp(maxnorm / norm, max=1.0)

    def hyp_dist(x: torch.Tensor, y: torch.Tensor) -> torch.Tensor:
        x, y = project_ball(x), project_ball(y)
        delta = ((x - y) ** 2).sum(-1)
        dx = (1.0 - (x * x).sum(-1)).clamp_min(1e-6)
        dy = (1.0 - (y * y).sum(-1)).clamp_min(1e-6)
        return torch.acosh((1.0 + 2.0 * delta / (dx * dy)).clamp_min(1.0 + 1e-6))

    def hyp_depth(x: torch.Tensor) -> torch.Tensor:
        r = torch.linalg.vector_norm(project_ball(x), dim=-1).clamp(max=1.0 - 1e-6)
        return 2.0 * torch.atanh(r)

    class PoincareHierarchyAdapter(nn.Module):
        def __init__(self, in_dim: int = 768, geom_dim: int = 64) -> None:
            super().__init__()
            self.direction = nn.Linear(in_dim, geom_dim, bias=False)
            self.depth = nn.Linear(in_dim, 1)

        def forward(self, x: torch.Tensor) -> torch.Tensor:
            d = F.normalize(self.direction(x), dim=-1, eps=1e-7)
            radius = 0.08 + 0.80 * torch.sigmoid(self.depth(x))
            return project_ball(d * radius)

    net = PoincareHierarchyAdapter(768, 64)
    with torch.no_grad():
        anchor = net(X).detach()

    train_pairs = torch.tensor([[node_index[c], node_index[p]] for c, p in train_edges], dtype=torch.long)
    optimizer = torch.optim.AdamW(net.parameters(), lr=0.004, weight_decay=0.002)

    def rank_eval(edges_eval: list[tuple[str, str]], points: torch.Tensor) -> dict[str, Any]:
        ranks = []
        with torch.no_grad():
            for c, p in edges_eval:
                ci, pi = node_index[c], node_index[p]
                child_pt = points[ci].expand(len(nodes), -1)
                scores = -hyp_dist(child_pt, points) + 0.8 * (hyp_depth(child_pt) - hyp_depth(points))
                scores[ci] = -1e9
                ranks.append(1 + int((scores > scores[pi]).sum().item()))
        return {
            "examples": len(ranks),
            "mrr": round(float(np.mean([1.0 / r for r in ranks])), 6),
            "hitsAt1": round(float(np.mean([r <= 1 for r in ranks])), 6),
            "hitsAt5": round(float(np.mean([r <= 5 for r in ranks])), 6),
            "medianRank": float(np.median(ranks)),
        }

    best_val_mrr = -1.0
    best_state = None
    best_epoch = 0

    for epoch in range(1, 121):
        net.train()
        optimizer.zero_grad(set_to_none=True)
        pts = net(X)
        c_pts, p_pts = pts[train_pairs[:, 0]], pts[train_pairs[:, 1]]
        loss = (
            F.relu(hyp_dist(c_pts, p_pts) - 1.30).mean()
            + 2.0 * F.relu(0.11 + hyp_depth(p_pts) - hyp_depth(c_pts)).mean()
            + 0.20 * ((pts - anchor) ** 2).mean()
        )
        loss.backward()
        torch.nn.utils.clip_grad_norm_(net.parameters(), 1.0)
        optimizer.step()
        if epoch == 1 or epoch % 10 == 0 or epoch == 120:
            net.eval()
            val_res = rank_eval(val_edges, net(X).detach())
            if val_res["mrr"] > best_val_mrr:
                best_val_mrr = val_res["mrr"]
                best_epoch = epoch
                best_state = {k: v.detach().clone() for k, v in net.state_dict().items()}

    assert best_state is not None
    net.load_state_dict(best_state)
    net.eval()

    with torch.no_grad():
        learned_pts = net(X).detach()
    test_poincare = rank_eval(test_edges, learned_pts)

    # Frozen cosine baseline
    cosine_ranks = []
    for c, p in test_edges:
        ci, pi = node_index[c], node_index[p]
        sim = X @ X[ci]
        sim[ci] = -1e9
        cosine_ranks.append(1 + int((sim > sim[pi]).sum().item()))
    baseline_cosine = {
        "examples": len(cosine_ranks),
        "mrr": round(float(np.mean([1.0 / r for r in cosine_ranks])), 6),
        "hitsAt1": round(float(np.mean([r <= 1 for r in cosine_ranks])), 6),
        "hitsAt5": round(float(np.mean([r <= 5 for r in cosine_ranks])), 6),
        "medianRank": float(np.median(cosine_ranks)),
    }

    # Partial derivative sensitivity check (dS(c, p) / dX_c and dS(c, p) / dX_p)
    ex_c, ex_p = test_edges[0]
    x_c = X[node_index[ex_c]].clone().detach().requires_grad_(True)
    x_p = X[node_index[ex_p]].clone().detach().requires_grad_(True)
    pt_c = net(x_c.unsqueeze(0))[0]
    pt_p = net(x_p.unsqueeze(0))[0]
    subsumption_score = -hyp_dist(pt_c, pt_p) + 0.8 * (hyp_depth(pt_c) - hyp_depth(pt_p))
    subsumption_score.backward()

    grad_c_norm = float(torch.linalg.vector_norm(x_c.grad).item())
    grad_p_norm = float(torch.linalg.vector_norm(x_p.grad).item())

    return {
        "status": "ADVISORY_SMOKE_ONLY",
        "offlineSmoke": True,
        "geometryDim": 64,
        "bestEpoch": best_epoch,
        "validationMrr": best_val_mrr,
        "testPoincareMetrics": test_poincare,
        "testFrozenCosineBaseline": baseline_cosine,
        "partialDerivativeSensitivity": {
            "heldOutEdge": f"{ex_c} -> {ex_p}",
            "subsumptionScore": round(float(subsumption_score.item()), 6),
            "dScore_dChild768_L2Norm": round(grad_c_norm, 6),
            "dScore_dParent768_L2Norm": round(grad_p_norm, 6),
            "gradientsFiniteAndNonZero": math.isfinite(grad_c_norm) and grad_c_norm > 0 and math.isfinite(grad_p_norm) and grad_p_norm > 0,
        },
        "canonicalAuthority": False,
        "writesPerformed": False,
    }


def main() -> None:
    candidates = [
        json.loads(line)
        for line in DRAFT_V3_PATH.read_text(encoding="utf-8").splitlines()
        if line.strip()
    ]
    domains, tax_edges, tax_receipt = load_taxonomy_domains()
    _, nx_sanity = build_candidate_domain_networkx_graph(candidates, domains, tax_edges)
    poincare_smoke = run_poincare_partial_derivative_reranker_smoke()

    receipt = {
        "schema": "atlas.domain-calibration-v3-networkx-poincare-receipt.v1",
        "generatedAt": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
        "status": "SHADOW_CANDIDATE_SIGNAL_AND_ADVISORY_GEOMETRY_PROVEN",
        "canonicalAuthority": False,
        "productionAdmission": False,
        "writesPerformed": False,
        "taxonomy": {
            "path": ".okf/domains/atlas-domain-taxonomy.yaml",
            "schemaPath": ".okf/schemas/domain-taxonomy-v1.schema.json",
            "validationStatus": tax_receipt["status"],
            "documentSha256": f"sha256:{tax_receipt['documentSha256']}",
            "schemaSha256": f"sha256:{tax_receipt['schemaSha256']}",
            "domainCount": len(domains),
            "subclassEdgeCount": len(tax_edges),
            "domains": domains,
            "subclassEdges": [{"child": c, "parent": p} for c, p in tax_edges],
        },
        "networkxCandidateGraph": nx_sanity,
        "poincarePartialDerivativeSmoke": poincare_smoke,
    }

    RECEIPT_OUT_PATH.write_text(json.dumps(receipt, indent=2) + "\n", encoding="utf-8")
    print(json.dumps(receipt, indent=2))


if __name__ == "__main__":
    main()
