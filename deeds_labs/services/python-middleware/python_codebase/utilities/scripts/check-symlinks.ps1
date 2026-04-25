param(
  [Parameter(Mandatory=$true)][string]$Path,
  [int]$Show = 10
)
$ErrorActionPreference = 'SilentlyContinue'
if (-not (Test-Path -LiteralPath $Path)) {
  Write-Output "❌ Path not found: $Path"
  exit 1
}
$items = Get-ChildItem -LiteralPath $Path -Recurse -Force -ErrorAction SilentlyContinue |
  Where-Object { ($_.Attributes -band [IO.FileAttributes]::ReparsePoint) -ne 0 }
$cnt = ($items | Measure-Object).Count
Write-Output ("ReparsePoints: {0}" -f $cnt)
if ($cnt -gt 0) {
  $items | Select-Object -First $Show FullName, Attributes | Format-Table -AutoSize
}
