#!/usr/bin/env pwsh
<#
.SYNOPSIS
    Phase 89: Quick Verification Test
.DESCRIPTION
    Verifies both deliverables are correctly configured
#>

$ErrorActionPreference = "Stop"

function Ok($m){ Write-Host "✅ $m" -ForegroundColor Green }
function Fail($m){ Write-Host "❌ $m" -ForegroundColor Red }
function Info($m){ Write-Host "ℹ️  $m" -ForegroundColor Gray }

Write-Host "`n🧪 Phase 89: Quick Verification Test`n" -ForegroundColor Cyan

$passed = 0
$failed = 0

# Test 1: Containers exist
Info "Test 1: Checking containers..."
$containers = @("phase66-postgres", "qdrant", "phase66-redis", "ollama-gemma")
foreach ($c in $containers) {
  $exists = docker ps -a --filter "name=^/$c$" --format "{{.Names}}"
  if ($exists) {
    Ok "$c exists"
    $passed++
  } else {
    Fail "$c not found"
    $failed++
  }
}

# Test 2: Database connection
Info "Test 2: Testing database connection..."
try {
  $result = docker exec phase66-postgres psql -U user -d legal -c "SELECT current_database(), current_user;" 2>&1
  if ($result -match "legal.*user") {
    Ok "Database connected (legal/user)"
    $passed++
  } else {
    Fail "Database connection failed or wrong credentials"
    $failed++
  }
} catch {
  Fail "Database not reachable: $($_.Exception.Message)"
  $failed++
}

# Test 3: Qdrant collection
Info "Test 3: Checking Qdrant collection..."
try {
  $collections = Invoke-RestMethod http://127.0.0.1:6333/collections
  $kb = $collections.result.collections | Where-Object { $_.name -eq "phase76_knowledge_base" }
  if ($kb) {
    Ok "Qdrant collection 'phase76_knowledge_base' exists"
    $passed++
  } else {
    Fail "Collection 'phase76_knowledge_base' not found"
    Info "Available collections: $($collections.result.collections.name -join ', ')"
    $failed++
  }
} catch {
  Fail "Qdrant not reachable: $($_.Exception.Message)"
  $failed++
}

# Test 4: Schema tables
Info "Test 4: Checking schema tables..."
try {
  $tables = docker exec phase66-postgres psql -U user -d legal -c "\dt" 2>&1
  $requiredTables = @("kg_nodes", "kg_edges", "file_index")
  foreach ($table in $requiredTables) {
    if ($tables -match $table) {
      Ok "Table '$table' exists"
      $passed++
    } else {
      Fail "Table '$table' not found (run migrations/phase89-schema.sql)"
      $failed++
    }
  }
} catch {
  Fail "Schema check failed: $($_.Exception.Message)"
  $failed += 3
}

# Test 5: run-safe.ps1 exists
Info "Test 5: Checking deliverable files..."
$runSafe = "..\go-services\knowledge-plane\run-safe.ps1"
if (Test-Path $runSafe) {
  Ok "run-safe.ps1 exists"
  $passed++

  # Check configuration
  $content = Get-Content $runSafe -Raw
  if ($content -match "postgresql://user:pass@127.0.0.1:5434/legal") {
    Ok "Database URL correct (user:pass@5434/legal)"
    $passed++
  } else {
    Fail "Database URL incorrect in run-safe.ps1"
    $failed++
  }
} else {
  Fail "run-safe.ps1 not found"
  $failed += 2
}

# Summary
Write-Host "`n" -NoNewline
Write-Host "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━" -ForegroundColor Cyan
Write-Host "Results: $passed passed, $failed failed" -ForegroundColor $(if ($failed -eq 0) { "Green" } else { "Yellow" })
Write-Host "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━" -ForegroundColor Cyan

if ($failed -eq 0) {
  Write-Host "`n✅ All tests passed! Phase 89 ready.`n" -ForegroundColor Green
  Write-Host "Next steps:" -ForegroundColor Cyan
  Write-Host "  1. cd ..\go-services\knowledge-plane; .\run-safe.ps1" -ForegroundColor Gray
  Write-Host "  2. node scripts\phase89-error-graph-builder.mjs --build-graph`n" -ForegroundColor Gray
  exit 0
} else {
  Write-Host "`n⚠️  Some tests failed. Check configuration.`n" -ForegroundColor Yellow
  Write-Host "Fix steps:" -ForegroundColor Cyan
  Write-Host "  1. Apply schema: Get-Content migrations\phase89-schema.sql | docker exec -i phase66-postgres psql -U user -d legal" -ForegroundColor Gray
  Write-Host "  2. Start containers: cd ..\go-services\knowledge-plane; .\run-safe.ps1`n" -ForegroundColor Gray
  exit 1
}
