"""Phase F Autoencoder + QLoRA training scaffolding. This script shows how to: * Load embedding datasets produced by
Gemma/EmbeddingGemma * Train a compact SOM-style autoencoder * Export TorchScript + ONNX artifacts for libtorch /
TensorRT / WASM builds * Optionally fine-tune Gemma3-Legal adapters via QLoRA with a GRPO-style loop The defaults are
intentionally conservative so you can run quick smoke tests. Fill in the dataset loaders and reward functions with
project-specific logic before using in production. """ from __future__ import annotations import argparse import json
import logging import math import pathlib from dataclasses import dataclass from typing import Iterable, Optional import
torch import torch.nn as nn from torch.utils.data import DataLoader, TensorDataset try: from transformers import (
AutoModelForCausalLM, AutoTokenizer, get_peft_model, ) from peft import LoraConfig except ImportError: # pragma: no
cover - optional dependency AutoModelForCausalLM = None AutoTokenizer = None get_peft_model = None LoraConfig = None
LOGGER = logging.getLogger("train_autoencoder") @dataclass class TrainConfig: embeddings_path: pathlib.Path output_dir:
pathlib.Path latent_dim: int = 64 batch_size: int = 256 epochs: int = 10 learning_rate: float = 1e-4 device: str =
"cuda" if torch.cuda.is_available() else "cpu" export_onnx: bool = True export_torchscript: bool = True train_adapter:
bool = False adapter_output: Optional[pathlib.Path] = None grpo_feedback_path: Optional[pathlib.Path] = None class
SomAutoEncoder(nn.Module): def __init__(self, input_dim: int, latent_dim: int): super().__init__() self.encoder =
nn.Sequential( nn.Linear(input_dim, 512), nn.ReLU(), nn.Linear(512, latent_dim), ) self.decoder = nn.Sequential(
nn.Linear(latent_dim, 512), nn.ReLU(), nn.Linear(512, input_dim), ) def forward(self, x: torch.Tensor) ->
tuple[torch.Tensor, torch.Tensor]: latent = self.encoder(x) reconstruction = self.decoder(latent) return reconstruction,
latent def load_embeddings(path: pathlib.Path) -> torch.Tensor: """Load embeddings saved as .pt, .pth, or .npy."""
LOGGER.info("Loading embeddings from %s", path) if path.suffix in {('.pt', '.pth')}: data = torch.load(path,
map_location="cpu") if isinstance(data, dict) and "embeddings" in data: data = data["embeddings"] elif path.suffix ==
".npy": import numpy as np data = torch.from_numpy(np.load(path)) else: # pragma: no cover - defensive branch raise
ValueError(f"Unsupported embedding format: {path}") if not isinstance(data, torch.Tensor): # pragma: no cover raise
TypeError("Expected torch.Tensor embeddings") LOGGER.info("Loaded embeddings tensor with shape %s", tuple(data.shape))
return data.float() def build_dataloader(tensor: torch.Tensor, batch_size: int) -> DataLoader: dataset =
TensorDataset(tensor) return DataLoader(dataset, batch_size=batch_size, shuffle=True, drop_last=False) def
train_autoencoder(cfg: TrainConfig) -> SomAutoEncoder: embeddings = load_embeddings(cfg.embeddings_path) dataloader =
build_dataloader(embeddings, cfg.batch_size) model = SomAutoEncoder(embeddings.shape[1], cfg.latent_dim).to(cfg.device)
criterion = nn.MSELoss() optimizer = torch.optim.Adam(model.parameters(), lr=cfg.learning_rate) for epoch in
range(cfg.epochs): epoch_loss = 0.0 for (batch,) in dataloader: batch = batch.to(cfg.device) reconstruction, _ =
model(batch) loss = criterion(reconstruction, batch) optimizer.zero_grad(set_to_none=True) loss.backward()
optimizer.step() epoch_loss += loss.item() * batch.size(0) mean_loss = epoch_loss / len(dataloader.dataset)
LOGGER.info("epoch=%d mse_loss=%.6f", epoch + 1, mean_loss) return model.cpu() def export_artifacts(model:
SomAutoEncoder, cfg: TrainConfig) -> None: cfg.output_dir.mkdir(parents=True, exist_ok=True) sample = torch.randn(1,
model.decoder[-1].out_features) if cfg.export_torchscript: traced = torch.jit.trace(model, sample) torchscript_path =
cfg.output_dir / "som_autoencoder.pt" traced.save(torchscript_path) LOGGER.info("Saved TorchScript autoencoder to %s",
torchscript_path) if cfg.export_onnx: onnx_path = cfg.output_dir / "som_autoencoder.onnx" torch.onnx.export( model,
sample, onnx_path, input_names=["input"], output_names=["reconstruction", "latent"], opset_version=17, )
LOGGER.info("Exported ONNX autoencoder to %s", onnx_path) def load_feedback(path: pathlib.Path) -> Iterable[dict[str,
float]]: if not path.exists(): LOGGER.warning("Feedback path %s does not exist; skipping RL stage", path) return [] with
path.open("r", encoding="utf-8") as handle: data = json.load(handle) if not isinstance(data, list): # pragma: no cover
raise TypeError("Feedback JSON must be a list") return data def train_adapter_with_grpo(cfg: TrainConfig) -> None: if
not cfg.train_adapter: LOGGER.info("Adapter training disabled; skipping") return if AutoModelForCausalLM is None:
LOGGER.error("transformers/peft not installed; cannot train adapter") return LOGGER.info("Loading Gemma3-Legal base
model for QLoRA fine-tuning") model = AutoModelForCausalLM.from_pretrained("google/gemma3-legal") tokenizer =
AutoTokenizer.from_pretrained("google/gemma3-legal") lora_cfg = LoraConfig( r=16, lora_alpha=32,
target_modules=["q_proj", "v_proj"], lora_dropout=0.05, ) model = get_peft_model(model, lora_cfg) feedback_items =
list(load_feedback(cfg.grpo_feedback_path)) if cfg.grpo_feedback_path else [] if not feedback_items: LOGGER.warning("No
feedback items provided; adapter weights will remain near-initial") return LOGGER.info("Running GRPO-style reinforcement
loop on %d feedback items", len(feedback_items)) optimizer = torch.optim.Adam(model.parameters(), lr=5e-5)
model.to(cfg.device) for item in feedback_items: query = item.get("query", "") reward = float(item.get("reward", 0.0))
if not query: continue inputs = tokenizer(query, return_tensors="pt").to(cfg.device) outputs = model(**inputs,
labels=inputs["input_ids"]) loss = outputs.loss - reward optimizer.zero_grad(set_to_none=True) loss.backward()
optimizer.step() adapter_dir = cfg.adapter_output or (cfg.output_dir / "qlora_adapter") adapter_dir.mkdir(parents=True,
exist_ok=True) model.save_pretrained(adapter_dir) LOGGER.info("Saved QLoRA adapter weights to %s", adapter_dir) def
parse_args() -> TrainConfig: parser = argparse.ArgumentParser(description="Train SOM autoencoder and optional QLoRA
adapter") parser.add_argument("embeddings", type=pathlib.Path, help="Path to Gemma embedding tensor (.pt/.npy)")
parser.add_argument("output", type=pathlib.Path, help="Output directory for artifacts")
parser.add_argument("--latent-dim", type=int, default=64, help="Latent dimension for autoencoder")
parser.add_argument("--epochs", type=int, default=10) parser.add_argument("--batch-size", type=int, default=256)
parser.add_argument("--lr", type=float, default=1e-4, help="Learning rate") parser.add_argument("--no-onnx",
action="store_true", help="Skip ONNX export") parser.add_argument("--no-torchscript", action="store_true", help="Skip
TorchScript export") parser.add_argument("--train-adapter", action="store_true", help="Enable QLoRA adapter
fine-tuning") parser.add_argument("--adapter-output", type=pathlib.Path, help="Directory to save QLoRA adapter")
parser.add_argument("--grpo-feedback", type=pathlib.Path, help="JSON file containing reward signals")
parser.add_argument("--device", type=str, default=None, help="Override training device (cpu/cuda)") args =
parser.parse_args() device = args.device or ("cuda" if torch.cuda.is_available() else "cpu") return TrainConfig(
embeddings_path=args.embeddings, output_dir=args.output, latent_dim=args.latent_dim, batch_size=args.batch_size,
epochs=args.epochs, learning_rate=args.lr, export_onnx=not args.no_onnx, export_torchscript=not args.no_torchscript,
train_adapter=args.train_adapter, adapter_output=args.adapter_output, grpo_feedback_path=args.grpo_feedback,
device=device, ) def main() -> None: logging.basicConfig(level=logging.INFO, format="[%(levelname)s] %(message)s") cfg =
parse_args() LOGGER.info("Training configuration: %s", cfg) model = train_autoencoder(cfg) export_artifacts(model, cfg)
train_adapter_with_grpo(cfg) LOGGER.info("Training pipeline completed successfully") if __name__ == "__main__": #
pragma: no cover main()
