#!/usr/bin/env pwsh
# Quick Start: Agentic Error Resolution
# Fixes 47K errors using 3-phase automated + AI-assisted pipeline

Write-Host ""
Write-Host "╔════════════════════════════════════════════════════════════╗" -ForegroundColor Cyan
Write-Host "║                                                            ║" -ForegroundColor Cyan
Write-Host "║   Agentic Error Resolution System                         ║" -ForegroundColor Cyan
Write-Host "║   Legal AI Platform - 47K Error Fix Pipeline              ║" -ForegroundColor Cyan
Write-Host "║                                                            ║" -ForegroundColor Cyan
Write-Host "╚════════════════════════════════════════════════════════════╝" -ForegroundColor Cyan
Write-Host ""

# Change to project directory
Set-Location $PSScriptRoot

Write-Host "📊 Current Error Count:" -ForegroundColor Yellow
Write-Host ""
try {
    npx svelte-check --threshold error 2>&1 | Select-String "error" | Write-Host -ForegroundColor Red
} catch {
    Write-Host "   (Too many errors to count - proceeding with fixes...)" -ForegroundColor Gray
}

Write-Host ""
Write-Host "🚀 Starting Error Resolution Pipeline..." -ForegroundColor Green
Write-Host ""

# Check prerequisites
Write-Host "🔍 Checking prerequisites..." -ForegroundColor Yellow

# Check if Ollama is running (optional for Phase 1 & 2)
try {
    $ollamaStatus = Invoke-WebRequest -Uri "http://localhost:11434/api/tags" -TimeoutSec 2 -ErrorAction Stop
    Write-Host "   ✅ Ollama is running" -ForegroundColor Green
    $ollamaAvailable = $true
} catch {
    Write-Host "   ⚠️  Ollama not detected (Phase 3 will be skipped)" -ForegroundColor Yellow
    Write-Host "      To enable AI-assisted fixes, run:" -ForegroundColor Gray
    Write-Host "        ollama serve" -ForegroundColor Gray
    Write-Host "        ollama pull gemma3-legal:latest" -ForegroundColor Gray
    $ollamaAvailable = $false
}

Write-Host ""

# Ask user what to run
Write-Host "Select operation:" -ForegroundColor Cyan
Write-Host "  1. Run all phases (automated + AI-assisted)" -ForegroundColor White
Write-Host "  2. Run Phase 1 only (automated syntax fixes)" -ForegroundColor White
Write-Host "  3. Run Phase 1 + 2 (automated + imports)" -ForegroundColor White
Write-Host "  4. Run Phase 3 only (AI-assisted, requires Ollama)" -ForegroundColor White
Write-Host "  5. Check current error count only" -ForegroundColor White
Write-Host ""
$choice = Read-Host "Enter choice (1-5)"

switch ($choice) {
    "1" {
        Write-Host ""
        Write-Host "🚀 Running all phases..." -ForegroundColor Green
        node agentic-error-resolution/scripts/run-all-phases.mjs
    }
    "2" {
        Write-Host ""
        Write-Host "🚀 Running Phase 1 (Automated Fixes)..." -ForegroundColor Green
        node agentic-error-resolution/scripts/phase1-automated-fixes.mjs
    }
    "3" {
        Write-Host ""
        Write-Host "🚀 Running Phase 1 + 2..." -ForegroundColor Green
        node agentic-error-resolution/scripts/phase1-automated-fixes.mjs
        Write-Host ""
        node agentic-error-resolution/scripts/phase2-import-fixes.mjs
    }
    "4" {
        if (-not $ollamaAvailable) {
            Write-Host ""
            Write-Host "❌ Ollama is required for Phase 3" -ForegroundColor Red
            Write-Host "   Please start Ollama first:" -ForegroundColor Yellow
            Write-Host "     ollama serve" -ForegroundColor Gray
            Write-Host "     ollama pull gemma3-legal:latest" -ForegroundColor Gray
            exit 1
        }
        Write-Host ""
        Write-Host "🚀 Running Phase 3 (AI-Assisted)..." -ForegroundColor Green
        node agentic-error-resolution/scripts/phase3-ai-repair.mjs
    }
    "5" {
        Write-Host ""
        Write-Host "📊 Running full error check..." -ForegroundColor Yellow
        npx svelte-check --threshold error
    }
    default {
        Write-Host ""
        Write-Host "❌ Invalid choice. Exiting." -ForegroundColor Red
        exit 1
    }
}

Write-Host ""
Write-Host "✨ Operation complete!" -ForegroundColor Green
Write-Host ""
Write-Host "📝 View logs:" -ForegroundColor Cyan
Write-Host "   Get-ChildItem agentic-error-resolution/logs/*.log | Sort-Object LastWriteTime -Descending | Select-Object -First 1" -ForegroundColor Gray
Write-Host ""
Write-Host "📊 View summaries:" -ForegroundColor Cyan
Write-Host "   Get-Content agentic-error-resolution/errors/phase*-summary.json | ConvertFrom-Json" -ForegroundColor Gray
Write-Host ""
Write-Host "🔍 Check remaining errors:" -ForegroundColor Cyan
Write-Host "   npx svelte-check --threshold error" -ForegroundColor Gray
Write-Host ""
