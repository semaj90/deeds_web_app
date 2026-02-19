"""Phase G: Distributed autoencoder training scaffold (PyTorch DDP + NCCL).

Run with `torchrun` or `python -m torch.distributed.run` after populating the
config file with dataset paths. The goal is to provide a starting point for
multi-GPU fine-tuning before exporting to TensorRT/Triton.
"""

from __future__ import annotations

import argparse
import json
import logging
import os
from dataclasses import dataclass
from typing import Optional

import torch
import torch.distributed as dist
import torch.multiprocessing as mp
import torch.nn as nn
from torch.nn.parallel import DistributedDataParallel
from torch.utils.data import DataLoader, DistributedSampler, TensorDataset

LOGGER = logging.getLogger("distributed_train")


@dataclass
class DistConfig:
    embeddings_path: str
    output_dir: str
    latent_dim: int = 64
    epochs: int = 5
    batch_size: int = 512
    lr: float = 1e-4
    backend: str = "nccl"
    world_size: int = 1
    rank: int = 0
    local_rank: int = 0
    seed: int = 42


class SomAutoEncoder(nn.Module):
    def __init__(self, input_dim: int, latent_dim: int):
        super().__init__()
        self.encoder = nn.Sequential(
            nn.Linear(input_dim, 512),
            nn.ReLU(),
            nn.Linear(512, latent_dim),
        )
        self.decoder = nn.Sequential(
            nn.Linear(latent_dim, 512),
            nn.ReLU(),
            nn.Linear(512, input_dim),
        )

    def forward(self, x: torch.Tensor) -> tuple[torch.Tensor, torch.Tensor]:
        latent = self.encoder(x)
        reconstruction = self.decoder(latent)
        return reconstruction, latent


def setup_process_group(cfg: DistConfig) -> None:
    dist.init_process_group(
        backend=cfg.backend,
        rank=cfg.rank,
        world_size=cfg.world_size,
    )
    torch.cuda.set_device(cfg.local_rank)
    torch.manual_seed(cfg.seed)


def cleanup() -> None:
    if dist.is_initialized():
        dist.destroy_process_group()


def save_checkpoint(model: SomAutoEncoder, cfg: DistConfig) -> None:
    if cfg.rank == 0:
        os.makedirs(cfg.output_dir, exist_ok=True)
        path = os.path.join(cfg.output_dir, "som_autoencoder_distributed.pt")
        torch.save(model.state_dict(), path)
        LOGGER.info("Master rank saved checkpoint to %s", path)


def train(cfg: DistConfig) -> None:
    setup_process_group(cfg)

    try:
        device = torch.device("cuda", cfg.local_rank)
        embeddings = torch.load(cfg.embeddings_path).float()
        dataset = TensorDataset(embeddings)
        sampler = DistributedSampler(dataset, num_replicas=cfg.world_size, rank=cfg.rank, shuffle=True)
        dataloader = DataLoader(dataset, batch_size=cfg.batch_size, sampler=sampler, drop_last=False)

        model = SomAutoEncoder(embeddings.shape[1], cfg.latent_dim).to(device)
        ddp_model = DistributedDataParallel(model, device_ids=[cfg.local_rank])
        criterion = nn.MSELoss()
        optimizer = torch.optim.Adam(ddp_model.parameters(), lr=cfg.lr)

        for epoch in range(cfg.epochs):
            sampler.set_epoch(epoch)
            epoch_loss = 0.0
            for (batch,) in dataloader:
                batch = batch.to(device)
                reconstruction, _ = ddp_model(batch)
                loss = criterion(reconstruction, batch)
                optimizer.zero_grad(set_to_none=True)
                loss.backward()
                optimizer.step()
                epoch_loss += loss.item() * batch.size(0)

            total_samples = torch.tensor([len(dataloader.dataset)], dtype=torch.float32, device=device)
            total_loss = torch.tensor([epoch_loss], dtype=torch.float32, device=device)
            dist.all_reduce(total_samples, op=dist.ReduceOp.SUM)
            dist.all_reduce(total_loss, op=dist.ReduceOp.SUM)
            mean_loss = (total_loss / total_samples).item()
            if cfg.rank == 0:
                LOGGER.info("epoch=%d mean_loss=%.6f", epoch + 1, mean_loss)

        save_checkpoint(model.cpu(), cfg)
    finally:
        cleanup()


def parse_args() -> DistConfig:
    parser = argparse.ArgumentParser(description="Distributed SOM autoencoder training")
    parser.add_argument("config", type=str, help="Path to JSON config with embeddings_path/output_dir")
    parser.add_argument("--local-rank", type=int, default=0)
    parser.add_argument("--rank", type=int, default=0)
    parser.add_argument("--world-size", type=int, default=1)
    args = parser.parse_args()

    with open(args.config, "r", encoding="utf-8") as handle:
        data = json.load(handle)

    return DistConfig(
        embeddings_path=data["embeddings_path"],
        output_dir=data["output_dir"],
        latent_dim=int(data.get("latent_dim", 64)),
        epochs=int(data.get("epochs", 5)),
        batch_size=int(data.get("batch_size", 512)),
        lr=float(data.get("learning_rate", 1e-4)),
        world_size=args.world_size,
        rank=args.rank,
        local_rank=args.local_rank,
    )


def main() -> None:
    logging.basicConfig(level=logging.INFO, format="[%(levelname)s] %(message)s")
    cfg = parse_args()
    train(cfg)


if __name__ == "__main__":  # pragma: no cover
    main()

