#!/usr/bin/env python3
"""Train a tiny deterministic shadow preference head from feedback tensors.

Not an RL policy and not a promotion authority. The output is usable only as a
challenger feature after an evaluation receipt exists.
"""
from __future__ import annotations
import hashlib, json, random, sys
from pathlib import Path

input_path=Path(sys.argv[1] if len(sys.argv)>1 else 'docs/reports/atlas-agent-feedback-tensors-v1.pt')
model_path=Path(sys.argv[2] if len(sys.argv)>2 else 'docs/reports/atlas-shadow-preference-head-v1.pt')
receipt_path=Path(sys.argv[3] if len(sys.argv)>3 else 'docs/reports/atlas-shadow-preference-eval-v1.json')
seed=int(sys.argv[4]) if len(sys.argv)>4 else 1337
try:
    import torch
except Exception as exc:
    raise SystemExit(f'PYTORCH_UNAVAILABLE: {exc}')

torch.manual_seed(seed); random.seed(seed)
data=torch.load(input_path,map_location='cpu',weights_only=False)
X=data['features']; y=data['labels']
if len(X)<20:
    raise SystemExit(f'INSUFFICIENT_FEEDBACK_ROWS: need >=20, got {len(X)}')
idx=torch.randperm(len(X),generator=torch.Generator().manual_seed(seed))
split=max(1,int(len(X)*0.8)); train_idx=idx[:split]; test_idx=idx[split:]
if len(test_idx)==0: test_idx=train_idx[-1:]
model=torch.nn.Linear(X.shape[1],2)
opt=torch.optim.AdamW(model.parameters(),lr=1e-2,weight_decay=1e-3)
for _ in range(150):
    opt.zero_grad(); loss=torch.nn.functional.cross_entropy(model(X[train_idx]),y[train_idx]); loss.backward(); opt.step()
with torch.no_grad():
    pred=model(X[test_idx]).argmax(dim=1); acc=float((pred==y[test_idx]).float().mean().item())
model_path.parent.mkdir(parents=True,exist_ok=True)
torch.save({'schema':'atlas.shadow-preference-head.v1','stateDict':model.state_dict(),'featureDim':X.shape[1],'seed':seed,'authority':'SHADOW_ONLY'},model_path)
receipt={'schema':'atlas.shadow-preference-eval.v1','rows':int(len(X)),'trainRows':int(len(train_idx)),'evalRows':int(len(test_idx)),'accuracy':acc,'seed':seed,'model':str(model_path),'authority':'SHADOW_ONLY','promotionAuthorized':False,'writesPerformed':False}
receipt['semanticChecksum']=hashlib.sha256(json.dumps(receipt,sort_keys=True,separators=(',',':')).encode()).hexdigest()
receipt_path.write_text(json.dumps(receipt,indent=2)+'\n',encoding='utf-8')
print(json.dumps(receipt,indent=2))
