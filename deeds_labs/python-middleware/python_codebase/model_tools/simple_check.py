import sys

print("=== PHASE 13 SYSTEM CHECK ===")
print(f"Python: {sys.version.split()[0]}")

# Check vLLM
try:
    import vllm
    print(f"vLLM: {vllm.__version__} - INSTALLED")
except ImportError:
    print("vLLM: NOT INSTALLED")

# Check Triton
try:
    import triton
    print(f"Triton: {triton.__version__} - INSTALLED")
except ImportError:
    print("Triton: NOT INSTALLED")

# Check PyTorch
try:
    import torch
    print(f"PyTorch: {torch.__version__} - INSTALLED")
    print(f"CUDA: {torch.cuda.is_available()}")
    if torch.cuda.is_available():
        print(f"GPU: {torch.cuda.get_device_name(0)}")
except ImportError:
    print("PyTorch: NOT INSTALLED")

# Check key packages
packages = ['transformers', 'fastapi', 'numpy', 'redis', 'psycopg2', 'requests']
for pkg in packages:
    try:
        module = __import__(pkg)
        version = getattr(module, '__version__', 'unknown')
        print(f"{pkg}: {version}")
    except ImportError:
        print(f"{pkg}: NOT INSTALLED")

print("\n=== DOCKER CHECK ===")
import subprocess
try:
    result = subprocess.run(['docker', 'ps', '--format', 'table {{.Names}}\t{{.Status}}'], 
                          capture_output=True, text=True, timeout=5)
    if result.returncode == 0:
        print("Docker containers:")
        print(result.stdout)
    else:
        print("Docker not running or error")
except Exception as e:
    print(f"Docker check failed: {e}")