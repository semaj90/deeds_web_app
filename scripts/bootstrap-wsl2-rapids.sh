#!/bin/bash

##############################################################################
# bootstrap-wsl2-rapids.sh — Install cuVS + RAPIDS on WSL2 with Miniforge
#
# Purpose: Set up GPU-accelerated topology and clustering in WSL2
#
# Prerequisites:
# - WSL2 Ubuntu/Debian with GPU passthrough enabled
# - CUDA 13.0 toolkit (verified via CUDA_PATH or nvidia-smi)
# - Miniforge NOT yet installed (script installs it)
#
# Core Installs (required):
# - Miniforge (conda + mamba, optimized for WSL2)
# - Python 3.14 (selector-supported, current supported choice)
# - RAPIDS CUDA 13 packages: cuGraph, cugraph-service, cuvs, cuml
# - nx-cugraph (GPU-accelerated networkx)
# - NetworkX (CPU fallback)
# - XGBoost (utility)
#
# Optional Deferred (install separately after validation):
# - stable-baselines3, other RL packages
# - LangExtract belongs in the CPU/native extraction lane, not this RAPIDS env
#
# RAPIDS Command Strategy:
# 1. Visit https://rapids.ai/ official release selector
# 2. Select: Linux, WSL2, mamba, stable release, CUDA 13.x, Python 3.14
# 3. Copy the exact mamba create command
# 4. Paste it into line 157-164 below
# 5. Use the selector output for the current stable CUDA 13.x line
#
# Usage:
# $ wsl bash scripts/bootstrap-wsl2-rapids.sh [--apply]
#
# Default (dry-run): preview commands
# --apply: actually run the installation
#
##############################################################################

set -e

APPLY_MODE="${1:-}"
DRY_RUN=1
if [[ "$APPLY_MODE" == "--apply" ]]; then
    DRY_RUN=0
fi

ENV_NAME="atlas-rapids-cu13"
PYTHON_VERSION="3.14"  # Current target for this WSL2 lane; keep aligned with the bootstrap report

# Color output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

log_info() {
    echo -e "${GREEN}✓${NC} $1"
}

log_warn() {
    echo -e "${YELLOW}⚠${NC} $1"
}

log_error() {
    echo -e "${RED}✗${NC} $1"
}

log_cmd() {
    if [[ $DRY_RUN -eq 1 ]]; then
        echo -e "${YELLOW}[DRY-RUN]${NC} $1"
    else
        echo -e "${GREEN}[EXEC]${NC} $1"
        eval "$1"
    fi
}

# Preload existing Miniforge install when present so non-interactive shells
# can resolve conda/mamba without depending on shell rc files.
if [[ -d "$HOME/miniforge3" ]]; then
    export PATH="$HOME/miniforge3/bin:$PATH"
    if [[ -f "$HOME/miniforge3/etc/profile.d/conda.sh" ]]; then
        # shellcheck disable=SC1090
        source "$HOME/miniforge3/etc/profile.d/conda.sh"
    fi
fi

##############################################################################
# Preflight checks
##############################################################################

echo "🔍 WSL2 RAPIDS Bootstrap"
echo "=================================================="
echo "Environment: $ENV_NAME"
echo "Python: $PYTHON_VERSION"
echo "Mode: $([ $DRY_RUN -eq 1 ] && echo 'DRY-RUN (preview only)' || echo 'APPLY (will execute)')"
echo ""

# Check for Miniforge (preferred) or conda
if command -v mamba &> /dev/null; then
    log_info "mamba found: $(mamba --version)"
    CONDA_CMD="mamba"
elif command -v conda &> /dev/null; then
    log_info "conda found: $(conda --version)"
    CONDA_CMD="conda"
    log_warn "conda is slower than mamba. Consider installing Miniforge:"
    echo "  wget https://github.com/conda-forge/miniforge/releases/latest/download/Miniforge3-Linux-x86_64.sh"
    echo "  bash Miniforge3-Linux-x86_64.sh"
else
    log_error "Neither mamba nor conda found. Installing Miniforge..."
    if [[ $DRY_RUN -eq 0 ]]; then
        if [[ -d "$HOME/miniforge3" ]]; then
            log_warn "Existing Miniforge prefix found at $HOME/miniforge3; reusing it"
        else
            cd /tmp
            wget -q https://github.com/conda-forge/miniforge/releases/latest/download/Miniforge3-Linux-x86_64.sh
            bash Miniforge3-Linux-x86_64.sh -b -p "$HOME/miniforge3"
            log_info "Miniforge installed to $HOME/miniforge3"
        fi
        export PATH="$HOME/miniforge3/bin:$PATH"
        CONDA_CMD="mamba"
    else
        echo "  [DRY-RUN] Would install Miniforge3"
        CONDA_CMD="mamba"
    fi
fi

# Check CUDA
if ! command -v nvidia-smi &> /dev/null; then
    log_warn "nvidia-smi not found. GPU may not be available in WSL2."
    echo "  To enable GPU in WSL2:"
    echo "  1. Install NVIDIA CUDA Toolkit for WSL2"
    echo "  2. Add to /etc/wsl.conf: [interop] appendWindowsPath=false"
    echo "  3. Restart WSL2"
fi

if command -v nvidia-smi &> /dev/null; then
    log_info "GPU detected:"
    nvidia-smi --query-gpu=name,memory.total --format=csv,noheader | sed 's/^/  /'
fi

echo ""
echo "📦 Installation Plan (using $CONDA_CMD)"
echo "=================================================="
echo "1. Create $CONDA_CMD environment: $ENV_NAME (Python $PYTHON_VERSION)"
echo "2. Install RAPIDS CUDA 13 packages: cugraph, cuvs, cuml"
echo "3. Install GPU-accelerated networkx: nx-cugraph"
echo "4. Install CPU fallbacks: networkx"
echo "5. Install optional ML utilities: xgboost, stable-baselines3"
echo "6. Verify GPU access"
echo ""

if [[ $DRY_RUN -eq 1 ]]; then
    log_warn "DRY-RUN mode. Run with --apply to execute."
    echo ""
fi

##############################################################################
# Step 1: Create environment with RAPIDS CUDA 13 selector
##############################################################################

echo "1️⃣  Creating $CONDA_CMD environment (Python $PYTHON_VERSION)..."
echo ""
echo "INSTRUCTION: This command MUST use the exact output from https://rapids.ai/"
echo "Select: Linux, WSL2, mamba, stable, CUDA 13.x, Python $PYTHON_VERSION"
echo ""

# RAPIDS SELECTOR COMMAND (paste exact output here, replacing the default below)
# Default generic channels — SHOULD BE REPLACED with exact selector output
log_cmd "$CONDA_CMD create -n $ENV_NAME \
  -c rapidsai \
  -c conda-forge \
  python=$PYTHON_VERSION \
  cuda-version=13.3 \
  cugraph \
  cuvs \
  cuml \
  nx-cugraph \
  networkx \
  xgboost \
  -y"

##############################################################################
# Step 2: Activate environment
##############################################################################

echo ""
echo "2️⃣  Activating $ENV_NAME environment..."

# Use `run -n` for env-scoped commands instead of shell activation so the script
# remains stable in non-interactive WSL shells.

##############################################################################
# Step 3: Install GPU-accelerated graph algorithms
##############################################################################

echo ""
echo "3️⃣  Installing nx-cugraph (GPU-accelerated networkx)..."
if [[ $DRY_RUN -eq 1 ]]; then
    log_cmd "$CONDA_CMD run -n $ENV_NAME python -c 'import nx_cugraph; print(nx_cugraph.__version__)'"
else
    if "$CONDA_CMD" run -n "$ENV_NAME" python -c 'import nx_cugraph' >/dev/null 2>&1; then
        log_info "nx-cugraph already installed in $ENV_NAME"
        "$CONDA_CMD" run -n "$ENV_NAME" python -c 'import nx_cugraph; print(f"nx-cugraph: {nx_cugraph.__version__}")'
    else
        log_warn "nx-cugraph missing; installing via conda-forge"
        log_cmd "$CONDA_CMD install -n $ENV_NAME -c conda-forge nx-cugraph -y"
    fi
fi

##############################################################################
# Step 4: Install CPU fallback
##############################################################################

echo ""
echo "4️⃣  Installing NetworkX (CPU fallback)..."
log_cmd "$CONDA_CMD install -n $ENV_NAME networkx -c conda-forge -y"

##############################################################################
# Step 5: Install optional utilities
##############################################################################

echo ""
echo "5️⃣  Installing optional ML utilities (xgboost, stable-baselines3)..."
log_cmd "$CONDA_CMD run -n $ENV_NAME python -m pip install xgboost stable-baselines3 optuna"

##############################################################################
# Step 6: Verification
##############################################################################

echo ""
echo "6️⃣  Verifying RAPIDS installations..."

VERIFY_SCRIPT='
import sys
print("Python:", sys.version.split()[0])
print()

# cuVS (critical for Stage 3)
try:
    import cuvs
    print(f"✅ cuVS: {cuvs.__version__}")
except Exception as e:
    print(f"❌ cuVS ERROR: {e}")

# cuGraph (topology expansion)
try:
    import cugraph
    print(f"✅ cuGraph: {cugraph.__version__}")
except Exception as e:
    print(f"❌ cuGraph ERROR: {e}")

# cuML (k-means, domain classifier)
try:
    import cuml
    print(f"✅ cuML: {cuml.__version__}")
except Exception as e:
    print(f"❌ cuML ERROR: {e}")

# NetworkX (CPU fallback)
try:
    import networkx
    print(f"✅ NetworkX: {networkx.__version__}")
except Exception as e:
    print(f"❌ NetworkX ERROR: {e}")

# nx-cugraph (GPU-accelerated networkx)
try:
    import nx_cugraph
    print(f"✅ nx-cugraph: {nx_cugraph.__version__}")
except Exception as e:
    print(f"⚠️  nx-cugraph NOT available (install separately if needed)")

# Optional utilities
try:
    import xgboost
    print(f"✅ XGBoost: {xgboost.__version__}")
except:
    print(f"⚠️  XGBoost NOT available (optional)")

try:
    import stable_baselines3
    print("✅ stable-baselines3: OK")
except:
    print("⚠️  stable-baselines3 NOT available (optional)")

print()
print("✅ RAPIDS verification complete")
'

log_cmd "$CONDA_CMD run -n $ENV_NAME python -c '$VERIFY_SCRIPT'"

##############################################################################
# Done
##############################################################################

echo ""
echo "✅ Bootstrap Complete"
echo "=================================================="
echo ""
echo "Next steps:"
echo ""
echo "1. From Windows, verify RAPIDS in WSL2:"
echo "   wsl -e bash -c 'mamba run -n $ENV_NAME python -c \"import cuvs; print(cuvs.__version__)\"'"
echo ""
echo "2. Or activate interactively:"
echo "   wsl bash"
echo "   conda activate $ENV_NAME"
echo "   python"
echo ""
echo "3. Run cuVS Stage 3 prefilter test:"
echo "   python -c 'from cuvs.neighbors import ivf_flat; print(\"cuVS IVF ready\")'  "
echo ""
echo "4. Test GPU topology expansion:"
echo "   python -c 'import cugraph; print(f\"cuGraph: {cugraph.__version__}\")'  "
echo ""
echo "5. To use from Node.js/TypeScript:"
echo "   Create HTTP bridge in scripts/wsl2-rapids-bridge.mjs"
echo "   Call Python cuVS via HTTP endpoints (:50052)"
echo ""
echo "Environment: $ENV_NAME"
echo "Activate: mamba activate $ENV_NAME (or use mamba run -n $ENV_NAME ...)"
echo "Conda command: $CONDA_CMD"
echo ""
