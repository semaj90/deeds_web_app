$ErrorActionPreference = 'Stop'

$repoRoot = (Resolve-Path (Join-Path $PSScriptRoot '..\..')).Path
Set-Location -LiteralPath $repoRoot

$port = 8765
$healthUrl = "http://127.0.0.1:$port/health"
$modelPath = Join-Path $repoRoot 'models/xgboost-reranker.ubj'
$logDirectory = Join-Path $repoRoot 'logs/sidecars'
$stdoutPath = Join-Path $logDirectory 'xgboost-reranker.out.log'
$stderrPath = Join-Path $logDirectory 'xgboost-reranker.err.log'

function Test-RerankerHealth {
    try {
        $health = Invoke-RestMethod $healthUrl -TimeoutSec 1 -ErrorAction Stop
        return ($health -and $health.model_loaded -eq $true)
    }
    catch {
        return $false
    }
}

$listeners = @(Get-NetTCPConnection -LocalPort $port -State Listen -ErrorAction SilentlyContinue)
if ($listeners.Count -gt 0) {
    if (Test-RerankerHealth) {
        Write-Host 'XGBoost reranker already healthy on :8765'
        exit 0
    }

    [Console]::Error.WriteLine('Port :8765 is occupied, but /health did not report model_loaded=true; refusing to start a second process.')
    exit 1
}

if (-not (Test-Path -LiteralPath $modelPath -PathType Leaf)) {
    Write-Host 'XGBoost reranker model is absent; optional sidecar skipped. Run npm run atlas:xgboost:train to create it.'
    exit 0
}

New-Item -ItemType Directory -Force -Path $logDirectory | Out-Null
Start-Process -FilePath 'python' `
    -ArgumentList @('scripts/atlas/serve-xgboost-reranker.py') `
    -WorkingDirectory $repoRoot `
    -WindowStyle Hidden `
    -Environment @{ PYTHONIOENCODING = 'utf-8' } `
    -RedirectStandardOutput $stdoutPath `
    -RedirectStandardError $stderrPath | Out-Null

for ($attempt = 0; $attempt -lt 15; $attempt++) {
    if (Test-RerankerHealth) {
        $health = Invoke-RestMethod $healthUrl -TimeoutSec 1 -ErrorAction Stop
        Write-Host "XGBoost reranker :8765 started (model_type=$($health.model_type))"
        exit 0
    }
    Start-Sleep -Milliseconds 500
}

Write-Host 'XGBoost reranker startup was attempted but readiness failed; see logs/sidecars/xgboost-reranker.err.log.'
Get-Content -LiteralPath $stderrPath -Tail 30 -ErrorAction SilentlyContinue
exit 1
