#!/usr/bin/env python3
"""
Lightweight helper that wraps an Ollama-exported GGUF embedding model into a
TensorRT/LLM-ready directory structure. It does NOT perform quantization or
actual weight conversion; that still needs to happen inside NVIDIA's tooling.

What it does:
  * Validates the GGUF blob exported from Ollama.
  * Copies it into a canonical location (weights/original.gguf).
  * Generates config.json + metadata.json capturing embedding dimensions, dtype,
    and pointers for later TensorRT steps.
  * Writes a README with the next commands to run inside the TensorRT-LLM env.
"""

from __future__ import annotations

import argparse
import json
import shutil
from datetime import datetime, timezone
from pathlib import Path


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Prepare embeddinggemma GGUF for TensorRT workflows.")
    parser.add_argument("--input-gguf", required=True, help="Path to the GGUF/ggml blob exported from Ollama.")
    parser.add_argument("--output-dir", required=True, help="Directory where the HF-style bundle will be written.")
    parser.add_argument("--model-name", default="embeddinggemma", help="Logical model identifier.")
    parser.add_argument("--dim", type=int, default=768, help="Embedding dimensionality.")
    parser.add_argument("--dtype", default="float16", choices=["float16", "bfloat16"], help="Primary compute dtype.")
    return parser.parse_args()


def write_json(path: Path, payload: dict) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(payload, indent=2) + "\n", encoding="utf-8")


def main() -> None:
    args = parse_args()
    input_path = Path(args.input_gguf).expanduser().resolve()
    output_dir = Path(args.output_dir).expanduser().resolve()
    weights_dir = output_dir / "weights"
    tokenizer_dir = output_dir / "tokenizer"

    if not input_path.exists():
        raise FileNotFoundError(f"Input GGUF not found: {input_path}")

    output_dir.mkdir(parents=True, exist_ok=True)
    weights_dir.mkdir(parents=True, exist_ok=True)
    tokenizer_dir.mkdir(parents=True, exist_ok=True)

    gguf_dest = weights_dir / "original.gguf"
    shutil.copy2(input_path, gguf_dest)

    timestamp = datetime.now(timezone.utc).isoformat()

    config = {
        "model_type": "embedding",
        "model_name": args.model_name,
        "hidden_size": args.dim,
        "embedding_dimension": args.dim,
        "dtype": args.dtype,
        "source": str(input_path),
        "generated": timestamp,
        "notes": "Placeholder HF-style config; run TensorRT tooling to materialize .plan files.",
    }
    write_json(output_dir / "config.json", config)

    metadata = {
        "model_name": args.model_name,
        "dimensionality": args.dim,
        "dtype": args.dtype,
        "original_file": str(gguf_dest),
        "created": timestamp,
    }
    write_json(output_dir / "metadata.json", metadata)

    readme = f"""# {args.model_name} TensorRT Prep Bundle

- **Source GGUF:** {input_path}
- **Copied to:** {gguf_dest}
- **Embedding dimension:** {args.dim}
- **dtype:** {args.dtype}
- **Generated:** {timestamp}

Next steps (inside TensorRT-LLM container / WSL):

```bash
python3 -m tensorrt_llm.hlapi.build_engine \\
  --model_path {output_dir} \\
  --output_dir /workspace/engines/{args.model_name} \\
  --dtype {args.dtype} \\
  --max_batch_size 8 \\
  --max_input_len 2048 \\
  --max_output_len 512
```

Adjust the batch sizes and max lengths to match your deployment requirements.
"""
    (output_dir / "README.md").write_text(readme, encoding="utf-8")

    # Minimal tokenizer stub so downstream tools don't fail when expecting vocab files.
    (tokenizer_dir / "tokenizer.json").write_text(
        json.dumps(
            {
                "tokenizer_version": "stub",
                "added_tokens": [],
                "model": {"type": "Unknown", "vocab_size": 0},
            },
            indent=2,
        )
        + "\n",
        encoding="utf-8",
    )

    print(f"Prepared TensorRT-ready bundle at {output_dir}")
    print("Remember: this does not replace NVIDIA's conversion step; run build_engine to create actual .plan files.")


if __name__ == "__main__":
    main()
