Write-Output '--- Largest Untracked (top 30) ---'
git ls-files --others --exclude-standard | ForEach-Object {
  $p = $_
  try { $l = (Get-Item -LiteralPath $p).Length } catch { $l = 0 }
  [PSCustomObject]@{Path=$p; SizeMB=[math]::Round($l/1MB,2)}
} | Sort-Object SizeMB -Descending | Select-Object -First 30 | Format-Table -AutoSize

Write-Output ''
Write-Output '--- Largest Modified Tracked (top 30) ---'
git ls-files -m | ForEach-Object {
  $p = $_
  try { $l = (Get-Item -LiteralPath $p).Length } catch { $l = 0 }
  [PSCustomObject]@{Path=$p; SizeMB=[math]::Round($l/1MB,2)}
} | Sort-Object SizeMB -Descending | Select-Object -First 30 | Format-Table -AutoSize
