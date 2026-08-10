param(
  [string]$RepoRoot = "C:\Users\james\Videos\deeds-web-app",
  [switch]$Apply
)

$ErrorActionPreference = "Stop"
$BundleRoot = Split-Path -Parent $MyInvocation.MyCommand.Path

$paths = @(
  "openspec",
  "sveltekit-frontend"
)

Write-Host "Parent Atlas tensor residency bundle"
Write-Host "Bundle: $BundleRoot"
Write-Host "Repo:   $RepoRoot"
Write-Host "Mode:   $(if ($Apply) { 'APPLY' } else { 'DRY-RUN' })"

foreach ($top in $paths) {
  $src = Join-Path $BundleRoot $top
  if (-not (Test-Path $src)) { continue }
  Get-ChildItem $src -Recurse -File | ForEach-Object {
    $rel = $_.FullName.Substring($BundleRoot.Length + 1)
    $dst = Join-Path $RepoRoot $rel
    $exists = Test-Path $dst
    Write-Host ("{0} {1}" -f ($(if ($exists) { 'COLLISION' } else { 'NEW      ' })), $rel)
    if ($Apply) {
      if ($exists) {
        throw "Refusing to overwrite existing file: $dst"
      }
      New-Item -ItemType Directory -Force -Path (Split-Path -Parent $dst) | Out-Null
      Copy-Item $_.FullName $dst
    }
  }
}

if (-not $Apply) {
  Write-Host "Dry run only. Re-run with -Apply after reviewing collisions."
}
