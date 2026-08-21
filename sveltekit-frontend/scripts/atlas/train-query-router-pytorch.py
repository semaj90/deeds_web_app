#!/usr/bin/env python3
"""Train the Parent Atlas query router on revision-qualified frozen tensors.

The trainer intentionally does not encode text. It consumes JSONL produced by
`export-query-router-dataset.mts` and independently re-validates representation,
prompt, feature, tensor, label, and model lineage before training. A hand-built
154-number row without this provenance is rejected.
"""
from __future__ import annotations

import argparse
import hashlib
import json
import math
import random
from dataclasses import dataclass
from pathlib import Path
from typing import Any

import numpy as np
import torch
from torch import nn
from torch.utils.data import DataLoader, Dataset, random_split

DOMAINS = ["code","database","retrieval","graph","api","security","documentation","workflow","testing","unknown"]
OPERATIONS = ["find","explain","debug","modify","compare","trace","test","synthesize"]
EMBED_DIM = 128
QUERY_FEATURE_DIM = 26
RETRIEVAL_NEED_DIM = 8
BUDGET_DIM = 3
INPUT_DIM = EMBED_DIM + QUERY_FEATURE_DIM
FEATURE_CONTRACT_REVISION = "atlas.query-router-tensor.v1"
QUERY_FEATURE_REVISION = "atlas.query-feature-projection.v1"
PROMPT_REVISION = "embeddinggemma-classification-prompt-google-model-card-v1"
PROJECTION_REVISION = "MRL_PREFIX_128_FLOAT32_L2_V1"
BUDGET_NORMALIZATION_REVISION = "atlas.query-router-budget-normalization.v1"
MODEL_ID = "google/embeddinggemma-300m"
SOURCE_REPRESENTATION = "classification_768"
ROUTER_REPRESENTATION = "classification_mrl_128"
MODEL_ARCH_REVISION = "atlas.query-router-mlp.v1"

REQUIRED_LINEAGE_FIELDS = (
    "query_digest", "query_revision", "label_revision", "embedding_model_id",
    "embedding_model_revision", "prompt_revision", "embedding_source_representation_id",
    "embedding_representation_id", "projection_revision", "feature_revision",
    "tensor_revision", "budget_normalization_revision", "source_record_sha256",
)

@dataclass
class Row:
    query_id: str
    features: np.ndarray
    domain: int
    operation: int
    needs: np.ndarray
    budget: np.ndarray

class RouterDataset(Dataset):
    def __init__(self, rows: list[Row]): self.rows = rows
    def __len__(self) -> int: return len(self.rows)
    def __getitem__(self, idx: int):
        row = self.rows[idx]
        return (torch.from_numpy(row.features), torch.tensor(row.domain, dtype=torch.long),
                torch.tensor(row.operation, dtype=torch.long), torch.from_numpy(row.needs), torch.from_numpy(row.budget))

class QueryRouterMLPV1(nn.Module):
    def __init__(self, input_dim: int = INPUT_DIM, hidden: int = 192, dropout: float = 0.10):
        super().__init__()
        self.trunk = nn.Sequential(nn.LayerNorm(input_dim), nn.Linear(input_dim, hidden), nn.GELU(), nn.Dropout(dropout), nn.Linear(hidden, hidden // 2), nn.GELU())
        trunk_dim = hidden // 2
        self.domain = nn.Linear(trunk_dim, len(DOMAINS)); self.operation = nn.Linear(trunk_dim, len(OPERATIONS))
        self.needs = nn.Linear(trunk_dim, RETRIEVAL_NEED_DIM); self.budget = nn.Linear(trunk_dim, BUDGET_DIM)
    def forward(self, x: torch.Tensor):
        h = self.trunk(x); return self.domain(h), self.operation(h), self.needs(h), self.budget(h)

class OnnxWrapper(nn.Module):
    def __init__(self, model: QueryRouterMLPV1): super().__init__(); self.model = model
    def forward(self, x: torch.Tensor):
        d,o,n,b = self.model(x)
        return torch.softmax(d, dim=-1), torch.softmax(o, dim=-1), torch.sigmoid(n), torch.sigmoid(b)

def sha256_bytes(data: bytes) -> str: return hashlib.sha256(data).hexdigest()

def _require_text(item: dict[str, Any], key: str, lineno: int) -> str:
    value = item.get(key)
    if not isinstance(value, str) or not value.strip(): raise ValueError(f"line {lineno}: {key} is required")
    return value.strip()

def _only_one(values: set[str], label: str) -> str:
    if len(values) != 1: raise ValueError(f"mixed {label}: {sorted(values)}")
    return next(iter(values))

def load_rows(path: Path) -> tuple[list[Row], str, dict[str, str]]:
    raw = path.read_bytes(); rows: list[Row] = []
    lineage_sets: dict[str, set[str]] = {key: set() for key in REQUIRED_LINEAGE_FIELDS if key not in {"query_digest","query_revision","source_record_sha256"}}
    for lineno, line in enumerate(raw.decode("utf-8").splitlines(), start=1):
        if not line.strip(): continue
        item = json.loads(line)
        for key in REQUIRED_LINEAGE_FIELDS: _require_text(item, key, lineno)
        if item["embedding_model_id"] != MODEL_ID: raise ValueError(f"line {lineno}: embedding_model_id must be {MODEL_ID}")
        if item["prompt_revision"] != PROMPT_REVISION: raise ValueError(f"line {lineno}: prompt_revision mismatch")
        if item["embedding_source_representation_id"] != SOURCE_REPRESENTATION: raise ValueError(f"line {lineno}: source representation mismatch")
        if item["embedding_representation_id"] != ROUTER_REPRESENTATION: raise ValueError(f"line {lineno}: router representation mismatch")
        if item["projection_revision"] != PROJECTION_REVISION: raise ValueError(f"line {lineno}: projection_revision mismatch")
        if item["feature_revision"] != QUERY_FEATURE_REVISION: raise ValueError(f"line {lineno}: feature_revision mismatch")
        if item["tensor_revision"] != FEATURE_CONTRACT_REVISION: raise ValueError(f"line {lineno}: tensor_revision mismatch")
        if item["budget_normalization_revision"] != BUDGET_NORMALIZATION_REVISION: raise ValueError(f"line {lineno}: budget normalization revision mismatch")
        for key in lineage_sets: lineage_sets[key].add(str(item[key]))
        emb = np.asarray(item["embedding_mrl_128"], dtype=np.float32); qf = np.asarray(item["query_features"], dtype=np.float32)
        needs = np.asarray(item["retrieval_needs"], dtype=np.float32); budget = np.asarray(item["budget_targets"], dtype=np.float32)
        if emb.shape != (EMBED_DIM,): raise ValueError(f"line {lineno}: embedding_mrl_128 must be 128d")
        if qf.shape != (QUERY_FEATURE_DIM,): raise ValueError(f"line {lineno}: query_features must be 26d")
        if needs.shape != (RETRIEVAL_NEED_DIM,) or np.any(needs < 0) or np.any(needs > 1): raise ValueError(f"line {lineno}: retrieval_needs invalid")
        if budget.shape != (BUDGET_DIM,) or np.any(budget < 0) or np.any(budget > 1): raise ValueError(f"line {lineno}: budget_targets invalid")
        if not np.isfinite(emb).all() or not np.isfinite(qf).all(): raise ValueError(f"line {lineno}: non-finite features")
        if abs(float(np.linalg.norm(emb)) - 1.0) > 1e-4: raise ValueError(f"line {lineno}: embedding_mrl_128 must be L2 normalized")
        domain_label = str(item["domain_label"]); operation_label = str(item["operation_label"])
        if domain_label not in DOMAINS: raise ValueError(f"line {lineno}: unknown domain_label {domain_label}")
        if operation_label not in OPERATIONS: raise ValueError(f"line {lineno}: unknown operation_label {operation_label}")
        rows.append(Row(str(item["query_id"]), np.concatenate([emb,qf]).astype(np.float32, copy=False), DOMAINS.index(domain_label), OPERATIONS.index(operation_label), needs, budget))
    if len(rows) < 20: raise ValueError("at least 20 training rows are required")
    lineage = {key: _only_one(values, key) for key, values in lineage_sets.items()}
    return rows, sha256_bytes(raw), lineage

def set_seed(seed: int):
    random.seed(seed); np.random.seed(seed); torch.manual_seed(seed)
    if torch.cuda.is_available(): torch.cuda.manual_seed_all(seed)

def evaluate(model: QueryRouterMLPV1, loader: DataLoader, device: torch.device) -> dict[str,float]:
    model.eval(); totals = {"domain_correct":0,"operation_correct":0,"count":0,"needs_bce":0.0,"budget_mse":0.0}
    bce = nn.BCEWithLogitsLoss(reduction="sum"); mse = nn.MSELoss(reduction="sum")
    with torch.no_grad():
        for x,domain,operation,needs,budget in loader:
            x,domain,operation,needs,budget = [v.to(device) for v in (x,domain,operation,needs,budget)]
            dlog,olog,nlog,blog = model(x)
            totals["domain_correct"] += int((dlog.argmax(-1)==domain).sum().item()); totals["operation_correct"] += int((olog.argmax(-1)==operation).sum().item())
            totals["count"] += int(x.shape[0]); totals["needs_bce"] += float(bce(nlog,needs).item()); totals["budget_mse"] += float(mse(torch.sigmoid(blog),budget).item())
    count=max(1,totals["count"])
    return {"domain_accuracy":totals["domain_correct"]/count,"operation_accuracy":totals["operation_correct"]/count,"retrieval_needs_bce_per_row":totals["needs_bce"]/count,"budget_mse_per_row":totals["budget_mse"]/count}

def main() -> int:
    parser=argparse.ArgumentParser(); parser.add_argument("--dataset",type=Path,required=True); parser.add_argument("--output-dir",type=Path,default=Path("classifier-models/query-router-v1"))
    parser.add_argument("--epochs",type=int,default=40); parser.add_argument("--batch-size",type=int,default=64); parser.add_argument("--lr",type=float,default=3e-4); parser.add_argument("--weight-decay",type=float,default=1e-2)
    parser.add_argument("--seed",type=int,default=42); parser.add_argument("--device",choices=["auto","cpu","cuda"],default="auto"); parser.add_argument("--export-onnx",action="store_true"); args=parser.parse_args()
    set_seed(args.seed); rows,dataset_checksum,lineage=load_rows(args.dataset); dataset=RouterDataset(rows)
    val_count=max(4,int(round(len(dataset)*0.2))); train_count=len(dataset)-val_count; generator=torch.Generator().manual_seed(args.seed)
    train_ds,val_ds=random_split(dataset,[train_count,val_count],generator=generator); train_loader=DataLoader(train_ds,batch_size=args.batch_size,shuffle=True,generator=generator); val_loader=DataLoader(val_ds,batch_size=args.batch_size,shuffle=False)
    if args.device=="cuda" and not torch.cuda.is_available(): raise RuntimeError("CUDA requested but unavailable")
    device=torch.device("cuda" if (args.device=="cuda" or (args.device=="auto" and torch.cuda.is_available())) else "cpu")
    model=QueryRouterMLPV1().to(device); optimizer=torch.optim.AdamW(model.parameters(),lr=args.lr,weight_decay=args.weight_decay)
    domain_loss=nn.CrossEntropyLoss(); operation_loss=nn.CrossEntropyLoss(); needs_loss=nn.BCEWithLogitsLoss(); budget_loss=nn.MSELoss(); best_state=None; best_score=-math.inf; history=[]
    for epoch in range(1,args.epochs+1):
        model.train(); loss_sum=0.0; rows_seen=0
        for x,domain,operation,needs,budget in train_loader:
            x,domain,operation,needs,budget=[v.to(device) for v in (x,domain,operation,needs,budget)]; optimizer.zero_grad(set_to_none=True); dlog,olog,nlog,blog=model(x)
            loss=domain_loss(dlog,domain)+operation_loss(olog,operation)+0.75*needs_loss(nlog,needs)+0.25*budget_loss(torch.sigmoid(blog),budget); loss.backward(); torch.nn.utils.clip_grad_norm_(model.parameters(),1.0); optimizer.step()
            loss_sum += float(loss.item())*x.shape[0]; rows_seen += int(x.shape[0])
        metrics=evaluate(model,val_loader,device); score=metrics["domain_accuracy"]+metrics["operation_accuracy"]-0.1*metrics["retrieval_needs_bce_per_row"]
        history.append({"epoch":epoch,"train_loss":loss_sum/max(1,rows_seen),**metrics})
        if score>best_score: best_score=score; best_state={k:v.detach().cpu().clone() for k,v in model.state_dict().items()}
    if best_state is None: raise RuntimeError("training produced no checkpoint")
    model.load_state_dict(best_state); model.to("cpu").eval(); final_metrics=evaluate(model,val_loader,torch.device("cpu")); args.output_dir.mkdir(parents=True,exist_ok=True)
    checkpoint_path=args.output_dir/"query-router-v1.pt"; torch.save({"state_dict":model.state_dict(),"domains":DOMAINS,"operations":OPERATIONS,"lineage":lineage},checkpoint_path); checkpoint_digest=sha256_bytes(checkpoint_path.read_bytes())
    manifest={"schema":"atlas.query-router-training-receipt.v1","modelArchitectureRevision":MODEL_ARCH_REVISION,"featureContractRevision":FEATURE_CONTRACT_REVISION,"embeddingModelId":MODEL_ID,"embeddingModelRevision":lineage["embedding_model_revision"],"embeddingPromptRevision":lineage["prompt_revision"],"embeddingRepresentationId":ROUTER_REPRESENTATION,"embeddingSourceRepresentationId":SOURCE_REPRESENTATION,"projectionRevision":lineage["projection_revision"],"queryFeatureRevision":lineage["feature_revision"],"budgetNormalizationRevision":lineage["budget_normalization_revision"],"labelRevision":lineage["label_revision"],"inputDimension":INPUT_DIM,"embeddingDimension":EMBED_DIM,"queryFeatureDimension":QUERY_FEATURE_DIM,"datasetPath":str(args.dataset),"datasetChecksum":dataset_checksum,"rowCount":len(rows),"trainCount":train_count,"validationCount":val_count,"seed":args.seed,"optimizer":"AdamW","epochs":args.epochs,"batchSize":args.batch_size,"learningRate":args.lr,"weightDecay":args.weight_decay,"trainingDevice":str(device),"domains":DOMAINS,"operations":OPERATIONS,"metrics":final_metrics,"checkpoint":str(checkpoint_path),"checkpointSha256":checkpoint_digest,"lineageValidated":True,"evidenceAuthority":False,"canonicalOwnerChanged":False}
    if args.export_onnx:
        onnx_path=args.output_dir/"query-router-v1.onnx"; sample=torch.zeros((1,INPUT_DIM),dtype=torch.float32); program=torch.onnx.export(OnnxWrapper(model),(sample,),dynamo=True,input_names=["features"],output_names=["domain_probabilities","operation_probabilities","retrieval_needs","budget"],dynamic_shapes=({0:torch.export.Dim("batch")},)); program.save(str(onnx_path)); manifest["onnx"]={"path":str(onnx_path),"sha256":sha256_bytes(onnx_path.read_bytes()),"exporter":"torch.onnx.export(dynamo=True)"}
    (args.output_dir/"training-receipt.json").write_text(json.dumps(manifest,indent=2)+"\n",encoding="utf-8"); (args.output_dir/"history.json").write_text(json.dumps(history,indent=2)+"\n",encoding="utf-8"); print(json.dumps(manifest,indent=2)); return 0

if __name__ == "__main__": raise SystemExit(main())
