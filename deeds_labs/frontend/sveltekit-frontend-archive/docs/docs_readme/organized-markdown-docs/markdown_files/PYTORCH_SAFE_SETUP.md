# PyTorch-Safe Environment Setup

This setup ensures **ZERO interference** with your existing PyTorch installation while providing a fully functional legal NLP service.

## 🛡️ Protection Features

- **Complete environment isolation** using virtual environments
- **PyTorch preservation** - never modifies your existing installation
- **Custom .env configuration** for user-specific settings
- **Conditional package installation** - only installs what's needed
- **Fallback modes** - works even without PyTorch for basic features

## 🚀 Quick Start

### 1. Run the PyTorch-Safe Setup

```powershell
# Basic setup (recommended)
.\setup-pytorch-isolated.ps1

# Force reinstall if needed
.\setup-pytorch-isolated.ps1 -ForceReinstall

# Skip PyTorch entirely (limited AI features)
.\setup-pytorch-isolated.ps1 -SkipPyTorch

# Verbose output for troubleshooting
.\setup-pytorch-isolated.ps1 -Verbose
```

### 2. Test Environment Isolation

```powershell
# Verify everything is properly isolated
.\test-environment-isolation.ps1
```

### 3. Activate and Run

```powershell
# Activate the isolated environment
& ".\venv-legal-nlp\Scripts\Activate.ps1"

# Start the NLP service
cd python-nlp-service
python main.py
```

## ⚙️ Configuration (.env)

The setup creates a `.env` file with safe defaults:

```env
# Environment Isolation
PYTHON_VENV_PATH=./venv-legal-nlp
PRESERVE_USER_PYTORCH=true
SKIP_PYTORCH_INSTALL=false
REQUIREMENTS_FILE=requirements-safe.txt

# PyTorch Settings (only affects isolated environment)
PYTORCH_INDEX_URL=
FALLBACK_TO_CPU=true
ENABLE_GPU_ACCELERATION=auto

# Environment Protection
PYTHONPATH=
VIRTUAL_ENV_DISABLE_PROMPT=true
PIP_USER=false
```

## 📦 Package Installation Strategy

### Phase 1: Safe Base Packages
- FastAPI, NumPy, OpenCV (CPU), OCR tools
- No PyTorch dependencies
- Installed from `requirements-safe.txt`

### Phase 2: PyTorch Detection
- Checks your global PyTorch installation
- Preserves existing version/configuration
- Installs compatible version in isolated environment

### Phase 3: AI Packages (Conditional)
- SentenceTransformers, YOLO, Whisper
- Only installed if PyTorch is available
- Uses `requirements-pytorch.txt`

## 🔍 What Gets Protected

### Your Global Environment
- ✅ PyTorch version and configuration
- ✅ CUDA drivers and settings
- ✅ Python packages and versions
- ✅ Conda/pip environment state
- ✅ System PATH and environment variables

### Our Isolated Environment
- 🏗️ Separate virtual environment
- 🧠 Legal NLP service packages
- 📊 Compatible AI libraries
- 🔧 Service-specific configuration

## 🧪 Verification Commands

### Check Global PyTorch (should be unchanged)
```powershell
python -c "import torch; print(f'PyTorch {torch.__version__} at {torch.__file__}')"
```

### Check Isolated Environment
```powershell
& ".\venv-legal-nlp\Scripts\Activate.ps1"
python -c "import torch; print(f'PyTorch {torch.__version__} at {torch.__file__}')"
```

### Run Full Test Suite
```powershell
.\test-environment-isolation.ps1
```

## 🚨 Troubleshooting

### Issue: "PyTorch version conflict"
```powershell
# Solution: Force clean reinstall
.\setup-pytorch-isolated.ps1 -ForceReinstall -Verbose
```

### Issue: "CUDA not working in service"
```powershell
# Solution: Check CUDA settings in .env
# Edit .env and set:
PYTORCH_INDEX_URL=https://download.pytorch.org/whl/cu118
CUDA_VISIBLE_DEVICES=0
```

### Issue: "Import errors in Python service"
```powershell
# Solution: Ensure virtual environment is activated
& ".\venv-legal-nlp\Scripts\Activate.ps1"
cd python-nlp-service
python main.py
```

### Issue: "Service won't start"
```powershell
# Check all dependencies
.\test-environment-isolation.ps1

# Reinstall with verbose output
.\setup-pytorch-isolated.ps1 -ForceReinstall -Verbose
```

## 📁 File Structure

```
project/
├── .env                           # Your custom configuration
├── .env.example                   # Template with safe defaults
├── setup-pytorch-isolated.ps1    # Main setup script
├── test-environment-isolation.ps1 # Verification script
├── venv-legal-nlp/               # Isolated virtual environment
├── python-nlp-service/
│   ├── main.py                   # Protected NLP service
│   ├── requirements-safe.txt     # Base packages (no PyTorch)
│   └── requirements-pytorch.txt  # AI packages (conditional)
└── models/                       # Your GGUF models
```

## ✅ Success Indicators

When setup is complete, you should see:

```
🎉 Setup Complete! Your PyTorch installation is preserved.
=======================================================

🚀 To start the NLP service:
   1. Activate environment: & '.\venv-legal-nlp\Scripts\Activate.ps1'
   2. cd python-nlp-service
   3. python main.py

🛡️  Environment Protection:
   Virtual Environment: .\venv-legal-nlp
   User PyTorch Preserved: true
   Global PyTorch: true
```

## 🔧 Advanced Configuration

### Custom PyTorch Version
```env
# In .env file
PYTORCH_INDEX_URL=https://download.pytorch.org/whl/cu121
```

### Skip PyTorch Entirely
```env
# In .env file
SKIP_PYTORCH_INSTALL=true
```

### CPU-Only Mode
```env
# In .env file
PYTORCH_INDEX_URL=https://download.pytorch.org/whl/cpu
USE_GPU=false
```

## 🤝 Support

If you encounter issues:

1. Run `.\test-environment-isolation.ps1` for diagnostics
2. Check your `.env` file settings
3. Try `.\setup-pytorch-isolated.ps1 -ForceReinstall -Verbose`
4. Ensure you're activating the virtual environment before starting the service

The setup is designed to be completely safe - it will never modify your existing PyTorch installation.
