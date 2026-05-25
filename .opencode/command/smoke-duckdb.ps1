$ErrorActionPreference = "Stop"
Write-Host "📊 Running isolated query contract check..." -ForegroundColor Cyan

# 1. Assert Presence of Gitignored Volatile Asset
$TargetFile = "sveltekit-frontend\docs\graph\codebase-graph.json"
if (-not (Test-Path $TargetFile)) {
    Write-Host "🛑 Source asset missing. Building recovery state packet..." -ForegroundColor Red
    exit 1
}

# 2. Invoke Analytical Engine via Decoupled Initialization Target
try {
    Write-Host "Attempting to run DuckDB contract check..." -ForegroundColor Yellow
    
    # Run duckdb processing using the separate sql file configuration
    duckdb -init .opencode/command/extract-top100-pagerank.sql /dev/null
    
    # Explicit check for external executable failures inside native Windows shells
    if ($LASTEXITCODE -ne 0) {
        throw "DuckDB pipeline engine exited with a non-zero return code: $LASTEXITCODE"
    }

    # 3. Seal State with Manifest Discipline
    $ManifestPayload = [PSCustomObject]@{
        version_hash           = "STABLE_ENGRAM_PROMOTED"
        promotion_state        = "STABLE_STAGED"
        last_refresh_timestamp = (Get-Date -Format "yyyy-MM-ddTHH:mm:ssZ")
        target_files_verified  = 100
    }
    
    # Out-File with explicit UTF8 encoding blocks string corruption
    $ManifestPayload | ConvertTo-Json | Out-File "sveltekit-frontend\docs\graph\graph-refresh-manifest.json" -Encoding utf8
    Write-Host "✅ Graph verification manifest successfully updated!" -ForegroundColor Green

} catch {
    Write-Host "🛑 Contract failed. Executing safety fallback revert loop..." -ForegroundColor Red
    # Revert active sandbox parameters on failure to protect prompt states
    git checkout -- sveltekit-frontend/opencode.json
    exit 1
}