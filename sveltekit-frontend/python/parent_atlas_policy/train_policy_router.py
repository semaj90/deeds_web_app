"""Offline linear policy-head trainer.

Input JSONL rows:
{"features": [30 floats], "action": "GRAPH_TRACE", "model": "NO_LLM", "budget": "MEDIUM"}

This is an experiment/training utility. Runtime inference remains TypeScript and consumes the
exported weight JSON. Do not train from unverified model guesses; use RouteTrace/compile/test labels.
"""
from __future__ import annotations
import argparse, json
from pathlib import Path
import torch
from torch import nn
from feature_schema import POLICY_FEATURES, ACTIONS, MODELS, BUDGETS

class PolicyHeads(nn.Module):
    def __init__(self, n_features: int):
        super().__init__()
        self.action = nn.Linear(n_features, len(ACTIONS))
        self.model = nn.Linear(n_features, len(MODELS))
        self.budget = nn.Linear(n_features, len(BUDGETS))

    def forward(self, x):
        return self.action(x), self.model(x), self.budget(x)

def load_rows(path: Path):
    rows = [json.loads(line) for line in path.read_text(encoding='utf-8').splitlines() if line.strip()]
    x = torch.tensor([row['features'] for row in rows], dtype=torch.float32)
    if x.shape[1] != len(POLICY_FEATURES):
        raise ValueError(f'expected {len(POLICY_FEATURES)} features, got {x.shape[1]}')
    y_action = torch.tensor([ACTIONS.index(row['action']) for row in rows])
    y_model = torch.tensor([MODELS.index(row['model']) for row in rows])
    y_budget = torch.tensor([BUDGETS.index(row['budget']) for row in rows])
    return x, y_action, y_model, y_budget

def matrix_by_label(layer: nn.Linear, labels):
    weight = layer.weight.detach().cpu().tolist()
    bias = layer.bias.detach().cpu().tolist()
    return ({label: weight[i] for i, label in enumerate(labels)}, {label: bias[i] for i, label in enumerate(labels)})

def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('dataset', type=Path)
    ap.add_argument('--output', type=Path, default=Path('policy-router-weights.json'))
    ap.add_argument('--epochs', type=int, default=300)
    ap.add_argument('--lr', type=float, default=1e-2)
    args = ap.parse_args()

    x, ya, ym, yb = load_rows(args.dataset)
    model = PolicyHeads(x.shape[1])
    optimizer = torch.optim.AdamW(model.parameters(), lr=args.lr, weight_decay=1e-4)
    loss_fn = nn.CrossEntropyLoss()
    for _ in range(args.epochs):
        optimizer.zero_grad()
        a, m, b = model(x)
        loss = loss_fn(a, ya) + loss_fn(m, ym) + loss_fn(b, yb)
        loss.backward()
        optimizer.step()

    aw, ab = matrix_by_label(model.action, ACTIONS)
    mw, mb = matrix_by_label(model.model, MODELS)
    bw, bb = matrix_by_label(model.budget, BUDGETS)
    payload = {
        'revision': 'parent-atlas.policy-router.trained.v1',
        'featureCount': len(POLICY_FEATURES),
        'featureNames': POLICY_FEATURES,
        'actionWeights': aw, 'actionBias': ab,
        'modelWeights': mw, 'modelBias': mb,
        'budgetWeights': bw, 'budgetBias': bb,
    }
    args.output.write_text(json.dumps(payload, indent=2), encoding='utf-8')

if __name__ == '__main__':
    main()
