#!/usr/bin/env python3
"""Conservative Parent Atlas AE trainer with explicit FP32/range diagnostics.

Canonical topology:
  768 -> 128 -> 64 -> 128 -> 768

Interpolation is evaluation-only. It is never injected into the training set.
"""

from __future__ import annotations
import argparse, json, time
from pathlib import Path
import numpy as np
import torch
import torch.nn as nn
from torch.utils.data import DataLoader, TensorDataset, random_split

from ae_fp32_ranges import (
    ensure_fp32_finite, l2_normalize_fp32, range_stats,
    interpolation_path, interpolation_report,
)

INPUT_DIM=768
HIDDEN_DIM=128
LATENT_DIM=64

class Autoencoder(nn.Module):
    def __init__(self):
        super().__init__()
        self.enc1=nn.Linear(INPUT_DIM,HIDDEN_DIM,dtype=torch.float32)
        self.enc2=nn.Linear(HIDDEN_DIM,LATENT_DIM,dtype=torch.float32)
        self.dec1=nn.Linear(LATENT_DIM,HIDDEN_DIM,dtype=torch.float32)
        self.dec2=nn.Linear(HIDDEN_DIM,INPUT_DIM,dtype=torch.float32)
    def encode(self,x): return torch.tanh(self.enc2(torch.tanh(self.enc1(x))))
    def decode(self,z): return torch.tanh(self.dec2(torch.tanh(self.dec1(z))))
    def forward(self,x):
        z=self.encode(x); return self.decode(z),z

def evaluate_ranges(model, loader, device):
    xs=[]; zs=[]; rs=[]
    model.eval()
    with torch.no_grad():
        for (batch,) in loader:
            batch=batch.to(device=device,dtype=torch.float32,non_blocking=True)
            recon,z=model(batch)
            xs.append(batch.cpu().numpy()); zs.append(z.cpu().numpy()); rs.append(recon.cpu().numpy())
    return {
        'input': range_stats(np.concatenate(xs)).to_dict(),
        'latent64': range_stats(np.concatenate(zs)).to_dict(),
        'reconstruction': range_stats(np.concatenate(rs)).to_dict(),
    }

def evaluate_interpolation(model, X, device, steps=9):
    if len(X)<2: return {'skipped':'need >=2 vectors'}
    path=interpolation_path(X[0],X[1],steps=steps,spherical=True)
    with torch.no_grad():
        t=torch.from_numpy(path).to(device=device,dtype=torch.float32)
        recon,z=model(t)
    return {
        'semantic_slerp': interpolation_report(path),
        'latent64': range_stats(z.cpu().numpy()).to_dict(),
        'reconstruction': range_stats(recon.cpu().numpy()).to_dict(),
    }

def main():
    ap=argparse.ArgumentParser()
    ap.add_argument('--vectors',required=True,help='Nx768 .npy float vectors')
    ap.add_argument('--out',default='models/autoencoder-fp32')
    ap.add_argument('--epochs',type=int,default=60)
    ap.add_argument('--batch',type=int,default=256)
    ap.add_argument('--lr',type=float,default=1e-3)
    ap.add_argument('--seed',type=int,default=1337)
    ap.add_argument('--interp-steps',type=int,default=9)
    args=ap.parse_args()

    torch.manual_seed(args.seed); np.random.seed(args.seed)
    device=torch.device('cuda' if torch.cuda.is_available() else 'cpu')
    X=np.load(args.vectors)
    X=ensure_fp32_finite(X,expected_dim=INPUT_DIM)
    X=l2_normalize_fp32(X)
    input_stats=range_stats(X).to_dict()

    T=torch.from_numpy(X)
    n_val=max(1,int(len(T)*0.1)); n_train=len(T)-n_val
    g=torch.Generator().manual_seed(args.seed)
    train_ds,val_ds=random_split(TensorDataset(T),[n_train,n_val],generator=g)
    train_dl=DataLoader(train_ds,batch_size=args.batch,shuffle=True,pin_memory=device.type=='cuda')
    val_dl=DataLoader(val_ds,batch_size=args.batch,shuffle=False,pin_memory=device.type=='cuda')

    model=Autoencoder().to(device=device,dtype=torch.float32)
    opt=torch.optim.Adam(model.parameters(),lr=args.lr,weight_decay=1e-5)
    mse=nn.MSELoss()
    best=float('inf'); best_state=None; started=time.time()

    for epoch in range(1,args.epochs+1):
        model.train(); total=0.0
        for (batch,) in train_dl:
            batch=batch.to(device=device,dtype=torch.float32,non_blocking=True)
            recon,z=model(batch)
            loss=mse(recon,batch)+1e-4*z.pow(2).mean()
            opt.zero_grad(set_to_none=True); loss.backward(); opt.step()
            total+=loss.item()*len(batch)
        model.eval(); val=0.0
        with torch.no_grad():
            for (batch,) in val_dl:
                batch=batch.to(device=device,dtype=torch.float32,non_blocking=True)
                recon,_=model(batch); val+=mse(recon,batch).item()*len(batch)
        val/=n_val
        print(f'epoch={epoch} train={total/n_train:.7f} val={val:.7f}')
        if val<best:
            best=val; best_state={k:v.detach().cpu().clone() for k,v in model.state_dict().items()}

    assert best_state is not None
    model.load_state_dict({k:v.to(device) for k,v in best_state.items()})
    out=Path(args.out); out.mkdir(parents=True,exist_ok=True)
    torch.save(best_state,out/'ae_fp32_state.pt')
    metrics={
        'contract':'semantic_768->latent_128->latent_64->latent_128->semantic_768',
        'dtype':'float32', 'device':str(device), 'seed':args.seed,
        'best_val_loss':best, 'elapsed_s':time.time()-started,
        'input_range':input_stats,
        'eval_ranges':evaluate_ranges(model,val_dl,device),
        'interpolation_eval_only':evaluate_interpolation(model,X,device,args.interp_steps),
        'interpolation_used_for_training':False,
    }
    (out/'ae_fp32_metrics.json').write_text(json.dumps(metrics,indent=2))
    print(json.dumps(metrics,indent=2))

if __name__=='__main__': main()
