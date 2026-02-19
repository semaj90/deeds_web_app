# Main Directory Cleanup Script - Fixed Version
# Created: September 4, 2025
# Purpose: Clean up main directories after successful file organization

param(
    [switch]$Execute,            # Use -Execute to actually remove files
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
    "sveltekit-frontend",
    "go-microservice",
    "go-services",
    "scripts",
    ".vscode",
    ".git",
    "node_modules",
    "build",
    "dist",
    "archives"
)

Write-Host "🧹 MAIN DIRECTORY CLEANUP PROCESS" -ForegroundColor Cyan
Write-Host "📂 Base path: $basePath" -ForegroundColor Yellow
Write-Host "📁 Organized path: $organizedPath" -ForegroundColor Yellow

# Default to dry run unless Execute is specified
$isDryRun = -not $Execute

Write-Host "🔧 Mode: $(if ($Execute) { 'EXECUTE CLEANUP' } else { 'DRY RUN' })" -ForegroundColor $(if ($Execute) { 'Red' } else { 'Green' })
Write-Host ""

if (-not (Test-Path $organizedPath)) {
    Write-Host "❌ ERROR: Organized files directory not found: $organizedPath" -ForegroundColor Red
    Write-Host "💡 Run the organization script first before cleanup" -ForegroundColor Yellow
    exit 1
}

$totalOriginalFiles = 0
$safeToRemove = 0
$filesToRemove = @()

Write-Host "🔍 SCANNING for files to clean up..." -ForegroundColor Magenta
Write-Host ""

foreach ($category in $fileTypes.Keys) {
    Write-Host "📂 Processing $category files..." -ForegroundColor Cyan

    foreach ($pattern in $fileTypes[$category]) {
        # Find original files (exclude critical directories)
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

            # Check if this file exists in organized structure
            $organizedCategoryPath = Join-Path $organizedPath $category
            if (Test-Path $organizedCategoryPath) {
                # Look for the file in the organized directory structure
                $organizedFile = Get-ChildItem -Path $organizedCategoryPath -Recurse -Filter $file.Name | Where-Object { $_.Name -eq $file.Name }

                if ($organizedFile) {
                    $safeToRemove++
                    $filesToRemove += $file.FullName

                    if ($isDryRun) {
                        Write-Host "    📋 Would remove: $relativePath" -ForegroundColor DarkGray
                    } else {
                        Write-Host "    🗑️ Removing: $relativePath" -ForegroundColor Yellow
                    }
                }
            }
        }
    }
}

Write-Host ""
Write-Host "📊 CLEANUP SUMMARY" -ForegroundColor Cyan
Write-Host "📄 Total original files scanned: $totalOriginalFiles" -ForegroundColor Yellow
Write-Host "🗑️ Files safe to remove: $safeToRemove" -ForegroundColor Green
Write-Host "🛡️ Files preserved: $($totalOriginalFiles - $safeToRemove)" -ForegroundColor Magenta
Write-Host ""

if ($safeToRemove -eq 0) {
    Write-Host "✅ No files need cleanup - main directories are already clean!" -ForegroundColor Green
    exit 0
}

if ($isDryRun) {
    Write-Host "🔍 DRY RUN COMPLETE" -ForegroundColor Cyan
    Write-Host "💡 $safeToRemove files have organized copies and can be safely removed" -ForegroundColor Green
    Write-Host "⚡ To execute cleanup, run:" -ForegroundColor Yellow
    Write-Host "   .\cleanup-main-directories.ps1 -Execute" -ForegroundColor White
} else {
    Write-Host "🔥 EXECUTING CLEANUP..." -ForegroundColor Red
    Write-Host ""

    $removed = 0
    $failed = 0

    foreach ($filePath in $filesToRemove) {
        try {
            Remove-Item -Path $filePath -Force
            $removed++
            $fileName = Split-Path $filePath -Leaf
            Write-Host "✅ Removed: $fileName" -ForegroundColor Green
        } catch {
            $failed++
            Write-Host "❌ Failed: $filePath - $($_.Exception.Message)" -ForegroundColor Red
        }
    }

    Write-Host ""
    Write-Host "🎉 CLEANUP COMPLETE!" -ForegroundColor Cyan
    Write-Host "✅ Successfully removed: $removed files" -ForegroundColor Green
    if ($failed -gt 0) {
        Write-Host "❌ Failed to remove: $failed files" -ForegroundColor Red
    }
    Write-Host "📁 All organized files remain safe at: $organizedPath" -ForegroundColor Magenta
}

Write-Host ""
Write-Host "📋 NEXT STEPS:" -ForegroundColor Cyan
Write-Host "1. Verify organized files work correctly" -ForegroundColor White
Write-Host "2. Update any hardcoded file paths in code" -ForegroundColor White
Write-Host "3. Update documentation with new file structure" -ForegroundColor White
Write-Host "4. Consider cleaning up empty directories" -ForegroundColor White
