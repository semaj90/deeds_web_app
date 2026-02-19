#!/usr/bin/env python3
"""
Train a production-ready autoencoder on document embeddings and export for TorchScript.
This script trains a deep autoencoder on a dataset of embeddings (e.g., from legal
documents), tunes hyperparameters, and saves the best performing model encoder for
use in a C++/libtorch environment.

Usage:
  python train_autoencoder.py --dataset-path=./data/embeddings.npy --output-dir=./model_out --epochs=25
"""
import argparse
import os
import json
import torch
from torch import nn
from torch.utils.data import DataLoader, TensorDataset
from tqdm import tqdm

try:
    # Optional: PEFT imports for QLoRA style adapters
    from peft import LoraConfig, get_peft_model
    from transformers import AutoTokenizer, AutoModelForCausalLM
    PEFT_AVAILABLE = True
except Exception:
    PEFT_AVAILABLE = False


class SimpleAutoencoder(nn.Module):
    def __init__(self, input_dim: int, latent_dim: int, dropout_p: float = 0.1):
        super().__init__()
        # Define hidden dimensions based on a common heuristic
        hidden_dim1 = (input_dim + latent_dim) // 2
        hidden_dim2 = (hidden_dim1 + latent_dim) // 2

        self.encoder = nn.Sequential(
            nn.Linear(input_dim, hidden_dim1),
            nn.ReLU(),
            nn.Dropout(dropout_p),
            nn.Linear(hidden_dim1, hidden_dim2),
            nn.ReLU(),
            nn.Linear(hidden_dim2, latent_dim),
        )
        self.decoder = nn.Sequential(
            nn.Linear(latent_dim, hidden_dim2),
            nn.ReLU(),
            nn.Dropout(dropout_p),
            nn.Linear(hidden_dim2, hidden_dim1),
            nn.ReLU(),
            nn.Linear(hidden_dim1, input_dim),
        )

    def forward(self, x):
        z = self.encoder(x)
        out = self.decoder(z)
        return out


def load_production_dataset(path: str, max_samples: int = -1):
    """
    Loads embeddings from a numpy file.
    Assumes the file contains a numpy array of shape (n_samples, embedding_dim).
    """
    import numpy as np
    if not os.path.exists(path):
        raise FileNotFoundError(f"Dataset not found at {path}. Please provide a valid path to a .npy file.")

    print(f"Loading dataset from {path}...")
    embeddings = np.load(path).astype('float32')

    if max_samples > 0 and len(embeddings) > max_samples:
        print(f"Subsampling dataset to {max_samples} samples.")
        indices = np.random.choice(len(embeddings), max_samples, replace=False)
        embeddings = embeddings[indices]

    if embeddings.ndim != 2:
        raise ValueError(f"Expected 2D array, but got shape {embeddings.shape}")

    print(f"Loaded dataset with shape: {embeddings.shape}")
    return TensorDataset(torch.from_numpy(embeddings))


def train_autoencoder(args):
    os.makedirs(args.output_dir, exist_ok=True)
    device = torch.device('cuda' if torch.cuda.is_available() and not args.force_cpu else 'cpu')
    print(f"Using device: {device}")

    # Prepare dataset
    ds = load_production_dataset(path=args.dataset_path, max_samples=args.max_samples)

    # Infer input_dim from dataset and update args
    input_dim = ds.tensors[0].shape[1]
    args.input_dim = input_dim  # for saving metadata
    print(f"Inferred input dimension: {input_dim}")

    # Create validation split
    val_split = 0.1
    if len(ds) < 10:
        raise ValueError("Dataset too small for a train/validation split.")
    dataset_size = len(ds)
    val_size = int(val_split * dataset_size)
    train_size = dataset_size - val_size
    train_ds, val_ds = torch.utils.data.random_split(ds, [train_size, val_size])
    print(f"Training set size: {len(train_ds)}, Validation set size: {len(val_ds)}")

    dl = DataLoader(train_ds, batch_size=args.batch_size, shuffle=True, num_workers=args.num_workers, pin_memory=True)
    val_dl = DataLoader(val_ds, batch_size=args.batch_size, num_workers=args.num_workers, pin_memory=True)

    model = SimpleAutoencoder(
        input_dim=input_dim, latent_dim=args.latent_dim, dropout_p=args.dropout
    ).to(device)
    opt = torch.optim.AdamW(model.parameters(), lr=args.lr, weight_decay=1e-2)
    scheduler = torch.optim.lr_scheduler.CosineAnnealingLR(opt, T_max=args.epochs)
    loss_fn = nn.MSELoss()

    train_losses = []
    val_losses = []
    best_val_loss = float('inf')

    for epoch in range(args.epochs):
        model.train()
        total_train_loss = 0.0
        with tqdm(dl, desc=f"Epoch {epoch+1}/{args.epochs} [Train]") as pbar:
            for batch in pbar:
                x = batch[0].to(device)
                recon = model(x)
                loss = loss_fn(recon, x)
                opt.zero_grad()
                loss.backward()
                opt.step()
                total_train_loss += loss.item() * x.size(0)
                pbar.set_postfix({'loss': f"{loss.item():.6f}", 'lr': f"{scheduler.get_last_lr()[0]:.2e}"})

        epoch_train_loss = total_train_loss / len(train_ds)
        train_losses.append(epoch_train_loss)

        # Validation loop
        model.eval()
        total_val_loss = 0.0
        with torch.no_grad():
            with tqdm(val_dl, desc=f"Epoch {epoch+1}/{args.epochs} [Val]") as pbar:
                for batch in pbar:
                    x = batch[0].to(device)
                    recon = model(x)
                    loss = loss_fn(recon, x)
                    total_val_loss += loss.item() * x.size(0)
                    pbar.set_postfix({'val_loss': f"{loss.item():.6f}"})

        epoch_val_loss = total_val_loss / len(val_ds)
        val_losses.append(epoch_val_loss)

        print(f"Epoch {epoch+1}/{args.epochs} - Train Loss: {epoch_train_loss:.6f}, Val Loss: {epoch_val_loss:.6f}")

        scheduler.step()

        # Save best model
        if epoch_val_loss < best_val_loss:
            best_val_loss = epoch_val_loss
            print(f"New best validation loss: {best_val_loss:.6f}. Saving model.")
            torch.save(model.state_dict(), os.path.join(args.output_dir, 'autoencoder_best.pt'))

    # write loss log for notebook UI
    try:
        with open(os.path.join(args.output_dir, 'loss_log.json'), 'w') as f:
            json.dump({'train': train_losses, 'val': val_losses}, f)
    except Exception as e:
        print('Warning: failed to write loss_log.json', e)

    # Save final PyTorch model (state dict) for reference
    torch.save(model.state_dict(), os.path.join(args.output_dir, 'autoencoder_final.pt'))

    # Export encoder as TorchScript module for C++/libtorch consumption
    print("Loading best model for export...")
    model.load_state_dict(torch.load(os.path.join(args.output_dir, 'autoencoder_best.pt')))
    model.eval()
    example = torch.randn(1, args.input_dim).to(device)
    scripted_encoder = torch.jit.script(model.encoder)
    scripted_encoder.save(os.path.join(args.output_dir, 'encoder.pt'))
    print('Saved TorchScript encoder to', os.path.join(args.output_dir, 'encoder.pt'))

    # Also export a small JSON file describing shapes and metadata
    meta = {
        'input_dim': args.input_dim,
        'latent_dim': args.latent_dim,
        'exported_encoder': 'encoder.pt',
        'hyperparameters': {
            'epochs': args.epochs,
            'batch_size': args.batch_size,
            'lr': args.lr,
            'dropout': args.dropout,
        }
    }
    with open(os.path.join(args.output_dir, 'meta.json'), 'w') as f:
        json.dump(meta, f, indent=2)


def parse_args():
    p = argparse.ArgumentParser(description="Train an autoencoder on document embeddings.")
    p.add_argument('--dataset-path', type=str, required=True, help="Path to the .npy file containing embeddings.")
    p.add_argument('--output-dir', default='./model_out')
    p.add_argument('--epochs', type=int, default=25, help="Production default: 25")
    p.add_argument('--batch-size', type=int, default=128, help="Production default: 128")
    p.add_argument('--lr', type=float, default=5e-5, help="Production default: 5e-5 with scheduler")
    p.add_argument('--latent-dim', type=int, default=128, help="Production default: 128")
    p.add_argument('--dropout', type=float, default=0.1, help="Dropout probability.")
    p.add_argument('--max-samples', type=int, default=-1, help="Max samples to use from dataset (-1 for all).")
    p.add_argument('--force-cpu', action='store_true')
    p.add_argument('--num-workers', type=int, default=4, help="Number of workers for DataLoader.")
    return p.parse_args()


if __name__ == '__main__':
    args = parse_args()
    train_autoencoder(args)
