#!/usr/bin/env pwsh
#
# Consolidation Cleanup Script
# Archives dead code to deeds_labs/
#
# Usage:
#   ./scripts/cleanup-consolidation.ps1 -DryRun   # Preview only
#   ./scripts/cleanup-consolidation.ps1           # Execute moves
#

param(
    [switch]$DryRun = $false
)

$ErrorActionPreference = "Stop"
$Root = "c:\Users\james\Videos\deeds-web-app"
$Archive = "$Root\deeds_labs\consolidation-archive-$(Get-Date -Format 'yyyyMMdd')"
$SvelteRoot = "$Root\sveltekit-frontend\src\lib"

# Colors
function Write-Header($msg) { Write-Host "`n═══ $msg ═══" -ForegroundColor Cyan }
function Write-Action($msg) { Write-Host "  → $msg" -ForegroundColor Yellow }
function Write-Success($msg) { Write-Host "  ✓ $msg" -ForegroundColor Green }
function Write-Skip($msg) { Write-Host "  ○ $msg" -ForegroundColor DarkGray }

if ($DryRun) {
    Write-Host "`n🔍 DRY RUN MODE - No files will be moved`n" -ForegroundColor Magenta
}

# Create archive structure
$ArchiveDirs = @(
    "$Archive/services-dead",
    "$Archive/types-dead",
    "$Archive/root-session-logs",
    "$Archive/root-phase-docs",
    "$Archive/root-patches"
)

if (-not $DryRun) {
    foreach ($dir in $ArchiveDirs) {
        New-Item -ItemType Directory -Path $dir -Force | Out-Null
    }
}

# ═══════════════════════════════════════════════════════════════
Write-Header "1. DEAD lib/services/ FILES (3)"
# ═══════════════════════════════════════════════════════════════

# NOTE: tts.ts and voice-commands.ts KEPT for Terminal voice wiring
$DeadServices = @(
    "api-client.ts",
    "source-validation-api.ts",
    "qdrant-client.ts"
)

$ServicesDir = "$SvelteRoot/services"
$moved = 0

foreach ($file in $DeadServices) {
    $src = "$ServicesDir/$file"
    if (Test-Path $src) {
        Write-Action "Archive: $file"
        if (-not $DryRun) {
            Move-Item -Path $src -Destination "$Archive/services-dead/$file" -Force
        }
        $moved++
    } else {
        Write-Skip "Not found: $file"
    }
}
Write-Success "Services: $moved files archived"

# ═══════════════════════════════════════════════════════════════
Write-Header "2. DEAD lib/types/ FILES (32)"
# ═══════════════════════════════════════════════════════════════

$DeadTypes = @(
    "advanced-patches.d.ts",
    "app.d.ts",
    "auth.d.ts",
    "case-summary.ts",
    "citations.ts",
    "common-props.d.ts",
    "env-enhanced.d.ts",
    "evidence.ts",
    "fast-locals-shim.d.ts",
    "global.ts",
    "locals-allow-any.d.ts",
    "locals-fix.d.ts",
    "locals.d.ts",
    "mermaid.d.ts",
    "missing-modules.d.ts",
    "missing-modules.d.ts.bullmq-backup",
    "modules.d.ts",
    "ollama.d.ts",
    "ollama.ts",
    "rag.ts",
    "rowlist-augment.d.ts",
    "runtime-shims-override.d.ts",
    "server.d.ts",
    "service-worker.d.ts",
    "sharedTypes.ts",
    "source-validation.ts",
    "svelte5-api-types.d.ts",
    "tiptap-shims.d.ts",
    "webassembly-enhanced.d.ts",
    "webgpu-navigator.d.ts",
    "webgpu.d.ts",
    "yorha-interface.ts"
)

$TypesDir = "$SvelteRoot/types"
$moved = 0

foreach ($file in $DeadTypes) {
    $src = "$TypesDir/$file"
    if (Test-Path $src) {
        Write-Action "Archive: $file"
        if (-not $DryRun) {
            Move-Item -Path $src -Destination "$Archive/types-dead/$file" -Force
        }
        $moved++
    } else {
        Write-Skip "Not found: $file"
    }
}
Write-Success "Types: $moved files archived"

# ═══════════════════════════════════════════════════════════════
Write-Header "3. ROOT SESSION LOGS (date pattern: N_N_*)"
# ═══════════════════════════════════════════════════════════════

$sessionLogs = Get-ChildItem -Path $Root -File | Where-Object {
    $_.Name -match "^\d+[_-]\d+[_-]?\d*.*\.(txt|md)$"
}

Write-Action "Found: $($sessionLogs.Count) session log files"
if (-not $DryRun -and $sessionLogs.Count -gt 0) {
    $sessionLogs | Move-Item -Destination "$Archive/root-session-logs/" -Force
}
Write-Success "Session logs: $($sessionLogs.Count) archived"

# ═══════════════════════════════════════════════════════════════
Write-Header "4. ROOT PHASE*.md DOCS"
# ═══════════════════════════════════════════════════════════════

$phaseDocs = Get-ChildItem -Path $Root -File | Where-Object {
    $_.Name -match "^PHASE\d+.*\.(md|txt)$"
}

Write-Action "Found: $($phaseDocs.Count) PHASE docs"
if (-not $DryRun -and $phaseDocs.Count -gt 0) {
    $phaseDocs | Move-Item -Destination "$Archive/root-phase-docs/" -Force
}
Write-Success "PHASE docs: $($phaseDocs.Count) archived"

# ═══════════════════════════════════════════════════════════════
Write-Header "5. ROOT .patch FILES"
# ═══════════════════════════════════════════════════════════════

$patches = Get-ChildItem -Path $Root -File -Filter "*.patch"

Write-Action "Found: $($patches.Count) patch files"
if (-not $DryRun -and $patches.Count -gt 0) {
    $patches | Move-Item -Destination "$Archive/root-patches/" -Force
}
Write-Success "Patches: $($patches.Count) archived"

# ═══════════════════════════════════════════════════════════════
Write-Header "SUMMARY"
# ═══════════════════════════════════════════════════════════════

$totalArchived = $DeadServices.Count + $DeadTypes.Count + $sessionLogs.Count + $phaseDocs.Count + $patches.Count

Write-Host "`n  Archive location: $Archive" -ForegroundColor White
Write-Host "  Total files to archive: $totalArchived" -ForegroundColor White

if ($DryRun) {
    Write-Host ""
    Write-Host "  Run without -DryRun to execute moves" -ForegroundColor Magenta
} else {
    Write-Host ""
    Write-Host "  Consolidation complete!" -ForegroundColor Green
}

# Remaining root file count
$remaining = (Get-ChildItem -Path $Root -File).Count
Write-Host ""
Write-Host "  Root files remaining: $remaining" -ForegroundColor Cyan
