#!/usr/bin/env python3
import argparse, json, time, pandas as pd

def build(csv_path):
    import cudf, cugraph
    pdf = pd.read_csv(csv_path)
    gdf = cudf.DataFrame.from_pandas(pdf[["src","dst"]])
    G = cugraph.DiGraph()
    G.from_cudf_edgelist(gdf, source="src", destination="dst", renumber=True)
    return G, cugraph

def main():
    ap=argparse.ArgumentParser()
    ap.add_argument("edges_csv")
    ap.add_argument("--algorithm",choices=["pagerank","louvain","leiden"],required=True)
    a=ap.parse_args()
    t=time.time()
    G,cg=build(a.edges_csv)
    if a.algorithm=="pagerank":
        x=cg.pagerank(G,alpha=0.85,max_iter=100,tol=1e-7).to_pandas()
        result={"nodeCount":len(x),"l1Sum":float(x["pagerank"].sum())}
    elif a.algorithm=="louvain":
        x,m=cg.louvain(G); p=x.to_pandas()
        result={"nodeCount":len(p),"communityCount":int(p["partition"].nunique()),"modularity":float(m)}
    else:
        x,m=cg.leiden(G); p=x.to_pandas()
        col="partition" if "partition" in p.columns else p.columns[-1]
        result={"nodeCount":len(p),"communityCount":int(p[col].nunique()),"modularity":float(m)}
    print(json.dumps({"schema":"parent-atlas.rapids-graph-result.v1","algorithm":a.algorithm,
                      "durationMs":round((time.time()-t)*1000,2),"result":result},indent=2))
if __name__=="__main__": main()
