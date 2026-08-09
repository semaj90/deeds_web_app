#!/usr/bin/env python3
import argparse, json, time
import pandas as pd
import cudf, cugraph

ap=argparse.ArgumentParser()
ap.add_argument("edges_csv")
ap.add_argument("--algorithm",choices=["pagerank","louvain","leiden"],required=True)
args=ap.parse_args()

pdf=pd.read_csv(args.edges_csv)
gdf=cudf.DataFrame.from_pandas(pdf[["src","dst"]])
G=cugraph.DiGraph()
G.from_cudf_edgelist(gdf,source="src",destination="dst",renumber=True)

t=time.perf_counter()
if args.algorithm=="pagerank":
    x=cugraph.pagerank(G,alpha=0.85,max_iter=100,tol=1e-7).to_pandas()
    result={
      "count":int(len(x)),
      "l1Sum":float(x["pagerank"].sum()),
      "top100":x.sort_values("pagerank",ascending=False).head(100).to_dict("records")
    }
elif args.algorithm=="louvain":
    x,m=cugraph.louvain(G)
    p=x.to_pandas()
    result={"count":int(len(p)),"communities":int(p["partition"].nunique()),"modularity":float(m)}
else:
    x,m=cugraph.leiden(G)
    p=x.to_pandas()
    col="partition" if "partition" in p.columns else p.columns[-1]
    result={"count":int(len(p)),"communities":int(p[col].nunique()),"modularity":float(m)}

print(json.dumps({
  "engine":"cugraph-native",
  "algorithm":args.algorithm,
  "durationMs":(time.perf_counter()-t)*1000,
  "result":result
}, default=str))
