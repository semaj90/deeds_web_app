#!/usr/bin/env bash
# TensorRT-LLM Gemma3 Environment Setup for WSL2 Ubuntu 24.04
# Pins exact versions per NVIDIA release matrix for gemma3.plan success
# Target: RTX 3060 Ti + AWQ4 quantized inference

set -e

echo "🚀 TensorRT-LLM Gemma3 Environment Setup"
echo "Target: gemma3.plan engine for RTX 3060 Ti"
echo "Stack: Python 3.10 + torch 2.7.1 + CUDA 12.4 + TensorRT-LLM 1.1.0rc5"
echo "=" * 80

# ============================================================================
# PREREQUISITE CHECKS
# ============================================================================

echo "🔍 Checking existing installations..."

# Check if CUDA 12.4 is already installed
CUDA_INSTALLED=false
if command -v nvcc >/dev/null 2>&1; then
    CUDA_VERSION=$(nvcc --version | grep "release" | sed 's/.*release //' | sed 's/,.*//')
    if [[ "$CUDA_VERSION" == "12.4" ]]; then
        echo "✅ CUDA 12.4 already installed"
        CUDA_INSTALLED=true
    else
        echo "⚠️  CUDA $CUDA_VERSION found (need 12.4)"
    fi
else
    echo "❌ CUDA not found"
fi

# Check if Python 3.10 is available (system or in existing venv)
PYTHON310_AVAILABLE=false
if command -v python3.10 >/dev/null 2>&1; then
    PYTHON_VERSION=$(python3.10 --version | cut -d' ' -f2)
    echo "✅ Python 3.10 available (system): $PYTHON_VERSION"
    PYTHON310_AVAILABLE=true
elif [ -f ~/trt_env_310/bin/python ]; then
    # Check Python version in existing trt_env_310
    VENV_PYTHON_VERSION=$(~/trt_env_310/bin/python --version 2>&1 | grep -o "3\.10\.[0-9]*" || echo "")
    if [[ -n "$VENV_PYTHON_VERSION" ]]; then
        echo "✅ Python 3.10 available (trt_env_310): $VENV_PYTHON_VERSION"
        PYTHON310_AVAILABLE=true
    else
        echo "❌ Python 3.10 not found in trt_env_310"
    fi
elif [ -f ~/trt_gemma3_env/bin/python ]; then
    # Check Python version in fallback venv
    VENV_PYTHON_VERSION=$(~/trt_gemma3_env/bin/python --version 2>&1 | grep -o "3\.10\.[0-9]*" || echo "")
    if [[ -n "$VENV_PYTHON_VERSION" ]]; then
        echo "✅ Python 3.10 available (trt_gemma3_env): $VENV_PYTHON_VERSION"
        PYTHON310_AVAILABLE=true
    else
        echo "❌ Python 3.10 not found in virtual environments"
    fi
else
    echo "❌ Python 3.10 not found"
fi

# Check if virtual environment already exists (prefer existing trt_env_310)
VENV_EXISTS=false
PYTORCH_INSTALLED=false
TENSORRT_INSTALLED=false
VENV_PATH=""

# Check for existing trt_env_310 first, then trt_gemma3_env
if [ -d ~/trt_env_310 ] && [ -f ~/trt_env_310/bin/python ]; then
    echo "✅ Found existing virtual environment ~/trt_env_310"
    VENV_EXISTS=true
    VENV_PATH="~/trt_env_310"
elif [ -d ~/trt_gemma3_env ] && [ -f ~/trt_gemma3_env/bin/python ]; then
    echo "✅ Found virtual environment ~/trt_gemma3_env"
    VENV_EXISTS=true
    VENV_PATH="~/trt_gemma3_env"
fi

if [ "$VENV_EXISTS" = true ]; then
    # Check if PyTorch 2.7.1 is installed in the venv
    if [ -f $VENV_PATH/bin/activate ]; then
        source $VENV_PATH/bin/activate 2>/dev/null || true

        # Check PyTorch version
        PYTORCH_VERSION=$(python -c "import torch; print(torch.__version__)" 2>/dev/null || echo "not_found")
        if echo "$PYTORCH_VERSION" | grep -q "2.7.1"; then
            echo "✅ PyTorch 2.7.1 already installed in venv: $PYTORCH_VERSION"
            PYTORCH_INSTALLED=true
        elif [[ "$PYTORCH_VERSION" != "not_found" ]]; then
            echo "⚠️  PyTorch found but not version 2.7.1: $PYTORCH_VERSION"
            PYTORCH_INSTALLED=false
        else
            echo "❌ PyTorch not found in venv"
            PYTORCH_INSTALLED=false
        fi

        # Check if TensorRT-LLM is installed
        TENSORRT_VERSION=$(python -c "import tensorrt_llm; print(tensorrt_llm.__version__)" 2>/dev/null || echo "not_found")
        if echo "$TENSORRT_VERSION" | grep -q "1.1.0rc5"; then
            echo "✅ TensorRT-LLM 1.1.0rc5 already installed: $TENSORRT_VERSION"
            TENSORRT_INSTALLED=true
        elif [[ "$TENSORRT_VERSION" != "not_found" ]]; then
            echo "⚠️  TensorRT-LLM found but not version 1.1.0rc5: $TENSORRT_VERSION"
            TENSORRT_INSTALLED=false
        else
            echo "❌ TensorRT-LLM not found in venv"
            TENSORRT_INSTALLED=false
        fi

        deactivate 2>/dev/null || true
    fi
elif [ -d ~/trt_env_310 ]; then
    echo "⚠️  Directory ~/trt_env_310 exists but appears corrupted (missing python binary)"
    VENV_EXISTS=false
elif [ -d ~/trt_gemma3_env ]; then
    echo "⚠️  Directory ~/trt_gemma3_env exists but appears corrupted (missing python binary)"
    VENV_EXISTS=false
else
    echo "❌ Virtual environment not found"
fi

# Check if activation script exists
ACTIVATION_SCRIPT_EXISTS=false
if [ -f ~/activate_trt_gemma3.sh ]; then
    echo "✅ Activation script already exists"
    ACTIVATION_SCRIPT_EXISTS=true
else
    echo "❌ Activation script not found"
fi

# Check if build script exists
BUILD_SCRIPT_EXISTS=false
if [ -f ~/build_gemma3_engine.sh ]; then
    echo "✅ Build script already exists"
    BUILD_SCRIPT_EXISTS=true
else
    echo "❌ Build script not found"
fi

# Summary of what needs to be done
echo ""
echo "📋 Installation Summary:"
echo "CUDA 12.4:        $([ "$CUDA_INSTALLED" = true ] && echo "✅ Installed" || echo "❌ Needs installation")"
echo "Python 3.10:      $([ "$PYTHON310_AVAILABLE" = true ] && echo "✅ Available" || echo "❌ Needs installation")"
echo "Virtual env:       $([ "$VENV_EXISTS" = true ] && echo "✅ Exists" || echo "❌ Needs creation")"
echo "PyTorch 2.7.1:     $([ "$PYTORCH_INSTALLED" = true ] && echo "✅ Installed" || echo "❌ Needs installation")"
echo "TensorRT-LLM:      $([ "$TENSORRT_INSTALLED" = true ] && echo "✅ Installed" || echo "❌ Needs installation")"
echo "Activation script: $([ "$ACTIVATION_SCRIPT_EXISTS" = true ] && echo "✅ Exists" || echo "❌ Needs creation")"
echo "Build script:      $([ "$BUILD_SCRIPT_EXISTS" = true ] && echo "✅ Exists" || echo "❌ Needs creation")"
echo ""

# Check if everything is already installed
if [ "$CUDA_INSTALLED" = true ] && [ "$PYTHON310_AVAILABLE" = true ] && [ "$VENV_EXISTS" = true ] && \
   [ "$PYTORCH_INSTALLED" = true ] && [ "$TENSORRT_INSTALLED" = true ] && \
   [ "$ACTIVATION_SCRIPT_EXISTS" = true ] && [ "$BUILD_SCRIPT_EXISTS" = true ]; then
    echo "🎉 All components already installed!"
    echo "💡 You can proceed directly to building Gemma3 engine:"
    echo "   source ~/activate_trt_gemma3.sh"
    echo "   ~/build_gemma3_engine.sh"
    exit 0
fi

# Ask user if they want to proceed with missing installations
echo "❓ Some components are missing. Continue with installation? (y/N)"
read -r response
if [[ ! "$response" =~ ^[Yy]$ ]]; then
    echo "Installation cancelled."
    exit 0
fi

echo ""

# ============================================================================
# 1. SYSTEM PREPARATION
# ============================================================================

echo "🔧 Step 1: System preparation and cleanup"

# Update system packages
sudo apt update && sudo apt upgrade -y

# Remove any existing CUDA installations to avoid conflicts
echo "Removing existing CUDA installations..."
sudo apt remove --purge cuda* nvidia-cuda-toolkit -y || true
sudo apt autoremove -y

# Remove existing Python virtual environments that might conflict
rm -rf ~/trt_env_* || true

# Install essential build tools
sudo apt install -y build-essential wget curl git python3-pip python3-venv

# ============================================================================
# 2. CUDA 12.4 INSTALLATION (EXACT VERSION)
# ============================================================================

if [ "$CUDA_INSTALLED" = false ]; then
    echo "🔧 Step 2: Installing CUDA 12.4 (exact version for TensorRT-LLM)"

    # Update packages and install prerequisites
    sudo apt update && sudo apt upgrade -y
    sudo apt install -y build-essential cmake wget git curl unzip software-properties-common

    # Add NVIDIA CUDA 12.4 repo and install
    wget -q https://developer.download.nvidia.com/compute/cuda/repos/ubuntu2404/x86_64/cuda-ubuntu2404.pin
    sudo mv cuda-ubuntu2404.pin /etc/apt/preferences.d/cuda-repository-pin-600
    wget -q https://developer.download.nvidia.com/compute/cuda/12.4.0/local_installers/cuda-repo-ubuntu2404-12-4-local_12.4.105-1_amd64.deb
    sudo dpkg -i cuda-repo-ubuntu2404-12-4-local_12.4.105-1_amd64.deb
    sudo cp /var/cuda-repo-ubuntu2404-12-4-local/cuda-*-keyring.gpg /usr/share/keyrings/
    sudo apt update
    sudo apt install -y cuda-toolkit-12-4 libcusparse-dev

    # Set CUDA environment variables
    echo 'export CUDA_HOME=/usr/local/cuda-12.4' >> ~/.bashrc
    echo 'export PATH=/usr/local/cuda-12.4/bin:$PATH' >> ~/.bashrc
    echo 'export LD_LIBRARY_PATH=/usr/local/cuda-12.4/lib64:$LD_LIBRARY_PATH' >> ~/.bashrc

    # Create standard symlinks
    sudo ln -sf /usr/local/cuda-12.4 /usr/local/cuda

    # Reload environment
    source ~/.bashrc

    # Verify CUDA installation
    echo "Verifying CUDA 12.4 installation..."
    /usr/local/cuda/bin/nvcc --version
else
    echo "⏭️  Step 2: Skipping CUDA installation (already installed)"
fi

# ============================================================================
# 3. PYTHON 3.10 VIRTUAL ENVIRONMENT
# ============================================================================

if [ "$PYTHON310_AVAILABLE" = false ]; then
    echo "🔧 Step 3a: Installing Python 3.10"
    sudo apt install -y python3.10 python3.10-venv python3.10-dev python3-pip
else
    echo "⏭️  Step 3a: Python 3.10 already available"
fi

if [ "$VENV_EXISTS" = false ]; then
    echo "🔧 Step 3b: Creating Python 3.10 virtual environment"
    # Use trt_env_310 to match existing naming
    python3.10 -m venv ~/trt_env_310
    VENV_PATH="~/trt_env_310"
    source ~/trt_env_310/bin/activate

    # Upgrade pip and essential tools
    pip install --upgrade pip setuptools wheel --no-cache-dir

    # Verify Python version
    python --version
    echo "Python environment: $(which python)"
else
    echo "⏭️  Step 3b: Using existing virtual environment: $VENV_PATH"
    # Convert tilde to absolute path for source command
    VENV_ABS_PATH=$(eval echo $VENV_PATH)
    source $VENV_ABS_PATH/bin/activate
fi

# ============================================================================
# 4. PYTORCH 2.7.1 NIGHTLY (CUDA 12.4 COMPATIBLE)
# ============================================================================

if [ "$PYTORCH_INSTALLED" = false ]; then
    echo "🔧 Step 4: Installing PyTorch 2.7.1 nightly with CUDA 12.4"

    # Uninstall any existing PyTorch installations
    pip uninstall -y torch torchvision torchaudio || true

    # Install PyTorch 2.7.1 nightly with CUDA 12.6 (cu126 for better compatibility)
    pip install --pre torch==2.7.1+cu126 torchvision==0.22.1+cu126 torchaudio==2.1.0 \
        -f https://download.pytorch.org/whl/nightly/cu126/torch_nightly.html --no-cache-dir

    # Verify PyTorch CUDA support
    python -c "
import torch
print(f'PyTorch version: {torch.__version__}')
print(f'CUDA available: {torch.cuda.is_available()}')
print(f'CUDA version: {torch.version.cuda}')
print(f'GPU count: {torch.cuda.device_count()}')
if torch.cuda.is_available():
    print(f'GPU name: {torch.cuda.get_device_name(0)}')
"
else
    echo "⏭️  Step 4: PyTorch 2.7.1 already installed"
    # Still verify it works
    python -c "import torch; print(f'✅ PyTorch {torch.__version__} CUDA: {torch.cuda.is_available()}')"
fi

# ============================================================================
# 5. NUMPY < 2 (TENSORRT-LLM REQUIREMENT)
# ============================================================================

echo "🔧 Step 5: Installing numpy < 2 and supporting packages"
pip install "numpy<2" safetensors jsonlines --no-cache-dir

# ============================================================================
# 6. TENSORRT-LLM 1.1.0RC5 INSTALLATION
# ============================================================================

if [ "$TENSORRT_INSTALLED" = false ]; then
    echo "🔧 Step 6: Installing TensorRT-LLM 1.1.0rc5"

    # Install TensorRT-LLM from NVIDIA pypi
    pip install tensorrt-llm==1.1.0rc5 --extra-index-url https://pypi.nvidia.com --no-cache-dir

    # Install additional requirements for TensorRT-LLM
    pip install transformers datasets accelerate optimum --no-cache-dir
else
    echo "⏭️  Step 6: TensorRT-LLM already installed"
fi

# ============================================================================
# 7. VERIFICATION & TESTING
# ============================================================================

echo "🔧 Step 7: Verification and testing"

# Test TensorRT-LLM import
python -c "
try:
    import tensorrt_llm
    print(f'✅ TensorRT-LLM version: {tensorrt_llm.__version__}')
    print('✅ TensorRT-LLM imported successfully')
except Exception as e:
    print(f'❌ TensorRT-LLM import failed: {e}')
    exit(1)
"

# Test trtllm-build command availability
which trtllm-build
trtllm-build --help | head -5

# Check for critical libraries
python -c "
import torch
import tensorrt_llm
import numpy as np
print('✅ All critical libraries loaded successfully')
print(f'Environment ready for Gemma3 .plan build')
"

# ============================================================================
# 8. ENVIRONMENT ACTIVATION SCRIPT
# ============================================================================

if [ "$ACTIVATION_SCRIPT_EXISTS" = false ]; then
    echo "🔧 Step 8: Creating activation script"

    # Create activation script for future use with detected venv path
    VENV_ABS_PATH=$(eval echo $VENV_PATH)
    cat > ~/activate_trt_gemma3.sh << EOF
#!/bin/bash
# Activate TensorRT-LLM Gemma3 environment

export CUDA_HOME=/usr/local/cuda-12.4
export PATH=/usr/local/cuda-12.4/bin:\$PATH
export LD_LIBRARY_PATH=/usr/local/cuda-12.4/lib64:\$LD_LIBRARY_PATH

source $VENV_ABS_PATH/bin/activate

echo "🚀 TensorRT-LLM Gemma3 environment activated"
echo "Environment: $VENV_ABS_PATH"
echo "Python: \$(python --version)"
echo "PyTorch: \$(python -c 'import torch; print(torch.__version__)')"
echo "CUDA: \$(python -c 'import torch; print(torch.version.cuda)')"
echo "TensorRT-LLM: \$(python -c 'import tensorrt_llm; print(tensorrt_llm.__version__)')"
echo ""
echo "Ready to build gemma3.plan engines!"
EOF

    chmod +x ~/activate_trt_gemma3.sh
else
    echo "⏭️  Step 8: Activation script already exists"
fi

# ============================================================================
# 9. GEMMA3 ENGINE BUILD SCRIPT
# ============================================================================

if [ "$BUILD_SCRIPT_EXISTS" = false ]; then
    echo "🔧 Step 9: Creating Gemma3 engine build script"

    # Create ready-to-use build script
    cat > ~/build_gemma3_engine.sh << 'EOF'
#!/bin/bash
# Build Gemma3 TensorRT engine with exact environment

set -e

# Activate environment
source ~/activate_trt_gemma3.sh

echo "🚀 Building Gemma3 TensorRT Engine"
echo "Input: /home/james/gemma3_awq4"
echo "Output: /home/james/gemma3_engine_final"

# Ensure AWQ4 model exists
if [ ! -d "/home/james/gemma3_awq4" ]; then
    echo "❌ AWQ4 model not found at /home/james/gemma3_awq4"
    echo "Please ensure the quantized model is available"
    exit 1
fi

# Create output directory
mkdir -p /home/james/gemma3_engine_final

# Build TensorRT engine with RTX 3060 Ti optimizations
trtllm-build \
  --checkpoint_dir /home/james/gemma3_awq4 \
  --output_dir /home/james/gemma3_engine_final \
  --gemma_version 3 \
  --dtype int4 \
  --max_batch_size 4 \
  --max_input_len 2048 \
  --max_seq_len 4096 \
  --enable_kv_cache \
  --use_flash_attention \
  --strongly_typed \
  --workers 1 \
  --log_level info

echo "✅ Gemma3 TensorRT engine build complete!"

# Verify .plan files
PLAN_FILES=$(find /home/james/gemma3_engine_final -name "*.plan" 2>/dev/null || true)
if [ -n "$PLAN_FILES" ]; then
    echo "🎯 Generated .plan files:"
    for plan in $PLAN_FILES; do
        size=$(du -h "$plan" | cut -f1)
        echo "  📄 $(basename "$plan"): $size"
    done
    echo ""
    echo "🚀 Ready for Go TensorRTEngine integration!"
    echo "   Engine path: /home/james/gemma3_engine_final"
else
    echo "❌ No .plan files generated - build may have failed"
    exit 1
fi
EOF

    chmod +x ~/build_gemma3_engine.sh
else
    echo "⏭️  Step 9: Build script already exists"
fi

# ============================================================================
# 10. FINAL INSTRUCTIONS
# ============================================================================

echo ""
echo "🎉 TensorRT-LLM Gemma3 Environment Setup Complete!"
echo "=" * 80
echo ""
echo "📋 Environment Summary:"
echo "  🐍 Python: $(python --version)"
echo "  🔥 PyTorch: $(python -c 'import torch; print(torch.__version__)')"
echo "  ⚡ CUDA: 12.4.0"
echo "  🚀 TensorRT-LLM: $(python -c 'import tensorrt_llm; print(tensorrt_llm.__version__)')"
echo "  📊 NumPy: $(python -c 'import numpy; print(numpy.__version__)')"
echo ""
echo "🚀 Ready to build gemma3.plan!"
echo ""
echo "📝 Usage Instructions:"
echo "  1. Activate environment: source ~/activate_trt_gemma3.sh"
echo "  2. Build Gemma3 engine: ~/build_gemma3_engine.sh"
echo "  3. Use .plan with Go TensorRTEngine struct"
# Get final environment path for summary
FINAL_VENV_PATH=$(eval echo $VENV_PATH)
echo ""
echo "📂 Key Paths:"
echo "  🔧 Environment: $FINAL_VENV_PATH/"
echo "  ⚙️  Activation: ~/activate_trt_gemma3.sh"
echo "  🏗️  Build script: ~/build_gemma3_engine.sh"
echo "  📄 Input AWQ4: /home/james/gemma3_awq4"
echo "  🎯 Output .plan: /home/james/gemma3_engine_final"
echo ""
echo "💡 Next Steps:"
echo "  1. Run: source ~/activate_trt_gemma3.sh"
echo "  2. Run: ~/build_gemma3_engine.sh"
echo "  3. Integrate with gpu-memory-manager.go TensorRTEngine struct"
echo ""
echo "🔍 Troubleshooting:"
echo "  - If build fails, check CUDA toolkit installation"
echo "  - Ensure AWQ4 model is present and valid"
echo "  - Verify GPU has sufficient VRAM (6GB+ for AWQ4)"
echo ""
echo "Environment is now ready for production-grade Gemma3 TensorRT engines!"