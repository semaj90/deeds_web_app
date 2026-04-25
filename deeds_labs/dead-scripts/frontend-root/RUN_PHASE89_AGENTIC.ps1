# Phase 89: Complete Agentic Error Fixing Pipeline
# Raw text approach - no regex, just embeddings + cosine similarity

Write-Host "`n🤖 Phase 89: Agentic Error Fixing Pipeline`n" -ForegroundColor Cyan

# ============================================================
# Step 1: Generate Error Reports
# ============================================================
Write-Host "1️⃣  Generating error reports..." -ForegroundColor Yellow

if (!(Test-Path "reports")) {
    New-Item -ItemType Directory -Path "reports" | Out-Null
}

Write-Host "   Running TypeScript compiler..." -ForegroundColor Gray
npx tsc --noEmit --pretty false 2>&1 | Out-File -FilePath reports/tsc-errors.txt -Encoding utf8
$tscCount = (Get-Content reports/tsc-errors.txt | Where-Object { $_ -match 'error TS' }).Count
Write-Host "   ✅ Found $tscCount TypeScript errors" -ForegroundColor Green

Write-Host "   Running svelte-check..." -ForegroundColor Gray
npx svelte-check --output machine 2>&1 | Out-File -FilePath reports/svelte-check-errors.json -Encoding utf8
$svelteCount = (Get-Content reports/svelte-check-errors.json | Where-Object { $_ -match 'ERROR' }).Count
Write-Host "   ✅ Found $svelteCount svelte-check errors" -ForegroundColor Green

$totalErrors = $tscCount + $svelteCount
Write-Host "`n   📊 Total errors to fix: $totalErrors`n" -ForegroundColor Cyan

# ============================================================
# Step 2: Embed All Errors (Raw Text)
# ============================================================
Write-Host "2️⃣  Embedding all errors..." -ForegroundColor Yellow
Write-Host "   This will take 15-30 minutes for $totalErrors errors" -ForegroundColor Gray
Write-Host "   Press Ctrl+C to skip if already embedded`n" -ForegroundColor Gray

node scripts/phase89-raw-text-embedder.mjs

if ($LASTEXITCODE -ne 0) {
    Write-Host "   ❌ Embedding failed! Check Ollama is running" -ForegroundColor Red
    exit 1
}

# ============================================================
# Step 3: Verify Embeddings
# ============================================================
Write-Host "`n3️⃣  Verifying embeddings..." -ForegroundColor Yellow

$stats = docker exec phase66-postgres psql -U legal_admin -d legal_ai_db -t -c "SELECT source, COUNT(*) as total, COUNT(*) FILTER (WHERE embedding IS NOT NULL) as embedded FROM raw_error_embeddings GROUP BY source;"

Write-Host $stats
Write-Host ""

# ============================================================
# Step 4: Interactive Fix Menu
# ============================================================
Write-Host "4️⃣  Agentic Fixing Options`n" -ForegroundColor Yellow

Write-Host "Choose an option:" -ForegroundColor Cyan
Write-Host "  1. Search similar errors (e.g., 'TS1005 missing comma')" -ForegroundColor Gray
Write-Host "  2. Auto-fix top 100 errors" -ForegroundColor Gray
Write-Host "  3. Auto-fix specific error code (e.g., TS1005)" -ForegroundColor Gray
Write-Host "  4. Run full autonomous fixing (ALL errors)" -ForegroundColor Gray
Write-Host ""

$choice = Read-Host "Enter choice (1-4)"

switch ($choice) {
    "1" {
        $query = Read-Host "Enter error description"
        node scripts/phase89-similarity-ranker.mjs "$query"
    }
    "2" {
        Write-Host "`n🤖 Auto-fixing top 100 errors..." -ForegroundColor Yellow
        node scripts/phase89-agentic-fixer.mjs --limit 100
    }
    "3" {
        $errorCode = Read-Host "Enter error code (e.g., TS1005)"
        Write-Host "`n🤖 Auto-fixing all $errorCode errors..." -ForegroundColor Yellow
        node scripts/phase89-agentic-fixer.mjs --error-code $errorCode
    }
    "4" {
        Write-Host "`n🤖 FULL AUTONOMOUS MODE - This will attempt to fix ALL errors!" -ForegroundColor Red
        $confirm = Read-Host "Are you sure? (yes/no)"
        if ($confirm -eq "yes") {
            node scripts/phase89-agentic-fixer.mjs --limit 100000
        } else {
            Write-Host "   Cancelled" -ForegroundColor Yellow
        }
    }
    default {
        Write-Host "   Invalid choice" -ForegroundColor Red
    }
}

# ============================================================
# Step 5: Verify Fixes
# ============================================================
Write-Host "`n5️⃣  Verifying fixes..." -ForegroundColor Yellow

Write-Host "   Running TypeScript compiler..." -ForegroundColor Gray
npx tsc --noEmit --pretty false 2>&1 | Out-File -FilePath reports/tsc-errors-after.txt -Encoding utf8
$tscAfter = (Get-Content reports/tsc-errors-after.txt | Where-Object { $_ -match 'error TS' }).Count

Write-Host "`n📊 Before: $tscCount errors" -ForegroundColor Gray
Write-Host "📊 After:  $tscAfter errors" -ForegroundColor Gray

if ($tscAfter -lt $tscCount) {
    $fixed = $tscCount - $tscAfter
    $percent = [math]::Round(($fixed / $tscCount) * 100, 1)
    Write-Host "✅ Fixed $fixed errors ($percent% reduction)" -ForegroundColor Green
} else {
    Write-Host "⚠️  No reduction in errors" -ForegroundColor Yellow
}

Write-Host "`n✅ Phase 89 Complete!`n" -ForegroundColor Green
