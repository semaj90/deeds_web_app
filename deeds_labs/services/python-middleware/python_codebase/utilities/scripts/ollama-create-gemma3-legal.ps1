param(
  [string]$ModelName = "gemma3-legal",
  [string]$ModelfilePath = "./Gemma3-Legal-Modelfile",
  [string]$GGUFPath = ""
)

$ErrorActionPreference = 'Stop'

function Write-Info($msg) { Write-Host "[Gemma3-Create] $msg" -ForegroundColor Cyan }
function Write-Ok($msg) { Write-Host "[Gemma3-Create] $msg" -ForegroundColor Green }
function Write-Warn($msg) { Write-Host "[Gemma3-Create] $msg" -ForegroundColor Yellow }
function Write-Err($msg) { Write-Host "[Gemma3-Create] $msg" -ForegroundColor Red }

# 1) Verify Ollama is reachable
try {
  $ver = Invoke-RestMethod -Uri 'http://localhost:11434/api/version' -TimeoutSec 5
  Write-Ok ("Ollama available: " + ($ver.version))
} catch {
  Write-Err "Ollama API not reachable on http://localhost:11434. Start Ollama first (ollama serve)."
  exit 1
}

# 2) Resolve paths
$root = Get-Location
$modelfile = Resolve-Path -Path $ModelfilePath -ErrorAction SilentlyContinue
if (-not $modelfile) {
  Write-Err "Modelfile not found: $ModelfilePath"
  exit 1
}
$modelfile = $modelfile.Path

# 3) Optional GGUF override: create temp Modelfile with absolute Windows path (supports BLOB or FROM)
$tempFile = $null
if ($GGUFPath -and (Test-Path $GGUFPath)) {
  $absGGUF = (Resolve-Path $GGUFPath).Path
  $content = Get-Content -Raw -Path $modelfile
  # Prefer replacing a BLOB weights line; else fallback to FROM
  $newContent = $content -replace '(?im)^BLOB\s+weights\s+.*$', ('BLOB weights "' + $absGGUF.Replace('"','\"') + '"')
  if ($newContent -eq $content) {
    $newContent = $content -replace '(?im)^FROM\s+.*$', ('FROM "' + $absGGUF.Replace('"','\"') + '"')
  }
  $content = $newContent
  $tempFile = [System.IO.Path]::Combine($root, "Gemma3-Legal-Modelfile.temp")
  $content | Out-File -FilePath $tempFile -Encoding utf8 -Force
  Write-Info "Using GGUF override: $absGGUF"
}

$useFile = if ($tempFile) { $tempFile } else { $modelfile }

# 4) Prefer GPU if available
try {
  $nvsmi = & nvidia-smi 2>$null
  if ($LASTEXITCODE -eq 0 -and $nvsmi) {
    $env:OLLAMA_GPU_LAYERS = '999'
    Write-Info "NVIDIA GPU detected; OLLAMA_GPU_LAYERS=999"
  } else {
    Write-Warn "No NVIDIA GPU detected or nvidia-smi not available; using CPU."
  }
} catch {
  Write-Warn "nvidia-smi not available; using CPU."
}

# 5) Create the model in Ollama
Write-Info "Creating model '$ModelName' from: $useFile"
$create = & ollama create $ModelName -f $useFile 2>&1
if ($LASTEXITCODE -ne 0) {
  Write-Err "ollama create failed. Output:\n$create"
  if ($tempFile -and (Test-Path $tempFile)) { Remove-Item $tempFile -Force }
  exit 1
}
Write-Ok "Model '$ModelName' created."

# 6) Quick chat sanity test
try {
  $prompt = 'Summarize indemnification obligations in 3 bullets.'
  Write-Info "Running quick test..."
  $resp = & ollama run $ModelName $prompt 2>&1
  Write-Host $resp
} catch {
  Write-Warn "Quick test failed: $($_.Exception.Message)"
}

if ($tempFile -and (Test-Path $tempFile)) { Remove-Item $tempFile -Force }
Write-Ok "Done."
