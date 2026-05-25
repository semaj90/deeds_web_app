#!/usr/bin/env pwsh
# Phase 88: Complete Documentation Ingestion Pipeline
# Crawls web docs + ingests local operator docs into Qdrant

Write-Host "📚 Phase 88: Documentation Ingestion Pipeline" -ForegroundColor Cyan
Write-Host "============================================`n" -ForegroundColor Cyan

$ErrorActionPreference = "Continue"

# Check dependencies
Write-Host "1. Checking dependencies..." -ForegroundColor Yellow
$missing = @()
if (-not (Get-Command node -ErrorAction SilentlyContinue)) { $missing += "Node.js" }
if (-not (Test-Path "scripts/phase76-knowledge-builder.mjs")) { $missing += "phase76-knowledge-builder.mjs" }
if (-not (Test-Path "scripts/phase76-run-kb-ingest.ps1")) { $missing += "phase76-run-kb-ingest.ps1" }

if ($missing.Count -gt 0) {
    Write-Host "   ❌ Missing: $($missing -join ', ')" -ForegroundColor Red
    exit 1
}
Write-Host "   ✅ All dependencies found" -ForegroundColor Green

# Create knowledge manifest if not exists
$manifestPath = "data/knowledge/kb-manifest-core.txt"
$policyFile = "data/knowledge/SVELTE5_CODE_POLICY.md"
if (-not (Test-Path $manifestPath)) {
    Write-Host "`n2. Creating knowledge base manifest..." -ForegroundColor Yellow
    New-Item -ItemType Directory -Path "data/knowledge" -Force | Out-Null

    @"
NEXT_STEPS_LOG.md
MCP_ARCHITECTURE_GUIDE.md
MCP_SESSION_SUMMARY.md
MCP_IMPLEMENTATION_SUMMARY.md
LLM_ROUTER_README.md
ERROR_REDUCTION_SUMMARY.md
TEST_MIGRATION_SUMMARY.md
CRAWLER_MANIFEST.md
data/knowledge/ace-agentic-patterns.md
data/knowledge/SVELTE5_CODE_POLICY.md
"@ | Set-Content $manifestPath

    Write-Host "   ✅ Created $manifestPath" -ForegroundColor Green
}

# Web docs crawling
Write-Host "`n3. Crawling web documentation..." -ForegroundColor Yellow
Write-Host "   ⚠️  This will take 10-30 minutes depending on network speed" -ForegroundColor Gray

$crawls = @(
    @{Url="https://svelte.dev/docs/svelte"; Depth=2; Tags="svelte5,docs,frontend"; Name="Svelte 5"},
    @{Url="https://kit.svelte.dev/docs"; Depth=2; Tags="sveltekit2,docs,fullstack"; Name="SvelteKit 2"},
    @{Url="https://www.bits-ui.com/docs/introduction"; Depth=2; Tags="bits-ui,docs,svelte5"; Name="Bits UI"},
    @{Url="https://unocss.dev/guide/"; Depth=2; Tags="unocss,docs,styling"; Name="UnoCSS"},
    @{Url="https://orm.drizzle.team/docs/overview"; Depth=2; Tags="drizzle,docs,orm"; Name="Drizzle ORM"},
    @{Url="https://www.postgresql.org/docs/current/"; Depth=1; Tags="postgres17,docs,db"; Name="PostgreSQL 17"},
    @{Url="https://github.com/pgvector/pgvector"; Depth=1; Tags="pgvector,docs,db"; Name="pgvector"}
)

$completed = 0
$failed = 0

foreach ($crawl in $crawls) {
    Write-Host "`n   🕷️  Crawling $($crawl.Name)..." -ForegroundColor Cyan
    Write-Host "      URL: $($crawl.Url)" -ForegroundColor Gray
    Write-Host "      Depth: $($crawl.Depth), Tags: $($crawl.Tags)" -ForegroundColor Gray

    try {
        $result = node scripts/phase76-knowledge-builder.mjs `
            --crawl $crawl.Url `
            --depth $crawl.Depth `
            --tags $crawl.Tags `
            2>&1 | Tee-Object -Variable output

        if ($LASTEXITCODE -eq 0) {
            Write-Host "      ✅ $($crawl.Name) complete" -ForegroundColor Green
            # Show last 5 lines of output
            $output | Select-Object -Last 5 | ForEach-Object {
                Write-Host "         $_" -ForegroundColor Gray
            }
            $completed++
        } else {
            Write-Host "      ⚠️  $($crawl.Name) failed (exit code $LASTEXITCODE)" -ForegroundColor Yellow
            $failed++
        }
    } catch {
        Write-Host "      ❌ $($crawl.Name) error: $($_.Exception.Message)" -ForegroundColor Red
        $failed++
    }

    Start-Sleep -Seconds 2
}

Write-Host "`n   📊 Crawl Summary: $completed completed, $failed failed" -ForegroundColor $(if ($failed -eq 0) { "Green" } else { "Yellow" })

# Local operator docs ingestion
Write-Host "`n4. Ingesting local operator documentation..." -ForegroundColor Yellow

if (Test-Path $manifestPath) {
    $docs = Get-Content $manifestPath | Where-Object { $_ -and $_.Trim() -ne "" }
    $ingested = 0
    $skipped = 0

    foreach ($doc in $docs) {
        if (Test-Path $doc) {
            Write-Host "   📄 Ingesting $doc..." -ForegroundColor Gray
            try {
                .\scripts\phase76-run-kb-ingest.ps1 `
                    -Paths $doc `
                    -Tags "ace,operator-docs,phase76,phase87" `
                    -Kind "kb_doc" `
                    -ErrorAction Stop | Out-Null
                $ingested++
            } catch {
                Write-Host "      ⚠️  Failed: $($_.Exception.Message)" -ForegroundColor Yellow
            }
        } else {
            Write-Host "   ⏭️  Skipping $doc (not found)" -ForegroundColor Gray
            $skipped++
        }
    }

    Write-Host "   ✅ Ingested $ingested docs ($skipped skipped)" -ForegroundColor Green
} else {
    Write-Host "   ⚠️  Manifest not found: $manifestPath" -ForegroundColor Yellow
}

# Search for additional docs via llms.txt and ripgrep
Write-Host "`n5. Discovering additional documentation..." -ForegroundColor Yellow

if (Test-Path "llms.txt") {
    Write-Host "   📋 Found llms.txt, checking for additional doc references..." -ForegroundColor Gray
    $llmsContent = Get-Content "llms.txt" -Raw

    # Search for markdown files referenced
    $mdRefs = Select-String -Path "llms.txt" -Pattern '\.md(?!\.)' -AllMatches |
        Select-Object -ExpandProperty Matches |
        Select-Object -ExpandProperty Value -Unique

    if ($mdRefs) {
        Write-Host "   📚 Found $($mdRefs.Count) markdown references in llms.txt" -ForegroundColor Cyan
        foreach ($ref in $mdRefs | Select-Object -First 10) {
            Write-Host "      - $ref" -ForegroundColor Gray
        }
    }
}

# Ripgrep search for README and docs
Write-Host "`n   🔍 Searching codebase for documentation..." -ForegroundColor Gray
$docPatterns = @("README\.md$", "GUIDE\.md$", "ARCHITECTURE\.md$", "SUMMARY\.md$")

foreach ($pattern in $docPatterns) {
    if (Get-Command rg -ErrorAction SilentlyContinue) {
        $matches = rg --files --glob "*$pattern" 2>$null
        if ($matches) {
            Write-Host "   📄 Found docs matching $pattern" -ForegroundColor Gray
            $matches | Select-Object -First 5 | ForEach-Object {
                Write-Host "      - $_" -ForegroundColor DarkGray
            }
        }
    }
}

# Verification
Write-Host "`n6. Verifying ingestion..." -ForegroundColor Yellow

Write-Host "   🔍 Testing retrieval with sample queries..." -ForegroundColor Gray

$testQueries = @(
    "Svelte 5 runes state derived effect",
    "SvelteKit 2 load function page server actions",
    "Bits UI Dialog Svelte 5"
)

$knowledgePlaneUrl = "http://127.0.0.1:8792"
$hasKnowledgePlane = $false

try {
    Invoke-RestMethod -Uri "$knowledgePlaneUrl/health" -Method Get -TimeoutSec 2 -ErrorAction Stop | Out-Null
    $hasKnowledgePlane = $true
} catch {
    Write-Host "   ⚠️  Knowledge Plane not running (port 8792)" -ForegroundColor Yellow
}

if ($hasKnowledgePlane) {
    foreach ($query in $testQueries) {
        try {
            $body = @{ query = $query; sources = @("svelte", "sveltekit", "codebase"); max_results = 3 } | ConvertTo-Json
            $result = Invoke-RestMethod -Uri "$knowledgePlaneUrl/svelte/docs/search" -Method Post -Body $body -ContentType "application/json" -TimeoutSec 5
            Write-Host "   ✅ '$query' → $($result.results.Count) results" -ForegroundColor Green
        } catch {
            Write-Host "   ⚠️  '$query' → failed" -ForegroundColor Yellow
        }
    }
} else {
    Write-Host "   💡 Start Knowledge Plane to test retrieval:" -ForegroundColor Cyan
    Write-Host "      cd ../go-services/knowledge-plane && ./run.ps1" -ForegroundColor Gray
}

# Summary
Write-Host "`n============================================" -ForegroundColor Cyan
Write-Host "✅ Phase 88 Ingestion Complete!" -ForegroundColor Green
Write-Host "============================================`n" -ForegroundColor Cyan

Write-Host "📊 Summary:" -ForegroundColor Yellow
Write-Host "   - Web docs crawled: $completed/$($crawls.Count)" -ForegroundColor White
Write-Host "   - Operator docs ingested: $ingested" -ForegroundColor White
Write-Host "   - Knowledge Plane: $(if ($hasKnowledgePlane) { 'Running ✅' } else { 'Stopped ⏸️' })" -ForegroundColor White

Write-Host "`n📝 Next Steps:" -ForegroundColor Yellow
Write-Host "   1. Verify Qdrant has new docs:" -ForegroundColor Gray
Write-Host "      Invoke-RestMethod http://localhost:6333/collections/phase76_knowledge_base" -ForegroundColor DarkGray
Write-Host "   2. Test FastMCP knowledge_retrieve tool" -ForegroundColor Gray
Write-Host "   3. Run autonomous agent with new KB grounding" -ForegroundColor Gray

Write-Host ""
