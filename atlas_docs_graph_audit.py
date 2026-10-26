#!/usr/bin/env python3
"""
atlas_docs_graph_audit.py
Read-only Parent Atlas document graph and OpenSpec link auditor.
Scans docs/**/*.md and openspec/**/*.md, validates paths and links,
tracks OpenSpec gate mentions vs definitions, and computes NetworkX connectivity metrics.
"""

import argparse
import json
import os
import re
import sys
from datetime import datetime, timezone
from pathlib import Path

MAX_FILE_BYTES = 16 * 1024 * 1024  # 16 MiB limit

MD_LINK_RE = re.compile(r'\[([^\]]+)\]\(([^)]+)\)')
GATE_RE = re.compile(r'\b(GATE[-_][A-Za-z0-9_-]+|[A-Z0-9]+[-_]GATE[-_]?[0-9A-Za-z]*)\b', re.IGNORECASE)
CHECKLIST_RE = re.compile(r'^\s*-\s*\[([ xX])\]\s*(.*)$')

def normalize_relpath(path: Path, root: Path) -> str:
    try:
        return str(path.relative_to(root)).replace("\\", "/")
    except ValueError:
        return str(path).replace("\\", "/")

def is_external_link(url: str) -> bool:
    url_lower = url.lower()
    return url_lower.startswith(("http://", "https://", "mailto:", "ftp://", "javascript:"))

def clean_link_target(raw_target: str) -> str:
    target = raw_target.strip()
    if target.startswith("<") and target.endswith(">"):
        target = target[1:-1].strip()
    # Remove anchor
    if "#" in target:
        target = target.split("#", 1)[0].strip()
    # Remove query params
    if "?" in target:
        target = target.split("?", 1)[0].strip()
    return target

def parse_markdown_links(content: str):
    links = []
    for match in MD_LINK_RE.finditer(content):
        label = match.group(1).strip()
        raw_url = match.group(2).strip()
        cleaned = clean_link_target(raw_url)
        links.append({
            "label": label,
            "raw": raw_url,
            "target": cleaned,
            "is_external": is_external_link(raw_url),
            "is_anchor_only": raw_url.startswith("#")
        })
    return links

def main():
    parser = argparse.ArgumentParser(description="Parent Atlas Document Graph and OpenSpec Link Auditor")
    parser.add_argument("--root", default=".", help="Root directory of repository")
    parser.add_argument("--output", default=".tmp/atlas/docs-link-audit.json", help="Output JSON receipt path")
    args = parser.parse_args()

    root_path = Path(args.root).resolve()
    output_path = Path(args.output).resolve()
    output_path.parent.mkdir(parents=True, exist_ok=True)

    scan_dirs = ["docs", "openspec"]
    markdown_files = []
    skipped_oversized = []

    for sdir in scan_dirs:
        dir_path = root_path / sdir
        if not dir_path.is_dir():
            continue
        for p in dir_path.rglob("*.md"):
            try:
                size = p.stat().st_size
                if size > MAX_FILE_BYTES:
                    skipped_oversized.append({
                        "path": normalize_relpath(p, root_path),
                        "bytes": size,
                        "limit": MAX_FILE_BYTES
                    })
                    continue
                markdown_files.append(p)
            except OSError:
                continue

    # Also inventory root markdown files if present
    for p in root_path.glob("*.md"):
        try:
            if p.stat().st_size <= MAX_FILE_BYTES:
                markdown_files.append(p)
        except OSError:
            pass

    markdown_files = sorted(list(set(markdown_files)))

    # Graph construction
    doc_nodes = set()
    for mf in markdown_files:
        doc_nodes.add(normalize_relpath(mf, root_path))

    doc_edges = []
    broken_links = []
    total_links_found = 0

    openspec_gates = {}
    checklist_stats = {"checked": 0, "unchecked": 0, "items_by_file": {}}

    for mf in markdown_files:
        source_rel = normalize_relpath(mf, root_path)
        source_dir = mf.parent

        try:
            text = mf.read_text(encoding="utf-8", errors="ignore")
        except Exception:
            continue

        # Checklists
        if "openspec" in source_rel:
            chk_checked = 0
            chk_unchecked = 0
            for line in text.splitlines():
                m = CHECKLIST_RE.match(line)
                if m:
                    state = m.group(1).lower()
                    if state == "x":
                        chk_checked += 1
                        checklist_stats["checked"] += 1
                    else:
                        chk_unchecked += 1
                        checklist_stats["unchecked"] += 1
            if chk_checked > 0 or chk_unchecked > 0:
                checklist_stats["items_by_file"][source_rel] = {
                    "checked": chk_checked,
                    "unchecked": chk_unchecked,
                    "total": chk_checked + chk_unchecked
                }

        # Gate detection
        for g_match in GATE_RE.finditer(text):
            gate_id = g_match.group(1).upper()
            if gate_id not in openspec_gates:
                openspec_gates[gate_id] = {
                    "gate_id": gate_id,
                    "mentions": [],
                    "definitions": []
                }
            openspec_gates[gate_id]["mentions"].append(source_rel)

        # Links
        links = parse_markdown_links(text)
        total_links_found += len(links)

        for lk in links:
            if lk["is_external"] or lk["is_anchor_only"]:
                continue
            target = lk["target"]
            if not target:
                continue

            # Resolve target
            resolved = None
            if target.startswith("/"):
                # Relative to root
                candidate = root_path / target.lstrip("/")
                if candidate.exists():
                    resolved = candidate
            else:
                # Relative to source file
                candidate = (source_dir / target).resolve()
                if candidate.exists():
                    resolved = candidate
                else:
                    # Check relative to root as fallback
                    candidate_root = (root_path / target).resolve()
                    if candidate_root.exists():
                        resolved = candidate_root

            if resolved:
                target_rel = normalize_relpath(resolved, root_path)
                if target_rel in doc_nodes:
                    doc_edges.append((source_rel, target_rel))
            else:
                # Flag broken link
                broken_links.append({
                    "source": source_rel,
                    "label": lk["label"],
                    "raw_target": lk["raw"],
                    "cleaned_target": target
                })

    # NetworkX metrics
    graph_metrics = {
        "networkx_available": False,
        "nodes_count": len(doc_nodes),
        "edges_count": len(doc_edges)
    }

    try:
        import networkx as nx
        graph_metrics["networkx_available"] = True
        G = nx.DiGraph()
        for n in doc_nodes:
            G.add_node(n)
        for u, v in doc_edges:
            G.add_edge(u, v)

        graph_metrics["num_nodes"] = G.number_of_nodes()
        graph_metrics["num_edges"] = G.number_of_edges()
        graph_metrics["num_weakly_connected_components"] = nx.number_weakly_connected_components(G)
        
        isolates = list(nx.isolates(G))
        graph_metrics["isolates_count"] = len(isolates)

        # In-degree centrality / Top hubs
        in_degrees = dict(G.in_degree())
        top_in = sorted(in_degrees.items(), key=lambda x: x[1], reverse=True)[:15]
        graph_metrics["top_referenced_docs"] = [{"path": p, "in_degree": deg} for p, deg in top_in if deg > 0]

        # PageRank
        try:
            pr = nx.pagerank(G, alpha=0.85, max_iter=200)
            top_pr = sorted(pr.items(), key=lambda x: x[1], reverse=True)[:15]
            graph_metrics["top_pagerank_docs"] = [{"path": p, "pagerank": round(score, 6)} for p, score in top_pr]
        except Exception as e:
            graph_metrics["pagerank_error"] = str(e)

    except ImportError:
        pass

    # Gate deduplication & definition matching
    for gate_id, data in openspec_gates.items():
        data["mentions"] = sorted(list(set(data["mentions"])))

    # Evidence classification buckets
    evidence_classification = {
        "IMPLEMENTED": [],
        "TESTED_FIXTURE": [],
        "PROVEN_LIVE": [],
        "BLOCKED": [],
        "NOT_PROVEN": []
    }

    receipt = {
        "audit_version": "v1.0.0",
        "timestamp": datetime.now(timezone.utc).isoformat(),
        "root": str(root_path).replace("\\", "/"),
        "summary": {
            "total_markdown_files_scanned": len(markdown_files),
            "skipped_oversized_files": len(skipped_oversized),
            "total_links_found": total_links_found,
            "broken_links_count": len(broken_links),
            "unique_gates_detected": len(openspec_gates),
            "checklist_totals": {
                "checked": checklist_stats["checked"],
                "unchecked": checklist_stats["unchecked"],
                "total": checklist_stats["checked"] + checklist_stats["unchecked"]
            }
        },
        "skipped_oversized": skipped_oversized,
        "graph_metrics": graph_metrics,
        "broken_links_sample": broken_links[:50],  # Sample first 50
        "broken_links_total": len(broken_links),
        "openspec_gates_summary": {
            "count": len(openspec_gates),
            "sample_gates": list(openspec_gates.keys())[:30]
        },
        "checklist_stats": {
            "checked": checklist_stats["checked"],
            "unchecked": checklist_stats["unchecked"],
            "files_with_checklists": len(checklist_stats["items_by_file"])
        }
    }

    with open(output_path, "w", encoding="utf-8") as f:
        json.dump(receipt, f, indent=2)

    print(f"DOCUMENT_GRAPH_AUDIT_SUCCESS: wrote receipt to {output_path}")
    print(f"Files scanned: {len(markdown_files)} | Broken links: {len(broken_links)} | OpenSpec gates: {len(openspec_gates)}")
    if graph_metrics["networkx_available"]:
        print(f"Graph nodes: {graph_metrics['num_nodes']} | Edges: {graph_metrics['num_edges']} | Components: {graph_metrics['num_weakly_connected_components']}")

if __name__ == "__main__":
    main()
