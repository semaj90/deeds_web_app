#!/usr/bin/env python3
"""Convert revision-qualified human feedback JSONL to deterministic PyTorch tensors.

This helper is deliberately model-agnostic and SHADOW_ONLY. It hashes stable
categorical/evidence fields into a fixed feature space and never mutates Atlas.
"""
from __future__ import annotations
import hashlib, json, math, sys
from pathlib import Path

input_path=Path(sys.argv[1] if len(sys.argv)>1 else 'docs/reports/atlas-agent-feedback-dataset-v1.jsonl')
output_path=Path(sys.argv[2] if len(sys.argv)>2 else 'docs/reports/atlas-agent-feedback-tensors-v1.pt')
receipt_path=Path(sys.argv[3] if len(sys.argv)>3 else 'docs/reports/atlas-agent-feedback-tensors-receipt-v1.json')
dim=int(sys.argv[4]) if len(sys.argv)>4 else 256
try:
    import torch
except Exception as exc:
    raise SystemExit(f'PYTORCH_UNAVAILABLE: {exc}')

rows=[]
if input_path.exists():
    for line in input_path.read_text(encoding='utf-8').splitlines():
        if line.strip(): rows.append(json.loads(line))

def bucket(token):
    h=hashlib.sha256(token.encode()).digest()
    return int.from_bytes(h[:8],'big')%dim

def features(row):
    x=[0.0]*dim
    fields=[]
    for key in ['decision','actorRole','reasonCode','taskId','candidateA','candidateB','selectedCandidate']:
        v=row.get(key)
        if v: fields.append(f'{key}:{v}')
    rev=row.get('revision') or {}
    for key in ['workspace','source','graph','model']:
        v=rev.get(key)
        if v: fields.append(f'rev:{key}:{v}')
    for ref in row.get('evidenceRefs') or []: fields.append(f'evidence:{ref}')
    for token in fields:
        x[bucket(token)] += 1.0
    norm=math.sqrt(sum(v*v for v in x)) or 1.0
    return [v/norm for v in x]

label_map={'REJECT':0,'PREFER_B':0,'APPROVE':1,'PREFER_A':1,'CORRECT':1}
X=[]; y=[]; rewards=[]; ids=[]
for row in rows:
    decision=str(row.get('decision') or '')
    if decision not in label_map: continue
    X.append(features(row)); y.append(label_map[decision]); ids.append(str(row.get('taskId') or ''))
    reward=row.get('reward'); rewards.append(float(reward) if isinstance(reward,(int,float)) and math.isfinite(float(reward)) else float(label_map[decision]))

tensors={
    'schema':'atlas.agent-feedback-tensors.v1',
    'features':torch.tensor(X,dtype=torch.float32) if X else torch.empty((0,dim),dtype=torch.float32),
    'labels':torch.tensor(y,dtype=torch.long),
    'rewards':torch.tensor(rewards,dtype=torch.float32),
    'taskIds':ids,
    'featureDim':dim,
    'authority':'SHADOW_ONLY'
}
output_path.parent.mkdir(parents=True,exist_ok=True)
torch.save(tensors,output_path)
receipt={'schema':'atlas.agent-feedback-tensors-receipt.v1','rows':len(X),'featureDim':dim,'output':str(output_path),'authority':'SHADOW_ONLY','writesPerformed':False}
receipt['semanticChecksum']=hashlib.sha256(json.dumps(receipt,sort_keys=True,separators=(',',':')).encode()).hexdigest()
receipt_path.write_text(json.dumps(receipt,indent=2)+'\n',encoding='utf-8')
print(json.dumps(receipt,indent=2))
