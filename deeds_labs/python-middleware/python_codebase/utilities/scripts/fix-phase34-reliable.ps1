# ============================================================
# PHASE 34 RELIABLE - PowerShell Token Fixer
# ============================================================
# Replaces stalled Node.js script with reliable regex-based fixes
# No external dependencies, processes files sequentially

$ErrorActionPreference = "Continue"
$root = "C:\Users\james\Videos\deeds-web-app"
$srcDir = "$root\sveltekit-frontend\src"
$backupDir = "$root\scripts\backups\phase34"
$logFile = "$root\scripts\logs\phase34-output.log"

# Clear old log
"" | Set-Content -Path $logFile

function Log {
    param([string]$msg, [string]$level = "INFO")
    $timestamp = Get-Date -Format "yyyy-MM-dd HH:mm:ss"
    $entry = "[$timestamp] [$level] $msg"
    Write-Host $entry
    Add-Content -Path $logFile -Value $entry
}

# Ensure backup dir exists
New-Item -ItemType Directory -Force -Path $backupDir | Out-Null

Log "Phase 34: Reliable Token Reconstruction (PowerShell)"
Log "Source: $srcDir"
Log ""

# Find all TypeScript/Svelte files
$tsFiles = @(Get-ChildItem -Path $srcDir -Recurse -Include "*.ts", "*.tsx", "*.js" -ErrorAction SilentlyContinue)
$svelteFiles = @(Get-ChildItem -Path $srcDir -Recurse -Include "*.svelte" -ErrorAction SilentlyContinue)
$allFiles = $tsFiles + $svelteFiles

Log "Found $($allFiles.Count) files to process"
Log ""

$processedCount = 0
$fixedCount = 0
$errorCount = 0
$fixPatterns = 0

function Fix-TokenErrors {
    param([string]$content, [string]$filePath)

    $original = $content
    $fixes = 0

    # Fix 1: Remove stray commas before colons
    $content = $content -replace '(\w+)\s*,\s*:', '${1}:'
    if ($content -ne $original) { $fixes++; $original = $content }

    # Fix 2: Remove semicolons from object property lines
    $content = $content -replace '(\w+)\s*;\s*([}\n])', '${1}${2}'
    if ($content -ne $original) { $fixes++; $original = $content }

    # Fix 3: Fix malformed script tags in Svelte
    $content = $content -replace '<script\s*,\s*', '<script '
    if ($content -ne $original) { $fixes++; $original = $content }

    # Fix 4: Remove duplicate commas
    $content = $content -replace ',{2,}', ','
    if ($content -ne $original) { $fixes++; $original = $content }

    # Fix 5: Fix colon chains in parameters
    $content = [regex]::Replace($content, '([a-z_]\w*)\s*:\s*([A-Z]\w*)\s*:\s*([a-z_]\w*)', '${1}: ${2}, ${3}')
    if ($content -ne $original) { $fixes++; $original = $content }

    # Fix 6: Remove trailing commas before closing braces
    $content = $content -replace ',\s*([}\])])', '${1}'
    if ($content -ne $original) { $fixes++; $original = $content }

    # Fix 7: Fix trailing commas in function parameters
    $content = $content -replace ',\s*\)', ')'
    if ($content -ne $original) { $fixes++; $original = $content }

    # Fix 8: Balance braces
    $openBraces = ($content | Select-String -Pattern '\{' -AllMatches | Measure-Object -Line).Count
    $closeBraces = ($content | Select-String -Pattern '\}' -AllMatches | Measure-Object -Line).Count

    if ($openBraces -gt $closeBraces) {
        $diff = $openBraces - $closeBraces
        if ($diff -le 5) {
            $content = $content.TrimEnd() + "`n" + ("}" * $diff)
            $fixes++
        }
    }

    # Fix 9: Fix missing commas between object properties
    $content = [regex]::Replace($content, '(\w+):\s*([A-Z]\w*)\s+(\w+):\s*', '${1}: ${2}, ${3}: ')
    if ($content -ne $original) { $fixes++; $original = $content }

    # Fix 10: Remove stray opening braces at end of lines
    $content = [regex]::Replace($content, '\s+{\s*$', ' {', 'Multiline')
    if ($content -ne $original) { $fixes++; $original = $content }

    return @{
        content = $content
        fixes = $fixes
    }
}

foreach ($file in $allFiles) {
    $processedCount++

    # Show progress every 100 files
    if ($processedCount % 100 -eq 0) {
        Log "Processing: $processedCount / $($allFiles.Count) files"
    }

    try {
        $content = Get-Content -Path $file.FullName -Raw -ErrorAction Stop
        if ($null -eq $content) { continue }

        # Apply fixes
        $result = Fix-TokenErrors -content $content -filePath $file.FullName
        $newContent = $result.content
        $numFixes = $result.fixes

        # If file changed, backup and write
        if ($newContent -ne $content) {
            # Create backup
            $relativePath = $file.FullName.Replace($srcDir, "").TrimStart("\")
            $backupPath = "$backupDir\$relativePath"
            $backupPathDir = Split-Path $backupPath

            if (!(Test-Path $backupPathDir)) {
                New-Item -ItemType Directory -Force -Path $backupPathDir | Out-Null
            }

            Copy-Item -Path $file.FullName -Destination $backupPath -Force -ErrorAction SilentlyContinue

            # Write fixed content
            Set-Content -Path $file.FullName -Value $newContent -Encoding UTF8 -ErrorAction Stop

            $fixedCount++
            $fixPatterns += $numFixes

            $shortPath = $file.FullName.Replace($srcDir, "")
            Log "Fixed: $shortPath (patterns: $numFixes)"
        }
    } catch {
        $errorCount++
        Log "Error processing $($file.Name): $_" "ERROR"
    }
}

Log ""
Log "==============================================="
Log "PHASE 34 SUMMARY"
Log "==============================================="
Log "Files scanned: $processedCount"
Log "Files fixed: $fixedCount"
Log "Total patterns fixed: $fixPatterns"
Log "Errors encountered: $errorCount"
Log "Backup location: $backupDir"
Log ""
Log "Phase 34 Complete"
