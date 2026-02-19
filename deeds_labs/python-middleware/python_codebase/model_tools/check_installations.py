#!/usr/bin/env python3
"""
System Installation Check for Phase 13 Enhanced Features
Checks vLLM, Triton, and other Windows-compatible AI libraries
"""

import sys
import importlib
import subprocess
import platform

def check_package(package_name, import_name=None):
    """Check if a package is installed and importable"""
    if import_name is None:
        import_name = package_name

    try:
        module = importlib.import_module(import_name)
        version = getattr(module, '__version__', 'unknown')
        return True, version, None
    except ImportError as e:
        return False, None, str(e)

def check_system_info():
    """Display system information"""
    print("=" * 60)
    print("SYSTEM INFORMATION")
    print("=" * 60)
    print(f"Platform: {platform.platform()}")
    print(f"Python version: {sys.version}")
    print(f"Python executable: {sys.executable}")
    print(f"Architecture: {platform.architecture()}")
    print(f"Machine: {platform.machine()}")
    print()

def check_ai_packages():
    """Check AI/ML package installations"""
    print("=" * 60)
    print("AI/ML PACKAGE INSTALLATIONS")
    print("=" * 60)

    packages = [
        ('vllm', 'vllm'),
        ('triton', 'triton'),
        ('torch', 'torch'),
        ('transformers', 'transformers'),
        ('numpy', 'numpy'),
        ('scipy', 'scipy'),
        ('scikit-learn', 'sklearn'),
        ('pandas', 'pandas'),
        ('fastapi', 'fastapi'),
        ('uvicorn', 'uvicorn'),
        ('pydantic', 'pydantic'),
        ('requests', 'requests'),
        ('aiohttp', 'aiohttp'),
        ('websockets', 'websockets'),
        ('redis', 'redis'),
        ('psycopg2', 'psycopg2'),
        ('sqlalchemy', 'sqlalchemy'),
        ('alembic', 'alembic'),
        ('celery', 'celery'),
        ('dramatiq', 'dramatiq'),
    ]

    installed_count = 0
    for package_name, import_name in packages:
        is_installed, version, error = check_package(package_name, import_name)
        if is_installed:
            print(f"✅ {package_name}: {version}")
            installed_count += 1
        else:
            print(f"❌ {package_name}: {error}")

    print(f"\nInstalled: {installed_count}/{len(packages)} packages")
    print()

def check_windows_specific():
    """Check Windows-specific installations"""
    print("=" * 60)
    print("WINDOWS-SPECIFIC CHECKS")
    print("=" * 60)

    # Check CUDA availability
    try:
        import torch
        cuda_available = torch.cuda.is_available()
        if cuda_available:
            print(f"✅ CUDA available: {torch.version.cuda}")
            print(f"   GPU devices: {torch.cuda.device_count()}")
            for i in range(torch.cuda.device_count()):
                gpu_name = torch.cuda.get_device_name(i)
                print(f"   Device {i}: {gpu_name}")
        else:
            print("❌ CUDA not available")
    except ImportError:
        print("❌ PyTorch not installed - cannot check CUDA")

    # Check for Visual Studio Build Tools
    try:
        import distutils.msvccompiler
        print("✅ Visual Studio Build Tools available")
    except ImportError:
        print("❌ Visual Studio Build Tools not found")

    print()

def check_vllm_specific():
    """Specific vLLM checks"""
    print("=" * 60)
    print("vLLM SPECIFIC CHECKS")
    print("=" * 60)

    try:
        import vllm
        print(f"✅ vLLM installed: {vllm.__version__}")

        # Check vLLM components
        try:
            from vllm import LLM, SamplingParams
            print("✅ vLLM core components available")
        except ImportError as e:
            print(f"❌ vLLM core components issue: {e}")

        # Check vLLM engine
        try:
            from vllm.engine.arg_utils import AsyncEngineArgs
            print("✅ vLLM engine available")
        except ImportError as e:
            print(f"❌ vLLM engine issue: {e}")

    except ImportError as e:
        print(f"❌ vLLM not installed: {e}")
        print("   Installation command for Windows:")
        print("   pip install vllm")
        print("   Or with CUDA support:")
        print("   pip install vllm[cuda]")

    print()

def check_triton_specific():
    """Specific Triton checks"""
    print("=" * 60)
    print("TRITON SPECIFIC CHECKS")
    print("=" * 60)

    try:
        import triton
        print(f"✅ Triton installed: {triton.__version__}")

        # Check Triton compiler
        try:
            import triton.compiler
            print("✅ Triton compiler available")
        except ImportError as e:
            print(f"❌ Triton compiler issue: {e}")

        # Check Triton language
        try:
            import triton.language as tl
            print("✅ Triton language available")
        except ImportError as e:
            print(f"❌ Triton language issue: {e}")

    except ImportError as e:
        print(f"❌ Triton not installed: {e}")
        print("   Installation command for Windows:")
        print("   pip install triton")
        print("   Or latest from PyPI:")
        print("   pip install triton --upgrade")

    print()

def check__services():
    """Check  services status"""
    print("=" * 60)
    print(" SERVICES STATUS")
    print("=" * 60)

    try:
        result = subprocess.run(['', 'ps'], capture_output=True, text=True, timeout=10)
        if result.returncode == 0:
            print("✅  is running")
            lines = result.stdout.strip().split('\n')
            if len(lines) > 1:  # More than just header
                print("Running containers:")
                for line in lines[1:]:  # Skip header
                    parts = line.split()
                    if len(parts) >= 2:
                        container_name = parts[-1]
                        image = parts[1]
                        print(f"   - {container_name} ({image})")
            else:
                print("   No running containers")
        else:
            print(f"❌  error: {result.stderr}")
    except subprocess.TimeoutExpired:
        print("❌  command timed out")
    except FileNotFoundError:
        print("❌  not found in PATH")
    except Exception as e:
        print(f"❌  check failed: {e}")

    print()

def main():
    """Main check routine"""
    print("Phase 13 Enhanced Features - System Installation Check")
    print("=" * 60)
    print()

    check_system_info()
    check_ai_packages()
    check_windows_specific()
    check_vllm_specific()
    check_triton_specific()
    check__services()

    print("=" * 60)
    print("INSTALLATION RECOMMENDATIONS")
    print("=" * 60)

    # Check if vLLM is missing
    try:
        import vllm
    except ImportError:
        print("📦 To install vLLM on Windows:")
        print("   pip install vllm")
        print("   # Or with CUDA support:")
        print("   pip install torch torchvision torchaudio --index-url https://download.pytorch.org/whl/cu121")
        print("   pip install vllm")
        print()

    # Check if Triton is missing
    try:
        import triton
    except ImportError:
        print("📦 To install Triton on Windows:")
        print("   pip install triton")
        print("   # Or latest version:")
        print("   pip install triton --upgrade")
        print()

    print("🚀 For Phase 13 enhanced features, ensure all packages are installed!")
    print("    services should be running for full functionality.")
    print()

if __name__ == "__main__":
    main()