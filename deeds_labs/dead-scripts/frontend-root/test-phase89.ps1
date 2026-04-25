#!/usr/bin/env pwsh
<#
.SYNOPSIS
    Phase 89: Complete System Verification Test
.DESCRIPTION
    Verifies both deliverables are working correctly:
    1. Hardened startup (no rebuilds, Phase 66 containers)
    2. Agentic error map (scripts, database, APIs)
#>

param(
  [switch]$SkipBuild
)

$ErrorActionPreference = "Stop"

function Test-Step($name, $script) {
  Write-Host "`n==> Testing: $name" -ForegroundColor Cyan
  try {
    & $script
    Write-Host "✅ PASS: $name" -ForegroundColor Green
    return $true
  } catch {
    Write-Host "❌ FAIL: $name" -ForegroundColor Red
    Write-Host "   Error: $($_.Exception.Message)" -ForegroundColor Yellow
    return $false
  }
}

$results = @()

Write-Host "🧪 Phase 89: Complete System Verification" -ForegroundColor Cyan
Write-Host "==========================================`n"

# ---- Deliverable 1: Hardened Startup ----
Write-Host "📦 DELIVERABLE 1: Safeguarded Dependency Startup" -ForegroundColor Magenta

$results += Test-Step "1.1 - Docker daemon reachable" {
  docker version | Out-Null
}

$results += Test-Step "1.2 - Phase 66 containers exist" {
  $containers = @('phase66-postgres', 'phase66-qdrant', 'phase66-redis')
  foreach ($c in $containers) {
    $exists = docker ps -a --filter "name=^/$c$" --format "{{.Names}}"
    if (-not $exists) {
      throw "Container $c does not exist"
    }
  }
}

$results += Test-Step "1.3 - Phase 66 containers running" {
  $containers = @('phase66-postgres', 'phase66-qdrant', 'phase66-redis')
  foreach ($c in $containers) {
    $running = docker ps --filter "name=^/$c$" --format "{{.Names}}"
    if (-not $running) {
      Write-Host "   Container $c is stopped, attempting to start..." -ForegroundColor Yellow
      docker start $c | Out-Null
      Start-Sleep -Seconds 2
    }
  }

  # Verify all running
  foreach ($c in $containers) {
    $running = docker ps --filter "name=^/$c$" --format "{{.Names}}"
    if (-not $running) {
      throw "Container $c failed to start"
    }
  }
}

$results += Test-Step "1.4 - Postgres connection (legal_ai_db)" {
  $result = docker exec phase66-postgres psql -U legal_admin -d legal_ai_db -c "SELECT current_database(), current_user;" 2>&1
  if ($result -notmatch "legal_ai_db.*legal_admin") {
    throw "Database connection failed or wrong credentials"
  }
}

$results += Test-Step "1.5 - Qdrant API reachable" {
  $collections = Invoke-RestMethod -Uri "http://127.0.0.1:6333/collections" -TimeoutSec 5
  if (-not $collections) {
    throw "Qdrant API not responding"
  }
}

$results += Test-Step "1.6 - Redis connection" {
  $pong = docker exec phase66-redis redis-cli ping 2>&1
  if ($pong -ne "PONG") {
    throw "Redis not responding"
  }
}

$results += Test-Step "1.7 - Ollama API reachable" {
  $tags = Invoke-RestMethod -Uri "http://127.0.0.1:11434/api/tags" -TimeoutSec 5
  if (-not $tags) {
    throw "Ollama API not responding"
  }
}

# ---- Deliverable 2: Agentic Error Map ----
Write-Host "`n📊 DELIVERABLE 2: Agentic Error Analysis Map" -ForegroundColor Magenta

$results += Test-Step "2.1 - Phase 89 schema exists" {
  $tables = docker exec phase66-postgres psql -U legal_admin -d legal_ai_db -c "\dt" 2>&1
  $requiredTables = @('kg_nodes', 'kg_edges', 'file_index')
  foreach ($table in $requiredTables) {
    if ($tables -notmatch $table) {
      throw "Table $table does not exist. Run migrations first."
    }
  }
}

$results += Test-Step "2.2 - phase89-error-map-builder.mjs exists" {
  $builderPath = "scripts\phase89-error-map-builder.mjs"
  if (-not (Test-Path $builderPath)) {
    throw "Builder script not found: $builderPath"
  }

  # Check configuration
  $content = Get-Content $builderPath -Raw
  if ($content -notmatch "legal_ai_db") {
    throw "Builder script not configured for legal_ai_db"
  }
}

$results += Test-Step "2.3 - phase89-error-map-query.mjs exists" {
  $queryPath = "scripts\phase89-error-map-query.mjs"
  if (-not (Test-Path $queryPath)) {
    throw "Query script not found: $queryPath"
  }

  # Check configuration
  $content = Get-Content $queryPath -Raw
  if ($content -notmatch "legal_ai_db") {
    throw "Query script not configured for legal_ai_db"
  }
}

if (-not $SkipBuild) {
  $results += Test-Step "2.4 - Build knowledge graph" {
    Write-Host "   Building graph (this may take 2-5 minutes)..." -ForegroundColor Gray
    $output = node scripts\phase89-error-map-builder.mjs 2>&1
    if ($LASTEXITCODE -ne 0) {
      throw "Builder failed: $output"
    }

    # Verify nodes created
    $nodeCount = docker exec phase66-postgres psql -U legal_admin -d legal_ai_db -t -c "SELECT COUNT(*) FROM kg_nodes;" 2>&1
    $nodeCount = $nodeCount.Trim()
    if ([int]$nodeCount -lt 10) {
      throw "Too few nodes created: $nodeCount (expected >10)"
    }
    Write-Host "   Created $nodeCount nodes" -ForegroundColor Gray
  }
} else {
  Write-Host "   ⏭️  Skipping build (use without -SkipBuild to test)" -ForegroundColor Yellow
}

$results += Test-Step "2.5 - Qdrant collection exists" {
  try {
    $collection = Invoke-RestMethod -Uri "http://127.0.0.1:6333/collections/phase89_error_map"
    if ($collection.result.points_count -lt 1) {
      throw "Collection exists but has no points (run builder first)"
    }
    Write-Host "   Collection has $($collection.result.points_count) vectors" -ForegroundColor Gray
  } catch {
    throw "Qdrant collection 'phase89_error_map' does not exist (run builder first)"
  }
}

$results += Test-Step "2.6 - Visualization route exists" {
  $routePath = "src\routes\phase89\error-map\+page.svelte"
  if (-not (Test-Path $routePath)) {
    throw "Visualization route not found: $routePath"
  }
}

$results += Test-Step "2.7 - API endpoints exist" {
  $endpoints = @(
    "src\routes\api\phase89\stats\+server.ts",
    "src\routes\api\phase89\graph\top-errors\+server.ts",
    "src\routes\api\phase89\graph\expand\+server.ts"
  )
  foreach ($ep in $endpoints) {
    if (-not (Test-Path $ep)) {
      throw "API endpoint not found: $ep"
    }
  }
}

# ---- Summary ----
Write-Host "`n===========================================" -ForegroundColor Cyan
Write-Host "📊 Test Results Summary" -ForegroundColor Cyan
Write-Host "===========================================`n"

$passed = ($results | Where-Object { $_ -eq $true }).Count
$failed = ($results | Where-Object { $_ -eq $false }).Count
$total = $results.Count

Write-Host "Total Tests: $total" -ForegroundColor White
Write-Host "Passed:      $passed" -ForegroundColor Green
Write-Host "Failed:      $failed" -ForegroundColor $(if ($failed -gt 0) { "Red" } else { "Gray" })

if ($failed -eq 0) {
  Write-Host "`n✅ All tests passed! Phase 89 is ready." -ForegroundColor Green
  Write-Host "`nNext steps:" -ForegroundColor Cyan
  Write-Host "  1. npm run dev" -ForegroundColor Gray
  Write-Host "  2. Open http://localhost:5175/phase89/error-map" -ForegroundColor Gray
  Write-Host "  3. node scripts\phase89-error-map-query.mjs `"TS1005`"" -ForegroundColor Gray
  exit 0
} else {
  Write-Host "`n❌ Some tests failed. Review errors above." -ForegroundColor Red
  exit 1
}
