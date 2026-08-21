#!/usr/bin/env python3
"""NetworkX PageRank reference oracle for Parent Atlas graph authority.

NetworkX owns the readable reference equation. Accelerated executors must prove
parity against the same revisioned projection/config; they do not redefine it.
The authority graph may contain cycles. Workflow DAG validation is separate.
"""
from __future__ import annotations
import argparse, hashlib, json, os, subprocess, uuid
from pathlib import Path
from typing import Iterable
try:
    import networkx as nx
    import yaml
except ImportError as error:
    print(json.dumps({"status":"NETWORKX_UNAVAILABLE","reason":str(error)}));raise SystemExit(2)

ROOT=Path(__file__).resolve().parents[1]
DEFAULT_FIXTURE=ROOT/"sveltekit-frontend/src/lib/server/atlas/graph/fixtures/pagerank-parity-graph.json"
DEFAULT_FROZEN_FIXTURE=ROOT/"graphify/frozen-graph-snapshot-v2.json"
DEFAULT_MANIFEST=ROOT/".okf/manifest.yaml"

def stable_json(value:object)->str:
    def normalize_numbers(item:object)->object:
        if isinstance(item,float) and item.is_integer(): return int(item)
        if isinstance(item,list): return [normalize_numbers(child) for child in item]
        if isinstance(item,dict): return {key:normalize_numbers(child) for key,child in item.items()}
        return item
    return json.dumps(normalize_numbers(value),sort_keys=True,separators=(",",":"),ensure_ascii=True)

def sha256_json(value:object)->str:return hashlib.sha256(stable_json(value).encode("utf-8")).hexdigest()

def topology_hash(nodes:list[dict],edges:list[dict])->str:
    return sha256_json({"nodes":sorted([{k:v for k,v in n.items() if k!="snapshotId"} for n in nodes],key=lambda n:n["nodeKey"]),"edges":sorted([{k:v for k,v in e.items() if k!="snapshotId"} for e in edges],key=lambda e:e["edgeKey"])})

def parse_personalization(entries:Iterable[str],valid_nodes:set[str])->dict[str,float]|None:
    weights:dict[str,float]={}
    for entry in entries:
        if "=" not in entry: raise ValueError(f"invalid personalization entry {entry!r}; expected NODE=WEIGHT")
        node,raw=entry.rsplit("=",1);node=node.strip()
        if node not in valid_nodes: raise ValueError(f"personalization node is not in graph: {node}")
        weight=float(raw)
        if weight<0: raise ValueError("personalization weights must be >= 0")
        weights[node]=weights.get(node,0.0)+weight
    if not weights:return None
    total=sum(weights.values())
    if total<=0:raise ValueError("at least one personalization weight must be > 0")
    return {node:weights[node]/total for node in sorted(weights)}

def run(fixture_path:Path,manifest_path:Path,*,alpha:float=0.85,max_iter:int=100,tol:float=1e-8,personalization_entries:Iterable[str]=())->dict:
    if not 0.0<alpha<1.0:raise ValueError("alpha must satisfy 0 < alpha < 1")
    if max_iter<=0:raise ValueError("max_iter must be > 0")
    if tol<=0:raise ValueError("tol must be > 0")
    fixture=json.loads(fixture_path.read_text(encoding="utf-8"));manifest=yaml.safe_load(manifest_path.read_text(encoding="utf-8"));projection=manifest["graph_projection"]
    included={edge.upper() for edge in projection["pagerank_edges"]};excluded={edge.upper() for edge in projection["excluded_edges"]}
    if "SEMANTIC_SIMILAR" not in excluded:raise ValueError("semantic_similar must be excluded from the PageRank projection")
    if included&excluded:raise ValueError("PageRank edge types cannot also be excluded")
    snapshot_id=fixture["snapshotId"];nodes=[{**node,"snapshotId":snapshot_id} for node in fixture["nodes"]];edges=[{**edge,"snapshotId":snapshot_id} for edge in fixture["edges"]]
    graph=nx.DiGraph();graph.add_nodes_from(node["nodeKey"] for node in nodes);projected_edges=[]
    for edge in edges:
        edge_type=edge["edgeType"].upper()
        if edge_type in included and edge["confidence"]>=projection["minimum_confidence"]:
            graph.add_edge(edge["sourceNodeKey"],edge["targetNodeKey"],weight=edge["weight"])
            projected_edges.append({"edgeKey":edge["edgeKey"],"sourceNodeKey":edge["sourceNodeKey"],"targetNodeKey":edge["targetNodeKey"],"edgeType":edge_type,"weight":edge["weight"],"confidence":edge["confidence"]})
    personalization=parse_personalization(personalization_entries,set(graph.nodes))
    scores=nx.pagerank(graph,alpha=alpha,personalization=personalization,max_iter=max_iter,tol=tol,weight="weight")
    source_topology_hash=topology_hash(nodes,edges)
    projection_payload={"snapshotId":snapshot_id,"minimumConfidence":projection["minimum_confidence"],"includedEdgeTypes":sorted(included),"excludedEdgeTypes":sorted(excluded),"nodes":sorted(graph.nodes),"edges":sorted(projected_edges,key=lambda e:e["edgeKey"])}
    projection_hash=sha256_json(projection_payload);personalization_hash=sha256_json(personalization) if personalization else None
    score_rows=[{"nodeKey":node_key,"pagerankRaw":scores[node_key]} for node_key in sorted(scores)];result_hash=sha256_json(score_rows)
    config={"alpha":alpha,"max_iter":max_iter,"tol":tol,"weight":"weight","mode":"personalized" if personalization else "global","personalization":personalization};config_hash=sha256_json(config)
    run_id=str(uuid.uuid5(uuid.NAMESPACE_URL,f"atlas-networkx:v2:{snapshot_id}:{projection_hash}:{config_hash}"))
    return {"schema":"atlas.graph-authority-receipt.v2","status":"NETWORKX_REFERENCE_PROVEN","snapshot_id":snapshot_id,"authority_contract":"networkx-authority-v2","run_id":run_id,"source_topology_hash":source_topology_hash,"projection_hash":projection_hash,"config_hash":config_hash,"personalization_hash":personalization_hash,"reference_engine":"networkx","executor_role":"REFERENCE_ORACLE","normalization_applied_by":"none","config":config,"node_count":graph.number_of_nodes(),"edge_count":graph.number_of_edges(),"included_edge_types":sorted(included),"excluded_edge_types":sorted(excluded),"scores":score_rows,"result_hash":result_hash}

def main()->int:
    parser=argparse.ArgumentParser();parser.add_argument("--fixture",type=Path,default=DEFAULT_FROZEN_FIXTURE if DEFAULT_FROZEN_FIXTURE.exists() else DEFAULT_FIXTURE);parser.add_argument("--manifest",type=Path,default=DEFAULT_MANIFEST);parser.add_argument("--build-fixture",action="store_true");parser.add_argument("--workspace-id",default=os.environ.get("PAGERANK_WORKSPACE_ID","workspace:parent-atlas"));parser.add_argument("--snapshot-id",default=os.environ.get("PAGERANK_SNAPSHOT_ID",""));parser.add_argument("--source-inventory-snapshot-id",default=os.environ.get("PAGERANK_SOURCE_INVENTORY_SNAPSHOT_ID",""));parser.add_argument("--alpha",type=float,default=0.85);parser.add_argument("--max-iter",type=int,default=100);parser.add_argument("--tol",type=float,default=1e-8);parser.add_argument("--personalize",action="append",default=[],metavar="NODE=WEIGHT");args=parser.parse_args()
    fixture_path=args.fixture
    if args.build_fixture or not fixture_path.exists():
        exporter=ROOT/"scripts/atlas/export-graph-snapshot-v2.mts";snapshot_id=args.snapshot_id or str(uuid.uuid4());source_inventory_snapshot_id=args.source_inventory_snapshot_id or f"inventory:{snapshot_id}"
        subprocess.run(["npx","tsx",str(exporter),"--output-json",str(fixture_path),"--workspace-id",args.workspace_id,"--snapshot-id",snapshot_id,"--source-inventory-snapshot-id",source_inventory_snapshot_id],cwd=ROOT,check=True)
    print(json.dumps(run(fixture_path,args.manifest,alpha=args.alpha,max_iter=args.max_iter,tol=args.tol,personalization_entries=args.personalize),sort_keys=True));return 0
if __name__=="__main__":raise SystemExit(main())
