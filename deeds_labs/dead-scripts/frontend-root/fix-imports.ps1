param(
    [string]$Path = ".",
    [switch]$Backup,
    [switch]$DryRun,
    [switch]$Verbose,
    [string]$LogFile = "fix-imports-log.txt"
)

# Error Analysis and Fix Script - November 17, 2025
# Based on Codebase Error Analysis guidelines from readme11425.md

Write-Host "🔍 TypeScript Error Fix Script - Phase 1: Import Path Corrections" -ForegroundColor Cyan
Write-Host "📋 Based on Error Analysis Report - November 14, 2025" -ForegroundColor Gray
Write-Host ""

# Initialize counters
$stats = @{
    FilesProcessed = 0
    FilesFixed = 0
    ErrorsFound = 0
    BackupsCreated = 0
}

# Create log file
$logPath = Join-Path $Path $LogFile
if (Test-Path $logPath) { Remove-Item $logPath -Force }
"TypeScript Import Fix Log - $(Get-Date)" | Out-File $logPath

function Write-Log {
    param([string]$Message, [string]$Level = "INFO")
    $timestamp = Get-Date -Format "yyyy-MM-dd HH:mm:ss"
    $logEntry = "[$timestamp] [$Level] $Message"
    $logEntry | Out-File $logPath -Append

    if ($Verbose -or $Level -eq "ERROR") {
        $color = switch ($Level) {
            "ERROR" { "Red" }
            "WARN" { "Yellow" }
            "SUCCESS" { "Green" }
            default { "Gray" }
        }
        Write-Host $Message -ForegroundColor $color
    }
}

# Common error patterns from error analysis
$fixPatterns = @(
    # Import path corruption with embedded TODO comments
    @{
        Name = "Embedded TODO in import paths"
        Pattern = '\$lib\s*//\s*TODO: Verify store subscription is correct for Svelte 5/'
        Replacement = '$lib/'
    },
    @{
        Name = "App import path corruption"
        Pattern = '\$app\s*//\s*TODO: Verify store subscription is correct for Svelte 5/'
        Replacement = '$app/'
    },
    @{
        Name = "Space-separated lib imports"
        Pattern = '\$lib\s+/'
        Replacement = '$lib/'
    },
    @{
        Name = "Space-separated app imports"
        Pattern = '\$app\s+/'
        Replacement = '$app/'
    },
    # Svelte 5 runes corruption
    @{
        Name = "State rune corruption"
        Pattern = '\$state // TODO: Verify store subscription is correct for Svelte 5\(([^)]+)\)'
        Replacement = '$state($1)'
    },
    @{
        Name = "Props rune corruption"
        Pattern = '\$props // TODO: Verify store subscription is correct for Svelte 5'
        Replacement = '$props'
    },
    @{
        Name = "Derived rune corruption"
        Pattern = '\$derived // TODO: Verify store subscription is correct for Svelte 5'
        Replacement = '$derived'
    },
    @{
        Name = "Bindable rune corruption"
        Pattern = '\$bindable // TODO: Verify store subscription is correct for Svelte 5'
        Replacement = '$bindable'
    },
    @{
        Name = "Page rune corruption"
        Pattern = '\$page // TODO: Verify store subscription is correct for Svelte 5'
        Replacement = '$page'
    },
    # Effect corruption
    @{
        Name = "Effect rune corruption"
        Pattern = '\$effect // TODO: Verify store subscription is correct for Svelte 5\('
        Replacement = '$effect(() => {'
    },
    # Type import issues - Only for pure type imports (interfaces, types, enums)
    @{
        Name = "Missing type imports for interfaces"
        Pattern = 'import\s*\{\s*([A-Z][a-zA-Z0-9_]*)\s*\}\s*from\s*[''"]([^''"]*types?[^''"]*)[''"]\s*;'
        Replacement = 'import type { $1 } from ''$2'';'
    },
    @{
        Name = "Missing type imports for Type suffixes"
        Pattern = 'import\s*\{\s*([A-Z][a-zA-Z0-9_]*Type)\s*\}\s*from\s*[''"]([^''"]*)[''"]\s*;'
        Replacement = 'import type { $1 } from ''$2'';'
    }
    # Interface/type mismatches
    @{
        Name = "Interface property corruption"
        Pattern = '(\w+):\s*\{\s*// TODO: Verify store subscription is correct for Svelte 5'
        Replacement = '$1: {'
    }
)

Write-Log "Starting systematic import path fixes..." "INFO"
Write-Log "Processing files in: $Path" "INFO"

# Get all relevant files
$files = Get-ChildItem -Path $Path -Recurse -Include *.ts,*.tsx,*.svelte -Exclude node_modules,*node_modules*

foreach ($file in $files) {
    $stats.FilesProcessed++
    $content = Get-Content $file.FullName -Raw -ErrorAction SilentlyContinue

    if ($null -eq $content) {
        Write-Log "Could not read file: $($file.FullName)" "ERROR"
        continue
    }

    $originalContent = $content
    $fileFixed = $false

    # Apply each fix pattern
    foreach ($pattern in $fixPatterns) {
        try {
            $matches = [regex]::Matches($content, $pattern.Pattern)
            if ($matches.Count -gt 0) {
                $content = [regex]::Replace($content, $pattern.Pattern, $pattern.Replacement)
                $stats.ErrorsFound += $matches.Count
                $fileFixed = $true
                Write-Log "Applied fix '$($pattern.Name)' to $($file.FullName) ($($matches.Count) occurrences)" "SUCCESS"
            }
        } catch {
            Write-Log "Error applying pattern '$($pattern.Name)' to $($file.FullName): $($_.Exception.Message)" "ERROR"
        }
    }

    # Additional validation and fixes
    # Remove duplicate TODO comments
    $content = $content -replace '(// TODO: Verify store subscription is correct for Svelte 5\s*)+', ''

    # Fix common syntax errors
    $content = $content -replace 'import\s*\{\s*\}\s*from\s*[''""]\s*[''"]\s*;', ''  # Remove empty imports

    if ($content -ne $originalContent) {
        if ($Backup) {
            $backupPath = "$($file.FullName).backup"
            Copy-Item $file.FullName $backupPath -Force
            $stats.BackupsCreated++
            Write-Log "Created backup: $backupPath" "INFO"
        }

        if (-not $DryRun) {
            try {
                Set-Content -Path $file.FullName -Value $content -NoNewline -Encoding UTF8
                $stats.FilesFixed++
                Write-Log "Successfully fixed: $($file.FullName)" "SUCCESS"
            } catch {
                Write-Log "Failed to write file: $($file.FullName) - $($_.Exception.Message)" "ERROR"
            }
        } else {
            Write-Log "DRY RUN: Would fix $($file.FullName)" "WARN"
        }
    }
}

# Summary report
Write-Host ""
Write-Host "📊 Fix Summary Report" -ForegroundColor Cyan
Write-Host "═══════════════════" -ForegroundColor Cyan
Write-Host "Files Processed: $($stats.FilesProcessed)" -ForegroundColor White
Write-Host "Files Fixed: $($stats.FilesFixed)" -ForegroundColor Green
Write-Host "Errors Found: $($stats.ErrorsFound)" -ForegroundColor Yellow
Write-Host "Backups Created: $($stats.BackupsCreated)" -ForegroundColor Blue
Write-Host ""
Write-Host "📋 Next Steps (per Error Analysis guidelines):" -ForegroundColor Cyan
Write-Host "1. Run 'npm run check' to verify fixes" -ForegroundColor White
Write-Host "2. Address remaining type compatibility issues" -ForegroundColor White
Write-Host "3. Fix module resolution problems" -ForegroundColor White
Write-Host "4. Resolve interface/type mismatches" -ForegroundColor White
Write-Host ""
Write-Host "📄 Detailed log saved to: $logPath" -ForegroundColor Gray

Write-Log "Fix script completed. Stats: FilesProcessed=$($stats.FilesProcessed), FilesFixed=$($stats.FilesFixed), ErrorsFound=$($stats.ErrorsFound)" "INFO"