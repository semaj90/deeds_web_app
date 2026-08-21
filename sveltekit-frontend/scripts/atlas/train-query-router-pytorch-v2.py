#!/usr/bin/env python3
from __future__ import annotations

import argparse
import hashlib
import json
from pathlib import Path
from typing import Any

import numpy as np
import torch
from torch import nn
from torch.utils.data import DataLoader, Dataset

DOMAINS = ["code","database","retrieval","graph","api","security","documentation","workflow","testing","unknown"]
OPERATIONS = ["find","explain","debug","modify","compare","trace","test","synthesize"]
INPUT_DIM = 234
NEEDS_DIM = 8
BUDGET_DIM = 3
MODEL_ARCH_REVISION = "atlas.query-router-pytorch.v2"
TENSOR_REVISION = "atlas.retrieval-router-tensor.v2"

class RouterDataset(Dataset):
    def __init__(self, rows: list[dict[str, Any]]):
        self.rows = rows
    def __len__(self): return len(self.rows)
    def __getitem__(self, idx):
        row = self.rows[idx]
        return (
            torch.tensor(row["featureTensor234"], dtype=torch.float32),
            torch.tensor(DOMAINS.index(row["domainLabel"]), dtype=torch.long),
            torch.tensor(OPERATIONS.index(row["operationLabel"]), dtype=torch.long),
            torch.tensor(row["retrievalNeeds"], dtype=torch.float32),
            torch.tensor(row["budgetTargets"], dtype=torch.float32),
        )

class QueryRouterV2(nn.Module):
    def __init__(self):
        super().__init__()
        self.trunk = nn.Sequential(
            nn.LayerNorm(INPUT_DIM),
            nn.Linear(INPUT_DIM, 256), nn.GELU(), nn.Dropout(0.10),
            nn.Linear(256, 128), nn.GELU(),
        )
        self.domain = nn.Linear(128, len(DOMAINS))
        self.operation = nn.Linear(128, len(OPERATIONS))
        self.needs = nn.Linear(128, NEEDS_DIM)
        self.budget = nn.Linear(128, BUDGET_DIM)
    def forward(self, x):
        h = self.trunk(x)
        return self.domain(h), self.operation(h), self.needs(h), self.budget(h)

def sha256(path: Path) -> str:
    return hashlib.sha256(path.read_bytes()).hexdigest()

def load_rows(path: Path):
    rows = [json.loads(line) for line in path.read_text(encoding="utf-8").splitlines() if line.strip()]
    if len(rows) < 20: raise ValueError("at least 20 rows required")
    for i, row in enumerate(rows, 1):
        if row.get("tensorRevision") != TENSOR_REVISION: raise ValueError(f"line {i}: tensorRevision mismatch")
        if len(row.get("featureTensor234", [])) != INPUT_DIM: raise ValueError(f"line {i}: feature width mismatch")
        if row.get("domainLabel") not in DOMAINS: raise ValueError(f"line {i}: domain label")
        if row.get("operationLabel") not in OPERATIONS: raise ValueError(f"line {i}: operation label")
        if row.get("split") not in {"train","validation","test"}: raise ValueError(f"line {i}: split")
    return rows

def metrics(model, rows, device):
    loader = DataLoader(RouterDataset(rows), batch_size=128, shuffle=False)
    model.eval(); dc=oc=n=0; need_loss=budget_loss=0.0
    bce = nn.BCEWithLogitsLoss(reduction="sum"); mse = nn.MSELoss(reduction="sum")
    with torch.no_grad():
        for x,d,o,needs,budget in loader:
            x,d,o,needs,budget = [v.to(device) for v in (x,d,o,needs,budget)]
            dl,ol,nl,bl = model(x)
            dc += int((dl.argmax(-1)==d).sum()); oc += int((ol.argmax(-1)==o).sum()); n += x.shape[0]
            need_loss += float(bce(nl, needs)); budget_loss += float(mse(torch.sigmoid(bl), budget))
    n=max(n,1)
    return {"domainAccuracy":dc/n,"operationAccuracy":oc/n,"retrievalNeedsBcePerRow":need_loss/n,"budgetMsePerRow":budget_loss/n}

def main():
    ap=argparse.ArgumentParser()
    ap.add_argument("--dataset", type=Path, required=True)
    ap.add_argument("--output-dir", type=Path, default=Path("classifier-models/query-router-v2-pytorch"))
    ap.add_argument("--epochs", type=int, default=50); ap.add_argument("--batch-size", type=int, default=64)
    ap.add_argument("--lr", type=float, default=3e-4); ap.add_argument("--seed", type=int, default=42)
    ap.add_argument("--device", choices=["auto","cpu","cuda"], default="auto")
    args=ap.parse_args(); torch.manual_seed(args.seed); np.random.seed(args.seed)
    rows=load_rows(args.dataset)
    train=[r for r in rows if r["split"]=="train"]; val=[r for r in rows if r["split"]=="validation"]; test=[r for r in rows if r["split"]=="test"]
    if not train or not val or not test: raise ValueError("all frozen splits must be non-empty")
    if args.device=="cuda" and not torch.cuda.is_available(): raise RuntimeError("CUDA requested but unavailable")
    device=torch.device("cuda" if args.device=="cuda" or (args.device=="auto" and torch.cuda.is_available()) else "cpu")
    gen=torch.Generator().manual_seed(args.seed)
    loader=DataLoader(RouterDataset(train),batch_size=args.batch_size,shuffle=True,generator=gen)
    model=QueryRouterV2().to(device); opt=torch.optim.AdamW(model.parameters(),lr=args.lr,weight_decay=1e-2)
    ce=nn.CrossEntropyLoss(); bce=nn.BCEWithLogitsLoss(); mse=nn.MSELoss(); best=None; best_score=-1e9
    for _ in range(args.epochs):
        model.train()
        for x,d,o,needs,budget in loader:
            x,d,o,needs,budget=[v.to(device) for v in (x,d,o,needs,budget)]
            opt.zero_grad(set_to_none=True); dl,ol,nl,bl=model(x)
            loss=ce(dl,d)+ce(ol,o)+0.75*bce(nl,needs)+0.25*mse(torch.sigmoid(bl),budget)
            loss.backward(); torch.nn.utils.clip_grad_norm_(model.parameters(),1.0); opt.step()
        vm=metrics(model,val,device); score=vm["domainAccuracy"]+vm["operationAccuracy"]-0.1*vm["retrievalNeedsBcePerRow"]
        if score>best_score:
            best_score=score; best={k:v.detach().cpu().clone() for k,v in model.state_dict().items()}
    if best is None: raise RuntimeError("no checkpoint")
    model.load_state_dict(best); model.cpu().eval()
    args.output_dir.mkdir(parents=True,exist_ok=True)
    ckpt=args.output_dir/"query-router-v2.pt"; torch.save({"state_dict":model.state_dict(),"domains":DOMAINS,"operations":OPERATIONS},ckpt)
    receipt={
        "schema":"atlas.query-router-training-receipt.v2","trainer":"pytorch","modelArchitectureRevision":MODEL_ARCH_REVISION,
        "tensorRevision":TENSOR_REVISION,"datasetPath":str(args.dataset),"datasetChecksum":sha256(args.dataset),"inputDimension":INPUT_DIM,
        "trainCount":len(train),"validationCount":len(val),"testCount":len(test),"seed":args.seed,"trainingDevice":str(device),
        "validationMetrics":metrics(model,val,torch.device("cpu")),"testMetrics":metrics(model,test,torch.device("cpu")),
        "checkpoint":str(ckpt),"checkpointSha256":sha256(ckpt),"evidenceAuthority":False,"canonicalOwnerChanged":False,"retrievalOwnerChanged":False,
    }
    (args.output_dir/"training-receipt.json").write_text(json.dumps(receipt,indent=2)+"\n",encoding="utf-8")
    print(json.dumps(receipt,indent=2)); return 0

if __name__=="__main__": raise SystemExit(main())
