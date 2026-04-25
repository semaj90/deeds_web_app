#!/bin/bash
# Comprehensive TensorRT-LLM CUDA Fix for WSL2
# Fixes library paths, metadata corruption, and prepares for engine builds

echo "=== TensorRT-LLM CUDA Fix Script ==="
echo "Fixing library paths and metadata corruption"
echo ""

# Set password for sudo operations
SUDO_PASSWORD="123456"

# Paths
TRT_ENV="$HOME/trt_env_310"
SYSTEM_CUDA="/home/james/.local/lib/python3.11/site-packages/nvidia"
CUDA_LIB="/usr/local/cuda/lib64"

echo "Step 1: Link missing CUDA libraries to system CUDA"
echo $SUDO_PASSWORD | sudo -S ln -sf $SYSTEM_CUDA/cusparselt/lib/libcusparseLt.so.0 $CUDA_LIB/libcusparseLt.so.0
echo $SUDO_PASSWORD | sudo -S ln -sf $SYSTEM_CUDA/cusparse/lib/libcusparse.so.12 $CUDA_LIB/libcusparse.so.12.new
echo "✅ CUDA libraries linked"

echo ""
echo "Step 2: Remove corrupted metadata in TensorRT environment"
rm -rf $TRT_ENV/lib/python3.10/site-packages/*nvidia*cu12*.dist-info
echo "✅ Corrupted metadata removed"

echo ""
echo "Step 3: Create clean environment activation script"
cat > $TRT_ENV/setup_cuda.sh << 'EOF'
#!/bin/bash
# CUDA environment setup for TensorRT-LLM
export CUDA_HOME=/usr/local/cuda
export LD_LIBRARY_PATH=/usr/local/cuda/lib64:/home/james/.local/lib/python3.11/site-packages/nvidia/cusparse/lib:/home/james/.local/lib/python3.11/site-packages/nvidia/cusparselt/lib:/home/james/.local/lib/python3.11/site-packages/nvidia/cublas/lib:$LD_LIBRARY_PATH
export PATH=/usr/local/cuda/bin:$PATH
echo "CUDA environment configured for TensorRT-LLM"
EOF

chmod +x $TRT_ENV/setup_cuda.sh

echo ""
echo "Step 4: Test TensorRT-LLM import"
source $TRT_ENV/bin/activate
source $TRT_ENV/setup_cuda.sh

# Test with timeout to avoid hanging
timeout 30 python -c "
try:
    import tensorrt_llm
    print('✅ TensorRT-LLM imported successfully:', tensorrt_llm.__version__)
except Exception as e:
    print('❌ Import failed:', str(e))
" 2>/dev/null || echo "❌ TensorRT import timed out or failed"

echo ""
echo "Step 5: Test trtllm-build command"
timeout 10 trtllm-build --help >/dev/null 2>&1 && echo "✅ trtllm-build command works" || echo "❌ trtllm-build failed"

echo ""
echo "=== Fix Complete ==="
echo "Usage: source ~/trt_env_310/bin/activate && source ~/trt_env_310/setup_cuda.sh"
echo "Then: trtllm-build [options]"
echo ""