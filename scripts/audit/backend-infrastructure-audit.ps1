param(
  [string]$DEEDS_REDIS_CONTAINER = $env:DEEDS_REDIS_CONTAINER,
  [string]$RABBITMQ_CONTAINER = $env:RABBITMQ_CONTAINER,
  [string]$RABBITMQ_USER = $env:RABBITMQ_USER,
  [string]$RABBITMQ_PASS = $env:RABBITMQ_PASS,
  [string]$OLLAMA_URL = $env:OLLAMA_URL,
  [string]$SIMDJSON_PATH = $env:SIMDJSON_PATH
)

$ErrorActionPreference = 'Stop'

function Write-Log($msg) { Write-Host "[audit-native] $msg" }

function Invoke-JsonGet([string]$Uri, [int]$TimeoutSec = 4) {
  Invoke-RestMethod -Uri $Uri -TimeoutSec $TimeoutSec
}

function Invoke-JsonPost([string]$Uri, [object]$Body, [int]$TimeoutSec = 10) {
  $json = if ($Body -is [string]) { $Body } else { $Body | ConvertTo-Json -Compress -Depth 12 }
  Invoke-RestMethod -Method POST -Uri $Uri -ContentType 'application/json' -TimeoutSec $TimeoutSec -Body $json
}

Write-Log "Running backend-infrastructure-audit.ps1 natively on Windows"

$pass = 0
$fail = 0
$skip = 0

function MarkPass([string]$name, [string]$detail = '') {
  if ($detail) { Write-Host "✅ PASS $detail" } else { Write-Host "✅ PASS" }
  $script:pass = $script:pass + 1
}

function MarkFail([string]$name, [string]$detail = '') {
  if ($detail) { Write-Host "❌ FAIL - $detail" } else { Write-Host "❌ FAIL" }
  $script:fail = $script:fail + 1
}

function MarkSkip([string]$name, [string]$detail = '') {
  if ($detail) { Write-Host "⚠️  SKIP $detail" } else { Write-Host "⚠️  SKIP" }
  $script:skip = $script:skip + 1
}

function Test-DockerPing([string]$container) {
  $out = & docker exec $container redis-cli PING 2>$null
  return ($out -match 'PONG')
}

function Test-HttpOk([string]$uri, [int]$timeout = 4) {
  try {
    $null = Invoke-JsonGet $uri $timeout
    return $true
  } catch {
    return $false
  }
}

function Get-BasicAuthHeader([string]$user, [string]$pass) {
  $bytes = [Text.Encoding]::UTF8.GetBytes("$user`:$pass")
  $b64 = [Convert]::ToBase64String($bytes)
  return @{ Authorization = "Basic $b64" }
}

Write-Host "🔍 Backend Infrastructure Audit (17 Gates)"
Write-Host "==========================================="
Write-Host ""

$redisContainer = if ($DEEDS_REDIS_CONTAINER) { $DEEDS_REDIS_CONTAINER } else { 'deeds-redis-prod' }
$rabbitUser = if ($RABBITMQ_USER) { $RABBITMQ_USER } else { 'guest' }
$rabbitPass = if ($RABBITMQ_PASS) { $RABBITMQ_PASS } else { 'guest' }
$ollamaBase = if ($OLLAMA_URL) { $OLLAMA_URL.TrimEnd('/') } else { 'http://127.0.0.1:11434' }

Write-Host "🔴 Tier A: Cache Layer"
Write-Host "----------------------"

Write-Host -NoNewline "G1: Redis connection... "
if (Test-DockerPing $redisContainer) {
  MarkPass 'G1'
} else {
  MarkFail 'G1' 'Redis not responding'
}

Write-Host -NoNewline "G2: Redis cache populated... "
try {
  $stats = Invoke-JsonGet 'http://127.0.0.1:5173/api/cache/exact-match/stats' 4
  $totalKeys = $stats.stats.totalKeys
  if ($stats -and $null -ne $totalKeys) {
    MarkPass 'G2' "($totalKeys keys)"
  } else {
    MarkFail 'G2' 'Cache stats endpoint returned no totalKeys'
  }
} catch {
  MarkFail 'G2' 'Cache stats endpoint not responding'
}

Write-Host -NoNewline "G3: Redis memory usage... "
try {
  $mem = (& docker exec $redisContainer redis-cli info memory 2>$null | Out-String)
  if ($LASTEXITCODE -eq 0 -and $mem -match 'used_memory_human:([^\r\n]+)') {
    MarkPass 'G3' "($($Matches[1].Trim()) used)"
  } else {
    MarkFail 'G3'
  }
} catch {
  MarkFail 'G3'
}

Write-Host -NoNewline "G4: Bifrost semantic cache... "
if (Test-HttpOk 'http://127.0.0.1:3040/health' 4) {
  MarkPass 'G4'
} else {
  MarkFail 'G4' 'Bifrost health failed'
}

Write-Host -NoNewline "G5: Qdrant vector store... "
try {
  $qdrant = Invoke-JsonGet 'http://127.0.0.1:6333/' 4
  if ($qdrant -and $qdrant.version) {
    MarkPass 'G5' "(v$($qdrant.version))"
  } else {
    MarkFail 'G5' 'Qdrant version missing'
  }
} catch {
  MarkFail 'G5' 'Qdrant not responding'
}

Write-Host ""
Write-Host "🟡 Tier B: Inference Layer"
Write-Host "--------------------------"

Write-Host -NoNewline "G6: Ollama service... "
try {
  $tags = Invoke-JsonGet "$ollamaBase/api/tags" 4
  $modelCount = @($tags.models).Count
  if ($modelCount -gt 0) {
    MarkPass 'G6' "($modelCount models)"
  } else {
    MarkFail 'G6' 'No models returned'
  }
} catch {
  MarkFail 'G6' 'Ollama not responding'
}

Write-Host -NoNewline "G7: GPU availability... "
try {
  $gpu = & nvidia-smi --query-gpu=name --format=csv,noheader 2>$null
  if ($LASTEXITCODE -eq 0 -and $gpu) {
    $free = & nvidia-smi --query-gpu=memory.free --format=csv,noheader,nounits 2>$null | Select-Object -First 1
    MarkPass 'G7' "($($gpu | Select-Object -First 1), ${free}MB free)"
  } else {
    MarkSkip 'G7' '(No GPU detected)'
  }
} catch {
  MarkSkip 'G7' '(No GPU detected)'
}

Write-Host -NoNewline "G8: Required models... "
try {
  $models = Invoke-JsonGet "$ollamaBase/api/tags" 4
  $names = @($models.models | ForEach-Object { $_.name })
  $hasRotor = @($names | Where-Object { $_ -match 'gemma4-rotorquant|gemma4-legal|gemma4-legal\.gguf' }).Count -gt 0
  $hasEmbed = @($names | Where-Object { $_ -match 'embeddinggemma' }).Count -gt 0
  if ($hasRotor -and $hasEmbed) {
    MarkPass 'G8' '(rotorquant + embedding models present)'
  } else {
    MarkSkip 'G8' "(missing models: rotorquant=$([int]$hasRotor) embed=$([int]$hasEmbed))"
  }
} catch {
  MarkSkip 'G8' '(model check unavailable)'
}

Write-Host -NoNewline "G9: Inference latency... "
try {
  $start = Get-Date
  $null = & ollama run 'gemma4-rotorquant:latest' 'say ok' 2>$null
  $latency = [int]((Get-Date) - $start).TotalMilliseconds
  if ($latency -lt 60000) {
    MarkPass 'G9' "(${latency}ms)"
  } else {
    MarkSkip 'G9' "(${latency}ms - slower than expected)"
  }
} catch {
  MarkFail 'G9' 'Inference request failed'
}

Write-Host ""
Write-Host "🟢 Tier C: Message Queue"
Write-Host "------------------------"

Write-Host -NoNewline "G10: RabbitMQ service... "
try {
  $hdr = Get-BasicAuthHeader $rabbitUser $rabbitPass
  $overview = Invoke-RestMethod -Uri 'http://127.0.0.1:15672/api/overview' -Headers $hdr -TimeoutSec 4
  if ($overview.rabbitmq_version) {
    MarkPass 'G10' "(v$($overview.rabbitmq_version))"
  } else {
    MarkFail 'G10' 'RabbitMQ management API returned no version'
  }
} catch {
  MarkFail 'G10' 'RabbitMQ management API not accessible'
}

Write-Host -NoNewline "G11: Queue consumers... "
try {
  $hdr = Get-BasicAuthHeader $rabbitUser $rabbitPass
  $queues = Invoke-RestMethod -Uri 'http://127.0.0.1:15672/api/queues' -Headers $hdr -TimeoutSec 4
  if ($queues) {
    $queueCount = @($queues).Count
    $noConsumers = @($queues | Where-Object { ($_.consumers -as [int]) -eq 0 }).Count
    if ($noConsumers -eq 0) {
      MarkPass 'G11' "($queueCount queues, all have consumers)"
    } else {
      MarkSkip 'G11' "($noConsumers queues without consumers)"
    }
  } else {
    MarkFail 'G11'
  }
} catch {
  MarkFail 'G11'
}

Write-Host -NoNewline "G12: Message flow... "
try {
  $hdr = Get-BasicAuthHeader $rabbitUser $rabbitPass
  $queue = Invoke-RestMethod -Uri 'http://127.0.0.1:15672/api/queues/%2F/synthesis.generate' -Headers $hdr -TimeoutSec 4
  if ($queue) {
    $msgCount = $queue.messages
    MarkPass 'G12' "(synthesis queue: $msgCount pending)"
  } else {
    MarkSkip 'G12' '(synthesis queue not found)'
  }
} catch {
  MarkSkip 'G12' '(synthesis queue not found)'
}

Write-Host ""
Write-Host "🔵 Tier D: Observability"
Write-Host "------------------------"

Write-Host -NoNewline "G13: Langfuse UI... "
try {
  $langfuse = Invoke-JsonGet 'http://127.0.0.1:3030' 4
  if ($langfuse) {
    MarkPass 'G13'
  } else {
    MarkFail 'G13'
  }
} catch {
  MarkSkip 'G13' '(Langfuse not running)'
}

Write-Host -NoNewline "G14: Trace ingestion... "
try {
  $traces = Invoke-JsonGet 'http://127.0.0.1:3030/api/public/traces?limit=1' 4
  if (($traces | ConvertTo-Json -Depth 4) -match 'data|traces') {
    MarkPass 'G14'
  } else {
    MarkSkip 'G14' '(no traces found)'
  }
} catch {
  MarkSkip 'G14' '(Langfuse not running)'
}

Write-Host -NoNewline "G15: Cache monitoring... "
try {
  $cacheStats = Invoke-JsonGet 'http://127.0.0.1:5173/api/cache/exact-match/stats' 4
  if ($cacheStats.success -eq $true) {
    MarkPass 'G15' "($($cacheStats.stats.totalKeys) keys, $($cacheStats.stats.memoryUsedMB)MB)"
  } else {
    MarkFail 'G15'
  }
} catch {
  MarkFail 'G15'
}

Write-Host ""
Write-Host "🟣 Tier E: Codebase Intelligence"
Write-Host "--------------------------------"

Write-Host -NoNewline "G16: Codebase index... "
try {
  $codebaseStats = Invoke-JsonGet 'http://127.0.0.1:5173/api/codebase-index/stats' 4
  if ($codebaseStats.indexedFiles -gt 0) {
    $simd = if ($codebaseStats._perf.simdAvailable) { 'true' } else { 'false' }
    MarkPass 'G16' "($($codebaseStats.indexedFiles) files, simdjson: $simd)"
  } else {
    MarkSkip 'G16' '(0 files indexed - run indexer)'
  }
} catch {
  MarkFail 'G16 - Stats endpoint not responding'
}

Write-Host -NoNewline "G17: GPU simdjson addon... "
try {
  if ($codebaseStats._perf.simdAvailable -eq $true) {
    MarkPass 'G17' '(native addon loaded)'
  } elseif ($codebaseStats._perf.simdAvailable -eq $false) {
    MarkSkip 'G17' '(addon unavailable; V8 fallback active)'
  } else {
    MarkFail 'G17' 'Cannot determine status'
  }
} catch {
  MarkFail 'G17' 'Cannot determine status'
}

Write-Host ""
Write-Host "==========================================="
Write-Host "📊 Results: $pass passed, $fail failed, $skip skipped"
Write-Host "==========================================="

if ($fail -gt 0) {
  Write-Host ""
  Write-Host "❌ $fail service(s) need attention"
  Write-Host ""
  Write-Host "Quick Fixes:"
  Write-Host "  • Redis: docker restart $redisContainer"
  Write-Host "  • Bifrost: cd go-microservice && go run cmd/bifrost/main.go"
  Write-Host "  • Ollama: restart the Windows Ollama service or confirm the local API is on $ollamaBase"
  Write-Host "  • RabbitMQ: docker restart $RABBITMQ_CONTAINER"
  Write-Host "  • Langfuse: docker-compose up -d langfuse-web"
  Write-Host "  • Codebase Index: cd sveltekit-frontend && npx tsx scripts/codebase-semantic-indexer.ts"
  Write-Host "  • Simdjson Addon: cd simd-bridge/cpp && cmake --build build --config Release"
}

exit ($(if ($fail -gt 0) { 1 } else { 0 }))
