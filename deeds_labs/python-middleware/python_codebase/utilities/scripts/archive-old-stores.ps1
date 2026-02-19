#!/usr/bin/env powershell
# Archive old fragmented store files

$storesDir = "c:\Users\james\Videos\deeds-web-app\sveltekit-frontend\src\lib\stores"
$archiveDir = "$storesDir\_archive\old-stores"

# Create archive if it doesn't exist
if (-not (Test-Path $archiveDir)) {
    New-Item -ItemType Directory -Path $archiveDir -Force | Out-Null
}

# List of new unified store files to keep
$keepFiles = @(
    "unified.ts",
    "index.ts",
    "_archive",
    "package.json"
)

# Get all files in stores directory (excluding directories and keep files)
$files = Get-ChildItem -Path $storesDir -File -Recurse:$false | Where-Object {
    -not ($_.Name -in $keepFiles) -and
    $_.Name -notmatch "^\.git"
}

Write-Host "📁 Found $($files.Count) old store files to archive"
Write-Host ""

$movedCount = 0
$files | ForEach-Object {
    $relativePath = $_.Name
    $destPath = Join-Path $archiveDir $relativePath

    # Handle duplicates by adding timestamp
    if (Test-Path $destPath) {
        $name = $_.BaseName
        $ext = $_.Extension
        $timestamp = Get-Date -Format "yyyyMMdd-HHmmss"
        $destPath = Join-Path $archiveDir "${name}_${timestamp}${ext}"
    }

    Move-Item -Path $_.FullName -Destination $destPath -Force
    $movedCount++

    if ($movedCount -le 10 -or $movedCount % 20 -eq 0) {
        Write-Host "✅ [$movedCount] Archived: $($_.Name)"
    }
}

Write-Host ""
Write-Host "📊 Archive Summary:"
Write-Host "   ✅ Files archived: $movedCount"
Write-Host "   📁 Archive location: $archiveDir"
Write-Host ""
Write-Host "Remaining files in stores directory:"
Get-ChildItem -Path $storesDir -File -Recurse:$false | Select-Object Name
