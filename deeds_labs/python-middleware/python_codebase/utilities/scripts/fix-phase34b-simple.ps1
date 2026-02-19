#!/usr/bin/env pwsh
# Phase 34B – Simple Semantic Object Literal Repair

$SRC = "C:\Users\james\Videos\deeds-web-app\sveltekit-frontend\src"
$BACKUP = "C:\Users\james\Videos\deeds-web-app\scripts\backups\phase34b"

if (!(Test-Path $BACKUP)) { New-Item -ItemType Directory -Path $BACKUP -Force | Out-Null }

Write-Host "Phase 34B – Semantic Object Literal Comma-to-Colon Repair" -ForegroundColor Cyan
Write-Host ""

$filesScanned = 0
$filesFixed = 0
$totalMatches = 0

$files = @(Get-ChildItem -Path $SRC -Recurse -Include "*.ts", "*.svelte")
Write-Host "Found $($files.Count) files to scan"
Write-Host ""

foreach ($file in $files) {
    $filesScanned++
    $content = Get-Content $file.FullName -Raw
    $orig = $content
    $matches = 0

    # Pattern 1: { prop, 123 } → { prop: 123 }
    $m1 = ([regex]::Matches($content, '(\{\s*[A-Za-z_$][A-Za-z0-9_$]*)\s*,\s*(?=[0-9\-\[])')).Count
    if ($m1 -gt 0) {
        $content = [regex]::Replace($content, '(\{\s*[A-Za-z_$][A-Za-z0-9_$]*)\s*,\s*(?=[0-9\-\[])', "`$1:")
        $matches += $m1
    }

    # Pattern 2: prop: val; next → prop: val, next
    $m2 = ([regex]::Matches($content, '([A-Za-z_$][A-Za-z0-9_$]*\s*:\s*[^\s,}]+);(\s*[A-Za-z_$])')).Count
    if ($m2 -gt 0) {
        $content = [regex]::Replace($content, '([A-Za-z_$][A-Za-z0-9_$]*\s*:\s*[^\s,}]+);(\s*[A-Za-z_$])', "`$1,`$2")
        $matches += $m2
    }

    # Pattern 3: , , → ,
    $m3 = ([regex]::Matches($content, ',\s*,')).Count
    if ($m3 -gt 0) {
        $content = [regex]::Replace($content, ',\s*,', ',')
        $matches += $m3
    }

    # Pattern 4: ; } → }
    $m4 = ([regex]::Matches($content, ';\s*(\})')).Count
    if ($m4 -gt 0) {
        $content = [regex]::Replace($content, ';\s*(\})', "`$1")
        $matches += $m4
    }

    if ($content -ne $orig) {
        # Backup
        $relPath = $file.FullName.Substring($SRC.Length).TrimStart('\')
        $backupPath = Join-Path $BACKUP $relPath
        $backupDir = Split-Path $backupPath
        if (!(Test-Path $backupDir)) { New-Item -ItemType Directory -Path $backupDir -Force | Out-Null }
        Copy-Item $file.FullName $backupPath -Force

        # Write
        Set-Content $file.FullName $content -Encoding UTF8
        $filesFixed++
        $totalMatches += $matches

        Write-Host "✅ $relPath - $matches patterns"
    }
}

Write-Host ""
Write-Host "Summary:" -ForegroundColor Green
Write-Host "  Scanned: $filesScanned"
Write-Host "  Fixed:   $filesFixed"
Write-Host "  Patterns: $totalMatches"
Write-Host ""
