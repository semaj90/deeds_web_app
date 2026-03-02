#!/usr/bin/env python3
"""
Prepare Training Datasets for Google Colab Upload

This script generates JSONL files from various sources and saves them to a directory
ready for upload to Google Drive /COLAB_PACKAGE/training-datasets/

Usage:
    python prepare_colab_datasets.py --output ./colab-datasets

Generates 10 JSONL files (103.5K examples total):
    1. evidence_qlora.jsonl (1K) - from local API
    2. tool_calling_glaive.jsonl (15K) - HuggingFace
    3. tool_calling_hermes.jsonl (10K) - HuggingFace
    4. tool_calling_xlam.jsonl (3K) - HuggingFace
    5. tool_calling_sharegpt.jsonl (3K) - HuggingFace
    6. video_webvid.jsonl (50K) - HuggingFace
    7. video_activitynet.jsonl (20K) - HuggingFace
    8. detective_mode.jsonl (500) - generated (base codebase investigation)
    9. detective_mode_enhanced.jsonl (500) - generated (advanced workflows)
   10. detective_mode_full.jsonl (1000) - combined base + enhanced
"""

import argparse
import json
from pathlib import Path
import requests
from datasets import load_dataset
from tqdm import tqdm

def fetch_evidence_dataset(api_url: str, output_path: Path, limit: int = 1000):
    """Fetch evidence dataset from local API"""
    print(f"\n[1/8] Fetching evidence dataset from {api_url}...")

    try:
        response = requests.get(f"{api_url}/api/qlora/generate?limit={limit}", timeout=300)
        response.raise_for_status()

        # API returns JSONL, write directly
        output_path.write_text(response.text, encoding='utf-8')

        # Count lines
        count = len([line for line in output_path.read_text(encoding='utf-8').split('\n') if line.strip()])
        print(f"   ✓ Saved {count:,} examples → {output_path.name}")

    except requests.exceptions.RequestException as e:
        print(f"   ⚠️  Failed to fetch evidence dataset: {e}")
        print(f"   💡 Make sure dev server is running: npm run dev")
        print(f"   💡 Or manually download:")
        print(f"      curl '{api_url}/api/qlora/generate?limit={limit}' > {output_path}")

        # Create empty file as placeholder
        output_path.write_text('', encoding='utf-8')

def download_hf_dataset(dataset_name: str, config: str, split: str, slice_spec: str, output_path: Path, text_field: str = 'text'):
    """Download HuggingFace dataset and convert to JSONL"""
    print(f"\n   Loading {dataset_name} ({slice_spec})...")

    try:
        # Load dataset
        if config:
            dataset = load_dataset(dataset_name, config, split=f"{split}[{slice_spec}]")
        else:
            dataset = load_dataset(dataset_name, split=f"{split}[{slice_spec}]")

        # Write JSONL
        count = 0
        with open(output_path, 'w', encoding='utf-8') as f:
            for example in tqdm(dataset, desc=f"   Converting {output_path.name}"):
                # Preserve original structure (messages field for tool calling, etc.)
                f.write(json.dumps(example) + '\n')
                count += 1

        print(f"   ✓ Saved {count:,} examples → {output_path.name}")

    except Exception as e:
        print(f"   ⚠️  Failed to download {dataset_name}: {e}")
        print(f"   💡 Check dataset name and HuggingFace connection")

        # Create empty file as placeholder
        output_path.write_text('', encoding='utf-8')

def main():
    parser = argparse.ArgumentParser(description="Prepare training datasets for Google Colab")
    parser.add_argument('--output', type=str, default='./colab-datasets', help='Output directory for JSONL files')
    parser.add_argument('--api-url', type=str, default='http://localhost:5173', help='Local API URL for evidence dataset')
    parser.add_argument('--skip-evidence', action='store_true', help='Skip evidence dataset (download manually)')
    parser.add_argument('--skip-hf', action='store_true', help='Skip HuggingFace datasets (for Option B: ACE Synthesis only)')

    args = parser.parse_args()

    output_dir = Path(args.output)
    output_dir.mkdir(exist_ok=True)

    print("="*70)
    print("DATASET PREPARATION FOR GOOGLE COLAB")
    print("="*70)
    print(f"\nOutput directory: {output_dir.absolute()}")
    print(f"API URL: {args.api_url}")

    # 1. Evidence dataset (local API)
    if not args.skip_evidence:
        fetch_evidence_dataset(
            args.api_url,
            output_dir / 'evidence_qlora.jsonl',
            limit=1000
        )
    else:
        print("\n[1/8] Skipping evidence dataset (--skip-evidence)")

    # 2-7. HuggingFace datasets
    if not args.skip_hf:
        print("\n[2/8] Tool Calling - Glaive...")
        download_hf_dataset(
            "glaiveai/glaive-function-calling-v2",
            config=None,
            split="train",
            slice_spec=":15000",
            output_path=output_dir / 'tool_calling_glaive.jsonl'
        )

        print("\n[3/8] Tool Calling - Hermes...")
        download_hf_dataset(
            "teknium/OpenHermes-2.5",
            config=None,
            split="train",
            slice_spec=":10000",
            output_path=output_dir / 'tool_calling_hermes.jsonl'
        )

        print("\n[4/8] Tool Calling - xLAM...")
        download_hf_dataset(
            "Salesforce/xlam-function-calling-60k",
            config=None,
            split="train",
            slice_spec=":3000",
            output_path=output_dir / 'tool_calling_xlam.jsonl'
        )

        print("\n[5/8] Tool Calling - ShareGPT...")
        download_hf_dataset(
            "anon8231489123/ShareGPT_Vicuna_unfiltered",
            config=None,
            split="train",
            slice_spec=":3000",
            output_path=output_dir / 'tool_calling_sharegpt.jsonl'
        )

        print("\n[6/8] Video - WebVid...")
        download_hf_dataset(
            "iejMac/CLIP-Stitched-webvid-10m",
            config=None,
            split="train",
            slice_spec=":50000",
            output_path=output_dir / 'video_webvid.jsonl'
        )

        print("\n[7/8] Video - ActivityNet...")
        download_hf_dataset(
            "HuggingFaceM4/ActivityNet-Captions",
            config=None,
            split="train",
            slice_spec=":20000",
            output_path=output_dir / 'video_activitynet.jsonl'
        )
    else:
        print("\n[2-7/8] Skipping HuggingFace datasets (--skip-hf)")
        print("   💡 For Option B (ACE Synthesis), only evidence_qlora.jsonl is needed")

    # 8. Detective Mode Base (generated locally)
    print("\n[8/9] Detective Mode Base - Codebase Investigation...")
    try:
        import sys
        import subprocess

        # Run detective mode generator
        detective_script = Path(__file__).parent / 'generate_detective_mode_dataset.py'
        if detective_script.exists():
            result = subprocess.run([
                sys.executable,
                str(detective_script),
                '--output', str(output_dir / 'detective_mode.jsonl'),
                '--count', '500'
            ], capture_output=True, text=True)

            if result.returncode == 0:
                print("   ✓ Generated 500 base detective mode examples")
            else:
                print(f"   ⚠️  Detective mode generation failed: {result.stderr}")
        else:
            print(f"   ⚠️  Detective mode generator not found: {detective_script}")
            print("   💡 Skipping detective mode dataset")
    except Exception as e:
        print(f"   ⚠️  Failed to generate detective mode: {e}")

    # 9. Detective Mode Enhanced (generated locally)
    print("\n[9/9] Detective Mode Enhanced - Advanced Workflows...")
    try:
        import sys
        import subprocess

        # Run enhanced detective mode generator
        enhanced_script = Path(__file__).parent / 'generate_detective_mode_enhanced.py'
        if enhanced_script.exists():
            result = subprocess.run([
                sys.executable,
                str(enhanced_script),
                '--output', str(output_dir / 'detective_mode_enhanced.jsonl'),
                '--count', '500'
            ], capture_output=True, text=True)

            if result.returncode == 0:
                print("   ✓ Generated 500 enhanced detective mode examples")

                # Combine base + enhanced → detective_mode_full.jsonl
                base_path = output_dir / 'detective_mode.jsonl'
                enhanced_path = output_dir / 'detective_mode_enhanced.jsonl'
                full_path = output_dir / 'detective_mode_full.jsonl'

                if base_path.exists() and enhanced_path.exists():
                    with open(full_path, 'w', encoding='utf-8') as outfile:
                        for infile_path in [base_path, enhanced_path]:
                            with open(infile_path, 'r', encoding='utf-8') as infile:
                                outfile.write(infile.read())
                    print("   ✓ Combined base + enhanced → detective_mode_full.jsonl (1000 examples)")
            else:
                print(f"   ⚠️  Enhanced detective mode generation failed: {result.stderr}")
        else:
            print(f"   ⚠️  Enhanced detective mode generator not found: {enhanced_script}")
            print("   💡 Skipping enhanced detective mode dataset")
    except Exception as e:
        print(f"   ⚠️  Failed to generate enhanced detective mode: {e}")

    # Summary
    print("\n" + "="*70)
    print("DATASET PREPARATION COMPLETE")
    print("="*70)

    print(f"\n📂 Generated files in: {output_dir.absolute()}")
    total_size = 0
    total_count = 0

    for file in sorted(output_dir.glob('*.jsonl')):
        size_mb = file.stat().st_size / (1024**2)
        total_size += size_mb

        # Count lines
        count = len([line for line in file.read_text(encoding='utf-8').split('\n') if line.strip()])
        total_count += count

        print(f"   {file.name:40s} {count:>7,} examples ({size_mb:>6.1f} MB)")

    print(f"\n📊 Total: {total_count:,} examples ({total_size:.1f} MB)")

    print(f"\n📤 Next Steps:")
    print(f"   1. Upload entire folder to Google Drive:")
    print(f"      → /MyDrive/COLAB_PACKAGE/training-datasets/")
    print(f"   2. Open Colab notebook:")
    print(f"      → scripts/unsloth-training/Gemma3_Legal_Multimodal_COMPLETE.ipynb")
    print(f"   3. Choose training mode:")
    print(f"      → OPTION_A: Full QLoRA (6-8 hours, all datasets, 103.5K examples)")
    print(f"      → OPTION_B: ACE Synthesis (1-2 hours, evidence + detective mode, 2K examples)")
    print(f"   4. Run all cells")

    print(f"\n💡 For Option B (ACE Synthesis + Detective Mode):")
    print(f"   python prepare_colab_datasets.py --skip-hf")
    print(f"   → Downloads: evidence_qlora.jsonl (1K) + detective_mode_full.jsonl (1K)")
    print(f"   → Total: 2,000 examples (ACE context + codebase investigation)")

    print("\n" + "="*70)

if __name__ == '__main__':
    main()