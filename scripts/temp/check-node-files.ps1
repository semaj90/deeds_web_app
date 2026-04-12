$tempPath = "C:\Users\james\AppData\Local\Temp"

Write-Host "=== .node FILES IN USE AUDIT ==="
Write-Host ""

# Get all .node files
$nodeFiles = Get-ChildItem "$tempPath\*.node" -File -ErrorAction SilentlyContinue
Write-Host "Total .node files: $($nodeFiles.Count)"
$totalSize = ($nodeFiles | Measure-Object -Property Length -Sum).Sum
Write-Host "Total size: $([math]::Round($totalSize/1GB,2)) GB"
Write-Host ""

# Show 20 most recent
Write-Host "--- 20 Most Recent .node files ---"
$recent = $nodeFiles | Sort-Object LastWriteTime -Descending | Select-Object -First 20
foreach ($f in $recent) {
    $sizeMB = [math]::Round($f.Length/1MB, 1)
    Write-Host "  $($f.Name)  $sizeMB MB  $($f.LastWriteTime.ToString('yyyy-MM-dd HH:mm'))"
}

# Check which are locked (in use by a process)
Write-Host ""
Write-Host "--- Checking for LOCKED files (in use) ---"
$locked = 0
$unlocked = 0
$sample = $nodeFiles | Sort-Object LastWriteTime -Descending | Select-Object -First 200

foreach ($f in $sample) {
    try {
        $stream = [System.IO.File]::Open($f.FullName, 'Open', 'ReadWrite', 'None')
        $stream.Close()
        $unlocked++
    } catch {
        $locked++
        Write-Host "  LOCKED: $($f.Name) ($([math]::Round($f.Length/1MB,1)) MB)"
    }
}

Write-Host ""
Write-Host "Sampled 200 most recent files:"
Write-Host "  Locked (in use): $locked"
Write-Host "  Unlocked (safe to delete): $unlocked"

# Age distribution
Write-Host ""
Write-Host "--- Age distribution of ALL .node files ---"
$now = Get-Date
$today = @($nodeFiles | Where-Object { ($now - $_.LastWriteTime).TotalDays -le 1 }).Count
$week = @($nodeFiles | Where-Object { ($now - $_.LastWriteTime).TotalDays -gt 1 -and ($now - $_.LastWriteTime).TotalDays -le 7 }).Count
$month = @($nodeFiles | Where-Object { ($now - $_.LastWriteTime).TotalDays -gt 7 -and ($now - $_.LastWriteTime).TotalDays -le 30 }).Count
$older = @($nodeFiles | Where-Object { ($now - $_.LastWriteTime).TotalDays -gt 30 }).Count

Write-Host "  Today: $today files"
Write-Host "  1-7 days: $week files"
Write-Host "  7-30 days: $month files"
Write-Host "  Older than 30 days: $older files"

# Unique base names (what modules are these?)
Write-Host ""
Write-Host "--- Unique module names (from filenames) ---"
$basenames = $nodeFiles | ForEach-Object {
    # Strip random suffixes - .node files are often like: better_sqlite3.node, sharp-win32.node
    $_.BaseName -replace '_napi_v\d+','_napi' -replace '-v\d+\.\d+','' -replace '\.\d+$',''
} | Group-Object | Sort-Object Count -Descending | Select-Object -First 20

foreach ($b in $basenames) {
    Write-Host "  $($b.Name): $($b.Count) copies"
}
