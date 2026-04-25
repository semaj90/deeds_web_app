<#
.SYNOPSIS
Phase 52 – Find and open the worst TS error files
#>

$ErrorLog = "logs/tsc_after_patch7.txt"
$TopN = 10
$SimdParser = "http://localhost:8095/json"

Write-Host "🚀  Phase 52 – Isolating top $TopN error-dense files"

# group by file paths that appear near “error TS”
$FileCounts = Get-Content $ErrorLog |
  Select-String "src\\.*\.ts" |
  ForEach-Object { $_.Matches.Value } |
  Group-Object |
  Sort-Object Count -Descending |
  Select-Object -First $TopN

$Tmp = @()
foreach ($f in $FileCounts) {
  $Tmp += $f.Name
  Write-Host ("⚠️  {0}  →  {1} errors" -f $f.Name, $f.Count)
}

# push to SIMD parser for tokenization preview
if ($Tmp.Count -gt 0) {
  $Body = Get-Content $ErrorLog -Raw
  Invoke-RestMethod -Uri "$SimdParser" -Method POST -Body $Body | Out-Null
  Write-Host "✅ Sent log to SIMD parser ($SimdParser)"
}

# open the top files in VS Code
code $Tmp