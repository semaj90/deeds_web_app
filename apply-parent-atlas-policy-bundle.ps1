param(
  [Parameter(Mandatory=$true)][string]$RepoRoot,
  [switch]$Apply,
  [switch]$Force
)

$ErrorActionPreference = 'Stop'
$BundleRoot = Split-Path -Parent $MyInvocation.MyCommand.Path
$Targets = @('sveltekit-frontend', 'openspec', 'docs')

foreach ($top in $Targets) {
  $source = Join-Path $BundleRoot $top
  if (-not (Test-Path $source)) { continue }
  Get-ChildItem -Path $source -Recurse -File | ForEach-Object {
    $relative = $_.FullName.Substring($BundleRoot.Length + 1)
    $dest = Join-Path $RepoRoot $relative
    if ((Test-Path $dest) -and -not $Force) {
      Write-Host "SKIP existing: $relative" -ForegroundColor Yellow
      return
    }
    if (-not $Apply) {
      Write-Host "DRY-RUN copy: $relative"
      return
    }
    New-Item -ItemType Directory -Force -Path (Split-Path -Parent $dest) | Out-Null
    Copy-Item $_.FullName $dest -Force:$Force
    Write-Host "COPIED: $relative" -ForegroundColor Green
  }
}

if (-not $Apply) {
  Write-Host "Dry run only. Re-run with -Apply after reviewing the paths."
}
