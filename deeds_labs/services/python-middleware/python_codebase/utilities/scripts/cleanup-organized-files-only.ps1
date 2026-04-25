# Safe Cleanup Script - Only Delete Successfully Organized Files
# Created: September 4, 2025
# Purpose: Remove ONLY files that were successfully copied to organized-files

param(
    [switch]$Execute,            # Use -Execute to actually remove files
    [switch]$ShowDetails         # Show detailed file-by-file verification
)

$basePath = "C:\Users\james\Desktop\deeds-web\deeds-web-app"
$organizedPath = Join-Path $basePath "organized-files"

Write-Host "🛡️ SAFE CLEANUP - Only Delete Successfully Organized Files" -ForegroundColor Cyan
Write-Host "📂 Base path: $basePath" -ForegroundColor Yellow
Write-Host "📁 Organized path: $organizedPath" -ForegroundColor Yellow

# Default to dry run unless Execute is specified
$isDryRunMode = -not $Execute
Write-Host "🔧 Mode: $(if ($Execute) { 'EXECUTE CLEANUP' } else { 'DRY RUN' })" -ForegroundColor $(if ($Execute) { 'Red' } else { 'Green' })
Write-Host ""

if (-not (Test-Path $organizedPath)) {
    Write-Host "❌ ERROR: Organized files directory not found!" -ForegroundColor Red
    exit 1
}

# Get the exact list of organized files and find their original counterparts
$verifiedPairs = @()
$totalOrganized = 0
$matchedOriginals = 0

Write-Host "🔍 PHASE 1: Finding organized files and their originals" -ForegroundColor Magenta

# Scan organized directories to find what was actually organized
$organizedCategories = Get-ChildItem -Path $organizedPath -Directory

foreach ($categoryDir in $organizedCategories) {
    $categoryName = $categoryDir.Name
    Write-Host "  📂 Scanning category: $categoryName" -ForegroundColor Gray

    $organizedFiles = Get-ChildItem -Path $categoryDir.FullName -Recurse -File
    $categoryCount = 0

    foreach ($organizedFile in $organizedFiles) {
        $totalOrganized++
        $categoryCount++

        # Reconstruct the original path
        $relativeToCategory = $organizedFile.FullName.Replace($categoryDir.FullName, "").TrimStart('\')

        # Clean up the path (reverse the cleaning done during organization)
        $originalRelativePath = $relativeToCategory -replace "_", "\"

        # Try multiple possible original locations
        $possibleOriginalPaths = @(
            (Join-Path $basePath $originalRelativePath),
            (Join-Path $basePath $organizedFile.Name),
            (Join-Path $basePath "sveltekit-frontend\$($organizedFile.Name)"),
            (Join-Path $basePath "go-microservice\$($organizedFile.Name)"),
            (Join-Path $basePath "scripts\$($organizedFile.Name)")
        )

        foreach ($possiblePath in $possibleOriginalPaths) {
            if (Test-Path $possiblePath) {
                # Verify it's the same file (size match)
                $organizedSize = (Get-Item $organizedFile.FullName).Length
                $originalSize = (Get-Item $possiblePath).Length

                if ($organizedSize -eq $originalSize) {
                    $verifiedPairs += @{
                        Original = $possiblePath
                        Organized = $organizedFile.FullName
                        Category = $categoryName
                        FileName = $organizedFile.Name
                    }
                    $matchedOriginals++

                    if ($ShowDetails) {
                        Write-Host "    ✅ Match found: $($organizedFile.Name)" -ForegroundColor Green
                    }
                    break
                }
            }
        }
    }

    Write-Host "    📊 ${categoryName}: $categoryCount organized files" -ForegroundColor Blue
}

Write-Host ""
Write-Host "📊 VERIFICATION SUMMARY" -ForegroundColor Cyan
Write-Host "📁 Total organized files: $totalOrganized" -ForegroundColor Green
Write-Host "🔗 Matched with originals: $matchedOriginals" -ForegroundColor Yellow
Write-Host "🗑️ Safe to remove: $matchedOriginals" -ForegroundColor $(if ($matchedOriginals -gt 0) { "Green" } else { "Red" })
Write-Host ""

if ($matchedOriginals -eq 0) {
    Write-Host "✅ No original files found to clean up!" -ForegroundColor Green
    Write-Host "💡 This could mean files were already cleaned or paths don't match" -ForegroundColor Yellow
    exit 0
}

Write-Host "🔍 PHASE 2: Files verified for safe removal" -ForegroundColor Magenta

# Group by category for nice display
$groupedPairs = $verifiedPairs | Group-Object Category

foreach ($group in $groupedPairs) {
    Write-Host "  📂 $($group.Name): $($group.Count) files" -ForegroundColor Blue

    if ($ShowDetails -or (-not $Execute)) {
        foreach ($pair in $group.Group) {
            $relativePath = $pair.Original.Replace($basePath, "").TrimStart("\")
            if (-not $Execute) {
                Write-Host "    📋 Would remove: $relativePath" -ForegroundColor DarkGray
            } else {
                Write-Host "    🗑️ Will remove: $relativePath" -ForegroundColor Yellow
            }
        }
    }
}

Write-Host ""

if ($isDryRun) {
    Write-Host "🔍 DRY RUN COMPLETE" -ForegroundColor Cyan
    Write-Host "💡 Run with -Execute to perform cleanup of $matchedOriginals files" -ForegroundColor Yellow
    Write-Host "🛡️ Only files with verified organized copies will be removed" -ForegroundColor Green
    Write-Host ""
    Write-Host "⚡ To execute:" -ForegroundColor Cyan
    Write-Host "   .\scripts\cleanup-organized-files-only.ps1 -Execute" -ForegroundColor White
} else {
    Write-Host "🔥 EXECUTING SAFE CLEANUP" -ForegroundColor Red
    Write-Host "🛡️ Removing only verified organized files..." -ForegroundColor Yellow
    Write-Host ""

    $removed = 0
    $failed = 0

    foreach ($pair in $verifiedPairs) {
        try {
            # Double-check the organized file still exists before removing original
            if (Test-Path $pair.Organized) {
                Remove-Item -Path $pair.Original -Force
                $removed++
                Write-Host "✅ Removed: $($pair.FileName)" -ForegroundColor Green
            } else {
                Write-Host "⚠️ Skipped: $($pair.FileName) (organized copy missing)" -ForegroundColor Yellow
                $failed++
            }
        } catch {
            $failed++
            Write-Host "❌ Failed to remove: $($pair.FileName) - $($_.Exception.Message)" -ForegroundColor Red
        }
    }

    Write-Host ""
    Write-Host "🎉 SAFE CLEANUP COMPLETE!" -ForegroundColor Cyan
    Write-Host "✅ Successfully removed: $removed files" -ForegroundColor Green
    if ($failed -gt 0) {
        Write-Host "❌ Failed to remove: $failed files" -ForegroundColor Red
    } else {
        Write-Host "❌ Failed to remove: $failed files" -ForegroundColor Green
    }
    Write-Host "🛡️ All organized files preserved at: $organizedPath" -ForegroundColor Magenta

    # Clean up empty directories (optional)
    Write-Host ""
    Write-Host "🧹 Cleaning up empty directories..." -ForegroundColor Gray
    $emptyDirs = Get-ChildItem -Path $basePath -Directory -Recurse | Where-Object {
        $_.Name -ne "organized-files" -and
        $_.FullName -notlike "*\.git*" -and
        $_.FullName -notlike "*\node_modules*" -and
        (Get-ChildItem $_.FullName -Force | Measure-Object).Count -eq 0
    }

    foreach ($emptyDir in $emptyDirs) {
        try {
            Remove-Item $emptyDir.FullName -Force
            Write-Host "🗑️ Removed empty directory: $($emptyDir.Name)" -ForegroundColor Gray
        } catch {
            Write-Host "⚠️ Could not remove directory: $($emptyDir.Name)" -ForegroundColor Yellow
        }
    }
}

Write-Host ""
Write-Host "📋 CLEANUP COMPLETE!" -ForegroundColor Cyan
Write-Host "✅ Only successfully organized files were removed" -ForegroundColor Green
Write-Host "🛡️ All organized files remain safely in organized-files/" -ForegroundColor Green
