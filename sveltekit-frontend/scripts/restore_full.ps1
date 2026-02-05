$srcRoot = "$PSScriptRoot\src"
$backupRoot = "$PSScriptRoot\src.backup.20260104_111218"
$count = 0
$restored = @()

Write-Host "Scanning $srcRoot for corrupted files..."

# Get all files in src that are small
$files = Get-ChildItem -Path $srcRoot -Recurse -File | Where-Object { $_.Length -lt 100 }

foreach ($file in $files) {
    # Get relative path from src
    $relPath = $file.FullName.Substring($srcRoot.Length + 1)

    # Construct backup path
    $backupPath = Join-Path $backupRoot $relPath

    if (Test-Path $backupPath) {
        $backupItem = Get-Item $backupPath
        if ($backupItem.Length -gt 100) {
            Write-Host "Restoring $relPath (Size: $($file.Length) -> $($backupItem.Length))"
            Copy-Item $backupPath $file.FullName -Force
            $count++
            $restored += $relPath
        }
    }
}
Write-Host "Restoration complete. Restored $count files."
if ($count -gt 0) {
    $restored | Out-File "restored_files_log.txt"
}
