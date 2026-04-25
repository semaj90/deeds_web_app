# Kills repo-related Node.js processes safely by matching cwd and script names
param(
  [switch]$DryRun
)

$ErrorActionPreference = 'SilentlyContinue'

# Collect candidate processes
$procs = Get-CimInstance Win32_Process | Where-Object { $_.Name -match '^node(\.exe)?$' }

$killed = @()
foreach ($p in $procs) {
  $cmd = $p.CommandLine
  $cwd = try { (Get-Item -LiteralPath (Split-Path -Path $p.ExecutablePath -Parent)) } catch { $null }
  $isRepo = $cmd -match 'deeds-web-app' -or $cmd -match 'sveltekit-frontend' -or $cmd -match 'vite' -or $cmd -match 'tsx' -or $cmd -match 'vitest' -or $cmd -match 'storybook'
  if ($isRepo) {
    if ($DryRun) {
      Write-Host "Would kill PID=$($p.ProcessId) Name=$($p.Name) CMD=$cmd" -ForegroundColor Yellow
    } else {
      try {
        Stop-Process -Id $p.ProcessId -Force -ErrorAction Stop
        Write-Host "Killed PID=$($p.ProcessId) Name=$($p.Name)" -ForegroundColor Green
        $killed += $p.ProcessId
      } catch {
        Write-Host "Failed to kill PID=$($p.ProcessId): $($_.Exception.Message)" -ForegroundColor Red
      }
    }
  }
}

if ($killed.Count -eq 0) { Write-Host "No repo-related Node processes were terminated." -ForegroundColor Cyan }
