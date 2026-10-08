"""CPU-only shadow baselines over frozen aligned candidate rows.

Reuse canonical ranking-alignment-v1; never auto-promote model checkpoints.
Imports optional sklearn/torch only inside the corresponding trainer.
"""
from __future__ import annotations
from .ranking_alignment_v1 import FEATURES

def to_matrices(rows):
    import numpy as np
    if not rows:
        raise ValueError("RANK_NO_ROWS")
    x = np.asarray([r.values + tuple(float(v) for v in r.missing) for r in rows], dtype=np.float32)
    y = np.asarray([r.label for r in rows], dtype=np.float32)
    return x, y

def fit_logistic(train):
    """Binary relevance baseline. Requires actual 0/1 labels."""
    from sklearn.linear_model import LogisticRegression
    from sklearn.pipeline import make_pipeline
    from sklearn.preprocessing import StandardScaler
    x, y = to_matrices(train)
    if not set(y.tolist()).issubset({0., 1.}) or len(set(y.tolist())) < 2:
        raise ValueError("RANK_LOGISTIC_BINARY_LABELS_REQUIRED")
    return make_pipeline(StandardScaler(), LogisticRegression(max_iter=500, random_state=42)).fit(x, y)

def fit_mlp_cpu(train, *, epochs=25, seed=42):
    """Tiny MLP CPU-only challenger; train-only normalization."""
    import numpy as np
    import torch
    x, y = to_matrices(train)
    if epochs < 1:
        raise ValueError("RANK_EPOCHS_INVALID")
    torch.manual_seed(seed)
    mean = x.mean(axis=0)
    std = x.std(axis=0)
    std = np.where(std < 1e-6, 1., std)
    x_tensor = torch.as_tensor((x - mean) / std)
    y_tensor = torch.as_tensor(y.reshape(-1, 1))
    model = torch.nn.Sequential(torch.nn.Linear(x.shape[1], 32), torch.nn.ReLU(), torch.nn.Linear(32, 1))
    opt = torch.optim.AdamW(model.parameters(), lr=1e-3)
    for _ in range(epochs):
        opt.zero_grad(set_to_none=True)
        loss = torch.nn.functional.mse_loss(model(x_tensor), y_tensor)
        loss.backward()
        opt.step()
    model.eval()
    return model, mean, std

def predict_mlp_cpu(fitted, rows):
    import numpy as np
    import torch
    model, mean, std = fitted
    x, _ = to_matrices(rows)
    with torch.no_grad():
        return model(torch.as_tensor((x-mean)/std)).flatten().numpy().tolist()
