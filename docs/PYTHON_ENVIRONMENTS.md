# Python Virtual Environments - deeds-web-app

## Overview

This project uses multiple Python virtual environments for different purposes. This document clarifies their purpose, setup, and usage.

---

## 📦 Active Environments

### 1. `.venv` (Primary - Phase 72+)
**Location:** `C:\Users\james\Videos\deeds-web-app\.venv`
**Python:** 3.13.5
**Purpose:** Main development environment with GPU/CUDA support

**Contains:**
- PyTorch 2.9.0+cu128
- TensorRT-LLM integration
- LangChain components
- CrewAI agents
- Drizzle-related Python tools

**Activation:**
```powershell
# PowerShell
C:\Users\james\Videos\deeds-web-app\.venv\Scripts\Activate.ps1

# Or via env var
$env:PHASE72_PYTHON = "C:\Users\james\Videos\deeds-web-app\.venv\Scripts\python.exe"
```

**Usage:**
```bash
# GPU vectorization
$env:PHASE72_PYTHON -c "import torch; print('CUDA:', torch.cuda.is_available())"

# Phase 66 agent
$env:PHASE72_PYTHON scripts/phase66_automated_error_fixer.py
```

---

### 2. `.venv-phase46` (Legacy)
**Location:** `C:\Users\james\Videos\deeds-web-app\.venv-phase46`
**Python:** 3.10.x (older)
**Purpose:** Legacy scripts from Phase 46

**Status:** ⚠️ May be deprecated - consider consolidating to `.venv`

---

### 3. `python_codebase/third_party_integrations/ubuntu_tensorrt/`
**Location:** `python_codebase/third_party_integrations/ubuntu_tensorrt/`
**Purpose:** TensorRT-specific environments (Linux/WSL oriented)

**Sub-environments:**
- `tensorrt_new_env/` - TensorRT 10.x
- `trt_env/` - TensorRT 8.x

**Status:** ⚠️ These contain symlinks that break on Windows - exclude from git

---

### 4. `.python311` (Legacy)
**Location:** `C:\Users\james\Videos\deeds-web-app\.python311`
**Purpose:** Python 3.11 environment (legacy)

**Status:** ⚠️ Contains symlinks - exclude from git

---

## ⚠️ Git Exclusions

Add to `.gitignore` to prevent symlink errors:

```gitignore
# Python virtual environments (contain symlinks)
.venv/
.venv-phase46/
.python311/
python_codebase/third_party_integrations/ubuntu_tensorrt/trt_env/
python_codebase/third_party_integrations/ubuntu_tensorrt/tensorrt_new_env/
tensorrt_py310_env/

# Python cache
__pycache__/
*.py[cod]
*.pyo
*.pyd
.Python
build/
develop-eggs/
dist/
downloads/
eggs/
.eggs/
lib64/
parts/
sdist/
var/
wheels/
pip-wheel-metadata/
share/python-wheels/
*.egg-info/
.installed.cfg
*.egg
MANIFEST
```

---

## 🛠️ Setup Instructions

### Create Primary Environment
```powershell
# Create new venv with Python 3.13
python -m venv .venv

# Activate
.\.venv\Scripts\Activate.ps1

# Install core dependencies
pip install --upgrade pip
pip install torch==2.9.0+cu128 --index-url https://download.pytorch.org/whl/cu128
pip install crewai crewai-tools langchain langchain-ollama qdrant-client
```

### Verify GPU Support
```powershell
.\.venv\Scripts\python.exe -c "import torch; print('CUDA available:', torch.cuda.is_available()); print('Device:', torch.cuda.get_device_name(0) if torch.cuda.is_available() else 'N/A')"
```

Expected output:
```
CUDA available: True
Device: NVIDIA GeForce RTX 3060 Ti
```

---

## 📋 Environment Variables

### VS Code Settings (`.vscode/settings.json`)
```json
{
  "python.defaultInterpreterPath": "${workspaceFolder}/.venv/Scripts/python.exe",
  "python.terminal.activateEnvironment": true,
  "terminal.integrated.env.windows": {
    "PHASE72_PYTHON": "C:\\Users\\james\\Videos\\deeds-web-app\\.venv\\Scripts\\python.exe"
  }
}
```

### Package.json Scripts
```json
{
  "scripts": {
    "phase66:agent": "cross-env PHASE72_PYTHON=.venv/Scripts/python.exe node scripts/run-phase66-agent.mjs",
    "phase72:gpu": "cross-env PHASE72_PYTHON=.venv/Scripts/python.exe node scripts/phase72-gpu-pipeline.mjs"
  }
}
```

---

## 🔧 Troubleshooting

### Error: `Function not implemented` (symlinks)
**Cause:** Git trying to add symlinked files from Python environments
**Solution:** Add environments to `.gitignore`

```bash
# If already tracked, remove from git
git rm -r --cached .venv/
git rm -r --cached .python311/
```

### Error: `pip: command not found`
**Cause:** Environment not activated
**Solution:** Activate the environment first

```powershell
.\.venv\Scripts\Activate.ps1
```

### Error: `torch.cuda.is_available()` returns False
**Cause:** Wrong PyTorch version installed
**Solution:** Reinstall with CUDA support

```bash
pip uninstall torch
pip install torch==2.9.0+cu128 --index-url https://download.pytorch.org/whl/cu128
```

### Error: `openai` dependency conflict
**Cause:** langchain-openai requires newer openai
**Solution:**

```bash
pip install --upgrade openai langchain-openai
```

---

## 📊 Dependency Summary

| Package | Version | Purpose |
|---------|---------|---------|
| torch | 2.9.0+cu128 | GPU tensor operations |
| crewai | 0.9.x | AI agent orchestration |
| langchain | 0.3.x | LLM chains and tools |
| langchain-ollama | 0.3.x | Local Ollama integration |
| qdrant-client | 1.12.x | Vector database client |
| litellm | 1.x | Multi-LLM abstraction |
| openai | 1.109+ | OpenAI API client |

---

## 🗄️ Environment Consolidation Plan

### Recommended Structure
```
deeds-web-app/
├── .venv/                  # Primary Python 3.13 + CUDA
├── docs/
│   └── PYTHON_ENVIRONMENTS.md  # This file
└── .gitignore              # Excludes all venvs
```

### Migration Steps
1. Export current packages: `pip freeze > requirements.txt`
2. Create new consolidated `.venv`
3. Install from requirements: `pip install -r requirements.txt`
4. Update all scripts to use `$env:PHASE72_PYTHON`
5. Delete legacy environments (`.venv-phase46`, `.python311`)

---

**Last Updated:** 2026-01-11
**Maintained by:** Antigravity (Google Deepmind ACE)
