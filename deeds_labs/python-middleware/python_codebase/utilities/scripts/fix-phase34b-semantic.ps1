#!/usr/bin/env pwsh
<#
.SYNOPSIS
Phase 34B – Semantic Object Literal Comma-to-Colon Repair
Safely converts { key, value } → { key: value } patterns in TypeScript/Svelte source files.

.DESCRIPTION
Targets corruption where object properties use commas instead of colons:
  ❌ { estimated_fixes, 12 }
  ✅ { estimated_fixes: 12 }

Also fixes semicolons between properties:
  ❌ prop: val; otherProp: val2
  ✅ prop: val, otherProp: val2

Uses refined regex to avoid false positives in:
  - Array destructuring: { a, b } = arr
  - Function parameters: ({ x, y }) => x + y
  - Shorthand properties: { x, y } when x/y are variables

.EXAMPLE
.\fix-phase34b-semantic.ps1
Scans sveltekit-frontend/src for corruption and applies repairs.

#>

[CmdletBinding()]
param (
    [string]$SourceRoot = "C:\Users\james\Videos\deeds-web-app\sveltekit-frontend\src",
    [string]$BackupRoot = "C:\Users\james\Videos\deeds-web-app\scripts\backups\phase34b",
    [string]$LogFile = "C:\Users\james\Videos\deeds-web-app\scripts\logs\phase34b-semantic-output.log"
)

$ErrorActionPreference = "Continue"

# ============================================================================
# SETUP
# ============================================================================

function Write-Log {
    param ([string]$Message, [ValidateSet("INFO", "WARN", "ERROR", "SUCCESS")][string]$Level = "INFO")
    $timestamp = Get-Date -Format "yyyy-MM-dd HH:mm:ss"
    $logEntry = "[$timestamp] [$Level] $Message"
    Add-Content -Path $LogFile -Value $logEntry -ErrorAction SilentlyContinue

    $colors = @{
        "INFO"    = "Cyan"
        "WARN"    = "Yellow"
        "ERROR"   = "Red"
        "SUCCESS" = "Green"
    }
    Write-Host $logEntry -ForegroundColor $colors[$Level]
}

if (!(Test-Path $BackupRoot)) { New-Item -ItemType Directory -Path $BackupRoot -Force | Out-Null }
if (!(Test-Path (Split-Path $LogFile))) { New-Item -ItemType Directory -Path (Split-Path $LogFile) -Force | Out-Null }

Write-Log "═══════════════════════════════════════════════════════════════" "INFO"
Write-Log "🧠 Phase 34B – Semantic Object Literal Comma-to-Colon Repair" "INFO"
Write-Log "═══════════════════════════════════════════════════════════════" "INFO"
Write-Log "Source Root: $SourceRoot" "INFO"
Write-Log "Backup Root: $BackupRoot" "INFO"
Write-Log ""

# ============================================================================
# PHASE 34B PATTERNS (as separate vars to avoid hashtable escaping)
# ============================================================================

$pattern1_regex = '(\{\s*[A-Za-z_$][A-Za-z0-9_$]*)\s*,\s*(?=[0-9\-\[])'
$pattern1_replace = '$1:'
$pattern1_desc = "{ prop, 123 } → { prop: 123 }"

$pattern2_regex = '([A-Za-z_$][A-Za-z0-9_$]*\s*:\s*[^\s,}]+);(\s*[A-Za-z_$])'
$pattern2_replace = '$1,$2'
$pattern2_desc = "prop: val; next → prop: val, next"

$pattern3_regex = ',\s*,'
$pattern3_replace = ','
$pattern3_desc = ", , → ,"

$pattern4_regex = ';\s*(\})'
$pattern4_replace = '$1'
$pattern4_desc = "prop: val; } → prop: val }"

# ============================================================================
# CORE LOGIC
# ============================================================================

$filesScanned = 0
$filesFixed = 0
$patternsMatched = @{}
$errorsEncountered = 0

Write-Log "Starting scan of TypeScript/Svelte files..." "INFO"
Write-Log ""

$tsFiles = @(Get-ChildItem -Path $SourceRoot -Recurse -Include "*.ts", "*.svelte" -ErrorAction SilentlyContinue)

Write-Log "Found $($tsFiles.Count) TypeScript/Svelte files to scan" "INFO"
Write-Log ""

foreach ($file in $tsFiles) {
    $filesScanned++

    try {
        $content = Get-Content $file.FullName -Raw -ErrorAction Stop
        $originalContent = $content
        $fileChanged = $false
        $filePatternCount = @{}

        # Apply Pattern 1
        if ($content -match $pattern1_regex) {
            $matchCount = ([regex]::Matches($content, $pattern1_regex)).Count
            $patternsMatched["Pattern1: $pattern1_desc"] = ($patternsMatched["Pattern1: $pattern1_desc"] ?? 0) + $matchCount
            $filePatternCount["Pattern1"] = $matchCount
            $content = [regex]::Replace($content, $pattern1_regex, $pattern1_replace)
            $fileChanged = $true
        }

        # Apply Pattern 2
        if ($content -match $pattern2_regex) {
            $matchCount = ([regex]::Matches($content, $pattern2_regex)).Count
            $patternsMatched["Pattern2: $pattern2_desc"] = ($patternsMatched["Pattern2: $pattern2_desc"] ?? 0) + $matchCount
            $filePatternCount["Pattern2"] = $matchCount
            $content = [regex]::Replace($content, $pattern2_regex, $pattern2_replace)
            $fileChanged = $true
        }

        # Apply Pattern 3
        if ($content -match $pattern3_regex) {
            $matchCount = ([regex]::Matches($content, $pattern3_regex)).Count
            $patternsMatched["Pattern3: $pattern3_desc"] = ($patternsMatched["Pattern3: $pattern3_desc"] ?? 0) + $matchCount
            $filePatternCount["Pattern3"] = $matchCount
            $content = [regex]::Replace($content, $pattern3_regex, $pattern3_replace)
            $fileChanged = $true
        }

        # Apply Pattern 4
        if ($content -match $pattern4_regex) {
            $matchCount = ([regex]::Matches($content, $pattern4_regex)).Count
            $patternsMatched["Pattern4: $pattern4_desc"] = ($patternsMatched["Pattern4: $pattern4_desc"] ?? 0) + $matchCount
            $filePatternCount["Pattern4"] = $matchCount
            $content = [regex]::Replace($content, $pattern4_regex, $pattern4_replace)
            $fileChanged = $true
        }

        if ($fileChanged -and $content -ne $originalContent) {
            $backupPath = Join-Path $BackupRoot (($file.FullName -replace [regex]::Escape($SourceRoot), '').TrimStart('\'))
            $backupDir = Split-Path $backupPath
            if (!(Test-Path $backupDir)) { New-Item -ItemType Directory -Path $backupDir -Force | Out-Null }
            Copy-Item $file.FullName $backupPath -Force

            Set-Content $file.FullName $content -Encoding UTF8 -ErrorAction Stop
            $filesFixed++

            $patternDesc = ($filePatternCount.GetEnumerator() | ForEach-Object { "$($_.Key)=$($_.Value)" }) -join ", "
            Write-Log "✅ Fixed: $($file.Name) [$patternDesc]" "SUCCESS"
        }
    }
    catch {
        $errorsEncountered++
        Write-Log "❌ Error: $($file.Name): $_" "ERROR"
    }
}# ============================================================================
# SUMMARY & REPORTING
# ============================================================================

Write-Log ""
Write-Log "═══════════════════════════════════════════════════════════════" "INFO"
Write-Log "📊 Phase 34B Semantic Repair Summary" "INFO"
Write-Log "═══════════════════════════════════════════════════════════════" "INFO"
Write-Log ""
Write-Log "Files scanned:          $filesScanned" "INFO"
Write-Log "Files fixed:            $filesFixed" "SUCCESS"
Write-Log "Errors encountered:     $errorsEncountered" $(if ($errorsEncountered -gt 0) { "WARN" } else { "SUCCESS" })
Write-Log ""
Write-Log "Pattern Breakdown:" "INFO"

$patternsMatched.GetEnumerator() | ForEach-Object {
    Write-Log "  • $($_.Key): $($_.Value) matches" "INFO"
}

Write-Log ""
Write-Log "Backup location: $BackupRoot" "INFO"
Write-Log ""

if ($filesFixed -eq 0) {
    Write-Log "⚠️  No files were modified. Patterns may have already been fixed or not present." "WARN"
}
else {
    Write-Log "✨ Phase 34B Complete – $filesFixed files updated." "SUCCESS"
}

Write-Log ""
Write-Log "Next steps:" "INFO"
Write-Log "  1. Review changes: git diff --stat" "INFO"
Write-Log "  2. Run validation: npm run check:svelte" "INFO"
Write-Log "  3. Build test: npm run build" "INFO"
Write-Log "  4. Commit: git commit -am 'fix: Phase 34B semantic object-literal repair'" "INFO"
Write-Log ""
