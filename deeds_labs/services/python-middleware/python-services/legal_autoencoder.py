#!/usr/bin/env python3
"""
PyTorch Autoencoder for 3840→512→3840 Embedding Compression
Legal AI Document Processing Pipeline
"""

import torch
import torch.nn as nn
import numpy as np
from typing import Tuple, Optional
import struct
import os

class LegalDocAutoencoder(nn.Module):
    """
    Autoencoder for compressing legal document embeddings from 3840D to 512D latent space.

    Architecture:
    - Encoder: 3840 → 2048 → 1024 → 512 (with residual connections)
    - Decoder: 512 → 1024 → 2048 → 3840 (symmetric)
    - Uses GELU activation and LayerNorm for stability
    """

    def __init__(self, input_dim: int = 3840, latent_dim: int = 512):
        super().__init__()

        # Encoder with residual connections
        self.encoder = nn.Sequential(
            # Layer 1: 3840 → 2048
            nn.Linear(input_dim, 2048),
            nn.LayerNorm(2048),
            nn.GELU(),

            # Layer 2: 2048 → 1024 (with residual)
            nn.Linear(2048, 1024),
            nn.LayerNorm(1024),
            nn.GELU(),

            # Layer 3: 1024 → 512 (with residual)
            nn.Linear(1024, 512),
            nn.LayerNorm(512),
            nn.GELU(),
        )

        # Decoder (symmetric to encoder)
        self.decoder = nn.Sequential(
            # Layer 1: 512 → 1024
            nn.Linear(512, 1024),
            nn.LayerNorm(1024),
            nn.GELU(),

            # Layer 2: 1024 → 2048
            nn.Linear(1024, 2048),
            nn.LayerNorm(2048),
            nn.GELU(),

            # Layer 3: 2048 → 3840
            nn.Linear(2048, input_dim),
        )

        self.input_dim = input_dim
        self.latent_dim = latent_dim

    def forward(self, x: torch.Tensor) -> Tuple[torch.Tensor, torch.Tensor]:
        """
        Forward pass through autoencoder.

        Args:
            x: Input tensor of shape (batch_size, input_dim)

        Returns:
            Tuple of (reconstruction, latent_vector)
        """
        # Encode to latent space
        z = self.encoder(x)

        # Decode back to original space
        x_reconstructed = self.decoder(z)

        return x_reconstructed, z

    def encode(self, x: torch.Tensor) -> torch.Tensor:
        """Encode input to latent space only."""
        return self.encoder(x)

    def decode(self, z: torch.Tensor) -> torch.Tensor:
        """Decode latent vector back to original space."""
        return self.decoder(z)


def train_autoencoder(
    model: LegalDocAutoencoder,
    embeddings: np.ndarray,
    epochs: int = 10,
    batch_size: int = 32,
    learning_rate: float = 1e-4,
    device: str = "auto",
    save_path: Optional[str] = None
) -> LegalDocAutoencoder:
    """
    Train the autoencoder on legal document embeddings.

    Args:
        model: Autoencoder model to train
        embeddings: Numpy array of shape (N, 3840)
        epochs: Number of training epochs
        batch_size: Batch size for training
        learning_rate: Learning rate for Adam optimizer
        device: Device to train on ('auto', 'cpu', 'cuda')
        save_path: Path to save trained model

    Returns:
        Trained autoencoder model
    """

    # Device setup
    if device == "auto":
        device = "cuda" if torch.cuda.is_available() else "cpu"

    model = model.to(device)
    print(f"Training on device: {device}")

    # Convert data to tensors
    embeddings_tensor = torch.from_numpy(embeddings).float().to(device)

    # Create dataset and dataloader
    dataset = torch.utils.data.TensorDataset(embeddings_tensor, embeddings_tensor)
    dataloader = torch.utils.data.DataLoader(
        dataset, batch_size=batch_size, shuffle=True, drop_last=False
    )

    # Optimizer and loss
    optimizer = torch.optim.Adam(model.parameters(), lr=learning_rate)
    criterion = nn.MSELoss()

    # Learning rate scheduler
    scheduler = torch.optim.lr_scheduler.CosineAnnealingLR(optimizer, T_max=epochs)

    model.train()
    best_loss = float('inf')

    for epoch in range(epochs):
        total_loss = 0.0
        num_batches = 0

        for batch_x, batch_target in dataloader:
            optimizer.zero_grad()

            # Forward pass
            reconstructed, _ = model(batch_x)
            loss = criterion(reconstructed, batch_target)

            # Backward pass
            loss.backward()
            optimizer.step()

            total_loss += loss.item()
            num_batches += 1

        avg_loss = total_loss / num_batches
        scheduler.step()

        print(".6f")

        # Save best model
        if avg_loss < best_loss and save_path:
            best_loss = avg_loss
            torch.save(model.state_dict(), save_path)
            print(f"  Saved best model to {save_path}")

    model.eval()
    return model


def export_weights_to_binary(model: LegalDocAutoencoder, output_path: str):
    """
    Export model weights to a binary format that can be loaded by C++/CUDA.

    Format:
    - Header: 4 bytes magic (0x4145), 4 bytes version (1), 4 bytes input_dim, 4 bytes latent_dim
    - Weights: All encoder and decoder weights as float32 arrays
    - Layout: [encoder.0.weight, encoder.0.bias, encoder.3.weight, encoder.3.bias, ...,
               decoder.0.weight, decoder.0.bias, ...]

    Args:
        model: Trained autoencoder model
        output_path: Path to save binary weights file
    """

    # Ensure model is in eval mode and on CPU
    model.eval()
    model.cpu()

    # Collect all weight tensors in order
    weight_tensors = []

    # Encoder weights (in order of layers)
    for name, param in model.encoder.named_parameters():
        if param.requires_grad:
            weight_tensors.append(param.detach().cpu().numpy())

    # Decoder weights (in order of layers)
    for name, param in model.decoder.named_parameters():
        if param.requires_grad:
            weight_tensors.append(param.detach().cpu().numpy())

    # Write binary file
    with open(output_path, 'wb') as f:
        # Header: magic (AE), version (1), input_dim, latent_dim
        f.write(struct.pack('<I', 0x4145))  # Magic: 'AE' for AutoEncoder
        f.write(struct.pack('<I', 1))       # Version
        f.write(struct.pack('<I', model.input_dim))
        f.write(struct.pack('<I', model.latent_dim))

        # Write each weight tensor
        for tensor in weight_tensors:
            # Write shape (dimensions)
            shape = tensor.shape
            f.write(struct.pack('<I', len(shape)))  # Number of dimensions
            for dim in shape:
                f.write(struct.pack('<I', dim))     # Each dimension size

            # Write data as float32
            tensor_flat = tensor.flatten().astype(np.float32)
            f.write(tensor_flat.tobytes())

    print(f"Exported weights to {output_path}")
    print(f"File size: {os.path.getsize(output_path)} bytes")


def load_weights_from_binary(model: LegalDocAutoencoder, input_path: str) -> LegalDocAutoencoder:
    """
    Load weights from binary file into model.

    Args:
        model: Autoencoder model to load weights into
        input_path: Path to binary weights file

    Returns:
        Model with loaded weights
    """

    model.eval()
    model.cpu()

    # Collect parameter names in same order as export
    param_names = []
    for name, param in model.encoder.named_parameters():
        if param.requires_grad:
            param_names.append(f"encoder.{name}")
    for name, param in model.decoder.named_parameters():
        if param.requires_grad:
            param_names.append(f"decoder.{name}")

    with open(input_path, 'rb') as f:
        # Read header
        magic = struct.unpack('<I', f.read(4))[0]
        version = struct.unpack('<I', f.read(4))[0]
        input_dim = struct.unpack('<I', f.read(4))[0]
        latent_dim = struct.unpack('<I', f.read(4))[0]

        assert magic == 0x4145, f"Invalid magic number: {magic:08x}"
        assert version == 1, f"Unsupported version: {version}"
        assert input_dim == model.input_dim, f"Input dim mismatch: {input_dim} vs {model.input_dim}"
        assert latent_dim == model.latent_dim, f"Latent dim mismatch: {latent_dim} vs {model.latent_dim}"

        # Load weights
        param_idx = 0
        while param_idx < len(param_names):
            # Read shape
            ndims = struct.unpack('<I', f.read(4))[0]
            shape = []
            for _ in range(ndims):
                shape.append(struct.unpack('<I', f.read(4))[0])

            # Read data
            num_elements = np.prod(shape)
            data_bytes = f.read(4 * num_elements)  # 4 bytes per float32
            tensor_np = np.frombuffer(data_bytes, dtype=np.float32).reshape(shape)

            # Load into model
            param_name = param_names[param_idx]
            param = dict(model.named_parameters())[param_name]
            param.data.copy_(torch.from_numpy(tensor_np))

            param_idx += 1

    print(f"Loaded weights from {input_path}")
    return model


# Example usage and testing
if __name__ == "__main__":
    # Create model
    model = LegalDocAutoencoder(input_dim=3840, latent_dim=512)
    print(f"Model created: {model.input_dim} → {model.latent_dim} → {model.input_dim}")

    # Generate sample legal document embeddings (normally from your GPU worker)
    np.random.seed(42)
    sample_embeddings = np.random.randn(1000, 3840).astype(np.float32)

    print("Training autoencoder...")
    trained_model = train_autoencoder(
        model=model,
        embeddings=sample_embeddings,
        epochs=5,
        batch_size=64,
        learning_rate=1e-4,
        save_path="legal_autoencoder.pt"
    )

    # Test compression
    test_input = torch.from_numpy(sample_embeddings[:10]).float()
    with torch.no_grad():
        reconstructed, latent = trained_model(test_input)

    compression_ratio = sample_embeddings.shape[1] / latent.shape[1]
    mse_loss = torch.mean((reconstructed - test_input) ** 2).item()

    print("
Compression test:")
    print(f"  Original shape: {test_input.shape}")
    print(f"  Latent shape: {latent.shape}")
    print(".1f")
    print(".6f")

    # Export weights for C++/CUDA usage
    export_weights_to_binary(trained_model, "legal_autoencoder_weights.bin")

    # Test loading
    new_model = LegalDocAutoencoder(input_dim=3840, latent_dim=512)
    loaded_model = load_weights_from_binary(new_model, "legal_autoencoder_weights.bin")

    # Verify weights match
    with torch.no_grad():
        _, latent_loaded = loaded_model(test_input)
    max_diff = torch.max(torch.abs(latent - latent_loaded)).item()
    print(".2e")