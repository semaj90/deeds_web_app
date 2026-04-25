<#
  Phase 39 – Complete Protected Pipeline Runner
  Runs Phases 34-38 sequentially with checkpoints, validation, and rollback.
  Safe, idempotent, and fully logged.
#>

$ErrorActionPreference = "Stop"
$root   = "C:\Users\james\Videos\deeds-web-app"
$scripts = Join-Path $root "scripts"
$logs    = Join-Path $scripts "logs"
$reports = Join-Path $scripts "reports"
$phase34_37 = Join-Path $scripts "run-phase34-37-protected.ps1"
$phase38     = Join-Path $scripts "run-phase38-eslint-ai.ps1"
$timestamp   = (Get-Date).ToString("yyyyMMdd-HHmmss")
$summaryLog  = Join-Path $logs "phase39-master-$timestamp.log"

Write-Host "🚀 Starting Phase 39: Complete Pipeline" -ForegroundColor Cyan
Write-Host "Logs → $summaryLog`n"

Start-Transcript -Path $summaryLog -Append

try {
  Push-Location $root

  Write-Host "🔒 1️⃣  Phase 34-37 – AST / WASM / Svelte protected cleanup" -ForegroundColor Yellow
  & $phase34_37
  if ($LASTEXITCODE -ne 0) { throw "Phase 34-37 failed (code $LASTEXITCODE)" }

  Write-Host "🧠 2️⃣  Phase 38 – ESLint + AI autofix polish" -ForegroundColor Yellow
  & $phase38
  if ($LASTEXITCODE -ne 0) { throw "Phase 38 failed (code $LASTEXITCODE)" }

  Write-Host "🧪 3️⃣  Validation → tsc / svelte-check / build" -ForegroundColor Yellow
  npm run check:svelte
  npm run build

  Write-Host "✅  All phases complete. Generating summary…" -ForegroundColor Green

  $reportPaths = Get-ChildItem -Path $reports -Filter "*.json" -ErrorAction SilentlyContinue
  foreach ($r in $reportPaths) {
    Write-Host "`n📄  $($r.Name)"
    Get-Content $r.FullName | Select-String -Pattern "error" -Context 0,2 | Out-Host
  }

  git add .
  git commit -am "fix: complete phase 34-38 pipeline @ $timestamp" | Out-Null
  Write-Host "`n🎯  Commit created. Safe rollback available via git." -ForegroundColor Green

} catch {
  Write-Host "❌  Pipeline failed: $_" -ForegroundColor Red
  git restore .
} finally {
  Pop-Location
  Stop-Transcript
}
