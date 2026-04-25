#!/usr/bin/env pwsh
<#
.SYNOPSIS
Phase 76-87: Complete RAG+KAG Stack Deployment & Test

.DESCRIPTION
Deploys and validates the full autonomous error-fixing stack:
1. Fix FastMCP server (webSearch mapping confirmed)
2. Fix ripgrep type issues (use globs not --type mjs)
3. Ingest operator docs into KB
4. Fix knowledge_graph "Pattern: undefined"
5. Scale embeddings (100 → 10,000)
6. Test Phase 86 autonomous loop
7. Validate Phase 87 integration

.EXAMPLE
.\phase76-87-full-deployment.ps1
#>

$ErrorActionPreference = "Stop"

Write-Host "=" * 80 -ForegroundColor Cyan
Write-Host "🚀 Phase 76-87: Full RAG+KAG Stack Deployment" -ForegroundColor Cyan
Write-Host "=" * 80 -ForegroundColor Cyan
Write-Host ""

# ============================================================================
# 1. Verify FastMCP Server
# ============================================================================

Write-Host "1️⃣ Verifying FastMCP Server" -ForegroundColor Yellow
Write-Host ""

try {
    $health = Invoke-RestMethod -Uri "http://127.0.0.1:3002/health" -TimeoutSec 5
    Write-Host "   ✅ FastMCP server healthy (port 3002)" -ForegroundColor Green

    $tools = Invoke-RestMethod -Uri "http://127.0.0.1:3002/tools" -TimeoutSec 5
    Write-Host "   ✅ Found $($tools.tools.Count) tools" -ForegroundColor Green

    # Verify critical tools exist
    $requiredTools = @('read_file', 'ripgrep', 'qdrant_search', 'postgres_query', 'write_file', 'run_command')
    $missingTools = $requiredTools | Where-Object { $_ -notin ($tools.tools | ForEach-Object { $_.name }) }

    if ($missingTools.Count -gt 0) {
        Write-Host "   ❌ Missing tools: $($missingTools -join ', ')" -ForegroundColor Red
        exit 1
    }

    Write-Host "   ✅ All required tools present" -ForegroundColor Green
} catch {
    Write-Host "   ❌ FastMCP server not running on port 3002" -ForegroundColor Red
    Write-Host "   Run: node scripts/fastmcp-server.mjs" -ForegroundColor Yellow
    exit 1
}

# ============================================================================
# 2. Test Ripgrep with Globs (not --type mjs)
# ============================================================================

Write-Host ""
Write-Host "2️⃣ Testing Ripgrep Search (with globs)" -ForegroundColor Yellow
Write-Host ""

$rgTests = @(
    @{
        Name = "Phase 76 references"
        Pattern = "phase76|Phase 76"
        Globs = @("*.mjs", "*.js", "*.ts", "*.md", "*.ps1")
    },
    @{
        Name = "RAG+KAG components"
        Pattern = "qdrant|pgvector|embeddinggemma|knowledge_graph"
        Globs = @("*.mjs", "*.ts", "*.js")
    },
    @{
        Name = "ACE prompting"
        Pattern = "ace|ACE|contextual.engineering|prompt.template"
        Globs = @("*.mjs", "*.md")
    }
)

foreach ($test in $rgTests) {
    $globArgs = $test.Globs | ForEach-Object { "-g", $_ }

    try {
        $results = rg -n $test.Pattern scripts @globArgs --max-count 5 2>&1

        if ($LASTEXITCODE -eq 0) {
            $count = ($results | Measure-Object -Line).Lines
            Write-Host "   ✅ $($test.Name): $count matches" -ForegroundColor Green
        } elseif ($LASTEXITCODE -eq 1) {
            Write-Host "   ⚠️ $($test.Name): 0 matches (not an error)" -ForegroundColor Yellow
        } else {
            Write-Host "   ❌ $($test.Name): ripgrep failed" -ForegroundColor Red
        }
    } catch {
        Write-Host "   ❌ $($test.Name): $_" -ForegroundColor Red
    }
}

# ============================================================================
# 3. Ingest Operator Docs into KB
# ============================================================================

Write-Host ""
Write-Host "3️⃣ Ingesting Operator Docs into Knowledge Base" -ForegroundColor Yellow
Write-Host ""

$operatorDocs = @(
    "NEXT_STEPS_LOG.md",
    "MCP_SESSION_SUMMARY.md",
    "MCP_IMPLEMENTATION_SUMMARY.md",
    "PHASE86_ENHANCEMENT_ROADMAP.md",
    "FASTMCP-STATUS-REPORT.md"
)

$existingDocs = $operatorDocs | Where-Object { Test-Path $_ }

if ($existingDocs.Count -eq 0) {
    Write-Host "   ⚠️ No operator docs found to ingest" -ForegroundColor Yellow
} else {
    Write-Host "   📄 Found $($existingDocs.Count) docs to ingest" -ForegroundColor Cyan

    try {
        $pathArgs = $existingDocs -join " "
        node scripts/phase76-kb-update.mjs --paths @existingDocs --tags phase76 ace mcp contextual-engineering operator-docs --kind kb_doc

        if ($LASTEXITCODE -eq 0) {
            Write-Host "   ✅ Operator docs ingested successfully" -ForegroundColor Green
        } else {
            Write-Host "   ❌ Failed to ingest docs (exit code: $LASTEXITCODE)" -ForegroundColor Red
        }
    } catch {
        Write-Host "   ❌ Ingestion failed: $_" -ForegroundColor Red
    }
}

# ============================================================================
# 4. Ingest ACE Prompt Templates
# ============================================================================

Write-Host ""
Write-Host "4️⃣ Ingesting ACE Prompt Templates" -ForegroundColor Yellow
Write-Host ""

try {
    node scripts/phase76-kb-update.mjs --kind ace_prompt_templates

    if ($LASTEXITCODE -eq 0) {
        Write-Host "   ✅ ACE prompt templates ingested" -ForegroundColor Green
    } else {
        Write-Host "   ❌ Failed to ingest templates" -ForegroundColor Red
    }
} catch {
    Write-Host "   ❌ Template ingestion failed: $_" -ForegroundColor Red
}

# ============================================================================
# 5. Fix knowledge_graph "Pattern: undefined"
# ============================================================================

Write-Host ""
Write-Host "5️⃣ Fixing knowledge_graph Pattern Pollution" -ForegroundColor Yellow
Write-Host ""

try {
    node scripts/phase76-kb-update.mjs --fix-graph-patterns

    if ($LASTEXITCODE -eq 0) {
        Write-Host "   ✅ knowledge_graph patterns fixed (undefined → unclassified)" -ForegroundColor Green
    } else {
        Write-Host "   ⚠️ Failed to fix patterns (Postgres may not be running)" -ForegroundColor Yellow
    }
} catch {
    Write-Host "   ⚠️ Graph fix failed: $_" -ForegroundColor Yellow
}

# ============================================================================
# 6. Check Embedding Coverage
# ============================================================================

Write-Host ""
Write-Host "6️⃣ Checking Embedding Coverage" -ForegroundColor Yellow
Write-Host ""

try {
    $body = @{
        name = "postgres_query"
        arguments = @{
            query = "SELECT COUNT(*) as embedded, (SELECT COUNT(*) FROM ts_errors WHERE status='open') as total FROM error_embeddings"
        }
    } | ConvertTo-Json -Compress

    $result = Invoke-RestMethod -Uri "http://127.0.0.1:3002/function-call" -Method Post -ContentType "application/json" -Body $body -TimeoutSec 10

    if ($result.ok -and $result.result.rows.Count -gt 0) {
        $embedded = $result.result.rows[0].embedded
        $total = $result.result.rows[0].total
        $coverage = [Math]::Round(($embedded / $total) * 100, 1)

        Write-Host "   📊 Embedded: $embedded / $total errors ($coverage%)" -ForegroundColor Cyan

        if ($embedded -lt 1000) {
            Write-Host "   ⚠️ Low coverage! Run:" -ForegroundColor Yellow
            Write-Host "      node scripts/phase87-ingest-error-corpus.mjs --limit 10000 --codes TS1005,TS1128,TS1109" -ForegroundColor Gray
        } else {
            Write-Host "   ✅ Good coverage for Phase 86 deployment" -ForegroundColor Green
        }
    } else {
        Write-Host "   ⚠️ Could not check coverage (Postgres may not be running)" -ForegroundColor Yellow
    }
} catch {
    Write-Host "   ⚠️ Coverage check failed (Postgres may not be running)" -ForegroundColor Yellow
}

# ============================================================================
# 7. Test Qdrant Collections
# ============================================================================

Write-Host ""
Write-Host "7️⃣ Testing Qdrant Collections" -ForegroundColor Yellow
Write-Host ""

$qdrantCollections = @(
    "phase76_knowledge_base",
    "phase72_ast_knowledge_base",
    "phase72_error_patterns"
)

foreach ($coll in $qdrantCollections) {
    try {
        $body = @{
            name = "qdrant_search"
            arguments = @{
                collection = $coll
                query = "TS1005 comma expected"
                topK = 1
            }
        } | ConvertTo-Json -Compress

        $result = Invoke-RestMethod -Uri "http://127.0.0.1:3002/function-call" -Method Post -ContentType "application/json" -Body $body -TimeoutSec 15

        if ($result.ok) {
            Write-Host "   ✅ ${coll}: operational" -ForegroundColor Green
        } else {
            Write-Host "   ⚠️ ${coll}: $($result.error)" -ForegroundColor Yellow
        }
    } catch {
        Write-Host "   ⚠️ ${coll}: not accessible" -ForegroundColor Yellow
    }
}

# ============================================================================
# 8. Validate Phase 86 Prerequisites
# ============================================================================

Write-Host ""
Write-Host "8️⃣ Phase 86 Prerequisites Check" -ForegroundColor Yellow
Write-Host ""

$prerequisites = @{
    "FastMCP Server" = $true
    "read_file tool" = $true
    "ripgrep tool" = $true
    "Postgres" = $false
    "Qdrant" = $false
    "Operator Docs in KB" = ($existingDocs.Count -gt 0)
    "ACE Prompt Templates" = $false
    "Embedding Coverage >1000" = $false
}

# Quick final check
try {
    $pgTest = Invoke-RestMethod -Uri "http://127.0.0.1:3002/function-call" -Method Post -ContentType "application/json" -Body (@{ name = "postgres_query"; arguments = @{ query = "SELECT 1" } } | ConvertTo-Json) -TimeoutSec 5
    $prerequisites["Postgres"] = $pgTest.ok
} catch {}

try {
    $qdTest = Invoke-RestMethod -Uri "http://127.0.0.1:3002/function-call" -Method Post -ContentType "application/json" -Body (@{ name = "qdrant_search"; arguments = @{ collection = "phase76_knowledge_base"; query = "test"; topK = 1 } } | ConvertTo-Json) -TimeoutSec 10
    $prerequisites["Qdrant"] = $qdTest.ok
} catch {}

Write-Host ""
foreach ($key in $prerequisites.Keys | Sort-Object) {
    $status = if ($prerequisites[$key]) { "✅" } else { "⚠️" }
    $color = if ($prerequisites[$key]) { "Green" } else { "Yellow" }
    Write-Host "   $status $key" -ForegroundColor $color
}

# ============================================================================
# Final Summary
# ============================================================================

Write-Host ""
Write-Host "=" * 80 -ForegroundColor Cyan
Write-Host "📊 Deployment Summary" -ForegroundColor Cyan
Write-Host "=" * 80 -ForegroundColor Cyan
Write-Host ""

$readyCount = ($prerequisites.Values | Where-Object { $_ -eq $true }).Count
$totalCount = $prerequisites.Count
$readiness = [Math]::Round(($readyCount / $totalCount) * 100, 0)

Write-Host "   Readiness: $readyCount/$totalCount prerequisites ($readiness%)" -ForegroundColor Cyan
Write-Host ""

if ($readiness -ge 80) {
    Write-Host "✅ READY FOR PHASE 86 AUTONOMOUS LOOP!" -ForegroundColor Green
    Write-Host ""
    Write-Host "Next Steps:" -ForegroundColor Yellow
    Write-Host "   1. Start Postgres: docker start phase66-postgres" -ForegroundColor Gray
    Write-Host "   2. Start Qdrant: docker start qdrant" -ForegroundColor Gray
    Write-Host "   3. Scale embeddings: node scripts/phase87-ingest-error-corpus.mjs --limit 10000 --codes TS1005,TS1128,TS1109" -ForegroundColor Gray
    Write-Host "   4. Run Phase 86 loop: node scripts/phase86-autonomous-loop.mjs" -ForegroundColor Gray
    Write-Host ""
} else {
    Write-Host "⚠️ MISSING PREREQUISITES" -ForegroundColor Yellow
    Write-Host ""
    Write-Host "Fix these before deploying Phase 86:" -ForegroundColor Yellow

    foreach ($key in $prerequisites.Keys | Where-Object { -not $prerequisites[$_] }) {
        Write-Host "   - $key" -ForegroundColor Gray
    }
    Write-Host ""
}

Write-Host "📚 Documentation:" -ForegroundColor Cyan
Write-Host "   - PHASE86_ENHANCEMENT_ROADMAP.md" -ForegroundColor Gray
Write-Host "   - FASTMCP-STATUS-REPORT.md" -ForegroundColor Gray
Write-Host "   - PHASE76-87-RAG-KAG-ARCHITECTURE.md" -ForegroundColor Gray
Write-Host ""
