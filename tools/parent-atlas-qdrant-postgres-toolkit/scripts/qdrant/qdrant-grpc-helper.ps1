[CmdletBinding()]
param(
  [string]$Address = "127.0.0.1:6334",
  [string]$ProtoRoot = "",
  [string]$ProtoFile = "",
  [string]$Service = "",
  [switch]$ListOnly
)

$ErrorActionPreference = "Stop"

if (-not (Get-Command grpcurl -ErrorAction SilentlyContinue)) {
  throw "grpcurl is required. Install it separately and ensure it is on PATH."
}

Write-Host "Qdrant gRPC target: $Address"
Write-Host "Note: server reflection may be disabled."

if ($ListOnly -or (-not $Service)) {
  $list = & grpcurl -plaintext -max-time 8 $Address list 2>&1
  if ($LASTEXITCODE -eq 0) {
    $list
    exit 0
  }

  Write-Warning "Reflection-based listing failed."
  Write-Warning "Use -ProtoRoot and -ProtoFile with an official Qdrant proto checkout."
  $list
  if (-not $ProtoRoot -or -not $ProtoFile) {
    exit 2
  }
}

if (-not $ProtoRoot -or -not $ProtoFile -or -not $Service) {
  throw "ProtoRoot, ProtoFile, and Service are required for a descriptor-based call."
}

& grpcurl `
  -plaintext `
  -max-time 8 `
  -import-path $ProtoRoot `
  -proto $ProtoFile `
  $Address `
  $Service

exit $LASTEXITCODE
