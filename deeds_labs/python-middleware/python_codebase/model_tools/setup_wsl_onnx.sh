#!/bin/bash
# WSL TensorRT-LLM ONNX Setup Script
# Installs Python dependencies for ONNX export in WSL environment

set -e

echo "🚀 Setting up TensorRT-LLM ONNX environment in WSL..."

# Install Python and pip if not present
sudo apt install -y python3 python3-pip python3-venv

# Create virtual environment
python3 -m venv venv
source venv/bin/activate

# Upgrade pip
pip install --upgrade pip

# Install ONNX export dependencies (CPU versions for WSL)
echo "📦 Installing ONNX export dependencies..."
pip install torch torchvision torchaudio --index-url https://download.pytorch.org/whl/cpu
pip install transformers optimum onnxruntime huggingface_hub sentencepiece
pip install onnx

# Verify installations
echo "🔍 Verifying installations..."
python3 -c "import torch; print(f'PyTorch: {torch.__version__}')"
python3 -c "import transformers; print(f'Transformers: {transformers.__version__}')"
python3 -c "import optimum; print(f'Optimum: {optimum.__version__}')"

echo "✅ WSL TensorRT-LLM ONNX environment setup complete!"
echo ""
echo "🚀 Next steps:"
echo "1. source venv/bin/activate"
echo "2. python3 export_gemma3_270m_to_onnx.py"
echo "3. python3 export_embeddinggemma_to_onnx.py"
echo "4. python3 build_tensorrt_engine.py --model gemma3"
echo ""
echo "Note: This uses CPU PyTorch. For GPU acceleration, use NVIDIA Docker containers"