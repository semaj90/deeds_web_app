# Gemma 4 Legal E4B Model Setup - PowerShell Launcher
# Validates prerequisites and runs the main Python setup script

$ErrorActionPreference = "Stop"

# Color helpers
function Write-Success { param($msg) Write-Host "✓ $msg" -ForegroundColor Green }
function Write-Error { param($msg) Write-Host "✗ $msg" -ForegroundColor Red }
function Write-Info { param($msg) Write-Host "ℹ $msg" -ForegroundColor Cyan }
function Write-Warning { param($msg) Write-Host "⚠ $msg" -ForegroundColor Yellow }

# Header
Write-Host ""
Write-Host "╔═══════════════════════════════════════════════════════════╗" -ForegroundColor Cyan
Write-Host "║   Gemma 4 Legal E4B Model Setup                          ║" -ForegroundColor Cyan
Write-Host "║   PowerShell Launcher v1.0.0                             ║" -ForegroundColor Cyan
Write-Host "╚═══════════════════════════════════════════════════════════╝" -ForegroundColor Cyan
Write-Host ""

# Change to script directory
$ScriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
Set-Location $ScriptDir
Write-Info "Working directory: $ScriptDir"
Write-Host ""

# Step 1: Check Python
Write-Host "[1/5] Checking Python..." -ForegroundColor Yellow
try {
    $pythonVersion = python --version 2>&1
    if ($pythonVersion -match "Python (\d+)\.(\d+)") {
        $majorVersion = [int]$matches[1]
        $minorVersion = [int]$matches[2]

        if ($majorVersion -lt 3 -or ($majorVersion -eq 3 -and $minorVersion -lt 9)) {
            Write-Error "Python 3.9+ required, found $pythonVersion"
            Write-Info "Download from: https://www.python.org/downloads/"
            exit 1
        }
        Write-Success "Python $pythonVersion"
    }
} catch {
    Write-Error "Python not found in PATH"
    Write-Info "Download from: https://www.python.org/downloads/"
    Write-Info "Make sure to check 'Add Python to PATH' during installation"
    exit 1
}

# Step 2: Check pip
Write-Host "[2/5] Checking pip..." -ForegroundColor Yellow
try {
    $pipVersion = python -m pip --version 2>&1
    if ($LASTEXITCODE -eq 0) {
        Write-Success "pip available"
    } else {
        throw "pip not working"
    }
} catch {
    Write-Error "pip not available"
    Write-Info "Install with: python -m ensurepip --upgrade"
    exit 1
}

# Step 3: Check Git
Write-Host "[3/5] Checking Git..." -ForegroundColor Yellow
try {
    $gitVersion = git --version 2>&1
    if ($LASTEXITCODE -eq 0) {
        Write-Success "$gitVersion"
    } else {
        throw "git not working"
    }
} catch {
    Write-Error "Git not found in PATH"
    Write-Info "Download from: https://git-scm.com/download/win"
    Write-Warning "You can continue, but llama.cpp cloning will fail"
    Write-Host ""
    $continue = Read-Host "Continue anyway? (y/N)"
    if ($continue -ne "y" -and $continue -ne "Y") {
        exit 1
    }
}

# Step 4: Check Ollama (optional but recommended)
Write-Host "[4/5] Checking Ollama..." -ForegroundColor Yellow
try {
    $ollamaVersion = ollama --version 2>&1
    if ($LASTEXITCODE -eq 0) {
        Write-Success "Ollama available"
    } else {
        throw "ollama not working"
    }
} catch {
    Write-Warning "Ollama not found in PATH"
    Write-Info "Download from: https://ollama.com/download"
    Write-Warning "You can convert to GGUF but import will fail without Ollama"
    Write-Host ""
    $continue = Read-Host "Continue anyway? (y/N)"
    if ($continue -ne "y" -and $continue -ne "Y") {
        exit 1
    }
}

# Step 5: Check disk space
Write-Host "[5/5] Checking disk space..." -ForegroundColor Yellow
$drive = (Get-Location).Drive
$freeSpace = (Get-PSDrive $drive.Name).Free / 1GB
$requiredSpace = 20

if ($freeSpace -lt $requiredSpace) {
    Write-Error "Insufficient disk space: $([math]::Round($freeSpace, 1))GB free, ${requiredSpace}GB required"
    Write-Info "Free up space and try again"
    exit 1
}
Write-Success "$([math]::Round($freeSpace, 1))GB free (${requiredSpace}GB required)"

# Summary
Write-Host ""
Write-Host "╔═══════════════════════════════════════════════════════════╗" -ForegroundColor Green
Write-Host "║   Prerequisites Check: PASSED                            ║" -ForegroundColor Green
Write-Host "╚═══════════════════════════════════════════════════════════╝" -ForegroundColor Green
Write-Host ""

# Estimate time
Write-Info "Estimated setup time: 60-90 minutes"
Write-Info "Steps:"
Write-Info "  1. Install Python dependencies (~5 min)"
Write-Info "  2. Download base model 7.5GB (~10-30 min depending on internet)"
Write-Info "  3. Download adapter 140MB (~1 min)"
Write-Info "  4. Merge LoRA weights (~5-10 min)"
Write-Info "  5. Save merged model (~5-10 min)"
Write-Info "  6. Convert to GGUF (~10-20 min)"
Write-Info "  7. Build llama.cpp (first time only, ~10-20 min)"
Write-Info "  8. Create Modelfile (~1 sec)"
Write-Info "  9. Import to Ollama (~5-10 min)"
Write-Info " 10. Run validation test (~30 sec)"
Write-Host ""

$confirm = Read-Host "Ready to start? (y/N)"
if ($confirm -ne "y" -and $confirm -ne "Y") {
    Write-Info "Setup cancelled"
    exit 0
}

# Run main Python script
Write-Host ""
Write-Host "═══════════════════════════════════════════════════════════" -ForegroundColor Cyan
Write-Host "Starting Python Setup Script..." -ForegroundColor Cyan
Write-Host "═══════════════════════════════════════════════════════════" -ForegroundColor Cyan
Write-Host ""

try {
    # Run with unbuffered output
    $env:PYTHONUNBUFFERED = "1"
    python gemma4_setup.py

    if ($LASTEXITCODE -eq 0) {
        Write-Host ""
        Write-Host "╔═══════════════════════════════════════════════════════════╗" -ForegroundColor Green
        Write-Host "║   SETUP COMPLETED SUCCESSFULLY!                          ║" -ForegroundColor Green
        Write-Host "╚═══════════════════════════════════════════════════════════╝" -ForegroundColor Green
        Write-Host ""
        Write-Success "Model ready: gemma4-legal:e4b"
        Write-Host ""
        Write-Info "Test the model:"
        Write-Host '  ollama run gemma4-legal:e4b "What is hearsay evidence?"' -ForegroundColor White
        Write-Host ""
        Write-Info "View logs: gemma4_setup.log"
        Write-Host ""

        # File summary
        if (Test-Path "gemma4-legal-e4b-q4_k_m.gguf") {
            $ggufSize = (Get-Item "gemma4-legal-e4b-q4_k_m.gguf").Length / 1MB
            Write-Info "GGUF file: gemma4-legal-e4b-q4_k_m.gguf ($([math]::Round($ggufSize, 1))MB)"
        }

        if (Test-Path "gemma4-legal-merged-full") {
            $mergedSize = (Get-ChildItem "gemma4-legal-merged-full" -Recurse | Measure-Object -Property Length -Sum).Sum / 1GB
            Write-Info "Merged model: gemma4-legal-merged-full\ ($([math]::Round($mergedSize, 1))GB)"
        }

        Write-Host ""
        Write-Warning "Optional cleanup:"
        Write-Host "  - Delete merged model to save ~15GB: Remove-Item -Recurse gemma4-legal-merged-full" -ForegroundColor Gray
        Write-Host "  - Delete llama.cpp to save ~500MB: Remove-Item -Recurse llama.cpp" -ForegroundColor Gray
        Write-Host "  - Keep GGUF file for manual Ollama reimport" -ForegroundColor Gray

    } else {
        Write-Host ""
        Write-Host "╔═══════════════════════════════════════════════════════════╗" -ForegroundColor Red
        Write-Host "║   SETUP FAILED                                           ║" -ForegroundColor Red
        Write-Host "╚═══════════════════════════════════════════════════════════╝" -ForegroundColor Red
        Write-Host ""
        Write-Error "Setup did not complete successfully"
        Write-Info "Check gemma4_setup.log for details"
        Write-Host ""
        Write-Info "Common issues:"
        Write-Info "  1. Internet connection lost during download"
        Write-Info "  2. Insufficient disk space (need 20GB free)"
        Write-Info "  3. Out of memory (need 16GB+ RAM for CPU mode)"
        Write-Info "  4. HuggingFace authentication required (login with: huggingface-cli login)"
        Write-Host ""
        exit 1
    }

} catch {
    Write-Host ""
    Write-Error "Setup script crashed: $_"
    Write-Info "Check gemma4_setup.log for details"
    exit 1
}

# Keep window open
Write-Host ""
Write-Host "Press any key to exit..." -ForegroundColor Gray
$null = $Host.UI.RawUI.ReadKey("NoEcho,IncludeKeyDown")