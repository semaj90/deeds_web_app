#!/usr/bin/env python3
"""Bounded GraphSAGE mean aggregation parity, CPU vs optional CUDA.
Fixture only. Not a trained GraphSAGE model nor a cuGraph execution proof.
"""
import argparse,json,time
def main():
 p=argparse.ArgumentParser()
 p.add_argument("--device",choices=["cpu","cuda"],default="cpu")
 p.add_argument("--max-gpu-mb",type=int,default=64)
 a=p.parse_args()
 if a.max_gpu_mb < 1 or a.max_gpu_mb > 256:p.error("Invalid budget")
 from atlas_compute.graph_tensor_metrics_v1 import benchmark_dense_aggregation
 if a.device=="cuda":
  import torch
  if not torch.cuda.is_available():raise RuntimeError("CUDA_UNAVAILABLE_NO_FALLBACK")
  free,total=torch.cuda.mem_get_info()
  if free < (a.max_gpu_mb+256)*1024*1024:raise RuntimeError("GPU_HEADROOM_INSUFFICIENT")
 begin=time.perf_counter()
 result=benchmark_dense_aggregation([[1.,0.],[0.,1.],[2.,3.]],[(0,2),(1,2)],
    graph_revision="fixture-graph-rev",device=a.device)
 payload={"schema":"atlas.gnn-cpu-cuda-parity.v1","fixtureOnly":True,
    "effectiveDevice":a.device,"verified":result.verified,
    "elapsedMs":(time.perf_counter()-begin)*1000,
    "maxAbsError":result.max_absolute_error,"relativeL2Error":result.relative_l2_error,
    "topkOverlap":result.topk_overlap,"checksum":result.checksum,
    "trainedGraphSageProven":False,"realLineageProven":False,"cuGraphProven":False}
 print(json.dumps(payload,sort_keys=True))
 if not result.verified:raise RuntimeError("PARITY_FAILED")
if __name__=="__main__":main()
