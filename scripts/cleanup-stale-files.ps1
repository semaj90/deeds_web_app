# ACE Pipeline - Stale File Cleanup
# Usage: pwsh -File scripts/cleanup-stale-files.ps1 [-Force]
# Default: dry-run (shows what would be deleted). Use -Force to actually delete.
#
# KEEP-LIST (never deleted):
#   package*.json, tsconfig*.json, *.config.json, schema JSON,
#   test fixture JSON, migration JSON, .vscode/*.json
#
# DELETE-LIST (only these patterns):
#   runtime .log files, report dumps, Qdrant scroll exports,
#   inference dumps, temp audit outputs, benchmark JSON outputs

param(
    [switch]$Force
)

$ErrorActionPreference = 'Continue'
$root = Split-Path -Parent $PSScriptRoot  # deeds-web-app root

Write-Host "`n══════════════════════════════════════════════════════" -ForegroundColor Cyan
Write-Host "  🧹 ACE Stale File Cleanup" -ForegroundColor Cyan
Write-Host "══════════════════════════════════════════════════════`n" -ForegroundColor Cyan

if (-not $Force) {
    Write-Host "  📋 DRY RUN — use -Force to actually delete`n" -ForegroundColor Yellow
}

$totalFreed = 0

# ═══════════════════════════════════════════════════════════════
# 1. Log files — runtime logs in known project directories
#    Excludes: node_modules, .git, deeds_labs
# ═══════════════════════════════════════════════════════════════

Write-Host "  🗑️  Runtime .log files" -ForegroundColor White

$logDirs = @(
    "$root/sveltekit-frontend",
    "$root/services",
    "$root/scripts",
    "$root/backend"
)

$logFiles = @()
foreach ($dir in $logDirs) {
    if (Test-Path $dir) {
        $logFiles += Get-ChildItem -Path $dir -Recurse -Include "*.log" -ErrorAction SilentlyContinue |
            Where-Object { $_.DirectoryName -notmatch 'node_modules|\.git|deeds_labs' }
    }
}

$logSize = ($logFiles | Measure-Object -Property Length -Sum).Sum
$logSizeMB = [math]::Round(($logSize ?? 0) / 1MB, 1)
Write-Host "     Found: $($logFiles.Count) files ($logSizeMB MB)" -ForegroundColor Gray

if ($Force -and $logFiles.Count -gt 0) {
    $logFiles | Remove-Item -Force -ErrorAction SilentlyContinue
    Write-Host "     ✔ Deleted $($logFiles.Count) log files" -ForegroundColor Green
} elseif ($logFiles.Count -gt 0) {
    $logFiles | Select-Object -First 10 | ForEach-Object {
        Write-Host "     - $($_.FullName -replace [regex]::Escape($root), '.')" -ForegroundColor DarkGray
    }
    if ($logFiles.Count -gt 10) {
        Write-Host "     ... and $($logFiles.Count - 10) more" -ForegroundColor DarkGray
    }
}
$totalFreed += ($logSize ?? 0)

# ═══════════════════════════════════════════════════════════════
# 2. JSON report dumps — ONLY from known dump directories
#    Strict keep-list: config, schema, fixtures, migrations
# ═══════════════════════════════════════════════════════════════

Write-Host "`n  🗑️  JSON report/export dumps" -ForegroundColor White

# --- Strict keep patterns (basenames that are ALWAYS kept) ---
$keepBasenames = @(
    'package.json', 'package-lock.json',
    'turbo.json', 'manifest.json', 'vercel.json',
    'launch.json', 'settings.json', 'tasks.json', 'extensions.json',
    'devcontainer.json', 'jsconfig.json'
)
$keepGlobs = @(
    'tsconfig*',     # tsconfig.json, tsconfig.node.json, etc
    '*.config.*',    # vite.config.ts, drizzle.config.ts, etc
    'eslint*',       # eslintrc.json, .eslintrc, etc
    'prettier*',
    'tailwind*',
    'postcss*',
    '*schema*',      # any schema file
    '*fixture*',     # test fixtures
    '*migration*',   # Drizzle/DB migrations
    '*seed*'         # DB seed data
)

# --- Only scan known dump directories (NOT the entire tree) ---
$jsonDumpDirs = @(
    "$root/sveltekit-frontend/reports",
    "$root/sveltekit-frontend/tmp",
    "$root/sveltekit-frontend/.tmp",
    "$root/sveltekit-frontend/gpu-outputs",
    "$root/sveltekit-frontend/scroll-exports",
    "$root/sveltekit-frontend/audit-outputs",
    "$root/sveltekit-frontend/inference-dumps",
    "$root/scripts/outputs",
    "$root/scripts/reports",
    "$root/reports"
)

$jsonFiles = @()
foreach ($dir in $jsonDumpDirs) {
    if (Test-Path $dir) {
        $jsonFiles += Get-ChildItem -Path $dir -Recurse -Include "*.json" -ErrorAction SilentlyContinue |
            Where-Object { $_.DirectoryName -notmatch 'node_modules|\.git|\.vscode' }
    }
}

# Filter out anything matching the keep-list
$jsonFiles = $jsonFiles | Where-Object {
    $name = $_.Name
    $dir = $_.DirectoryName
    # Always keep .vscode JSON
    if ($dir -match '\.vscode') { return $false }
    # Always keep exact basename matches
    if ($keepBasenames -contains $name) { return $false }
    # Always keep glob matches
    foreach ($glob in $keepGlobs) {
        if ($name -like $glob) { return $false }
    }
    return $true
}

$jsonSize = ($jsonFiles | Measure-Object -Property Length -Sum).Sum
$jsonSizeMB = [math]::Round(($jsonSize ?? 0) / 1MB, 1)
Write-Host "     Found: $($jsonFiles.Count) files ($jsonSizeMB MB)" -ForegroundColor Gray

if ($Force -and $jsonFiles.Count -gt 0) {
    $jsonFiles | Remove-Item -Force -ErrorAction SilentlyContinue
    Write-Host "     ✔ Deleted $($jsonFiles.Count) JSON dump files" -ForegroundColor Green
} elseif ($jsonFiles.Count -gt 0) {
    $jsonFiles | Select-Object -First 10 | ForEach-Object {
        $sizeMB = [math]::Round($_.Length / 1MB, 2)
        Write-Host "     - $($_.FullName -replace [regex]::Escape($root), '.') (${sizeMB}MB)" -ForegroundColor DarkGray
    }
    if ($jsonFiles.Count -gt 10) {
        Write-Host "     ... and $($jsonFiles.Count - 10) more" -ForegroundColor DarkGray
    }
}
$totalFreed += ($jsonSize ?? 0)

# ═══════════════════════════════════════════════════════════════
# 3. Workspace-root tmp_*.json (Qdrant scrolls, inference dumps,
#    curl test outputs) — safe to delete, never config/schema
# ═══════════════════════════════════════════════════════════════

Write-Host "`n  🗑️  Root tmp_*.json files" -ForegroundColor White

$rootTmpJson = Get-ChildItem -Path $root -MaxDepth 1 -Filter "tmp_*.json" -ErrorAction SilentlyContinue

$rootTmpSize = ($rootTmpJson | Measure-Object -Property Length -Sum).Sum
$rootTmpSizeMB = [math]::Round(($rootTmpSize ?? 0) / 1MB, 1)
Write-Host "     Found: $($rootTmpJson.Count) files ($rootTmpSizeMB MB)" -ForegroundColor Gray

if ($Force -and $rootTmpJson.Count -gt 0) {
    $rootTmpJson | Remove-Item -Force -ErrorAction SilentlyContinue
    Write-Host "     ✔ Deleted $($rootTmpJson.Count) root tmp JSON files" -ForegroundColor Green
} elseif ($rootTmpJson.Count -gt 0) {
    $rootTmpJson | ForEach-Object {
        $sizeMB = [math]::Round($_.Length / 1MB, 2)
        Write-Host "     - $($_.Name) (${sizeMB}MB)" -ForegroundColor DarkGray
    }
}
$totalFreed += ($rootTmpSize ?? 0)

# ═══════════════════════════════════════════════════════════════
# 4. Temp files — .tmp, .bak, .swp (in project dirs only)
# ═══════════════════════════════════════════════════════════════

Write-Host "`n  🗑️  Temp files (.tmp, .bak, .swp)" -ForegroundColor White

$tempFiles = Get-ChildItem -Path "$root/sveltekit-frontend" -Recurse -Include "*.tmp", "*.bak", "*.swp" -ErrorAction SilentlyContinue |
    Where-Object { $_.DirectoryName -notmatch 'node_modules|\.git|deeds_labs' }

$tempSize = ($tempFiles | Measure-Object -Property Length -Sum).Sum
$tempSizeMB = [math]::Round(($tempSize ?? 0) / 1MB, 1)
Write-Host "     Found: $($tempFiles.Count) files ($tempSizeMB MB)" -ForegroundColor Gray

if ($Force -and $tempFiles.Count -gt 0) {
    $tempFiles | Remove-Item -Force -ErrorAction SilentlyContinue
    Write-Host "     ✔ Deleted $($tempFiles.Count) temp files" -ForegroundColor Green
}
$totalFreed += ($tempSize ?? 0)

# ═══════════════════════════════════════════════════════════════
# Summary
# ═══════════════════════════════════════════════════════════════

$totalFreedMB = [math]::Round($totalFreed / 1MB, 1)

Write-Host "`n══════════════════════════════════════════════════════" -ForegroundColor Cyan
if ($Force) {
    Write-Host "  ✔ Freed: $totalFreedMB MB" -ForegroundColor Green
} else {
    Write-Host "  📋 Would free: $totalFreedMB MB" -ForegroundColor Yellow
    Write-Host "  Run with -Force to delete" -ForegroundColor Yellow
}
Write-Host "══════════════════════════════════════════════════════`n" -ForegroundColor Cyan
