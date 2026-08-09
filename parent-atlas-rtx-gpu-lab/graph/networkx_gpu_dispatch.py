#!/usr/bin/env python3
"""
Run ordinary NetworkX APIs with the nx-cugraph backend enabled.

Either launch with:
  NX_CUGRAPH_AUTOCONFIG=True python networkx_gpu_dispatch.py ...

or this script will set the environment before importing networkx.
"""
import os
os.environ.setdefault("NX_CUGRAPH_AUTOCONFIG","True")

import argparse, json, time
import pandas as pd
import networkx as nx

ap=argparse.ArgumentParser()
ap.add_argument("edges_csv")
ap.add_argument("--algorithm",choices=[
    "pagerank","hits","louvain","leiden","betweenness","kcore",
    "ancestors","descendants","bfs","dijkstra"
],required=True)
ap.add_argument("--source")
ap.add_argument("--target")
args=ap.parse_args()

df=pd.read_csv(args.edges_csv)
G=nx.from_pandas_edgelist(df,"src","dst",create_using=nx.DiGraph)

t=time.perf_counter()
a=args.algorithm
if a=="pagerank":
    r=nx.pagerank(G,alpha=0.85,max_iter=100,tol=1e-7)
elif a=="hits":
    hubs,auth=nx.hits(G,max_iter=100); r={"hubs":hubs,"authorities":auth}
elif a=="louvain":
    r={"communities":[sorted(map(str,c)) for c in nx.community.louvain_communities(G.to_undirected(),seed=1337)]}
elif a=="leiden":
    # available in nx-cugraph; call via backend if exposed in installed NetworkX version
    try:
        r={"communities":[sorted(map(str,c)) for c in nx.community.leiden_communities(G.to_undirected())]}
    except AttributeError:
        raise SystemExit("Installed NetworkX does not expose leiden_communities; use native cuGraph script.")
elif a=="betweenness":
    r=nx.betweenness_centrality(G)
elif a=="kcore":
    r=nx.core_number(G.to_undirected())
elif a=="ancestors":
    r=sorted(map(str,nx.ancestors(G,args.source)))
elif a=="descendants":
    r=sorted(map(str,nx.descendants(G,args.source)))
elif a=="bfs":
    r=list(map(str,nx.bfs_tree(G,args.source).nodes()))
else:
    r=nx.dijkstra_path(G,args.source,args.target)

print(json.dumps({
    "engine":"networkx+nx-cugraph",
    "algorithm":a,
    "nodes":G.number_of_nodes(),
    "edges":G.number_of_edges(),
    "durationMs":(time.perf_counter()-t)*1000,
    "result":r
}, default=float))
