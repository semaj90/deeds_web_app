# Archive old fragmented store files
$storesDir = "c:\Users\james\Videos\deeds-web-app\sveltekit-frontend\src\lib\stores"
$archiveDir = "$storesDir\_archive\old-stores"

if (-not (Test-Path $archiveDir)) {
    New-Item -ItemType Directory -Path $archiveDir -Force | Out-Null
}

$keepFiles = @("unified.ts", "index.ts", "_archive", "package.json")

$files = Get-ChildItem -Path $storesDir -File | Where-Object {
    -not ($_.Name -in $keepFiles) -and $_.Name -notmatch "^\.git"
}

Write-Host "Found files to archive: $($files.Count)"

$movedCount = 0
$files | ForEach-Object {
    $destPath = Join-Path $archiveDir $_.Name
    if (Test-Path $destPath) {
        $destPath = Join-Path $archiveDir "$($_.BaseName)_$(Get-Date -Format yyyyMMdd-HHmmss)$($_.Extension)"
    }
    Move-Item -Path $_.FullName -Destination $destPath -Force
    $movedCount++
    if ($movedCount % 20 -eq 1) { Write-Host "Archived $movedCount files..." }
}

Write-Host "Archive Complete: $movedCount files moved"
Write-Host "Location: $archiveDir"
