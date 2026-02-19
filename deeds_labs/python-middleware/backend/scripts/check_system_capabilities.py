#!/usr/bin/env python3
"""
FastMCP System Capabilities Check
Verifies PyTorch, CUDA, ripgrep, awk, and libtorch installation
"""

import subprocess
import sys
import os
from pathlib import Path

def check_pytorch():
    """Check PyTorch installation and CUDA support"""
    print("🔍 Checking PyTorch...")
    try:
        import torch
        print(f"   ✅ PyTorch version: {torch.__version__}")
        print(f"   ✅ Installation path: {os.path.dirname(torch.__file__)}")

        # Check CUDA
        if torch.cuda.is_available():
            print(f"   ✅ CUDA available: True")
            print(f"   ✅ CUDA version: {torch.version.cuda}")
            print(f"   ✅ GPU device: {torch.cuda.get_device_name(0)}")
            print(f"   ✅ GPU memory: {torch.cuda.get_device_properties(0).total_memory / 1e9:.2f} GB")
            print(f"   ✅ cuDNN version: {torch.backends.cudnn.version()}")

            # Test CUDA tensor
            x = torch.randn(1000, 1000).cuda()
            y = torch.randn(1000, 1000).cuda()
            z = x @ y
            print(f"   ✅ CUDA tensor operations: Working")

            return {
                "installed": True,
                "cuda": True,
                "version": torch.__version__,
                "device": torch.cuda.get_device_name(0),
                "path": os.path.dirname(torch.__file__)
            }
        else:
            print(f"   ⚠️  CUDA available: False (CPU only)")
            return {
                "installed": True,
                "cuda": False,
                "version": torch.__version__,
                "path": os.path.dirname(torch.__file__)
            }
    except ImportError as e:
        print(f"   ❌ PyTorch not installed: {e}")
        return {"installed": False, "cuda": False}


def check_libtorch():
    """Check libtorch C++ libraries"""
    print("\n🔍 Checking libtorch (C++ interface)...")
    try:
        import torch
        torch_path = Path(torch.__file__).parent

        # Check for lib directory
        lib_dir = torch_path / "lib"
        if lib_dir.exists():
            print(f"   ✅ libtorch lib directory: {lib_dir}")

            # Count DLLs (Windows) or SOs (Linux)
            if sys.platform == "win32":
                libs = list(lib_dir.glob("*.dll"))
                print(f"   ✅ Found {len(libs)} DLL files")
            else:
                libs = list(lib_dir.glob("*.so*"))
                print(f"   ✅ Found {len(libs)} shared libraries")

            # Check for key libraries
            key_libs = ["c10.dll", "torch_cpu.dll", "torch_cuda.dll"] if sys.platform == "win32" else \
                       ["libc10.so", "libtorch_cpu.so", "libtorch_cuda.so"]

            for lib in key_libs:
                if any(lib in str(f) for f in libs):
                    print(f"   ✅ {lib}: Found")

        # Check for include directory
        include_dir = torch_path / "include"
        if include_dir.exists():
            print(f"   ✅ libtorch include directory: {include_dir}")

            # Check for torch/torch.h
            torch_header = include_dir / "torch" / "torch.h"
            if torch_header.exists():
                print(f"   ✅ torch/torch.h: Found")

            return {
                "installed": True,
                "lib_path": str(lib_dir),
                "include_path": str(include_dir)
            }
        else:
            print(f"   ⚠️  Include directory not found")
            return {"installed": False}

    except Exception as e:
        print(f"   ❌ Error checking libtorch: {e}")
        return {"installed": False}


def check_ripgrep():
    """Check ripgrep installation"""
    print("\n🔍 Checking ripgrep...")
    try:
        result = subprocess.run(
            ["rg", "--version"],
            capture_output=True,
            text=True,
            timeout=5
        )

        if result.returncode == 0:
            lines = result.stdout.strip().split('\n')
            version_line = lines[0] if lines else "Unknown"
            print(f"   ✅ ripgrep installed: {version_line}")

            # Check for SIMD acceleration
            for line in lines:
                if "simd" in line.lower():
                    print(f"   ✅ {line.strip()}")

            # Check for PCRE2 support
            for line in lines:
                if "PCRE2" in line:
                    print(f"   ✅ {line.strip()}")

            # Get path
            where_result = subprocess.run(
                ["where.exe" if sys.platform == "win32" else "which", "rg"],
                capture_output=True,
                text=True
            )
            if where_result.returncode == 0:
                print(f"   ✅ Path: {where_result.stdout.strip().split()[0]}")

            return {"installed": True, "version": version_line}
        else:
            print(f"   ❌ ripgrep check failed")
            return {"installed": False}

    except FileNotFoundError:
        print(f"   ❌ ripgrep not found in PATH")
        print(f"   💡 Install: choco install ripgrep (Windows) or brew install ripgrep (macOS)")
        return {"installed": False}
    except Exception as e:
        print(f"   ❌ Error: {e}")
        return {"installed": False}


def check_awk():
    """Check awk installation (Windows native via Git)"""
    print("\n🔍 Checking awk...")
    try:
        result = subprocess.run(
            ["awk", "--version"],
            capture_output=True,
            text=True,
            timeout=5
        )

        if result.returncode == 0:
            version_line = result.stdout.strip().split('\n')[0]
            print(f"   ✅ awk installed: {version_line}")

            # Get path
            where_result = subprocess.run(
                ["where.exe" if sys.platform == "win32" else "which", "awk"],
                capture_output=True,
                text=True
            )
            if where_result.returncode == 0:
                path = where_result.stdout.strip().split()[0]
                print(f"   ✅ Path: {path}")

                # Check if it's from Git (common on Windows)
                if "Git" in path:
                    print(f"   ℹ️  Source: Git for Windows")

            return {"installed": True, "version": version_line}
        else:
            print(f"   ❌ awk check failed")
            return {"installed": False}

    except FileNotFoundError:
        print(f"   ❌ awk not found in PATH")
        print(f"   💡 Install Git for Windows (includes awk)")
        return {"installed": False}
    except Exception as e:
        print(f"   ❌ Error: {e}")
        return {"installed": False}


def check_cmake():
    """Check CMake installation (needed for building C++ ranker)"""
    print("\n🔍 Checking CMake...")
    try:
        result = subprocess.run(
            ["cmake", "--version"],
            capture_output=True,
            text=True,
            timeout=5
        )

        if result.returncode == 0:
            version_line = result.stdout.strip().split('\n')[0]
            print(f"   ✅ CMake installed: {version_line}")
            return {"installed": True, "version": version_line}
        else:
            print(f"   ❌ CMake check failed")
            return {"installed": False}

    except FileNotFoundError:
        print(f"   ⚠️  CMake not found in PATH")
        print(f"   💡 Required for building C++ code quality ranker")
        print(f"   💡 Install: choco install cmake (Windows)")
        return {"installed": False}
    except Exception as e:
        print(f"   ❌ Error: {e}")
        return {"installed": False}


def generate_cmake_config(pytorch_info, libtorch_info):
    """Generate CMakeLists.txt configuration snippet"""
    print("\n📝 CMake Configuration for C++ Ranker:")
    print("="*70)

    if libtorch_info.get("installed"):
        torch_path = Path(libtorch_info["lib_path"]).parent
        print(f"""
# Add to CMakeLists.txt:

set(CMAKE_PREFIX_PATH "{torch_path}")
find_package(Torch REQUIRED)

# For CUDA support
if(TORCH_CUDA_AVAILABLE)
    enable_language(CUDA)
    set(CMAKE_CUDA_ARCHITECTURES 86)  # RTX 3060 Ti
endif()

include_directories(${{TORCH_INCLUDE_DIRS}})
target_link_libraries(code_quality_ranker "${{TORCH_LIBRARIES}}")
""")

        print(f"✅ Use this in backend/ml/CMakeLists.txt")
    else:
        print("⚠️  libtorch not found - install PyTorch first")

    print("="*70)


def test_cuda_performance():
    """Test CUDA performance with a quick benchmark"""
    print("\n⚡ Testing CUDA Performance...")
    try:
        import torch
        import time

        if not torch.cuda.is_available():
            print("   ⚠️  CUDA not available - skipping performance test")
            return

        # CPU benchmark
        x_cpu = torch.randn(5000, 5000)
        y_cpu = torch.randn(5000, 5000)

        start = time.time()
        z_cpu = x_cpu @ y_cpu
        cpu_time = time.time() - start

        print(f"   CPU matmul (5000x5000): {cpu_time*1000:.2f}ms")

        # GPU benchmark
        x_gpu = torch.randn(5000, 5000).cuda()
        y_gpu = torch.randn(5000, 5000).cuda()

        # Warmup
        _ = x_gpu @ y_gpu
        torch.cuda.synchronize()

        start = time.time()
        z_gpu = x_gpu @ y_gpu
        torch.cuda.synchronize()
        gpu_time = time.time() - start

        print(f"   GPU matmul (5000x5000): {gpu_time*1000:.2f}ms")
        print(f"   ✅ Speedup: {cpu_time/gpu_time:.2f}x faster on GPU")

        # Test embedding batch (realistic workload)
        batch_size = 100
        embed_dim = 768

        embeddings = torch.randn(batch_size, embed_dim).cuda()

        start = time.time()
        # Simulate embedding distance calculation
        distances = torch.cdist(embeddings, embeddings)
        torch.cuda.synchronize()
        embed_time = time.time() - start

        print(f"   Embedding batch ({batch_size}x{embed_dim}): {embed_time*1000:.2f}ms")
        print(f"   ✅ Throughput: {batch_size / embed_time:.2f} embeddings/sec")

    except Exception as e:
        print(f"   ❌ Performance test failed: {e}")


def print_summary(results):
    """Print final summary"""
    print("\n" + "="*70)
    print("📊 SYSTEM CAPABILITIES SUMMARY")
    print("="*70)

    pytorch = results.get("pytorch", {})
    libtorch = results.get("libtorch", {})
    ripgrep = results.get("ripgrep", {})
    awk = results.get("awk", {})
    cmake = results.get("cmake", {})

    print(f"\n{'Component':<20} {'Status':<15} {'Details'}")
    print("-"*70)

    # PyTorch
    status = "✅ Installed" if pytorch.get("installed") else "❌ Missing"
    details = f"v{pytorch.get('version', 'N/A')}"
    print(f"{'PyTorch':<20} {status:<15} {details}")

    # CUDA
    if pytorch.get("cuda"):
        print(f"{'CUDA Acceleration':<20} {'✅ Enabled':<15} {pytorch.get('device', 'N/A')}")
    else:
        print(f"{'CUDA Acceleration':<20} {'❌ Disabled':<15} CPU only")

    # libtorch
    status = "✅ Available" if libtorch.get("installed") else "❌ Missing"
    print(f"{'libtorch (C++)':<20} {status:<15}")

    # ripgrep
    status = "✅ Installed" if ripgrep.get("installed") else "❌ Missing"
    details = ripgrep.get("version", "").split()[0] if ripgrep.get("installed") else ""
    print(f"{'ripgrep':<20} {status:<15} {details}")

    # awk
    status = "✅ Installed" if awk.get("installed") else "❌ Missing"
    print(f"{'awk':<20} {status:<15}")

    # CMake
    status = "✅ Installed" if cmake.get("installed") else "⚠️  Missing"
    print(f"{'CMake':<20} {status:<15}")

    print("="*70)

    # Ready status
    all_critical = (
        pytorch.get("installed") and
        pytorch.get("cuda") and
        libtorch.get("installed") and
        ripgrep.get("installed")
    )

    if all_critical:
        print("\n✅ System ready for FastMCP with CUDA-accelerated code quality ranking!")
        print("\n🚀 Next steps:")
        print("   1. Build C++ ranker: cd backend/ml && mkdir build && cd build")
        print("   2. Configure CMake: cmake .. -DCMAKE_PREFIX_PATH=<see above>")
        print("   3. Build: cmake --build . --config Release")
        print("   4. Run batch indexer with GPU acceleration")
    else:
        print("\n⚠️  Some components missing:")
        if not pytorch.get("installed"):
            print("   - Install PyTorch: pip install torch torchvision torchaudio --index-url https://download.pytorch.org/whl/cu128")
        if not pytorch.get("cuda"):
            print("   - Install CUDA toolkit: https://developer.nvidia.com/cuda-downloads")
        if not ripgrep.get("installed"):
            print("   - Install ripgrep: choco install ripgrep")
        if not cmake.get("installed"):
            print("   - Install CMake: choco install cmake")

    print("="*70)


if __name__ == "__main__":
    print("🔍 FastMCP System Capabilities Check")
    print("="*70)

    results = {}

    # Run all checks
    results["pytorch"] = check_pytorch()
    results["libtorch"] = check_libtorch()
    results["ripgrep"] = check_ripgrep()
    results["awk"] = check_awk()
    results["cmake"] = check_cmake()

    # Generate CMake config if applicable
    if results["pytorch"].get("installed") and results["libtorch"].get("installed"):
        generate_cmake_config(results["pytorch"], results["libtorch"])

    # Performance test if CUDA available
    if results["pytorch"].get("cuda"):
        test_cuda_performance()

    # Print summary
    print_summary(results)
