#!/usr/bin/env pwsh
<#
.SYNOPSIS
Run Phase 76 KB ingestion with correct Postgres credentials

.DESCRIPTION
Sets PGUSER/PGPASSWORD environment variables to override .pgpass file,
then runs phase76-kb-update.mjs with proper authentication.

.EXAMPLE
.\phase76-run-kb-ingest.ps1 -Paths "NEXT_STEPS_LOG.md" -Tags "ace,mcp" -Kind "kb_doc"
#>

param(
    [Parameter(Mandatory=$false)]
    [string[]]$Paths = @("NEXT_STEPS_LOG.md"),

    [Parameter(Mandatory=$false)]
    [string]$Tags = "ace,mcp,phase76",

    [Parameter(Mandatory=$false)]
    [string]$Kind = "kb_doc",

    [Parameter(Mandatory=$false)]
    [switch]$IngestACEPrompts,

    [Parameter(Mandatory=$false)]
    [switch]$IngestLLMOutputs,

    [Parameter(Mandatory=$false)]
    [string]$RunId
)

Write-Host "🚀 Phase 76: KB Ingestion Wrapper" -ForegroundColor Cyan
Write-Host "=" * 80 -ForegroundColor Cyan
Write-Host ""

# ============================================================================
# Set Postgres Environment Variables (override .pgpass)
# ============================================================================

Write-Host "1️⃣ Setting Postgres credentials..." -ForegroundColor Yellow

$env:PGHOST = "127.0.0.1"
$env:PGPORT = "5434"
$env:PGDATABASE = "legal"
$env:PGUSER = "user"
$env:PGPASSWORD = "pass"

Write-Host "   ✅ PGUSER=user" -ForegroundColor Green
Write-Host "   ✅ PGHOST=127.0.0.1" -ForegroundColor Green
Write-Host "   ✅ PGPORT=5434" -ForegroundColor Green
Write-Host "   ✅ PGDATABASE=legal" -ForegroundColor Green
Write-Host ""

# ============================================================================
# Build Command
# ============================================================================

Write-Host "2️⃣ Building command..." -ForegroundColor Yellow

if ($IngestACEPrompts) {
    $cmd = "node scripts/phase76-kb-update.mjs --kind ace_prompt_templates"
    Write-Host "   📋 Mode: Ingest ACE prompt templates" -ForegroundColor Cyan
}
elseif ($IngestLLMOutputs) {
    if ($RunId) {
        $cmd = "node scripts/phase76-kb-update.mjs --kind ace_llm_outputs --run-id $RunId"
        Write-Host "   📋 Mode: Ingest LLM outputs (run $RunId)" -ForegroundColor Cyan
    }
    else {
        Write-Host "   ❌ --RunId required for LLM outputs mode" -ForegroundColor Red
        exit 1
    }
}
else {
    $pathArgs = $Paths -join " "
    $cmd = "node scripts/phase76-kb-update.mjs --paths $pathArgs --tags $Tags --kind $Kind"
    Write-Host "   📋 Mode: Ingest files" -ForegroundColor Cyan
    Write-Host "   📄 Paths: $($Paths -join ', ')" -ForegroundColor Gray
    Write-Host "   🏷️  Tags: $Tags" -ForegroundColor Gray
    Write-Host "   📦 Kind: $Kind" -ForegroundColor Gray
}

Write-Host ""

# ============================================================================
# Execute
# ============================================================================

Write-Host "3️⃣ Running ingestion..." -ForegroundColor Yellow
Write-Host ""

Invoke-Expression $cmd

$exitCode = $LASTEXITCODE

# ============================================================================
# Cleanup
# ============================================================================

Remove-Item Env:\PGHOST
Remove-Item Env:\PGPORT
Remove-Item Env:\PGDATABASE
Remove-Item Env:\PGUSER
Remove-Item Env:\PGPASSWORD

Write-Host ""
if ($exitCode -eq 0) {
    Write-Host "✅ Ingestion complete!" -ForegroundColor Green
}
else {
    Write-Host "❌ Ingestion failed with exit code $exitCode" -ForegroundColor Red
}

Write-Host ""

exit $exitCode
