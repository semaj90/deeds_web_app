# ============================================================
# PHASE 34B - Comma-to-Colon Replacement in Interfaces/Types
# ============================================================
# Focuses on fixing: "field, Type" → "field: Type" in TypeScript interfaces
# This is the missing pattern from Phase 34

$ErrorActionPreference = "Continue"
$root = "C:\Users\james\Videos\deeds-web-app"
$srcDir = "$root\sveltekit-frontend\src"
$backupDir = "$root\scripts\backups\phase34b"
$logFile = "$root\scripts\logs\phase34b-output.log"

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

Log "Phase 34B: Comma-to-Colon Replacement in Interfaces (PowerShell)"
Log "Source: $srcDir"
Log ""

# Find all TypeScript files (includes .ts, .tsx, .d.ts)
$tsFiles = @(Get-ChildItem -Path $srcDir -Recurse -Include "*.ts", "*.tsx" -ErrorAction SilentlyContinue)

Log "Found $($tsFiles.Count) TypeScript files to scan"
Log ""

$processedCount = 0
$fixedCount = 0
$errorCount = 0
$fixPatterns = 0

function Fix-CommaToColon {
    param([string]$content, [string]$filePath)

    $original = $content
    $fixes = 0

    # Pattern 1: "identifier, TypeName;" in interface properties (most common)
    # Matches: word characters followed by comma and space, then Type, then semicolon
    # Example: "estimated_fixes, number;" → "estimated_fixes: number;"
    $pattern1 = '([a-zA-Z_$][a-zA-Z0-9_$]*)\s*,\s*([a-zA-Z_$][a-zA-Z0-9_$<>\[\]\s]*?[;?])'
    $replacement1 = '${1}: ${2}'

    if ($content -match $pattern1) {
        $content = $content -replace $pattern1, $replacement1
        $fixes += ($content | Select-String -Pattern $replacement1 | Measure-Object).Count
    }

    # Pattern 2: "identifier, Type[];" - array types with comma
    # Example: "items, string[];" → "items: string[];"
    $pattern2 = '([a-zA-Z_$][a-zA-Z0-9_$]*)\s*,\s*(\w+(?:<[^>]*>)?\[\][?]?[;])'
    $replacement2 = '${1}: ${2}'

    if ($content -match $pattern2) {
        $matches_before = ($content | Select-String -Pattern $pattern2 | Measure-Object).Count
        $content = $content -replace $pattern2, $replacement2
        $matches_after = ($content | Select-String -Pattern $pattern2 | Measure-Object).Count
        if ($matches_before -gt $matches_after) {
            $fixes += $matches_before - $matches_after
        }
    }

    # Pattern 3: "identifier, interface[]" - complex types with brackets
    # Example: "category_analysis, Context7CategoryAnalysisItem[];" → "category_analysis: Context7CategoryAnalysisItem[];"
    $pattern3 = '([a-zA-Z_$][a-zA-Z0-9_$]*)\s*,\s*([A-Z][a-zA-Z0-9_$]*(?:<[^>]*>)?\[\][?]?[;])'
    $replacement3 = '${1}: ${2}'

    if ($content -match $pattern3) {
        $matches_before = ($content | Select-String -Pattern $pattern3 | Measure-Object).Count
        $content = $content -replace $pattern3, $replacement3
        $matches_after = ($content | Select-String -Pattern $pattern3 | Measure-Object).Count
        if ($matches_before -gt $matches_after) {
            $fixes += $matches_before - $matches_after
        }
    }

    # Pattern 4: "identifier, Type?" - optional types with question mark
    # Example: "optional_field, string?;" → "optional_field: string?;"
    $pattern4 = '([a-zA-Z_$][a-zA-Z0-9_$]*)\s*,\s*(\w+<[^>]*>\?[;]|\w+\?[;])'
    $replacement4 = '${1}: ${2}'

    if ($content -match $pattern4) {
        $matches_before = ($content | Select-String -Pattern $pattern4 | Measure-Object).Count
        $content = $content -replace $pattern4, $replacement4
        $matches_after = ($content | Select-String -Pattern $pattern4 | Measure-Object).Count
        if ($matches_before -gt $matches_after) {
            $fixes += $matches_before - $matches_after
        }
    }

    # Pattern 5: Multi-line: comma at end of line before type on next line
    # Example:
    #   property,
    #   string;
    # Fix to:
    #   property:
    #   string;
    $pattern5 = '([a-zA-Z_$][a-zA-Z0-9_$]*)\s*,\s*\n(\s*(?:string|number|boolean|object|any|unknown|[A-Z]\w+)[?]?[\[\]]*[;])'
    $replacement5 = '${1}:' + "`n" + '${2}'

    if ($content -match $pattern5) {
        $content = $content -replace $pattern5, $replacement5
        $fixes++
    }

    return @{
        content = $content
        fixes = $fixes
        changed = $original -ne $content
    }
}

Log "Starting scan and fix process..."
Log ""

# Process each file
foreach ($file in $tsFiles) {
    $processedCount++

    # Show progress every 100 files
    if ($processedCount % 100 -eq 0) {
        Log "Processing: $processedCount / $($tsFiles.Count) files"
    }

    try {
        $content = Get-Content -Path $file.FullName -Raw -ErrorAction SilentlyContinue

        if ($null -eq $content) {
            continue
        }

        $result = Fix-CommaToColon -content $content -filePath $file.FullName

        if ($result.changed) {
            $fixedCount++
            $fixPatterns += $result.fixes

            # Create backup
            $relPath = $file.FullName.Replace($srcDir, "")
            $backupPath = Join-Path $backupDir ($relPath.TrimStart("\"))
            $backupDir_File = Split-Path $backupPath
            New-Item -ItemType Directory -Force -Path $backupDir_File | Out-Null
            Copy-Item -Path $file.FullName -Destination $backupPath -Force

            # Write fixed content
            Set-Content -Path $file.FullName -Value $result.content -Encoding UTF8

            Log "Fixed: $relPath (patterns: $($result.fixes))"
        }
    }
    catch {
        $errorCount++
        Log "Error processing $($file.Name): $_" "ERROR"
    }
}

Log ""
Log "==============================================="
Log "PHASE 34B SUMMARY"
Log "==============================================="
Log "Files scanned: $processedCount"
Log "Files fixed: $fixedCount"
Log "Total patterns fixed: $fixPatterns"
Log "Errors encountered: $errorCount"
Log "Backup location: $backupDir"
Log ""
Log "Phase 34B Complete"
Log "==============================================="
