#!/usr/bin/env pwsh
# Phase 34B – Semantic Object Literal Comma-to-Colon Repair

param (
    [string]$SourceRoot = "C:\Users\james\Videos\deeds-web-app\sveltekit-frontend\src",
    [string]$BackupRoot = "C:\Users\james\Videos\deeds-web-app\scripts\backups\phase34b",
    [string]$LogFile = "C:\Users\james\Videos\deeds-web-app\scripts\logs\phase34b-semantic-output.log"
)

$ErrorActionPreference = "Continue"

if (!(Test-Path $BackupRoot)) { New-Item -ItemType Directory -Path $BackupRoot -Force | Out-Null }
if (!(Test-Path (Split-Path $LogFile))) { New-Item -ItemType Directory -Path (Split-Path $LogFile) -Force | Out-Null }

function Write-Log {
    param ([string]$Message, [string]$Level = "INFO")
    $timestamp = Get-Date -Format "yyyy-MM-dd HH:mm:ss"
    $logEntry = "[$timestamp] [$Level] $Message"
    Add-Content -Path $LogFile -Value $logEntry -ErrorAction SilentlyContinue

    $colorMap = @{ "INFO" = "Cyan"; "WARN" = "Yellow"; "ERROR" = "Red"; "SUCCESS" = "Green" }
    $color = $colorMap[$Level]
    if ($null -eq $color) { $color = "White" }
    Write-Host $logEntry -ForegroundColor $color
}

Write-Log "═══════════════════════════════════════════════════════════════" "INFO"
Write-Log "🧠 Phase 34B – Semantic Object Literal Repair" "INFO"
Write-Log "═══════════════════════════════════════════════════════════════" "INFO"
Write-Log ""

$filesScanned = 0
$filesFixed = 0
$errorsEncountered = 0
$totalMatches = 0

$tsFiles = @(Get-ChildItem -Path $SourceRoot -Recurse -Include "*.ts", "*.svelte" -ErrorAction SilentlyContinue)
Write-Log "Found $($tsFiles.Count) TypeScript/Svelte files to scan" "INFO"
Write-Log ""

foreach ($file in $tsFiles) {
    $filesScanned++

    try {
        $content = Get-Content $file.FullName -Raw -ErrorAction Stop
        $originalContent = $content
        $changed = $false
        $matchCount = 0

        # Pattern 1: { prop, 123 } → { prop: 123 }
        $p1 = '(\{\s*[A-Za-z_$][A-Za-z0-9_$]*)\s*,\s*(?=[0-9\-\[])'
        if ($content -match $p1) {
            $m = ([regex]::Matches($content, $p1)).Count
            $matchCount += $m
            $content = [regex]::Replace($content, $p1, "`$1:")
            $changed = $true
        }

        # Pattern 2: prop: val; next → prop: val, next
        $p2 = '([A-Za-z_$][A-Za-z0-9_$]*\s*:\s*[^\s,}]+);(\s*[A-Za-z_$])'
        if ($content -match $p2) {
            $m = ([regex]::Matches($content, $p2)).Count
            $matchCount += $m
            $content = [regex]::Replace($content, $p2, "`$1,`$2")
            $changed = $true
        }        # Pattern 3: , , → ,
        $p3 = ',\s*,'
        if ($content -match $p3) {
            $m = ([regex]::Matches($content, $p3)).Count
            $matchCount += $m
            $content = [regex]::Replace($content, $p3, ',')
            $changed = $true
        }

        # Pattern 4: ; } → }
        $p4 = ';\s*(\})'
        if ($content -match $p4) {
            $m = ([regex]::Matches($content, $p4)).Count
            $matchCount += $m
            $content = [regex]::Replace($content, $p4, "`$1")
            $changed = $true
        }

        if ($changed -and $content -ne $originalContent) {
            $backupPath = Join-Path $BackupRoot (($file.FullName -replace [regex]::Escape($SourceRoot), '').TrimStart('\'))
            $backupDir = Split-Path $backupPath
            if (!(Test-Path $backupDir)) { New-Item -ItemType Directory -Path $backupDir -Force | Out-Null }
            Copy-Item $file.FullName $backupPath -Force

            Set-Content $file.FullName $content -Encoding UTF8 -ErrorAction Stop
            $filesFixed++
            $totalMatches += $matchCount

            $msg = "✅ Fixed: $($file.Name) - $matchCount patterns"
            Write-Log $msg "SUCCESS"
        }
    }
    catch {
        $errorsEncountered++
        Write-Log "❌ Error: $($file.Name)" "ERROR"
    }
}

Write-Log ""
Write-Log "═══════════════════════════════════════════════════════════════" "INFO"
Write-Log "📊 Phase 34B Complete" "SUCCESS"
Write-Log "═══════════════════════════════════════════════════════════════" "INFO"
Write-Log ""
Write-Log "Files scanned:   $filesScanned" "INFO"
Write-Log "Files fixed:     $filesFixed" "SUCCESS"
Write-Log "Total patterns:  $totalMatches" "SUCCESS"
Write-Log "Errors:          $errorsEncountered" "INFO"
Write-Log ""
