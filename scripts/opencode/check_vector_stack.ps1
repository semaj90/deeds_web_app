# Check and smoke-test the vector stack (Redis Stack + Qdrant)
param()

Write-Host "Starting vector stack health check..."

$compose = "docker-compose -f $PSScriptRoot\..\..\docker-compose.vector.yml"
Write-Host "Bringing up containers (detached)..."
& docker-compose -f (Resolve-Path "$PSScriptRoot\..\..\docker-compose.vector.yml") up -d

Start-Sleep -Seconds 4

function Exec-RedisPing {
  Write-Host "Checking Redis (docker exec deeds-redis-stack redis-cli PING) ..."
  $out = & docker exec deeds-redis-stack redis-cli PING 2>&1
  Write-Host $out
}

function Check-Qdrant {
  Write-Host "Checking Qdrant HTTP health..."
  try {
    $res = Invoke-RestMethod -Uri http://localhost:6333/collections -Method Get -ErrorAction Stop
    Write-Host "Qdrant collections:"
    $res | ConvertTo-Json -Depth 2
  } catch {
    Write-Host "Qdrant check failed: $_"
  }
}

Exec-RedisPing
Check-Qdrant

Write-Host "Seeding Qdrant demo collection..."
node (Join-Path $PSScriptRoot 'seed-qdrant.mjs')

Write-Host "Running langcache demo (Node)..."
node (Join-Path $PSScriptRoot 'langcache-demo.mjs')

Write-Host "Vector stack health check complete. Review outputs above."
