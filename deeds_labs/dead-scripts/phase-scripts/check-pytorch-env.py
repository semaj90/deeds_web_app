#!/usr/bin/env python3
"""
Phase 89: PyTorch Environment Verification
Check if PyTorch is properly installed with CUDA support and multiprocessing capabilities
"""

import json
import sys

def check_pytorch():
    results = {
        'pytorch_installed': False,
        'version': None,
        'cuda_available': False,
        'cuda_version': None,
        'device_name': None,
        'device_count': 0,
        'multiprocessing_available': False,
        'multiprocessing_start_method': None,
        'transformers_installed': False,
        'sentence_transformers_installed': False,
        'errors': []
    }

    # Check PyTorch
    try:
        import torch
        results['pytorch_installed'] = True
        results['version'] = torch.__version__
        results['cuda_available'] = torch.cuda.is_available()

        if results['cuda_available']:
            results['cuda_version'] = torch.version.cuda
            results['device_count'] = torch.cuda.device_count()
            if results['device_count'] > 0:
                results['device_name'] = torch.cuda.get_device_name(0)

        # Check multiprocessing
        try:
            import torch.multiprocessing as mp
            results['multiprocessing_available'] = True
            results['multiprocessing_start_method'] = mp.get_start_method()
        except Exception as e:
            results['errors'].append(f"Multiprocessing check failed: {str(e)}")

    except ImportError as e:
        results['errors'].append(f"PyTorch not installed: {str(e)}")

    # Check transformers
    try:
        import transformers
        results['transformers_installed'] = True
        results['transformers_version'] = transformers.__version__
    except ImportError:
        results['errors'].append("transformers not installed")

    # Check sentence-transformers
    try:
        import sentence_transformers
        results['sentence_transformers_installed'] = True
        results['sentence_transformers_version'] = sentence_transformers.__version__
    except ImportError:
        results['errors'].append("sentence-transformers not installed")

    return results

if __name__ == "__main__":
    results = check_pytorch()

    print("\n" + "="*70)
    print("🔍 Phase 89: PyTorch Environment Check")
    print("="*70 + "\n")

    # PyTorch
    if results['pytorch_installed']:
        print(f"✅ PyTorch: v{results['version']}")
    else:
        print("❌ PyTorch: NOT INSTALLED")

    # CUDA
    if results['cuda_available']:
        print(f"✅ CUDA: {results['cuda_version']}")
        print(f"✅ GPU: {results['device_name']} ({results['device_count']} device(s))")
    else:
        print("⚠️  CUDA: Not available (CPU only)")

    # Multiprocessing
    if results['multiprocessing_available']:
        print(f"✅ torch.multiprocessing: {results['multiprocessing_start_method']}")
    else:
        print("❌ torch.multiprocessing: NOT AVAILABLE")

    # Dependencies
    if results['transformers_installed']:
        print(f"✅ transformers: v{results.get('transformers_version', 'unknown')}")
    else:
        print("❌ transformers: NOT INSTALLED")

    if results['sentence_transformers_installed']:
        print(f"✅ sentence-transformers: v{results.get('sentence_transformers_version', 'unknown')}")
    else:
        print("❌ sentence-transformers: NOT INSTALLED")

    # Errors
    if results['errors']:
        print("\n⚠️  Warnings/Errors:")
        for error in results['errors']:
            print(f"   • {error}")

    print("\n" + "="*70)

    # JSON output for programmatic parsing
    if '--json' in sys.argv:
        print("\nJSON Output:")
        print(json.dumps(results, indent=2))

    # Recommendations
    print("\n💡 Recommendations:\n")

    if not results['pytorch_installed']:
        print("   pip install torch torchvision torchaudio --index-url https://download.pytorch.org/whl/cu130")
        print("   Note: Using cu130 for CUDA 13.0")

    if not results['transformers_installed']:
        print("   pip install transformers")

    if not results['sentence_transformers_installed']:
        print("   pip install sentence-transformers")

    if results['pytorch_installed'] and not results['cuda_available']:
        print("   ⚠️  PyTorch installed but CUDA not available!")
        print("   Reinstall PyTorch with CUDA 13.0:")
        print("   pip install torch torchvision torchaudio --index-url https://download.pytorch.org/whl/cu130")

    if results['pytorch_installed'] and results['cuda_available']:
        print("   ✅ System ready for PyTorch multiprocessing with CUDA!")
        print("   Next step: python scripts/phase89-pytorch-multicore.py index --root ./src")

    print()

    # Exit code
    sys.exit(0 if results['pytorch_installed'] and results['cuda_available'] else 1)
