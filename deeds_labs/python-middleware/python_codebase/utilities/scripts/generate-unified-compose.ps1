<#
Detect running Docker containers and produce a deduplicated docker-compose.unified.yml

Usage:
  pwsh ./scripts/generate-unified-compose.ps1

This script inspects `docker ps` output and emits a canonical compose file where known
services are deduplicated and present. It will not overwrite your existing compose file
unless you pass -Force.
#>

param(
  [switch]$Force
)

Write-Host "🔍 Detecting running Docker containers..."

$ps = docker ps --format "{{.Names}} {{.Image}} {{.Ports}}" 2>$null
if ($LASTEXITCODE -ne 0) {
  Write-Host "⚠️ Docker daemon not reachable from this environment. Run this script on your machine with Docker Desktop or Docker Engine running." -ForegroundColor Yellow
  exit 1
}

$containers = $ps -split "`n" | Where-Object { $_ -ne "" }
Write-Host "Found containers:`n" -NoNewline
$containers | ForEach-Object { Write-Host "  $_" }

# Known service templates
$serviceMap = @{
  "postgres" = @{
    image = "pgvector/pgvector:pg17"
    ports = @("5432:5432")
    env   = @("POSTGRES_USER=postgres","POSTGRES_PASSWORD=postgres","POSTGRES_DB=deeds_db")
    volumes = @("postgres_data:/var/lib/postgresql/data")
  }
  "redis" = @{
    image = "redis:7-alpine"
    ports = @("6379:6379")
    volumes = @("redis_data:/data")
  }
  "qdrant" = @{
    image = "qdrant/qdrant:latest"
    ports = @("6333:6333")
    volumes = @("qdrant_storage:/qdrant/storage")
  }
  "rabbitmq" = @{
    image = "rabbitmq:3-management"
    ports = @("5672:5672","15672:15672")
    env = @("RABBITMQ_DEFAULT_USER=user","RABBITMQ_DEFAULT_PASS=password")
    volumes = @("rabbitmq_data:/var/lib/rabbitmq")
  }
  "minio" = @{
    image = "minio/minio:latest"
    ports = @("9000:9000","9001:9001")
    env = @("MINIO_ROOT_USER=minioadmin","MINIO_ROOT_PASSWORD=minioadmin")
    volumes = @("minio_data:/data")
  }
  "ollama" = @{
    image = "ollama/ollama:latest"
    ports = @("11434:11434")
    volumes = @("ollama_models:/root/.ollama")
  }
  "triton" = @{
    image = "nvcr.io/nvidia/tritonserver:24.09-py3"
    ports = @("8000:8000","8001:8001","8002:8002")
    volumes = @("./models:/models")
  }
}

$composeLines = @()
$composeLines += "version: '3.9'"
$composeLines += "services:"

foreach ($svcName in $serviceMap.Keys) {
  $found = $containers | Where-Object { $_ -match $svcName }
  if ($found) {
    Write-Host "✅ Found running container for $svcName, adding template to compose." -ForegroundColor Green
  } else {
    Write-Host "🆕 $svcName not running; adding template for future startup." -ForegroundColor Yellow
  }

  $svc = $serviceMap[$svcName]
  $composeLines += "  $svcName:"
  $composeLines += "    image: $($svc.image)"
  $composeLines += "    container_name: $svcName"
  if ($svc.env) {
    $composeLines += "    environment:"
    foreach ($e in $svc.env) { $composeLines += "      - $e" }
  }
  if ($svc.ports) {
    $composeLines += "    ports:"
    foreach ($p in $svc.ports) { $composeLines += "      - \"$p\"" }
  }
  if ($svc.volumes) {
    $composeLines += "    volumes:"
    foreach ($v in $svc.volumes) { $composeLines += "      - $v" }
  }
  $composeLines += "    networks:"
  $composeLines += "      - backend"
  $composeLines += ""
}

$composeLines += "volumes:";
$seenVolumes = @{}
foreach ($svc in $serviceMap.Values) {
  if ($svc.volumes) {
    foreach ($v in $svc.volumes) {
      $name = ($v -split ':')[0]
      if (-not $seenVolumes.ContainsKey($name)) { $composeLines += "  $name:"; $seenVolumes[$name] = $true }
    }
  }
}

$composeLines += "networks:";
$composeLines += "  backend:";
$composeLines += "    driver: bridge"

$outPath = Join-Path -Path (Get-Location) -ChildPath "docker-compose.unified.yml"
if (Test-Path $outPath -PathType Leaf -and -not $Force) {
  Write-Host "⚠️ $outPath already exists. Re-run with -Force to overwrite." -ForegroundColor Yellow
  exit 0
}

$composeLines -join "`n" | Out-File -FilePath $outPath -Encoding utf8
Write-Host "✅ Generated: $outPath" -ForegroundColor Green

Write-Host "Next: run `docker compose -f docker-compose.unified.yml up -d` to start the unified stack."
