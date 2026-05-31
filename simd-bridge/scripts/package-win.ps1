Param()
$ErrorActionPreference = 'Stop'

Write-Host "Packaging simd native addon for Windows (simd_bridge_rs.node)"

$repoRoot = Split-Path -Parent $PSScriptRoot
$cratePath = Join-Path $repoRoot '..\rust-simdjson'
Write-Host "Changing directory to: $cratePath"
Set-Location $cratePath

Write-Host "Running: cargo build --release"
cargo build --release

$targetDir = Join-Path $cratePath 'target\release'
$dll = Join-Path $targetDir 'simd_bridge_rs.dll'
$node = Join-Path $targetDir 'simd_bridge_rs.node'

if (Test-Path $dll) {
  Write-Host "Found DLL: $dll"
  Write-Host "Copying to: $node"
  Copy-Item -Path $dll -Destination $node -Force
  Write-Host "Packaged: $node"
} else {
  Write-Host "Error: expected build artifact not found: $dll" -ForegroundColor Red
  Write-Host "Available files in target/release:"
  Get-ChildItem -Path $targetDir | ForEach-Object { Write-Host " - $_" }
  exit 1
}

Write-Host "Done. You can now run node scripts that require the native addon."
