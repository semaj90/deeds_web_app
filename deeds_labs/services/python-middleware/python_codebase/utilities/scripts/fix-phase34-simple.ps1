# ============================================================
# PHASE 34 SIMPLE - Direct PowerShell Token Fixer
# ============================================================
# Simplified alternative to Node.js script that stalled
# Focuses on critical error patterns that block compilation

$ErrorActionPreference = "Continue"
$root = "C:\Users\james\Videos\deeds-web-app"
$srcDir = "$root\sveltekit-frontend\src"
$logFile = "$root\scripts\logs\phase34-simple.log"

function Log {
    param([string]$msg, [string]$level = "INFO")
    $timestamp = Get-Date -Format "yyyy-MM-dd HH:mm:ss"
    $entry = "[$timestamp] [$level] $msg"
    Write-Host $entry
    Add-Content -Path $logFile -Value $entry
}

function Backup-File {
    param([string]$path)
    $backupDir = "$root\scripts\backups\phase34"
    $relativePath = $path.Replace($srcDir, "").TrimStart("\")
    $backupPath = "$backupDir\$relativePath"

    $backupDir = Split-Path $backupPath
    if (!(Test-Path $backupDir)) {
        New-Item -ItemType Directory -Force -Path $backupDir | Out-Null
    }

    Copy-Item -Path $path -Destination $backupPath -Force
}

Log "🚀 Starting Phase 34 Simple Token Reconstruction"
Log "Source: $srcDir"

# Find all TypeScript and Svelte files
$files = @()
$files += Get-ChildItem -Path $srcDir -Recurse -Filter "*.ts" -ErrorAction SilentlyContinue
$files += Get-ChildItem -Path $srcDir -Recurse -Filter "*.tsx" -ErrorAction SilentlyContinue
$files += Get-ChildItem -Path $srcDir -Recurse -Filter "*.svelte" -ErrorAction SilentlyContinue

Log "Found $($files.Count) files to process"

$fixedCount = 0
$filesChanged = 0
$errors = @()

foreach ($file in $files) {
    $content = Get-Content -Path $file.FullName -Raw -ErrorAction SilentlyContinue
    if ($null -eq $content) { continue }

    $originalContent = $content
    $fileFixed = 0

    # Fix 1: Remove stray commas before colons in interfaces/objects
    # Before: "field, :"  →  After: "field:"
    $newContent = [regex]::Replace($content, '(\w+)\s*,\s*:', '$1:')
    if ($newContent -ne $content) { $fileFixed++; $fixedCount++ }
    $content = $newContent

    # Fix 2: Fix incorrect semicolon in field definitions
    # Before: "field; //"  →  After: "field //"
    $newContent = [regex]::Replace($content, '(\w+)\s*;\s*(//.+)', '$1 $2')
    if ($newContent -ne $content) { $fileFixed++; $fixedCount++ }
    $content = $newContent

    # Fix 3: Fix missing colon after property names
    # Before: "field ,"  →  After: "field:"
    $newContent = [regex]::Replace($content, '(\w+)\s*,(\s*[:\}])', '$1:$2')
    if ($newContent -ne $content) { $fileFixed++; $fixedCount++ }
    $content = $newContent

    # Fix 4: Fix malformed script tags in Svelte
    # Before: <script, lang="ts">  →  After: <script lang="ts">
    $newContent = $content -replace '<script,\s+lang=', '<script lang='
    if ($newContent -ne $content) { $fileFixed++; $fixedCount++ }
    $content = $newContent

    # Fix 5: Fix duplicate commas
    # Before: "field,,"  →  After: "field,"
    $newContent = [regex]::Replace($content, ',{2,}', ',')
    if ($newContent -ne $content) { $fileFixed++; $fixedCount++ }
    $content = $newContent

    # Fix 6: Fix unmatched braces (basic)
    # Count braces and attempt to balance simple cases
    $openBraces = [regex]::Matches($content, '\{').Count
    $closeBraces = [regex]::Matches($content, '\}').Count
    if ($openBraces -gt $closeBraces -and $openBraces - $closeBraces -le 3) {
        for ($i = 0; $i -lt ($openBraces - $closeBraces); $i++) {
            $content = $content.TrimEnd() + "`n}"
            $fixedCount++
            $fileFixed++
        }
    }

    # Fix 7: Remove stray opening brackets at end of lines
    # Before: "line {$"  →  After: "line"
    $newContent = [regex]::Replace($content, '\s*{\s*$', '', 'Multiline')
    if ($newContent -ne $content) { $fileFixed++; $fixedCount++ }
    $content = $newContent

    # Write file if changed
    if ($content -ne $originalContent) {
        try {
            Backup-File -path $file.FullName
            Set-Content -Path $file.FullName -Value $content -ErrorAction Stop
            $filesChanged++
            Log "✅ Fixed $($file.Name) ($fileFixed patterns)" "FIXED"
        } catch {
            Log "❌ Error writing $($file.Name): $_" "ERROR"
            $errors += $file.Name
        }
    }
}

Log ""
Log "═══════════════════════════════════════════════════════════"
Log "📊 PHASE 34 SIMPLE SUMMARY"
Log "═══════════════════════════════════════════════════════════"
Log "Files processed: $($files.Count)"
Log "Files changed: $filesChanged"
Log "Total patterns fixed: $fixedCount"
Log "Errors: $($errors.Count)"

if ($errors.Count -gt 0) {
    Log "Failed files:" "WARNING"
    $errors | ForEach-Object { Log "  - $_" "WARNING" }
}

Log "✅ Phase 34 Simple Complete"
Log ""
