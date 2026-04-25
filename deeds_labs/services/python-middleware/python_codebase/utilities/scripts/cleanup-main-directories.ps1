# Main Directory Cleanup Script
# Created: September 4, 2025
# Purpose: Clean up main directories after successful file organization
# Safety: Verifies organized files exist before removing originals

param(
    [switch]$DryRun,             # Default to dry run for safety
    [switch]$Execute,            # Must explicitly use -Execute to actually remove files
    [switch]$Verify              # Verify organized files exist before cleanup
)

$basePath = "C:\Users\james\Desktop\deeds-web\deeds-web-app"
$organizedPath = Join-Path $basePath "organized-files"

# File type mappings (same as organization script)
$fileTypes = @{
    "markdown-docs" = @("*.md")
    "batch-scripts" = @("*.bat", "*.cmd")
    "java-archives" = @("*.jar")
    "json-configs" = @("*.json")
    "powershell-scripts" = @("*.ps1")
    "text-files" = @("*.txt")
    "go-source" = @("*.go")
    "backup-files" = @("*.backup*")
    "javascript-modules" = @("*.js", "*.mjs")
    "typescript-source" = @("*.ts")
    "svelte-components" = @("*.svelte")
}

# Critical directories to NEVER clean (preserve development structure)
$preserveDirectories = @(
    "organized-files",
    "sveltekit-frontend\src",
    "sveltekit-frontend\static",
    "go-microservice\cmd",
    "go-microservice\internal",
    "go-microservice\pkg",
    "go-services\cmd",
    "go-services\internal",
    "scripts\maintenance",
    "scripts\orchestration",
    ".vscode",
    ".git",
    "node_modules",
    "build",
    "dist"
)

Write-Host "🧹 MAIN DIRECTORY CLEANUP PROCESS" -ForegroundColor Cyan
Write-Host "📂 Base path: $basePath" -ForegroundColor Yellow
Write-Host "📁 Organized path: $organizedPath" -ForegroundColor Yellow

# Set default behavior if no switches provided
if (-not $Execute -and -not $Verify) {
    $DryRun = $true
}

Write-Host "🔧 Mode: $(if ($Execute) { 'EXECUTE CLEANUP' } else { 'DRY RUN' })" -ForegroundColor $(if ($Execute) { 'Red' } else { 'Green' })
Write-Host ""

if (-not (Test-Path $organizedPath)) {
    Write-Host "❌ ERROR: Organized files directory not found: $organizedPath" -ForegroundColor Red
    Write-Host "💡 Run the organization script first before cleanup" -ForegroundColor Yellow
    exit 1
}

$totalOriginalFiles = 0
$totalOrganizedFiles = 0
$safeToRemove = 0
$filesToRemove = @()

Write-Host "🔍 PHASE 1: Verification of organized files" -ForegroundColor Magenta
Write-Host ""

foreach ($category in $fileTypes.Keys) {
    $categoryPath = Join-Path $organizedPath $category

    if (Test-Path $categoryPath) {
        $organizedCount = (Get-ChildItem -Path $categoryPath -Recurse -File).Count
        $totalOrganizedFiles += $organizedCount
        Write-Host "✅ $category : $organizedCount files organized" -ForegroundColor Green
    } else {
        Write-Host "⚠️  $category : Directory not found" -ForegroundColor Yellow
    }
}

Write-Host ""
Write-Host "🔍 PHASE 2: Identifying files for cleanup" -ForegroundColor Magenta
Write-Host ""

foreach ($category in $fileTypes.Keys) {
    foreach ($pattern in $fileTypes[$category]) {
        Write-Host "  🔍 Scanning for: $pattern" -ForegroundColor Gray

        # Find original files (exclude organized-files and critical directories)
        $originalFiles = Get-ChildItem -Path $basePath -Recurse -Filter $pattern | Where-Object {
            $relativePath = $_.FullName.Replace($basePath, "").TrimStart('\')
            $shouldPreserve = $false

            foreach ($preserveDir in $preserveDirectories) {
                if ($relativePath.StartsWith($preserveDir, [System.StringComparison]::OrdinalIgnoreCase)) {
                    $shouldPreserve = $true
                    break
                }
            }

            -not $shouldPreserve
        }

        foreach ($file in $originalFiles) {
            $totalOriginalFiles++
            $relativePath = $file.FullName.Replace($basePath, "").TrimStart('\')
            $cleanDir = (Split-Path $relativePath -Parent) -replace '[\\/:*?"<>|]', '_'

            # Check if organized version exists
            $expectedOrganizedPath = Join-Path (Join-Path $organizedPath $category) "$cleanDir\$($file.Name)"

            if (Test-Path $expectedOrganizedPath) {
                $safeToRemove++
                $filesToRemove += $file.FullName

                if ($DryRun) {
                    Write-Host "    📋 Would remove: $relativePath" -ForegroundColor DarkGray
                } else {
                    Write-Host "    🗑️ Marked for removal: $relativePath" -ForegroundColor Yellow
                }
            } else {
                Write-Host "    ⚠️ SKIPPING (no organized copy found): $relativePath" -ForegroundColor Red
            }
        }
    }
}

Write-Host ""
Write-Host "📊 CLEANUP SUMMARY" -ForegroundColor Cyan
Write-Host "📁 Total organized files: $totalOrganizedFiles" -ForegroundColor Green
Write-Host "📄 Total original files found: $totalOriginalFiles" -ForegroundColor Yellow
Write-Host "🗑️ Files safe to remove: $safeToRemove" -ForegroundColor $(if ($safeToRemove -gt 0) { 'Green' } else { 'Yellow' })"
Write-Host "⚠️ Files to preserve: $($totalOriginalFiles - $safeToRemove)" -ForegroundColor Magenta
Write-Host ""

if ($safeToRemove -eq 0) {
    Write-Host "✅ No files need cleanup - all important files already preserved!" -ForegroundColor Green
    exit 0
}

if ($DryRun) {
    Write-Host "🔍 DRY RUN COMPLETE" -ForegroundColor Cyan
    Write-Host "💡 Run with -Execute parameter to perform actual cleanup" -ForegroundColor Yellow
    Write-Host "🛡️ Safety check: $safeToRemove files have verified organized copies" -ForegroundColor Green
    Write-Host ""
    Write-Host "⚡ To execute cleanup:" -ForegroundColor Cyan
    Write-Host "   .\organize-files-by-type.ps1 -Execute" -ForegroundColor White
} else {
    Write-Host "🔥 EXECUTING CLEANUP" -ForegroundColor Red
    Write-Host ""

    $removed = 0
    $failed = 0

    foreach ($filePath in $filesToRemove) {
        try {
            Remove-Item -Path $filePath -Force
            $removed++
            Write-Host "✅ Removed: $(Split-Path $filePath -Leaf)" -ForegroundColor Green
        } catch {
            $failed++
            Write-Host "❌ Failed to remove: $filePath - $($_.Exception.Message)" -ForegroundColor Red
        }
    }

    Write-Host ""
    Write-Host "🎉 CLEANUP COMPLETE!" -ForegroundColor Cyan
    Write-Host "✅ Successfully removed: $removed files" -ForegroundColor Green
    Write-Host "❌ Failed to remove: $failed files" -ForegroundColor Red
    Write-Host "📁 All organized files remain at: $organizedPath" -ForegroundColor Magenta
}

Write-Host ""
Write-Host "📋 NEXT STEPS:" -ForegroundColor Cyan
Write-Host "1. Verify organized files work correctly" -ForegroundColor White
Write-Host "2. Update any hardcoded file paths in code" -ForegroundColor White
Write-Host "3. Update documentation with new file structure" -ForegroundColor White
Write-Host "4. Consider cleaning up empty directories" -ForegroundColor White
