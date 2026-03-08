#!/usr/bin/env python3
"""
Upload JSONL training files to HuggingFace as a private dataset.

Usage:
    1. Install: pip install datasets huggingface_hub
    2. Login:   huggingface-cli login  (paste your HF token)
    3. Run:     python upload-to-huggingface.py

This reads all 26 JSONL files from COLAB_PACKAGE/training-datasets/,
combines them into a single HuggingFace Dataset with source tracking,
and pushes to your private HuggingFace repo.

After upload, the Colab notebook loads data with:
    load_dataset("YOUR_USERNAME/deeds-legal-codebase", split="train")
    (100-300 MB/s direct HTTP vs 10-50 MB/s Google Drive FUSE mount)
"""

import json
import sys
from pathlib import Path
from datasets import Dataset
from huggingface_hub import whoami

# ── Config ──────────────────────────────────────────────────────────
DATASET_DIR = Path(__file__).parent / "COLAB_PACKAGE" / "training-datasets"
REPO_NAME = "deeds-legal-codebase"  # Will become: Semaj90/deeds-legal-codebase
PRIVATE = True  # Keep dataset private
# ────────────────────────────────────────────────────────────────────


def load_jsonl_files(dataset_dir: Path) -> list[dict]:
    """Load all JSONL files and normalize to {text, source} format."""
    all_examples = []
    file_stats = []

    for filepath in sorted(dataset_dir.glob("*.jsonl")):
        if "-old" in filepath.name or filepath.name.startswith("."):
            print(f"  Skipping: {filepath.name}")
            continue

        count = 0
        with open(filepath, "r", encoding="utf-8") as f:
            for line_num, line in enumerate(f, 1):
                line = line.strip()
                if not line:
                    continue
                try:
                    obj = json.loads(line)
                except json.JSONDecodeError as e:
                    print(f"  WARNING: {filepath.name}:{line_num} invalid JSON: {e}")
                    continue

                # Normalize to text field
                text = extract_text(obj)
                if text:
                    all_examples.append({
                        "text": text,
                        "source": filepath.stem,  # filename without .jsonl
                    })
                    count += 1

        file_stats.append((filepath.name, count))
        print(f"  {filepath.name}: {count:,} examples")

    print(f"\n  Total: {len(all_examples):,} examples from {len(file_stats)} files")
    return all_examples


def extract_text(obj: dict) -> str | None:
    """Extract text from various JSONL formats."""
    # Format 1: messages array (OpenAI/ShareGPT style)
    if "messages" in obj:
        parts = []
        for msg in obj["messages"]:
            role = msg.get("role", "")
            content = msg.get("content", "")
            if role == "system":
                parts.append(f"System: {content}")
            elif role == "user":
                parts.append(f"User: {content}")
            elif role == "assistant":
                parts.append(f"Assistant: {content}")
        return "\n\n".join(parts) if parts else None

    # Format 2: conversations array
    if "conversations" in obj:
        parts = []
        for msg in obj["conversations"]:
            role = msg.get("from", msg.get("role", ""))
            content = msg.get("value", msg.get("content", ""))
            parts.append(f"{role}: {content}")
        return "\n\n".join(parts) if parts else None

    # Format 3: instruction/input/output (Alpaca style)
    if "instruction" in obj:
        text = obj["instruction"]
        if obj.get("input"):
            text += f"\n\nInput: {obj['input']}"
        if obj.get("output"):
            text += f"\n\nOutput: {obj['output']}"
        return text

    # Format 4: plain text field
    if "text" in obj:
        return obj["text"] if isinstance(obj["text"], str) else str(obj["text"])

    # Format 5: content field
    if "content" in obj:
        return obj["content"]

    return None


def main():
    # Verify login
    try:
        user_info = whoami()
        username = user_info["name"]
        print(f"Logged in as: {username}")
    except Exception:
        print("ERROR: Not logged in to HuggingFace!")
        print("  Run: huggingface-cli login")
        print("  Get token at: https://huggingface.co/settings/tokens")
        sys.exit(1)

    repo_id = f"{username}/{REPO_NAME}"
    print(f"\nTarget: {repo_id} (private={PRIVATE})")

    # Verify dataset directory
    if not DATASET_DIR.exists():
        print(f"\nERROR: {DATASET_DIR} not found!")
        sys.exit(1)

    jsonl_files = list(DATASET_DIR.glob("*.jsonl"))
    print(f"\nFound {len(jsonl_files)} JSONL files in {DATASET_DIR}\n")

    # Load all files
    print("Loading JSONL files...")
    examples = load_jsonl_files(DATASET_DIR)

    if not examples:
        print("ERROR: No examples loaded!")
        sys.exit(1)

    # Create HuggingFace Dataset
    print("\nCreating HuggingFace Dataset...")
    dataset = Dataset.from_list(examples)
    print(f"  Columns: {dataset.column_names}")
    print(f"  Rows: {len(dataset):,}")
    print(f"  Size: ~{dataset.data.nbytes / (1024**2):.1f} MB")

    # Push to hub
    print(f"\nUploading to {repo_id}...")
    print("  (This may take a few minutes depending on dataset size)\n")

    dataset.push_to_hub(
        repo_id,
        private=PRIVATE,
        commit_message="Upload deeds legal + codebase training data (26 JSONL files)",
    )

    print(f"\nDone! Dataset uploaded to: https://huggingface.co/datasets/{repo_id}")
    print(f"\nTo use in Colab notebook:")
    print(f'  dataset = load_dataset("{repo_id}", split="train")')


if __name__ == "__main__":
    main()
