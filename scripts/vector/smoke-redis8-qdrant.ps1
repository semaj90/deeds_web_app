param(
  [string]$ComposeFile = "$PSScriptRoot\..\..\docker-compose.redis8-eval.yml",
  [string]$RedisContainer = "redis8-eval",
  [string]$QdrantUrl = "http://127.0.0.1:6333",
  [int]$RedisPort = 6380,
  [switch]$SkipUp
)

$ErrorActionPreference = "Stop"

function Step($msg) {
  Write-Host ""
  Write-Host "==> $msg" -ForegroundColor Cyan
}

function Assert-Port-FreeOrListening($port) {
  $line = netstat -ano | Select-String ":$port "
  if ($line) {
    Write-Host "Port $port has listener:" -ForegroundColor Yellow
    $line | Select-Object -First 5 | ForEach-Object { Write-Host $_ }
  } else {
    Write-Host "Port $port has no listener yet."
  }
}

Step "Redis 8 / Qdrant eval health check"
Write-Host "Compose file: $ComposeFile"

Assert-Port-FreeOrListening $RedisPort

if (-not $SkipUp) {
  Step "Bringing up Redis 8 eval container"
  docker compose -f $ComposeFile up -d
}

Start-Sleep -Seconds 3

Step "Checking Redis 8 PING"
$ping = docker exec $RedisContainer redis-cli PING
if ($ping -ne "PONG") {
  throw "Redis 8 did not return PONG. Got: $ping"
}
Write-Host "Redis PING: $ping" -ForegroundColor Green

Step "Checking Redis version/license-relevant server info"
docker exec $RedisContainer redis-cli INFO server | Select-String "redis_version|redis_mode|os|arch_bits"

Step "Checking Redis 8 Vector Set commands"
$vadd = docker exec $RedisContainer redis-cli COMMAND INFO VADD
$vsim = docker exec $RedisContainer redis-cli COMMAND INFO VSIM
Write-Host "VADD command info present: $($vadd -ne $null)"
Write-Host "VSIM command info present: $($vsim -ne $null)"

Step "Testing Redis Streams durable delivery"
docker exec $RedisContainer redis-cli XGROUP CREATE ace:memory:events opencode-consumers '$' MKSTREAM 2>$null | Out-Null
$id = docker exec $RedisContainer redis-cli XADD ace:memory:events '*' source opencode event smoke summary "redis8 streams smoke"
Write-Host "XADD id: $id"
docker exec $RedisContainer redis-cli XREADGROUP GROUP opencode-consumers worker-1 COUNT 1 STREAMS ace:memory:events ">"
docker exec $RedisContainer redis-cli XACK ace:memory:events opencode-consumers $id

Step "Testing Redis 8 Vector Sets"
docker exec $RedisContainer redis-cli DEL ace:vector:test | Out-Null
docker exec $RedisContainer redis-cli VADD ace:vector:test VALUES 4 0.1 0.2 0.3 0.4 card:a
docker exec $RedisContainer redis-cli VADD ace:vector:test VALUES 4 0.1 0.2 0.29 0.41 card:b
docker exec $RedisContainer redis-cli VADD ace:vector:test VALUES 4 0.9 0.1 0.1 0.1 card:c
docker exec $RedisContainer redis-cli TYPE ace:vector:test
docker exec $RedisContainer redis-cli VSIM ace:vector:test VALUES 4 0.1 0.2 0.3 0.4 WITHSCORES COUNT 3

Step "Checking Qdrant HTTP"
try {
  $collections = Invoke-RestMethod -Uri "$QdrantUrl/collections" -Method Get -ErrorAction Stop
  $collections | ConvertTo-Json -Depth 4
} catch {
  throw "Qdrant HTTP check failed at $QdrantUrl/collections: $_"
}

Step "Done"
Write-Host "Redis 8 eval + Qdrant health check complete." -ForegroundColor Green
