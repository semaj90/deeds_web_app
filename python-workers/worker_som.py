#!/usr/bin/env python3
"""
Self-Organizing Map (SOM) GPU Worker

Reads JSON from stdin, trains SOM on GPU using PyTorch,
writes results to stdout. Used by topology enrichment pipeline.

Protocol:
  INPUT (stdin):  {"vectors": [[...], ...], "grid_size": 20, "learning_rate": 0.5, "epochs": 50, "random_seed": 42}
  OUTPUT (stdout): {"som_indices": [...], "bmu_grid_x": [...], "bmu_grid_y": [...], "convergence": 0.92, "epochs_trained": 45}
  ERROR (stderr):  {"error": "message"}
"""

import sys
import json
import torch
import numpy as np
from typing import Dict, List, Tuple, Any
import math

def euclidean_distance(x: torch.Tensor, y: torch.Tensor) -> torch.Tensor:
    """Compute Euclidean distance between tensors."""
    return torch.sqrt(torch.sum((x - y) ** 2, dim=-1))

def som_train_gpu(
    vectors: np.ndarray,
    grid_size: int = 20,
    learning_rate: float = 0.5,
    epochs: int = 50,
    random_seed: int = 42
) -> Dict[str, Any]:
    """
    Train Self-Organizing Map on GPU.

    Args:
        vectors: (n, d) array of embeddings
        grid_size: SOM grid dimension (grid_size x grid_size)
        learning_rate: initial learning rate
        epochs: number of training epochs
        random_seed: reproducible seeding

    Returns:
        {
          "som_indices": [int, ...],       # n-length SOM cell indices (0 to grid_size^2-1)
          "bmu_grid_x": [int, ...],        # n-length x coordinates (0 to grid_size-1)
          "bmu_grid_y": [int, ...],        # n-length y coordinates (0 to grid_size-1)
          "convergence": float,            # final average distance (0-1 normalized)
          "epochs_trained": int            # actual epochs trained
        }
    """
    torch.manual_seed(random_seed)
    np.random.seed(random_seed)

    n, d = vectors.shape
    device = 'cuda:0' if torch.cuda.is_available() else 'cpu'

    # Move to GPU
    x_gpu = torch.tensor(vectors, dtype=torch.float32, device=device)

    # Initialize SOM weights (grid_size × grid_size × d)
    total_nodes = grid_size * grid_size
    weights = torch.randn(total_nodes, d, dtype=torch.float32, device=device)

    # Normalize weights
    weights = weights / torch.norm(weights, dim=1, keepdim=True)

    # Pre-compute grid positions
    grid_positions = []
    for i in range(grid_size):
        for j in range(grid_size):
            grid_positions.append((i, j))
    grid_positions_tensor = torch.tensor(
        grid_positions, dtype=torch.float32, device=device
    )

    bmu_indices = torch.zeros(n, dtype=torch.long, device=device)
    convergence_history = []

    for epoch in range(epochs):
        # Decay learning rate and neighborhood radius
        lr = learning_rate * (1 - epoch / epochs)
        sigma = math.sqrt(grid_size) * (1 - epoch / epochs)

        # Shuffled order
        order = np.random.permutation(n)

        for idx in order:
            x = x_gpu[idx]

            # Find best matching unit (BMU)
            distances = torch.norm(weights - x, dim=1)
            bmu_idx = torch.argmin(distances).item()
            bmu_grid_pos = grid_positions_tensor[bmu_idx]

            # Update weights (gaussian neighborhood)
            grid_distances = torch.norm(
                grid_positions_tensor - bmu_grid_pos.unsqueeze(0), dim=1
            )
            h = torch.exp(-(grid_distances ** 2) / (2 * sigma ** 2))

            # Update rule
            delta = (x - weights) * h.unsqueeze(1) * lr
            weights = weights + delta

            # Renormalize
            weights = weights / (torch.norm(weights, dim=1, keepdim=True) + 1e-8)

        # Compute convergence metric
        bmu_indices_epoch = torch.argmin(
            torch.norm(weights.unsqueeze(0) - x_gpu.unsqueeze(1), dim=2),
            dim=1
        )

        avg_distance = torch.norm(
            x_gpu - weights[bmu_indices_epoch], dim=1
        ).mean().item()

        # Normalize to [0, 1]
        convergence = max(0.0, min(1.0, 1.0 - avg_distance / math.sqrt(d)))
        convergence_history.append(convergence)

        # Early stopping if converged
        if len(convergence_history) > 1:
            if abs(convergence_history[-1] - convergence_history[-2]) < 1e-4:
                break

    # Final BMU assignment
    bmu_indices = torch.argmin(
        torch.norm(weights.unsqueeze(0) - x_gpu.unsqueeze(1), dim=2),
        dim=1
    )

    # Convert flat indices to grid coordinates
    bmu_grid_x = (bmu_indices % grid_size).cpu().numpy().tolist()
    bmu_grid_y = (bmu_indices // grid_size).cpu().numpy().tolist()

    return {
        "som_indices": bmu_indices.cpu().numpy().tolist(),
        "bmu_grid_x": bmu_grid_x,
        "bmu_grid_y": bmu_grid_y,
        "convergence": float(convergence_history[-1]) if convergence_history else 0.0,
        "epochs_trained": epoch + 1,
    }


def main():
    try:
        # Read JSON from stdin
        input_data = sys.stdin.read()
        job = json.loads(input_data)

        # Extract parameters
        vectors = np.array(job['vectors'], dtype=np.float32)
        grid_size = int(job.get('grid_size', 20))
        learning_rate = float(job.get('learning_rate', 0.5))
        epochs = int(job.get('epochs', 50))
        random_seed = int(job.get('random_seed', 42))

        # Validate input
        if vectors.shape[0] == 0:
            raise ValueError("No vectors provided")
        if grid_size < 2:
            raise ValueError(f"grid_size must be at least 2, got {grid_size}")
        if learning_rate <= 0:
            raise ValueError(f"learning_rate must be positive, got {learning_rate}")
        if epochs < 1:
            raise ValueError(f"epochs must be at least 1, got {epochs}")

        # Train SOM
        result = som_train_gpu(vectors, grid_size, learning_rate, epochs, random_seed)

        # Write result to stdout (JSON)
        print(json.dumps(result))
        sys.exit(0)

    except Exception as e:
        # Write error to stderr (JSON)
        error_msg = json.dumps({
            "error": str(e),
            "type": type(e).__name__,
        })
        print(error_msg, file=sys.stderr)
        sys.exit(1)


if __name__ == '__main__':
    main()
