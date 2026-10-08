"""Small deterministic manual-backprop multihead MLP CPU teaching/reference fixture.
Uses a shared tanh layer, one sigmoid binary classification head, and one regression head.
Not a QLoRA trainer and not an admitted Parent Atlas model.
"""
from __future__ import annotations
import math, random
from typing import Mapping
from cpu_helpers import dense_features

class MultiHeadMLP:
    def __init__(self, registry: Mapping[str, int], hidden: int=4, seed: int=13):
        if hidden < 1 or not registry: raise ValueError('INVALID_SHAPE')
        self.registry = dict(registry)
        dense_features({}, self.registry)
        rnd = random.Random(seed)
        self.w = [[rnd.uniform(-.3,.3) for _ in registry] for _ in range(hidden)]
        self.b = [0.0] * hidden
        self.w_cls = [rnd.uniform(-.3,.3) for _ in range(hidden)]
        self.w_reg = [rnd.uniform(-.3,.3) for _ in range(hidden)]
        self.b_cls = 0.0; self.b_reg = 0.0

    def forward(self, values: Mapping[str,float]):
        x = dense_features(values, self.registry)
        h = [math.tanh(sum(a*b for a,b in zip(row,x))+bias) for row,bias in zip(self.w,self.b)]
        z = sum(a*b for a,b in zip(self.w_cls,h))+self.b_cls
        p = 1/(1+math.exp(-z)) if z>=0 else math.exp(z)/(1+math.exp(z))
        y = sum(a*b for a,b in zip(self.w_reg,h))+self.b_reg
        return p, y, (x,h)

    def loss(self, values: Mapping[str,float], cls: int, reg: float) -> float:
        if cls not in (0,1) or not math.isfinite(reg): raise ValueError('INVALID_TARGET')
        p,y,_ = self.forward(values)
        return -(cls*math.log(max(p,1e-12))+(1-cls)*math.log(max(1-p,1e-12))) + .5*(y-reg)**2

    def train_step(self, values: Mapping[str,float], cls: int, reg: float, lr: float=.05) -> float:
        if type(cls) is not int or cls not in (0,1) or not math.isfinite(reg) or not 0 < lr <= 1:
            raise ValueError('INVALID_TRAINING_ARGUMENT')
        p,y,(x,h) = self.forward(values)
        dc = p-cls; dr = y-reg
        dh = [(dc*self.w_cls[i]+dr*self.w_reg[i])*(1-h[i]**2) for i in range(len(h))]
        for i in range(len(h)):
            self.w_cls[i] -= lr*dc*h[i]
            self.w_reg[i] -= lr*dr*h[i]
        self.b_cls -= lr*dc; self.b_reg -= lr*dr
        for i in range(len(h)):
            for j in range(len(x)):
                self.w[i][j] -= lr*dh[i]*x[j]
            self.b[i] -= lr*dh[i]
        return self.loss(values,cls,reg)
