#!/usr/bin/env python3
"""
Fetch training datasets from web sources:
- HuggingFace legal datasets
- Svelte 5 LSP documentation
- Legal domain image-text pairs
"""

import json
import requests
from pathlib import Path
from typing import List, Dict

OUTPUT_DIR = Path("./training-datasets/web")
OUTPUT_DIR.mkdir(parents=True, exist_ok=True)

# HuggingFace API token (set via env var or .env)
HF_TOKEN = None  # Optional: set if needed for private datasets


def fetch_huggingface_legal_datasets():
    """
    Fetch legal domain datasets from HuggingFace
    Recommended datasets:
    - pile-of-law/pile-of-law (legal documents)
    - lexlms/legal_summarization
    - jonathanli/law-qa
    """
    print("Fetching HuggingFace legal datasets...")

    datasets = [
        "pile-of-law/pile-of-law",
        "lexlms/legal_summarization",
        "jonathanli/law-qa"
    ]

    # For each dataset, fetch sample rows (use datasets library in production)
    samples = []

    # Example: Fetch via HF datasets API (requires `pip install datasets`)
    # from datasets import load_dataset
    # for dataset_name in datasets:
    #     try:
    #         dataset = load_dataset(dataset_name, split="train", streaming=True)
    #         for i, example in enumerate(dataset):
    #             if i >= 1000:  # Limit sample size
    #                 break
    #             samples.append({
    #                 "source": dataset_name,
    #                 "text": example.get("text", "") or example.get("document", ""),
    #                 "metadata": {k: v for k, v in example.items() if k not in ["text", "document"]}
    #             })
    #     except Exception as e:
    #         print(f"Error loading {dataset_name}: {e}")

    # Placeholder: Manual download instruction
    print(f"""
    To fetch HuggingFace datasets:

    1. Install: pip install datasets huggingface_hub
    2. Login: huggingface-cli login
    3. Run:
       from datasets import load_dataset

       # Legal documents
       pile_of_law = load_dataset("pile-of-law/pile-of-law", split="train[:5000]")
       pile_of_law.to_json("{OUTPUT_DIR}/pile-of-law.jsonl")

       # Legal Q&A
       law_qa = load_dataset("jonathanli/law-qa", split="train")
       law_qa.to_json("{OUTPUT_DIR}/law-qa.jsonl")

       # Legal summarization
       legal_sum = load_dataset("lexlms/legal_summarization", split="train[:2000]")
       legal_sum.to_json("{OUTPUT_DIR}/legal-summarization.jsonl")
    """)

    return samples


def fetch_svelte5_docs():
    """
    Fetch Svelte 5 documentation and examples
    """
    print("Fetching Svelte 5 documentation...")

    svelte5_urls = [
        "https://raw.githubusercontent.com/sveltejs/svelte/main/documentation/docs/01-introduction/01-overview.md",
        "https://raw.githubusercontent.com/sveltejs/svelte/main/documentation/docs/02-runes/01-what-are-runes.md",
        "https://raw.githubusercontent.com/sveltejs/svelte/main/documentation/docs/02-runes/02-$state.md",
        "https://raw.githubusercontent.com/sveltejs/svelte/main/documentation/docs/02-runes/03-$derived.md",
        "https://raw.githubusercontent.com/sveltejs/svelte/main/documentation/docs/02-runes/04-$effect.md",
        "https://raw.githubusercontent.com/sveltejs/svelte/main/documentation/docs/02-runes/05-$props.md"
    ]

    docs = []
    for url in svelte5_urls:
        try:
            response = requests.get(url, timeout=10)
            if response.status_code == 200:
                docs.append({
                    "source": url,
                    "text": response.text,
                    "type": "svelte5_docs"
                })
                print(f"  ✓ Fetched {url.split('/')[-1]}")
        except Exception as e:
            print(f"  ✗ Error fetching {url}: {e}")

    # Save to JSONL
    output_file = OUTPUT_DIR / "svelte5-docs.jsonl"
    with open(output_file, "w", encoding="utf-8") as f:
        for doc in docs:
            f.write(json.dumps(doc) + "\n")

    print(f"Saved {len(docs)} Svelte 5 docs to {output_file}")
    return docs


def fetch_legal_vision_datasets():
    """
    Fetch legal document image-text pairs for vision model training

    Recommended sources:
    - RVL-CDIP (document classification with images)
    - DocVQA (document visual question answering)
    - Legal forms/contracts with OCR annotations
    """
    print("Fetching legal vision datasets...")

    print(f"""
    Recommended vision datasets for legal domain:

    1. RVL-CDIP Dataset (400K document images, 16 categories)
       - Download: https://huggingface.co/datasets/rvl_cdip
       - Contains: invoices, letters, forms, memos

    2. DocVQA (12K+ document images with Q&A pairs)
       - Download: https://huggingface.co/datasets/lmms-lab/DocVQA
       - Use: Question-answering on legal documents

    3. Pile of Law with PDF extractions
       - Combine text from pile-of-law with PDF images
       - Create image-caption pairs

    4. Custom dataset from your evidence uploads
       - Use existing evidence items with metadata
       - Create training pairs: (image, evidence_type, entities, summary)

    To create custom dataset from your DB:
       SELECT
         e.id,
         e.title,
         e.evidence_type,
         e.metadata->>'visionAnalysis' as vision_data,
         e.metadata->>'entities' as entities
       FROM evidence e
       WHERE e.file_type LIKE 'image/%'
       LIMIT 5000;
    """)


def create_unsloth_config():
    """
    Generate Unsloth training configuration
    """
    config = {
        "base_model": "unsloth/gemma-3n-2b-bnb-4bit",  # Multimodal Gemma 3n
        "dataset_format": "vision_language",
        "training_args": {
            "output_dir": "./unsloth-legal-vlm",
            "num_train_epochs": 3,
            "per_device_train_batch_size": 4,
            "gradient_accumulation_steps": 4,
            "learning_rate": 2e-4,
            "fp16": True,
            "logging_steps": 10,
            "save_strategy": "steps",
            "save_steps": 100,
            "max_seq_length": 2048,
            "use_lora": True,
            "lora_r": 16,
            "lora_alpha": 16,
            "lora_dropout": 0.05
        },
        "dataset_paths": {
            "codebase_patterns": "./training-datasets/*.jsonl",
            "legal_documents": "./training-datasets/web/pile-of-law.jsonl",
            "legal_qa": "./training-datasets/web/law-qa.jsonl",
            "svelte5_docs": "./training-datasets/web/svelte5-docs.jsonl",
            "vision_pairs": "./training-datasets/evidence-vision-pairs.jsonl"
        },
        "export_format": "trt_llm",  # For TensorRT-LLM deployment
        "quantization": "int4"
    }

    config_file = OUTPUT_DIR / "unsloth-training-config.json"
    with open(config_file, "w") as f:
        json.dump(config, f, indent=2)

    print(f"\nUnsloth config saved to: {config_file}")
    return config


if __name__ == "__main__":
    print("=" * 60)
    print("Legal AI Vision Model Dataset Collection")
    print("=" * 60)
    print()

    # Fetch web datasets
    fetch_svelte5_docs()
    fetch_huggingface_legal_datasets()
    fetch_legal_vision_datasets()

    # Generate Unsloth training config
    create_unsloth_config()

    print("\n" + "=" * 60)
    print("Dataset collection complete!")
    print("=" * 60)
    print(f"\nNext steps:")
    print(f"1. Run: bash scripts/dataset-collection/extract-legal-patterns.sh")
    print(f"2. Install datasets library: pip install datasets huggingface_hub")
    print(f"3. Download HuggingFace datasets (see instructions above)")
    print(f"4. Create evidence vision pairs from your database")
    print(f"5. Run Unsloth training script")
