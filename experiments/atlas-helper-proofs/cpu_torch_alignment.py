"""Lazy-import CPU PyTorch/ATen parity and small multi-head classifier. No GPU allocation."""
def torch_feature_matrix(rows, expected_width=25):
    import torch
    if not rows or any(len(row) != expected_width for row in rows):
        raise ValueError("INVALID_MATRIX_WIDTH")
    x = torch.tensor(rows, dtype=torch.float32, device="cpu")
    if not bool(torch.isfinite(x).all()):
        raise ValueError("NONFINITE_FEATURE")
    return x

def kmeans_cpu(rows, k, iterations=20):
    """Deterministic Lloyd k-means using CPU ATen ops; no cluster-as-identity."""
    import torch
    x = torch_feature_matrix(rows, len(rows[0]))
    if not 1 <= k <= len(rows) or not 1 <= iterations <= 100:
        raise ValueError("INVALID_KMEANS_ARGUMENT")
    centers = x[:k].clone()
    for _ in range(iterations):
        d = torch.cdist(x, centers, p=2)
        labels = d.argmin(dim=1)
        next_centers = torch.stack([x[labels == j].mean(dim=0) if bool((labels == j).any())
                                    else centers[j] for j in range(k)])
        if torch.equal(centers,next_centers):
            break
        centers = next_centers
    return {"labels":labels.tolist(),"centers":centers.tolist(),
            "status":"FIXTURE_ONLY","canonical_authority":False}

def train_classifier_cpu(rows, labels, epochs=20, lr=0.01):
    import torch
    from torch import nn
    torch.manual_seed(7)
    x = torch_feature_matrix(rows)
    if len(labels) != len(rows) or not all(type(y) is int and y in (0,1) for y in labels):
        raise ValueError("INVALID_LABELS")
    if not 1 <= epochs <= 100 or not 0 < lr <= 1:
        raise ValueError("INVALID_OPTIMIZER_ARGUMENT")
    y = torch.tensor(labels, dtype=torch.long, device="cpu")
    model = nn.Sequential(nn.Linear(25,16),nn.SiLU(),nn.Linear(16,2))
    optimizer = torch.optim.AdamW(model.parameters(),lr=lr)
    loss_fn = nn.CrossEntropyLoss()
    losses=[]
    for _ in range(epochs):
        optimizer.zero_grad(set_to_none=True)
        loss = loss_fn(model(x),y)
        loss.backward()
        optimizer.step()
        losses.append(float(loss.detach()))
    return {"initial_loss":losses[0],"final_loss":losses[-1],
            "model":model,"status":"FIXTURE_ONLY"}
