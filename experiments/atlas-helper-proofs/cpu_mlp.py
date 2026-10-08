"""Pure-Python dictionary-input, two-head MLP with manual backprop; fixture only."""
import math
import random

class MultiHeadMLP:
    def __init__(self, registry: dict[str, int], hidden: int = 8, seed: int = 7):
        if hidden < 1 or not registry or sorted(registry.values()) != list(range(len(registry))):
            raise ValueError("INVALID_TOPOLOGY")
        self.registry = dict(registry)
        rng = random.Random(seed)
        self.w1 = [[rng.uniform(-0.2, 0.2) for _ in registry] for _ in range(hidden)]
        self.b1 = [0.0] * hidden
        self.w_class = [rng.uniform(-0.2, 0.2) for _ in range(hidden)]
        self.w_reg = [rng.uniform(-0.2, 0.2) for _ in range(hidden)]
        self.b_class = self.b_reg = 0.0

    def vector(self, features: dict[str, float]) -> list[float]:
        if set(features) - set(self.registry):
            raise ValueError("UNKNOWN_FEATURE")
        x = [0.0] * len(self.registry)
        for key, value in features.items():
            if type(value) not in (float, int) or not math.isfinite(value):
                raise ValueError("INVALID_FEATURE")
            x[self.registry[key]] = float(value)
        return x

    def forward(self, features: dict[str, float]):
        x = self.vector(features)
        h = [math.tanh(sum(w * v for w, v in zip(row, x)) + b) for row, b in zip(self.w1, self.b1)]
        z = sum(w * v for w, v in zip(self.w_class, h)) + self.b_class
        p = 1.0 / (1.0 + math.exp(-max(-60.0, min(60.0, z))))
        y = sum(w * v for w, v in zip(self.w_reg, h)) + self.b_reg
        return p, y

    def train_step(self, features: dict[str, float], label: int, target: float, lr: float = 0.01):
        if label not in (0, 1) or type(label) is bool or not math.isfinite(target) or not 0 < lr <= 1:
            raise ValueError("INVALID_TRAINING_ARGUMENT")
        x = self.vector(features)
        h = [math.tanh(sum(w * v for w, v in zip(row, x)) + b) for row, b in zip(self.w1, self.b1)]
        logit = sum(w * v for w, v in zip(self.w_class, h)) + self.b_class
        p = 1 / (1 + math.exp(-max(-60.0, min(60.0, logit))))
        y = sum(w * v for w, v in zip(self.w_reg, h)) + self.b_reg
        loss = -(label * math.log(max(p, 1e-12)) + (1-label)*math.log(max(1-p, 1e-12))) + .5*(y-target)**2
        dc, dr = p-label, y-target
        dh = [(dc*wc + dr*wr)*(1-hj*hj) for wc, wr, hj in zip(self.w_class,self.w_reg,h)]
        for j in range(len(h)):
            self.w_class[j] -= lr*dc*h[j]
            self.w_reg[j] -= lr*dr*h[j]
            for i in range(len(x)):
                self.w1[j][i] -= lr*dh[j]*x[i]
            self.b1[j] -= lr*dh[j]
        self.b_class -= lr*dc
        self.b_reg -= lr*dr
        return loss
