$src = "src\lib\services"
$backup = "src.backup.20260104_111218\lib\services"
$count = 0
$files = Get-ChildItem -Path $src -File | Where-Object { $_.Length -lt 100 }

Write-Host "Found $($files.Count) candidates in $src"

foreach ($file in $files) {
    $backupPath = Join-Path $backup $file.Name
    if (Test-Path $backupPath) {
        $backupItem = Get-Item $backupPath
        if ($backupItem.Length -gt 100) {
            Write-Host "Restoring $($file.Name) (Size: $($file.Length) -> $($backupItem.Length))"
            Copy-Item $backupPath $file.FullName -Force
            $count++
        } else {
             Write-Host "Skipping $($file.Name) - Backup also small ($($backupItem.Length))"
        }
    } else {
        Write-Host "Skipping $($file.Name) - No backup found at $backupPath"
    }
}
Write-Host "Restored $count files."
