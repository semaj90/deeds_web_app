#!/usr/bin/env python3
"""Train the Parent Atlas query router on frozen feature tensors.

Input JSONL rows must contain:
  query_id: str
  embedding_mrl_128: list[128]
  query_features: list[26]
  domain_label: str
  operation_label: str
  retrieval_needs: list[8]
  budget_targets: list[3]

The trainer consumes frozen numeric features only. Train/validation/test
membership is derived from SHA-256(query_id), so PyTorch, XGBoost and static
baselines evaluate identical rows.
"""
from __future__ import annotations
import argparse, hashlib, json, math, random
from dataclasses import dataclass
from pathlib import Path
from typing import Any
import numpy as np
import torch
from torch import nn
from torch.utils.data import DataLoader, Dataset

DOMAINS=["code","database","retrieval","graph","api","security","documentation","workflow","testing","unknown"]
OPERATIONS=["find","explain","debug","modify","compare","trace","test","synthesize"]
EMBED_DIM=128; QUERY_FEATURE_DIM=26; RETRIEVAL_NEED_DIM=8; BUDGET_DIM=3; INPUT_DIM=154
FEATURE_CONTRACT_REVISION="atlas.query-router-tensor.v1"; MODEL_ARCH_REVISION="atlas.query-router-mlp.v1"; STABLE_SPLIT_REVISION="sha256-query-id-80-10-10-v1"

@dataclass
class Row:
    query_id:str; features:np.ndarray; domain:int; operation:int; needs:np.ndarray; budget:np.ndarray
class RouterDataset(Dataset):
    def __init__(self,rows:list[Row]): self.rows=rows
    def __len__(self): return len(self.rows)
    def __getitem__(self,idx):
        r=self.rows[idx]; return torch.from_numpy(r.features),torch.tensor(r.domain,dtype=torch.long),torch.tensor(r.operation,dtype=torch.long),torch.from_numpy(r.needs),torch.from_numpy(r.budget)
class QueryRouterMLPV1(nn.Module):
    def __init__(self,input_dim:int=INPUT_DIM,hidden:int=192,dropout:float=.10):
        super().__init__(); self.trunk=nn.Sequential(nn.LayerNorm(input_dim),nn.Linear(input_dim,hidden),nn.GELU(),nn.Dropout(dropout),nn.Linear(hidden,hidden//2),nn.GELU()); d=hidden//2; self.domain=nn.Linear(d,len(DOMAINS)); self.operation=nn.Linear(d,len(OPERATIONS)); self.needs=nn.Linear(d,8); self.budget=nn.Linear(d,3)
    def forward(self,x): h=self.trunk(x); return self.domain(h),self.operation(h),self.needs(h),self.budget(h)
class OnnxWrapper(nn.Module):
    def __init__(self,model): super().__init__(); self.model=model
    def forward(self,x):
        d,o,n,b=self.model(x); return torch.softmax(d,-1),torch.softmax(o,-1),torch.sigmoid(n),torch.sigmoid(b)
def sha256_bytes(data:bytes)->str:return hashlib.sha256(data).hexdigest()
def stable_split(query_id:str)->str:
    bucket=int(hashlib.sha256(query_id.encode()).hexdigest()[:8],16)%100; return "train" if bucket<80 else "validation" if bucket<90 else "test"
def load_rows(path:Path):
    raw=path.read_bytes(); rows=[]
    for lineno,line in enumerate(raw.decode().splitlines(),1):
        if not line.strip(): continue
        item=json.loads(line); emb=np.asarray(item["embedding_mrl_128"],dtype=np.float32); qf=np.asarray(item["query_features"],dtype=np.float32); needs=np.asarray(item["retrieval_needs"],dtype=np.float32); budget=np.asarray(item["budget_targets"],dtype=np.float32)
        if emb.shape!=(128,) or qf.shape!=(26,): raise ValueError(f"line {lineno}: feature shape mismatch")
        if needs.shape!=(8,) or np.any(needs<0) or np.any(needs>1): raise ValueError(f"line {lineno}: invalid retrieval needs")
        if budget.shape!=(3,) or np.any(budget<0) or np.any(budget>1): raise ValueError(f"line {lineno}: invalid budget targets")
        if not np.isfinite(emb).all() or not np.isfinite(qf).all(): raise ValueError(f"line {lineno}: non-finite features")
        domain=str(item["domain_label"]); operation=str(item["operation_label"])
        if domain not in DOMAINS or operation not in OPERATIONS: raise ValueError(f"line {lineno}: unknown labels")
        rows.append(Row(str(item["query_id"]),np.concatenate([emb,qf]).astype(np.float32,copy=False),DOMAINS.index(domain),OPERATIONS.index(operation),needs,budget))
    if len(rows)<30: raise ValueError("at least 30 rows are required")
    return rows,sha256_bytes(raw)
def set_seed(seed):
    random.seed(seed); np.random.seed(seed); torch.manual_seed(seed)
    if torch.cuda.is_available(): torch.cuda.manual_seed_all(seed)
def rows_for_split(rows,split):
    selected=[r for r in rows if stable_split(r.query_id)==split]
    if not selected: raise ValueError(f"stable split {split!r} is empty")
    return selected
def evaluate(model,loader,device):
    model.eval(); totals={"domain_correct":0,"operation_correct":0,"count":0,"needs_bce":0.,"budget_mse":0.}; bce=nn.BCEWithLogitsLoss(reduction="sum"); mse=nn.MSELoss(reduction="sum")
    with torch.no_grad():
        for x,d,o,n,b in loader:
            x,d,o,n,b=[v.to(device) for v in (x,d,o,n,b)]; dl,ol,nl,bl=model(x); totals["domain_correct"]+=int((dl.argmax(-1)==d).sum()); totals["operation_correct"]+=int((ol.argmax(-1)==o).sum()); totals["count"]+=x.shape[0]; totals["needs_bce"]+=float(bce(nl,n)); totals["budget_mse"]+=float(mse(torch.sigmoid(bl),b))
    c=max(1,totals["count"]); return {"domain_accuracy":totals["domain_correct"]/c,"operation_accuracy":totals["operation_correct"]/c,"retrieval_needs_bce_per_row":totals["needs_bce"]/c,"budget_mse_per_row":totals["budget_mse"]/c}
def write_predictions(model,rows,path):
    lines=[]; model.eval()
    with torch.no_grad():
        for r in rows:
            d,o,n,b=model(torch.from_numpy(r.features).unsqueeze(0)); lines.append(json.dumps({"query_id":r.query_id,"domain_probabilities":torch.softmax(d,-1)[0].tolist(),"operation_probabilities":torch.softmax(o,-1)[0].tolist(),"retrieval_need_probabilities":torch.sigmoid(n)[0].tolist(),"budget_predictions":torch.sigmoid(b)[0].tolist()},sort_keys=True))
    path.write_text("\n".join(lines)+"\n")
def main():
    p=argparse.ArgumentParser(); p.add_argument("--dataset",type=Path,required=True); p.add_argument("--output-dir",type=Path,default=Path("classifier-models/query-router-v1")); p.add_argument("--epochs",type=int,default=40); p.add_argument("--batch-size",type=int,default=64); p.add_argument("--lr",type=float,default=3e-4); p.add_argument("--weight-decay",type=float,default=1e-2); p.add_argument("--seed",type=int,default=42); p.add_argument("--device",choices=["auto","cpu","cuda"],default="auto"); p.add_argument("--export-onnx",action="store_true"); a=p.parse_args(); set_seed(a.seed)
    rows,checksum=load_rows(a.dataset); tr=rows_for_split(rows,"train"); va=rows_for_split(rows,"validation"); te=rows_for_split(rows,"test"); gen=torch.Generator().manual_seed(a.seed); tl=DataLoader(RouterDataset(tr),batch_size=a.batch_size,shuffle=True,generator=gen); vl=DataLoader(RouterDataset(va),batch_size=a.batch_size); tel=DataLoader(RouterDataset(te),batch_size=a.batch_size)
    if a.device=="cuda" and not torch.cuda.is_available(): raise RuntimeError("CUDA requested but unavailable")
    device=torch.device("cuda" if (a.device=="cuda" or (a.device=="auto" and torch.cuda.is_available())) else "cpu"); model=QueryRouterMLPV1().to(device); opt=torch.optim.AdamW(model.parameters(),lr=a.lr,weight_decay=a.weight_decay); ce=nn.CrossEntropyLoss(); bce=nn.BCEWithLogitsLoss(); mse=nn.MSELoss(); best=None; best_score=-math.inf; history=[]
    for epoch in range(1,a.epochs+1):
        model.train(); loss_sum=0.; seen=0
        for x,d,o,n,b in tl:
            x,d,o,n,b=[v.to(device) for v in (x,d,o,n,b)]; opt.zero_grad(set_to_none=True); dl,ol,nl,bl=model(x); loss=ce(dl,d)+ce(ol,o)+.75*bce(nl,n)+.25*mse(torch.sigmoid(bl),b); loss.backward(); torch.nn.utils.clip_grad_norm_(model.parameters(),1.0); opt.step(); loss_sum+=float(loss)*x.shape[0]; seen+=x.shape[0]
        metrics=evaluate(model,vl,device); score=metrics["domain_accuracy"]+metrics["operation_accuracy"]-.1*metrics["retrieval_needs_bce_per_row"]; history.append({"epoch":epoch,"train_loss":loss_sum/max(1,seen),**metrics})
        if score>best_score: best_score=score; best={k:v.detach().cpu().clone() for k,v in model.state_dict().items()}
    if best is None: raise RuntimeError("no checkpoint")
    model.load_state_dict(best); model.cpu().eval(); vm=evaluate(model,vl,torch.device("cpu")); tm=evaluate(model,tel,torch.device("cpu")); a.output_dir.mkdir(parents=True,exist_ok=True); ck=a.output_dir/"query-router-v1.pt"; torch.save({"state_dict":model.state_dict(),"domains":DOMAINS,"operations":OPERATIONS},ck); pred=a.output_dir/"test-predictions.jsonl"; write_predictions(model,te,pred)
    manifest={"schema":"atlas.query-router-training-receipt.v1","modelArchitectureRevision":MODEL_ARCH_REVISION,"featureContractRevision":FEATURE_CONTRACT_REVISION,"embeddingModelId":"google/embeddinggemma-300m","embeddingRepresentationId":"classification_mrl_128","embeddingSourceRepresentationId":"classification_768","inputDimension":154,"datasetPath":str(a.dataset),"datasetChecksum":checksum,"rowCount":len(rows),"splitRevision":STABLE_SPLIT_REVISION,"trainCount":len(tr),"validationCount":len(va),"testCount":len(te),"seed":a.seed,"optimizer":"AdamW","validationMetrics":vm,"testMetrics":tm,"checkpoint":str(ck),"checkpointSha256":sha256_bytes(ck.read_bytes()),"testPredictions":str(pred),"evidenceAuthority":False,"canonicalOwnerChanged":False}
    if a.export_onnx:
        onnx_path=a.output_dir/"query-router-v1.onnx"; sample=torch.zeros((1,154),dtype=torch.float32); program=torch.onnx.export(OnnxWrapper(model),(sample,),dynamo=True,input_names=["features"],output_names=["domain_probabilities","operation_probabilities","retrieval_needs","budget"],dynamic_shapes=({0:torch.export.Dim("batch")},)); program.save(str(onnx_path)); manifest["onnx"]={"path":str(onnx_path),"sha256":sha256_bytes(onnx_path.read_bytes()),"exporter":"torch.onnx.export(dynamo=True)"}
    (a.output_dir/"training-receipt.json").write_text(json.dumps(manifest,indent=2)+"\n"); (a.output_dir/"history.json").write_text(json.dumps(history,indent=2)+"\n"); print(json.dumps(manifest,indent=2)); return 0
if __name__=="__main__": raise SystemExit(main())
