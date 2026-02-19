#!/usr/bin/env pwsh
<#
.SYNOPSIS
    Phase 41: Svelte 5 transition directive fixes
.DESCRIPTION
    Fixes deprecated transition syntax and common Svelte 5 migration issues
#>

param(
    [switch]$DryRun,
    [switch]$Verbose
)

$ErrorActionPreference = "Stop"
Set-StrictMode -Version Latest

function Write-Phase { param($msg) Write-Host "🔷 $msg" -ForegroundColor Cyan }
function Write-Success { param($msg) Write-Host "✅ $msg" -ForegroundColor Green }
function Write-Warn { param($msg) Write-Host "⚠️  $msg" -ForegroundColor Yellow }

$RepoRoot = Split-Path -Parent $PSScriptRoot
$BackupDir = Join-Path $RepoRoot "phase41-backups-$(Get-Date -Format 'yyyyMMdd-HHmmss')"
$FixCount = 0
$FileCount = 0

Write-Host "`n🚀 Phase 41: Svelte 5 Transition Directive Fixes" -ForegroundColor Magenta
Write-Host "=" * 70

if (-not $DryRun) {
    Write-Phase "Creating backup directory: $BackupDir"
    New-Item -ItemType Directory -Force -Path $BackupDir | Out-Null
}

# Pattern 1: transitionfade → transition:fade
Write-Phase "Fixing transition directives..."
$svelteFiles = Get-ChildItem -Path (Join-Path $RepoRoot "src") -Filter "*.svelte" -Recurse -File

foreach ($file in $svelteFiles) {
    # Skip if file doesn't exist or is inaccessible
    if (-not (Test-Path $file.FullName -PathType Leaf)) {
        if ($Verbose) { Write-Host "  Skipping inaccessible: $($file.Name)" -ForegroundColor DarkGray }
        continue
    }
    
    try {
        $content = Get-Content -Path $file.FullName -Raw -ErrorAction Stop
    } catch {
        if ($Verbose) { Write-Host "  Error reading: $($file.Name)" -ForegroundColor DarkGray }
        continue
    }
    
    $originalContent = $content
    $fileFixed = $false
    
    # Fix transition directives
    if ($content -match 'transition(fade|fly|slide|scale|draw|crossfade)=') {
        $content = $content -replace 'transition(fade|fly|slide|scale|draw|crossfade)=', 'transition:$1='
        $fileFixed = $true
        $FixCount++
        if ($Verbose) { Write-Host "  Fixed transition in: $($file.Name)" -ForegroundColor Gray }
    }
    
    # Fix in:fade and out:fade
    if ($content -match '(in|out)(fade|fly|slide|scale)=') {
        $content = $content -replace '(in|out)(fade|fly|slide|scale)=', '$1:$2='
        $fileFixed = $true
        $FixCount++
        if ($Verbose) { Write-Host "  Fixed in/out transition in: $($file.Name)" -ForegroundColor Gray }
    }
    
    # Fix animate directives
    if ($content -match 'animate(flip)=') {
        $content = $content -replace 'animate(flip)=', 'animate:$1='
        $fileFixed = $true
        $FixCount++
        if ($Verbose) { Write-Host "  Fixed animate in: $($file.Name)" -ForegroundColor Gray }
    }
    
    if ($fileFixed) {
        if (-not $DryRun) {
            # Backup original
            $relativePath = $file.FullName.Substring($RepoRoot.Length + 1)
            $backupPath = Join-Path $BackupDir $relativePath
            $backupParent = Split-Path -Parent $backupPath
            New-Item -ItemType Directory -Force -Path $backupParent | Out-Null
            Copy-Item -Path $file.FullName -Destination $backupPath -Force
            
            # Write fixed content
            Set-Content -Path $file.FullName -Value $content -NoNewline
        }
        $FileCount++
    }
}

Write-Success "Fixed $FixCount transition directives in $FileCount files"

# Pattern 2: Fix component default export issues
Write-Phase "Analyzing component export patterns..."

$componentErrors = @()
$errorPattern = 'Module .* has no default export'

# Quick scan for this specific error
$checkOutput = & npx svelte-check --threshold error 2>&1 | Select-String -Pattern $errorPattern
if ($checkOutput) {
    Write-Warn "Found $(($checkOutput | Measure-Object).Count) default export errors"
    Write-Host "  These require manual review - common fix:"
    Write-Host "  Change: import Component from './Component.svelte'"
    Write-Host "  To: import { Component } from './Component.svelte' (if named export)"
    Write-Host "  Or add: export default Component; in the component"
}

# Summary
Write-Host "`n" + ("=" * 70)
Write-Host "📊 Phase 41 Summary" -ForegroundColor Magenta
Write-Host ("=" * 70)
Write-Host ""
Write-Host "Files modified: $FileCount"
Write-Host "Fixes applied: $FixCount"
if (-not $DryRun) {
    Write-Host "Backup location: $BackupDir"
}
Write-Host ""

if ($DryRun) {
    Write-Warn "DRY RUN - No files were modified"
    Write-Host "Run without -DryRun to apply fixes"
} else {
    Write-Success "Phase 41 complete!"
    Write-Host ""
    Write-Host "Next steps:"
    Write-Host "  1. npx svelte-check --threshold error"
    Write-Host "  2. npm run dev:gpu (test in browser)"
    Write-Host "  3. Review remaining errors for manual fixes"
}

Write-Host ""
