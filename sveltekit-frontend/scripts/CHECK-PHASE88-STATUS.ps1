#!/usr/bin/env pwsh
# Quick status check for Phase 88 systems

Write-Host "📊 Phase 88 System Status Check" -ForegroundColor Cyan
Write-Host "==============================" -ForegroundColor Cyan
Write-Host ""

# Docker Services
Write-Host "🐳 Docker Services:" -ForegroundColor Yellow
$containers = @("phase66-postgres", "phase66-redis", "phase66-qdrant")
foreach ($c in $containers) {
    $status = docker ps --filter "name=$c" --format "{{.Status}}" 2>$null
    if ($status) {
        Write-Host "   ✅ $c`: $status" -ForegroundColor Green
    } else {
        $exitStatus = docker ps -a --filter "name=$c" --format "{{.Status}}" 2>$null
        Write-Host "   ❌ $c`: $exitStatus" -ForegroundColor Red
    }
}

# Ollama
Write-Host "`n🧠 Ollama:" -ForegroundColor Yellow
try {
    $response = curl -s http://localhost:11434/api/tags 2>$null
    if ($response) {
        $models = $response | ConvertFrom-Json | Select-Object -ExpandProperty models
        $embeddingModel = $models | Where-Object { $_.name -eq "embeddinggemma:latest" }
        $llmModel = $models | Where-Object { $_.name -eq "gemma3-legal:latest" }

        if ($embeddingModel) {
            Write-Host "   ✅ embeddinggemma:latest" -ForegroundColor Green
        } else {
            Write-Host "   ❌ embeddinggemma:latest (missing)" -ForegroundColor Red
        }

        if ($llmModel) {
            Write-Host "   ✅ gemma3-legal:latest" -ForegroundColor Green
        } else {
            Write-Host "   ❌ gemma3-legal:latest (missing)" -ForegroundColor Red
        }
    } else {
        Write-Host "   ❌ Not reachable" -ForegroundColor Red
    }
} catch {
    Write-Host "   ❌ Not reachable at localhost:11434" -ForegroundColor Red
}

# Qdrant Collection
Write-Host "`n📦 Qdrant Collection:" -ForegroundColor Yellow
try {
    $collection = curl -s http://localhost:6333/collections/phase76_knowledge_base 2>$null | ConvertFrom-Json
    $points = $collection.result.points_count
    $status = $collection.result.status

    Write-Host "   Collection: phase76_knowledge_base" -ForegroundColor Gray
    Write-Host "   Status: $status" -ForegroundColor Gray

    if ($points -ge 600) {
        Write-Host "   ✅ Points: $points (target: 600+)" -ForegroundColor Green
    } elseif ($points -gt 0) {
        Write-Host "   ⚠️  Points: $points (target: 600+, run ingestion)" -ForegroundColor Yellow
    } else {
        Write-Host "   ❌ Points: 0 (run ingestion)" -ForegroundColor Red
    }
} catch {
    Write-Host "   ❌ Cannot reach Qdrant at localhost:6333" -ForegroundColor Red
}

# Knowledge Plane
Write-Host "`n🔧 Knowledge Plane:" -ForegroundColor Yellow
try {
    $health = curl -s http://127.0.0.1:8792/health 2>$null | ConvertFrom-Json
    if ($health.status -eq "healthy") {
        Write-Host "   ✅ Running (v$($health.version))" -ForegroundColor Green
        Write-Host "   Checks:" -ForegroundColor Gray
        foreach ($check in $health.checks.PSObject.Properties) {
            $icon = if ($check.Value -eq "ok") { "✅" } else { "❌" }
            Write-Host "      $icon $($check.Name): $($check.Value)" -ForegroundColor Gray
        }
    } else {
        Write-Host "   ⚠️  Status: $($health.status)" -ForegroundColor Yellow
    }
} catch {
    Write-Host "   ❌ Not running on port 8792" -ForegroundColor Red
    Write-Host "      Start: cd ..\go-services\knowledge-plane; .\run.ps1" -ForegroundColor Gray
}

# FastMCP
Write-Host "`n🔌 FastMCP:" -ForegroundColor Yellow
$fastmcp = Get-Process -Name node -ErrorAction SilentlyContinue |
    Where-Object { $_.CommandLine -like "*fastmcp*" }
if ($fastmcp) {
    Write-Host "   ✅ Running (PID: $($fastmcp.Id))" -ForegroundColor Green
} else {
    Write-Host "   ❌ Not running" -ForegroundColor Red
    Write-Host "      Start: node scripts\fastmcp-server.mjs" -ForegroundColor Gray
}

# Files
Write-Host "`n📄 Key Files:" -ForegroundColor Yellow
$files = @(
    "data\knowledge\SVELTE5_CODE_POLICY.md",
    "scripts\phase88-docs-ingestion.ps1",
    "scripts\test-kb-grounding.ps1",
    "PHASE88_LAUNCH_CHECKLIST.md"
)
foreach ($f in $files) {
    if (Test-Path $f) {
        $size = [math]::Round((Get-Item $f).Length / 1KB, 1)
        Write-Host "   ✅ $f ($size KB)" -ForegroundColor Green
    } else {
        Write-Host "   ❌ $f (missing)" -ForegroundColor Red
    }
}

# Summary
Write-Host "`n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━" -ForegroundColor Cyan
Write-Host ""
Write-Host "Next Steps:" -ForegroundColor Yellow

$qdrantPoints = 0
try {
    $qdrantPoints = (curl -s http://localhost:6333/collections/phase76_knowledge_base 2>$null | ConvertFrom-Json).result.points_count
} catch {}

if ($qdrantPoints -lt 600) {
    Write-Host "  1. Run ingestion: .\scripts\phase88-docs-ingestion.ps1" -ForegroundColor Cyan
}

$kpRunning = $false
try {
    $kpRunning = (curl -s http://127.0.0.1:8792/health 2>$null | ConvertFrom-Json).status -eq "healthy"
} catch {}

if (-not $kpRunning) {
    Write-Host "  2. Start Knowledge Plane: cd ..\go-services\knowledge-plane; .\run.ps1" -ForegroundColor Cyan
}

if (-not $fastmcp) {
    Write-Host "  3. Start FastMCP: node scripts\fastmcp-server.mjs" -ForegroundColor Cyan
}

if ($qdrantPoints -ge 600 -and $kpRunning -and $fastmcp) {
    Write-Host "  ✅ All systems ready! Run: .\scripts\LAUNCH-PHASE88.ps1" -ForegroundColor Green
} else {
    Write-Host ""
    Write-Host "Or run automated launcher: .\scripts\LAUNCH-PHASE88.ps1" -ForegroundColor Gray
}

Write-Host ""
