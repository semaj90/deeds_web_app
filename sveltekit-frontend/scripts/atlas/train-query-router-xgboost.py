#!/usr/bin/env python3
"""Train an XGBoost baseline on the same frozen Parent Atlas router tensor."""
from __future__ import annotations
import argparse, hashlib, json, pickle
from pathlib import Path
from typing import Any
import numpy as np
import xgboost as xgb
from sklearn.metrics import accuracy_score, f1_score, mean_squared_error, roc_auc_score

DOMAINS=["code","database","retrieval","graph","api","security","documentation","workflow","testing","unknown"]
OPERATIONS=["find","explain","debug","modify","compare","trace","test","synthesize"]
EMBED_DIM=128; QUERY_FEATURE_DIM=26; INPUT_DIM=154; NEED_DIM=8; BUDGET_DIM=3
MODEL_REVISION="atlas.query-router-xgboost.v1"; FEATURE_CONTRACT_REVISION="atlas.query-router-tensor.v1"

def sha256_bytes(data:bytes)->str:return hashlib.sha256(data).hexdigest()
def split_name(query_id:str)->str:
    bucket=int(hashlib.sha256(query_id.encode()).hexdigest()[:8],16)%100
    return "train" if bucket<80 else "validation" if bucket<90 else "test"

def load_dataset(path:Path):
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
        rows.append({"query_id":str(item["query_id"]),"x":np.concatenate([emb,qf]).astype(np.float32,copy=False),"domain":DOMAINS.index(domain),"operation":OPERATIONS.index(operation),"needs":needs,"budget":budget})
    if len(rows)<30: raise ValueError("at least 30 rows are required")
    return rows,sha256_bytes(raw)

def matrix(rows,split):
    selected=[r for r in rows if split_name(r["query_id"])==split]
    if not selected: raise ValueError(f"stable split {split!r} is empty")
    return np.stack([r["x"] for r in selected]),np.asarray([r["domain"] for r in selected]),np.asarray([r["operation"] for r in selected]),np.stack([r["needs"] for r in selected]),np.stack([r["budget"] for r in selected]),[r["query_id"] for r in selected]

def multiclass(num_class,seed): return xgb.XGBClassifier(objective="multi:softprob",num_class=num_class,n_estimators=300,max_depth=5,learning_rate=.05,subsample=.9,colsample_bytree=.9,tree_method="hist",eval_metric="mlogloss",random_state=seed)
def binary(seed): return xgb.XGBClassifier(objective="binary:logistic",n_estimators=250,max_depth=4,learning_rate=.05,subsample=.9,colsample_bytree=.9,tree_method="hist",eval_metric="logloss",random_state=seed)
def regression(seed): return xgb.XGBRegressor(objective="reg:squarederror",n_estimators=250,max_depth=4,learning_rate=.05,subsample=.9,colsample_bytree=.9,tree_method="hist",eval_metric="rmse",random_state=seed)
def safe_auc(y,p): return None if len(np.unique(y))<2 else float(roc_auc_score(y,p))

def evaluate(models,split_data):
    X,domain,operation,needs,budget,ids=split_data
    dp=models["domain"].predict_proba(X); op=models["operation"].predict_proba(X); npb=np.stack([m.predict_proba(X)[:,1] for m in models["needs"]],axis=1); bp=np.stack([np.clip(m.predict(X),0,1) for m in models["budget"]],axis=1)
    f1s=[]; aucs=[]
    for i in range(8):
        truth=(needs[:,i]>=.5).astype(np.int64); pred=(npb[:,i]>=.5).astype(np.int64); f1s.append(float(f1_score(truth,pred,zero_division=0))); aucs.append(safe_auc(truth,npb[:,i]))
    predictions=[{"query_id":qid,"domain_probabilities":dp[i].tolist(),"operation_probabilities":op[i].tolist(),"retrieval_need_probabilities":npb[i].tolist(),"budget_predictions":bp[i].tolist()} for i,qid in enumerate(ids)]
    return {"domain_accuracy":float(accuracy_score(domain,dp.argmax(1))),"domain_macro_f1":float(f1_score(domain,dp.argmax(1),average="macro",zero_division=0)),"operation_accuracy":float(accuracy_score(operation,op.argmax(1))),"operation_macro_f1":float(f1_score(operation,op.argmax(1),average="macro",zero_division=0)),"retrieval_need_macro_f1":float(np.mean(f1s)),"retrieval_need_f1_by_index":f1s,"retrieval_need_auc_by_index":aucs,"budget_mse":float(mean_squared_error(budget,bp)),"row_count":int(X.shape[0]),"predictions":predictions}

def main():
    p=argparse.ArgumentParser(); p.add_argument("--dataset",type=Path,required=True); p.add_argument("--output-dir",type=Path,default=Path("classifier-models/query-router-xgboost-v1")); p.add_argument("--seed",type=int,default=42); a=p.parse_args()
    rows,checksum=load_dataset(a.dataset); train=matrix(rows,"train"); val=matrix(rows,"validation"); test=matrix(rows,"test"); X,d,o,n,b,_=train
    dm=multiclass(len(DOMAINS),a.seed); dm.fit(X,d); om=multiclass(len(OPERATIONS),a.seed+1); om.fit(X,o)
    needs=[]
    for i in range(8):
        labels=n[:,i]
        if len(np.unique((labels>=.5).astype(np.int64)))<2: raise ValueError(f"retrieval need {i} has one thresholded class in train split")
        m=binary(a.seed+10+i); m.fit(X,labels); needs.append(m)
    budgets=[]
    for i in range(3): m=regression(a.seed+30+i); m.fit(X,b[:,i]); budgets.append(m)
    models={"domain":dm,"operation":om,"needs":needs,"budget":budgets}; vm=evaluate(models,val); tm=evaluate(models,test)
    a.output_dir.mkdir(parents=True,exist_ok=True); model_path=a.output_dir/"query-router-xgboost-v1.pkl"
    with model_path.open("wb") as f: pickle.dump(models,f)
    pred_path=a.output_dir/"test-predictions.jsonl"; pred_path.write_text("\n".join(json.dumps(r,sort_keys=True) for r in tm.pop("predictions"))+"\n"); vm.pop("predictions")
    receipt={"schema":"atlas.query-router-xgboost-training-receipt.v1","modelRevision":MODEL_REVISION,"featureContractRevision":FEATURE_CONTRACT_REVISION,"embeddingModelId":"google/embeddinggemma-300m","embeddingRepresentationId":"classification_mrl_128","inputDimension":INPUT_DIM,"objectiveDomain":"multi:softprob","objectiveOperation":"multi:softprob","objectiveRetrievalNeeds":"binary:logistic","objectiveBudget":"reg:squarederror","datasetPath":str(a.dataset),"datasetSha256":checksum,"stableSplit":"sha256(query_id) bucket 80/10/10","splitCounts":{"train":len(train[-1]),"validation":len(val[-1]),"test":len(test[-1])},"validation":vm,"test":tm,"modelPath":str(model_path),"modelSha256":sha256_bytes(model_path.read_bytes()),"testPredictionsPath":str(pred_path),"evidenceAuthority":False,"canonicalWritesPerformed":False}
    (a.output_dir/"training-receipt.json").write_text(json.dumps(receipt,indent=2,sort_keys=True)+"\n"); print(json.dumps(receipt,indent=2,sort_keys=True)); return 0
if __name__=="__main__": raise SystemExit(main())
