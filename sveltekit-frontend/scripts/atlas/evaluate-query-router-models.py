#!/usr/bin/env python3
"""Compare Parent Atlas query-router predictions on an identical frozen test split."""
from __future__ import annotations
import argparse, hashlib, json
from pathlib import Path
from typing import Any
import numpy as np
from sklearn.metrics import brier_score_loss, f1_score, roc_auc_score
DOMAINS=["code","database","retrieval","graph","api","security","documentation","workflow","testing","unknown"]
OPERATIONS=["find","explain","debug","modify","compare","trace","test","synthesize"]
NEED_NAMES=["lexicalExact","sparseContextual","sparseExpansion","semantic","ast","graph","exactSymbol","mutationFreshness"]
def stable_split(q):
    b=int(hashlib.sha256(q.encode()).hexdigest()[:8],16)%100; return "train" if b<80 else "validation" if b<90 else "test"
def read_jsonl(path):
    rows=[]
    for i,line in enumerate(path.read_text().splitlines(),1):
        if not line.strip(): continue
        try: rows.append(json.loads(line))
        except json.JSONDecodeError as e: raise ValueError(f"{path}:{i}: invalid JSON: {e}") from e
    return rows
def load_truth(path):
    truth={}
    for r in read_jsonl(path):
        q=str(r["query_id"])
        if stable_split(q)!="test": continue
        if q in truth: raise ValueError(f"duplicate test query_id: {q}")
        truth[q]=r
    if not truth: raise ValueError("stable test split is empty")
    return truth
def load_predictions(path,expected):
    pred={}
    for r in read_jsonl(path):
        q=str(r["query_id"])
        if q in pred: raise ValueError(f"duplicate query_id in {path}: {q}")
        pred[q]=r
    actual=set(pred)
    if actual!=expected: raise ValueError(f"prediction/test ID mismatch for {path}; missing={sorted(expected-actual)[:10]} extra={sorted(actual-expected)[:10]}")
    return pred
def ece_binary(y,p,bins=10):
    result=0.; edges=np.linspace(0,1,bins+1)
    for i in range(bins):
        lo,hi=edges[i],edges[i+1]; mask=(p>=lo)&(p<hi if i<bins-1 else p<=hi); count=int(mask.sum())
        if count: result+=(count/len(y))*abs(float(p[mask].mean())-float(y[mask].mean()))
    return result
def multiclass_ece(labels,probs): return ece_binary((probs.argmax(1)==labels).astype(np.float32),probs.max(1))
def safe_auc(y,p): return None if len(np.unique(y))<2 else float(roc_auc_score(y,p))
def evaluate_model(truth,pred):
    ids=sorted(truth); dt=np.asarray([DOMAINS.index(str(truth[q]["domain_label"])) for q in ids]); ot=np.asarray([OPERATIONS.index(str(truth[q]["operation_label"])) for q in ids]); nt=np.asarray([truth[q]["retrieval_needs"] for q in ids],dtype=np.float32); bt=np.asarray([truth[q]["budget_targets"] for q in ids],dtype=np.float32)
    dp=np.asarray([pred[q]["domain_probabilities"] for q in ids],dtype=np.float32); op=np.asarray([pred[q]["operation_probabilities"] for q in ids],dtype=np.float32); npb=np.asarray([pred[q]["retrieval_need_probabilities"] for q in ids],dtype=np.float32); bp=np.asarray([pred[q]["budget_predictions"] for q in ids],dtype=np.float32)
    if dp.shape!=(len(ids),10) or op.shape!=(len(ids),8) or npb.shape!=(len(ids),8) or bp.shape!=(len(ids),3): raise ValueError("prediction shape mismatch")
    for name,v in [("domain",dp),("operation",op),("needs",npb),("budget",bp)]:
        if not np.isfinite(v).all(): raise ValueError(f"{name} predictions contain non-finite values")
    metrics={}
    for i,name in enumerate(NEED_NAMES):
        y=(nt[:,i]>=.5).astype(np.int64); p=np.clip(npb[:,i],0,1); metrics[name]={"f1":float(f1_score(y,(p>=.5).astype(np.int64),zero_division=0)),"auroc":safe_auc(y,p),"brier":float(brier_score_loss(y,p)),"ece":float(ece_binary(y.astype(np.float32),p))}
    return {"rowCount":len(ids),"domainMacroF1":float(f1_score(dt,dp.argmax(1),average="macro",zero_division=0)),"operationMacroF1":float(f1_score(ot,op.argmax(1),average="macro",zero_division=0)),"domainEce":float(multiclass_ece(dt,dp)),"operationEce":float(multiclass_ece(ot,op)),"retrievalNeeds":metrics,"retrievalNeedMacroF1":float(np.mean([m["f1"] for m in metrics.values()])),"retrievalNeedMeanBrier":float(np.mean([m["brier"] for m in metrics.values()])),"retrievalNeedMeanEce":float(np.mean([m["ece"] for m in metrics.values()])),"budgetMse":float(np.mean((np.clip(bp,0,1)-bt)**2))}
def main():
    p=argparse.ArgumentParser(); p.add_argument("--dataset",type=Path,required=True); p.add_argument("--prediction",action="append",required=True,help="NAME=path/to/test-predictions.jsonl"); p.add_argument("--output",type=Path,default=Path("classifier-models/query-router-evaluation.json")); a=p.parse_args(); truth=load_truth(a.dataset); expected=set(truth); results={}
    for item in a.prediction:
        if "=" not in item: raise ValueError("--prediction must be NAME=PATH")
        name,value=item.split("=",1); name=name.strip()
        if not name or name in results: raise ValueError(f"invalid/duplicate model name: {name!r}")
        results[name]=evaluate_model(truth,load_predictions(Path(value),expected))
    report={"schema":"atlas.query-router-same-corpus-evaluation.v1","dataset":str(a.dataset),"datasetSha256":hashlib.sha256(a.dataset.read_bytes()).hexdigest(),"splitRevision":"sha256-query-id-80-10-10-v1","testRowCount":len(truth),"models":results,"promotionDecision":"NOT_AUTOMATIC","evidenceAuthority":False}; a.output.parent.mkdir(parents=True,exist_ok=True); a.output.write_text(json.dumps(report,indent=2,sort_keys=True)+"\n"); print(json.dumps(report,indent=2,sort_keys=True)); return 0
if __name__=="__main__": raise SystemExit(main())
