#!/usr/bin/env pwsh
#
# Consolidation Cleanup Script v2
# Deep cleanup of root files
#
# Usage:
#   ./scripts/cleanup-consolidation-v2.ps1 -DryRun   # Preview only
#   ./scripts/cleanup-consolidation-v2.ps1           # Execute moves
#

param(
    [switch]$DryRun = $false
)

$ErrorActionPreference = "Stop"
$Root = "c:\Users\james\Videos\deeds-web-app"
$Archive = "$Root\deeds_labs\consolidation-archive-$(Get-Date -Format 'yyyyMMdd')-v2"
$ToolsDir = "$Root\tools\bin"

# Colors
function Write-Header($msg) { Write-Host "`n═══ $msg ═══" -ForegroundColor Cyan }
function Write-Action($msg) { Write-Host "  → $msg" -ForegroundColor Yellow }
function Write-Success($msg) { Write-Host "  ✓ $msg" -ForegroundColor Green }
function Write-Skip($msg) { Write-Host "  ○ $msg" -ForegroundColor DarkGray }
function Write-Info($msg) { Write-Host "  [i] $msg" -ForegroundColor Blue }

$TotalArchived = 0
$TotalMoved = 0

if ($DryRun) {
    Write-Host "`n🔍 DRY RUN MODE - No files will be moved`n" -ForegroundColor Magenta
}

# Create archive structure
$ArchiveDirs = @(
    "$Archive/md-session-phase",
    "$Archive/txt-session-logs",
    "$Archive/scripts-old-bat",
    "$Archive/scripts-old-sh",
    "$Archive/scripts-old-ps1",
    "$Archive/exe-services"
)

if (-not $DryRun) {
    foreach ($dir in $ArchiveDirs) {
        New-Item -ItemType Directory -Path $dir -Force | Out-Null
    }
    # Also create tools/bin for active executables
    New-Item -ItemType Directory -Path $ToolsDir -Force | Out-Null
}

# ═══════════════════════════════════════════════════════════════
Write-Header "1. SESSION/PHASE .MD FILES"
# ═══════════════════════════════════════════════════════════════

$sessionMd = Get-ChildItem -Path $Root -File -Filter "*.md" |
    Where-Object { $_.Name -match 'SESSION|PHASE|COMPLETE|SUMMARY' }

Write-Info "Found: $($sessionMd.Count) session/phase .md files"

$moved = 0
foreach ($file in $sessionMd) {
    Write-Action "Archive: $($file.Name)"
    if (-not $DryRun) {
        Move-Item -Path $file.FullName -Destination "$Archive/md-session-phase/$($file.Name)" -Force
    }
    $moved++
}
Write-Success "Session/Phase .md: $moved files archived"
$TotalArchived += $moved

# ═══════════════════════════════════════════════════════════════
Write-Header "2. SESSION LOG .TXT FILES"
# ═══════════════════════════════════════════════════════════════

$sessionTxt = Get-ChildItem -Path $Root -File -Filter "*.txt" |
    Where-Object { $_.Name -match 'session|log|_[0-9]+_|pm|am|^[0-9]+' }

Write-Info "Found: $($sessionTxt.Count) session log .txt files"

$moved = 0
foreach ($file in $sessionTxt) {
    Write-Action "Archive: $($file.Name)"
    if (-not $DryRun) {
        Move-Item -Path $file.FullName -Destination "$Archive/txt-session-logs/$($file.Name)" -Force
    }
    $moved++
}
Write-Success "Session log .txt: $moved files archived"
$TotalArchived += $moved

# ═══════════════════════════════════════════════════════════════
Write-Header "3. OLD .BAT SCRIPTS (>90 days)"
# ═══════════════════════════════════════════════════════════════

$recent = (Get-Date).AddDays(-90)

# Keep these recent scripts
$keepBat = @(
    "reconfigure-cmake.bat",
    "start-langextract.bat",
    "start-ollama-flash-attention.bat",
    "start-ollama-gpu.bat"
)

$oldBat = Get-ChildItem -Path $Root -File -Filter "*.bat" |
    Where-Object { $_.LastWriteTime -lt $recent -and $_.Name -notin $keepBat }

Write-Info "Found: $($oldBat.Count) old .bat files (keeping $($keepBat.Count) recent)"

$moved = 0
foreach ($file in $oldBat) {
    Write-Action "Archive: $($file.Name)"
    if (-not $DryRun) {
        Move-Item -Path $file.FullName -Destination "$Archive/scripts-old-bat/$($file.Name)" -Force
    }
    $moved++
}
Write-Success "Old .bat: $moved files archived"
$TotalArchived += $moved

# ═══════════════════════════════════════════════════════════════
Write-Header "4. OLD .SH SCRIPTS (>90 days)"
# ═══════════════════════════════════════════════════════════════

# Keep these recent scripts
$keepSh = @(
    "deploy-sveltekit.sh",
    "fix-css-corruption.sh",
    "fix-destructuring.sh",
    "test-sse-health-update.sh",
    "build-trt-engines.sh",
    "start-triton.sh"
)

$oldSh = Get-ChildItem -Path $Root -File -Filter "*.sh" |
    Where-Object { $_.LastWriteTime -lt $recent -and $_.Name -notin $keepSh }

Write-Info "Found: $($oldSh.Count) old .sh files (keeping $($keepSh.Count) recent)"

$moved = 0
foreach ($file in $oldSh) {
    Write-Action "Archive: $($file.Name)"
    if (-not $DryRun) {
        Move-Item -Path $file.FullName -Destination "$Archive/scripts-old-sh/$($file.Name)" -Force
    }
    $moved++
}
Write-Success "Old .sh: $moved files archived"
$TotalArchived += $moved

# ═══════════════════════════════════════════════════════════════
Write-Header "5. OLD .PS1 SCRIPTS (>90 days)"
# ═══════════════════════════════════════════════════════════════

# Keep these recent scripts
$keepPs1 = @(
    "fix-phase87-config.ps1",
    "git-push-phase66.ps1",
    "install-pytorch-cuda.ps1",
    "phase89-stack-wiring.ps1",
    "phase94-next-steps.ps1",
    "quarantine-corrupted-routes.ps1",
    "start-fastmcp-services.ps1",
    "start-phase87.ps1",
    "start-phase89.ps1",
    "start-rag-stack.ps1",
    "test-phase89.ps1",
    "test-qdrant-health.ps1",
    "verify-phase87-fixes.ps1",
    "verify-phase87.ps1",
    "cleanup-consolidation.ps1",
    "cleanup-consolidation-v2.ps1"
)

$oldPs1 = Get-ChildItem -Path $Root -File -Filter "*.ps1" |
    Where-Object { $_.LastWriteTime -lt $recent -and $_.Name -notin $keepPs1 }

Write-Info "Found: $($oldPs1.Count) old .ps1 files (keeping $($keepPs1.Count) recent)"

$moved = 0
foreach ($file in $oldPs1) {
    Write-Action "Archive: $($file.Name)"
    if (-not $DryRun) {
        Move-Item -Path $file.FullName -Destination "$Archive/scripts-old-ps1/$($file.Name)" -Force
    }
    $moved++
}
Write-Success "Old .ps1: $moved files archived"
$TotalArchived += $moved

# ═══════════════════════════════════════════════════════════════
Write-Header "6. SERVICE .EXE FILES (move to tools/bin)"
# ═══════════════════════════════════════════════════════════════

# Keep these essential tools in root (or move to tools/bin)
$keepExe = @(
    "minio.exe",       # MinIO object storage - active
    "caddy.exe",       # Caddy web server - active
    "codex-x86_64-pc-windows-msvc.exe"  # Codex CLI - active
)

$archiveExe = @(
    # Old/obsolete Go services
    "cognitive-microservice.exe",
    "cuda-service-worker.exe",
    "cuda-service.exe",
    "enhanced-rag-service.exe",
    "enhanced-rag-som-system.exe",
    "enhanced-rag-updated.exe",
    "gpu-cluster-executor.exe",
    "gpu-memory-manager.exe",
    "gpu-orchestrator-prod.exe",
    "gpu-orchestrator-service.exe",
    "gpu-orchestrator.exe",
    "health-server.exe",
    "health-server-prod.exe",
    "health-server-service.exe",
    "legal-ai-cuda.exe",
    "legal-ai-quic-auth.exe",
    "legal-ai-quic-server.exe",
    "legal-ai-quic-server-fixed.exe",
    "legal-ai-quic-server-v125.exe",
    "legal-engine.exe",
    "legal-extraction-service.exe",
    "legal-recommendation-engine.exe",
    "legal-recommendation-engine-fixed.exe",
    "metrics-server.exe",
    "minio-streaming-orchestrator.exe",
    "mock-health.exe",
    "multi-protocol-gateway.exe",
    "neo4j-integration-service.exe",
    "quic-coordinator-simplified.exe",
    "sequential-kg-service.exe",
    "simd-json-accelerator.exe",
    "simple-api-endpoints.exe",
    "streaming-pdf-processor.exe",
    "tensor-quic-auth.exe",
    "tensorrt-bridge.exe",
    "test-build.exe",
    "webasm-gpu-middleware.exe"
)

Write-Info "Archiving $($archiveExe.Count) obsolete .exe files"

$moved = 0
foreach ($exe in $archiveExe) {
    $src = "$Root\$exe"
    if (Test-Path $src) {
        Write-Action "Archive: $exe"
        if (-not $DryRun) {
            Move-Item -Path $src -Destination "$Archive/exe-services/$exe" -Force
        }
        $moved++
    }
}
Write-Success "Old .exe: $moved files archived"
$TotalArchived += $moved

# Move essential exes to tools/bin
Write-Info "Moving essential .exe to tools/bin"
$movedTools = 0
foreach ($exe in $keepExe) {
    $src = "$Root\$exe"
    if (Test-Path $src) {
        Write-Action "Move: $exe → tools/bin/"
        if (-not $DryRun) {
            Move-Item -Path $src -Destination "$ToolsDir\$exe" -Force
        }
        $movedTools++
    }
}
Write-Success "Essential .exe: $movedTools files moved to tools/bin"
$TotalMoved += $movedTools

# Also move Python installers and envutil
$utilExe = @(
    "python-3.12.7-amd64.exe",
    "python-3.12.6-amd64.exe",
    "python311.exe",
    "envutil.exe",
    "envutil-prod.exe",
    "envutil-service.exe",
    "rabbitmq-installer.exe"
)

foreach ($exe in $utilExe) {
    $src = "$Root\$exe"
    if (Test-Path $src) {
        Write-Action "Move: $exe → tools/bin/"
        if (-not $DryRun) {
            Move-Item -Path $src -Destination "$ToolsDir\$exe" -Force
        }
        $movedTools++
    }
}

# ═══════════════════════════════════════════════════════════════
Write-Header "SUMMARY"
# ═══════════════════════════════════════════════════════════════

Write-Host ""
Write-Host "  Archive location: $Archive" -ForegroundColor Green
Write-Host "  Tools location: $ToolsDir" -ForegroundColor Green
Write-Host ""
Write-Host "  Total files archived: $TotalArchived" -ForegroundColor Cyan
Write-Host "  Total files moved: $TotalMoved" -ForegroundColor Cyan
Write-Host ""

$remaining = (Get-ChildItem -Path $Root -File).Count
Write-Host "  Root files remaining: $remaining" -ForegroundColor Yellow
Write-Host ""
Write-Success "Consolidation v2 complete!"
