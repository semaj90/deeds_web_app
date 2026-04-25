"""Phase G helper to sync model artifacts into Triton repository and launch server.

Usage:
  python launch_triton.py --artifacts ./artifacts --repository ./triton_model_repository --run

If ``--run`` is provided, a Triton Docker container is started using the
prepared repository. Otherwise the script simply copies the latest
TorchScript export into the repository.
"""

from __future__ import annotations

import argparse
import os
import shutil
import subprocess
from pathlib import Path


def sync_artifacts(artifacts_dir: Path, repository: Path) -> None:
    repository.mkdir(parents=True, exist_ok=True)
    target_model_dir = repository / "autoencoder" / "1"
    target_model_dir.mkdir(parents=True, exist_ok=True)
    source = artifacts_dir / "som_autoencoder.pt"
    if not source.exists():
        # try alternative filenames
        source = artifacts_dir / "encoder.pt"
    if not source.exists():
        print("Warning: No TorchScript model found in artifacts (looked for som_autoencoder.pt, encoder.pt)")
    else:
        destination = target_model_dir / "model.pt"
        shutil.copy2(source, destination)
        print(f"Copied TorchScript model to {destination}")

    # copy merged adapter if present
    merged = artifacts_dir / "pytorch_adapter_merged.bin"
    if merged.exists():
        shutil.copy2(merged, target_model_dir / merged.name)
        print(f"Copied merged adapter to model repo: {merged.name}")

    # write a small manifest.json that Triton Python backend can read
    manifest = {
        "model": "autoencoder",
        "version": "1",
        "adapter": str(merged.name) if merged.exists() else None,
    }
    with open(target_model_dir / "manifest.json", "w") as f:
        json.dump(manifest, f)


def launch_triton(repository: Path, http_port: int, grpc_port: int, metrics_port: int) -> None:
    cmd = [
        "docker",
        "run",
        "--rm",
        "--gpus",
        "all",
        "-p",
        f"{http_port}:8000",
        "-p",
        f"{grpc_port}:8001",
        "-p",
        f"{metrics_port}:8002",
        "-v",
        f"{repository.resolve()}:/models",
        "nvcr.io/nvidia/tritonserver:24.02-py3",
        "tritonserver",
        "--model-repository=/models",
    ]
    print("Launching Triton Inference Server:")
    print(" ".join(cmd))
    subprocess.run(cmd, check=True)


def main() -> None:
    parser = argparse.ArgumentParser(description="Prepare and optionally launch Triton server")
    parser.add_argument("--artifacts", type=Path, default=Path("./artifacts"))
    parser.add_argument("--repository", type=Path, default=Path("./triton_model_repository"))
    parser.add_argument("--http-port", type=int, default=8000)
    parser.add_argument("--grpc-port", type=int, default=8001)
    parser.add_argument("--metrics-port", type=int, default=8002)
    parser.add_argument("--run", action="store_true", help="Start Triton server after syncing artifacts")
    args = parser.parse_args()

    sync_artifacts(args.artifacts, args.repository)
    if args.run:
        launch_triton(args.repository, args.http_port, args.grpc_port, args.metrics_port)


if __name__ == "__main__":  # pragma: no cover
    main()

