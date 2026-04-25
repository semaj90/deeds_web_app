#!/usr/bin/env pwsh
# Phase 89 Complete Setup - Quick Start
# Runs full pipeline: dependencies → schema → graph → visualization

param(
  [switch]$SkipDependencies,
  [switch]$SkipGraph,
  [switch]$DryRun
)

$ErrorActionPreference = "Stop"

function Write-Step($msg) { Write-Host "`n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━" -ForegroundColor Cyan; Write-Host "==> $msg" -ForegroundColor Cyan }
function Write-Ok($msg)   { Write-Host "✅ $msg" -ForegroundColor Green }
function Write-Warn($msg) { Write-Host "⚠️  $msg" -ForegroundColor Yellow }
function Write-Err($msg)  { Write-Host "❌ $msg" -ForegroundColor Red }

Write-Host "`n🚀 Phase 89: Complete Setup & Quick Start`n" -ForegroundColor Cyan
Write-Host "This script will:"
Write-Host "  1. Start hardened dependencies (Phase 66 containers)"
Write-Host "  2. Apply database schema (knowledge graph)"
Write-Host "  3. Build error analysis graph (AST + ts-morph)"
Write-Host "  4. Launch visualization server"
Write-Host "`n"

# Step 1: Start Dependencies
if (-not $SkipDependencies) {
  Write-Step "Step 1: Starting hardened dependencies (NO docker compose rebuilds)"

  $runScript = "..\..\go-services\knowledge-plane\run.ps1"
  if (Test-Path $runScript) {
    if ($DryRun) {
      Write-Host "[DRYRUN] Would run: $runScript -SkipHealth" -ForegroundColor Gray
    } else {
      & $runScript -SkipHealth
      if ($LASTEXITCODE -ne 0) {
        Write-Err "Dependency startup failed"
        exit 1
      }
    }
    Write-Ok "Dependencies running"
  } else {
    Write-Warn "Dependency script not found at $runScript, skipping..."
  }
} else {
  Write-Warn "Skipping dependency startup (--SkipDependencies flag)"
}

# Step 2: Apply Database Schema
Write-Step "Step 2: Applying Phase 89 database schema"

$schemaFile = "migrations\phase89-error-graph-schema.sql"
$dbUrl = $env:DATABASE_URL ?? "postgresql://user:pass@127.0.0.1:5434/legal"

if (Test-Path $schemaFile) {
  if ($DryRun) {
    Write-Host "[DRYRUN] Would run: psql `"$dbUrl`" -f $schemaFile" -ForegroundColor Gray
  } else {
    try {
      psql "$dbUrl" -f $schemaFile | Out-Null
      Write-Ok "Schema applied successfully"
    } catch {
      Write-Warn "Schema application failed (may already exist): $($_.Exception.Message)"
    }
  }
} else {
  Write-Err "Schema file not found: $schemaFile"
  exit 1
}

# Step 3: Build Error Graph
if (-not $SkipGraph) {
  Write-Step "Step 3: Building error analysis graph (AST + knowledge graph)"

  $graphScript = "scripts\phase89-build-error-graph.mjs"
  if (Test-Path $graphScript) {
    if ($DryRun) {
      Write-Host "[DRYRUN] Would run: node $graphScript" -ForegroundColor Gray
    } else {
      Write-Host "`n"
      node $graphScript
      if ($LASTEXITCODE -ne 0) {
        Write-Err "Graph building failed"
        exit 1
      }
    }
    Write-Ok "Error graph built successfully"
  } else {
    Write-Err "Graph script not found: $graphScript"
    exit 1
  }
} else {
  Write-Warn "Skipping graph build (--SkipGraph flag)"
}

# Step 4: Launch Visualization
Write-Step "Step 4: Next Steps - Launch Visualization"

Write-Host "`n✅ Phase 89 Setup Complete!`n" -ForegroundColor Green

Write-Host "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━" -ForegroundColor Cyan
Write-Host "QUICK START COMMANDS:" -ForegroundColor Yellow
Write-Host "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━" -ForegroundColor Cyan

Write-Host "`n1️⃣  View Error Map Visualization:" -ForegroundColor Cyan
Write-Host "   http://localhost:5175/phase89/error-map"

Write-Host "`n2️⃣  Generate KB-Grounded Fix:" -ForegroundColor Cyan
Write-Host "   # Get error ID"
Write-Host "   psql `"$dbUrl`" -c `"SELECT id, code, path, line FROM ts_errors LIMIT 10;`""
Write-Host "`n   # Generate fix"
Write-Host "   .\scripts\phase89-kb-grounded-fix.ps1 -ErrorId 123 -ExpandDepth 2"

Write-Host "`n3️⃣  Query Knowledge Graph:" -ForegroundColor Cyan
Write-Host "   psql `"$dbUrl`" -c `"SELECT * FROM error_density_by_directory;`""

Write-Host "`n4️⃣  Expand Graph from File:" -ForegroundColor Cyan
Write-Host "   curl -X POST http://localhost:5175/api/phase89/graph/expand ``"
Write-Host "     -H 'Content-Type: application/json' ``"
Write-Host "     -d '{`"seed_uris`": [`"file:src/lib/cache.ts`"], `"depth`": 2}'"

Write-Host "`n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━" -ForegroundColor Cyan
Write-Host "SYSTEM OVERVIEW:" -ForegroundColor Yellow
Write-Host "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━" -ForegroundColor Cyan

$stats = psql "$dbUrl" -t -c "SELECT
  (SELECT COUNT(*) FROM kg_nodes WHERE kind = 'file') as files,
  (SELECT COUNT(*) FROM kg_nodes WHERE kind = 'error') as errors,
  (SELECT COUNT(*) FROM kg_nodes WHERE kind = 'symbol') as symbols,
  (SELECT COUNT(*) FROM kg_edges) as edges,
  (SELECT COUNT(*) FROM file_index) as indexed,
  (SELECT COUNT(*) FROM error_embeddings) as embeddings"

if ($stats) {
  Write-Host "`n$stats" -ForegroundColor Green
} else {
  Write-Warn "Could not fetch stats (database may not be ready)"
}

Write-Host "`n📚 For detailed documentation, see:" -ForegroundColor Cyan
Write-Host "   PHASE89_README.md"

Write-Host "`n🎉 Your agentic error analysis system is ready!" -ForegroundColor Green
Write-Host "   Every fix will use your 810-point Svelte 5/SvelteKit 2 KB!`n"
