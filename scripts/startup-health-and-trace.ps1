param(
  [switch]$JsonOnly,
  [switch]$Strict,
  [string]$OutFile = "docs/reports/startup-health-trace-report.json"
)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

$repoRoot = (Resolve-Path (Join-Path $PSScriptRoot '..')).Path

function Load-DotEnv {
  param([string]$Path)

  $envMap = @{}
  if (-not (Test-Path $Path)) { return $envMap }

  Get-Content -Path $Path | ForEach-Object {
    $line = $_.Trim()
    if (-not $line -or $line.StartsWith('#')) { return }
    $idx = $line.IndexOf('=')
    if ($idx -lt 1) { return }

    $name = $line.Substring(0, $idx).Trim()
    $value = $line.Substring($idx + 1).Trim().Trim('"').Trim("'")
    if ($name) {
      $envMap[$name] = $value
    }
  }

  return $envMap
}

function Get-EnvValue {
  param(
    [string]$Name,
    [hashtable]$DotEnv
  )

  if ($DotEnv.ContainsKey($Name) -and -not [string]::IsNullOrWhiteSpace($DotEnv[$Name])) {
    return @{ value = $DotEnv[$Name]; source = '.env' }
  }

  $v = [Environment]::GetEnvironmentVariable($Name)
  if (-not [string]::IsNullOrWhiteSpace($v)) {
    return @{ value = $v; source = 'process-env' }
  }

  return @{ value = $null; source = 'missing' }
}

function Test-TcpPort {
  param(
    [string]$HostName,
    [int]$Port,
    [int]$TimeoutMs = 2500
  )

  $client = New-Object System.Net.Sockets.TcpClient
  try {
    $iar = $client.BeginConnect($HostName, $Port, $null, $null)
    $ok = $iar.AsyncWaitHandle.WaitOne($TimeoutMs, $false)
    if (-not $ok) {
      throw "timeout"
    }

    $client.EndConnect($iar)
    return @{ host = $HostName; port = $Port; connected = $true }
  } finally {
    $client.Close()
  }
}

function Parse-SseOrJsonBody {
  param([string]$Body)

  if ([string]::IsNullOrWhiteSpace($Body)) {
    throw "empty response body"
  }

  $firstData = $null
  $Body -split "`r?`n" | ForEach-Object {
    if ($_ -like 'data: *' -and -not $firstData) {
      $firstData = $_.Substring(6)
    }
  }

  if ($firstData) {
    return ($firstData | ConvertFrom-Json)
  }

  return ($Body | ConvertFrom-Json)
}

$dotEnvPath = Join-Path $repoRoot '.env'
$dotEnv = Load-DotEnv -Path $dotEnvPath

$neo4jUser = Get-EnvValue -Name 'NEO4J_USER' -DotEnv $dotEnv
$neo4jPass = Get-EnvValue -Name 'NEO4J_PASSWORD' -DotEnv $dotEnv

$report = [ordered]@{
  ok = $true
  strict = [bool]$Strict
  timestamp = (Get-Date).ToUniversalTime().ToString('o')
  output_file = $OutFile
  neo4j_credential_source = [ordered]@{
    user = $neo4jUser.source
    password = $neo4jPass.source
  }
  checks = [ordered]@{}
  errors = @()
}

function Add-Check {
  param(
    [string]$Name,
    [scriptblock]$ScriptBlock,
    [bool]$Required = $false
  )

  try {
    $result = & $ScriptBlock
    $report.checks[$Name] = [ordered]@{
      ok = $true
      required = $Required
      result = $result
    }
  } catch {
    $message = $_.Exception.Message
    $report.checks[$Name] = [ordered]@{
      ok = $false
      required = $Required
      error = $message
    }
    $report.errors += "$Name failed: $message"

    if ($Required -or $Strict) {
      $report.ok = $false
    }
  }
}

Add-Check -Name 'trace-health' -Required $true -ScriptBlock {
  $res = Invoke-WebRequest -UseBasicParsing -TimeoutSec 4 -Uri 'http://127.0.0.1:8788/health'
  @{ status = [int]$res.StatusCode }
}

Add-Check -Name 'trace-mcp-initialize' -Required $true -ScriptBlock {
  $payload = @{
    jsonrpc = '2.0'
    id = 'startup-init'
    method = 'initialize'
    params = @{
      protocolVersion = '2024-11-05'
      capabilities = @{}
      clientInfo = @{ name = 'startup-health-and-trace'; version = '1.0.0' }
    }
  } | ConvertTo-Json -Depth 8

  $resp = Invoke-WebRequest -Method Post -Uri 'http://127.0.0.1:8788/mcp' -Headers @{ Accept = 'application/json, text/event-stream' } -ContentType 'application/json' -Body $payload -TimeoutSec 6 -UseBasicParsing
  $json = Parse-SseOrJsonBody -Body $resp.Content
  if ($json.PSObject.Properties.Name -contains 'error' -and $json.error) {
    throw "initialize RPC error: $($json.error.message)"
  }

  @{ status = [int]$resp.StatusCode; hasResult = [bool]$json.result }
}

Add-Check -Name 'trace-engram-redis-health' -Required $false -ScriptBlock {
  $payload = @{
    jsonrpc = '2.0'
    id = 'startup-engram-health'
    method = 'tools/call'
    params = @{ name = 'engram.redis_health'; arguments = @{} }
  } | ConvertTo-Json -Depth 8

  $resp = Invoke-WebRequest -Method Post -Uri 'http://127.0.0.1:8788/mcp' -Headers @{ Accept = 'application/json, text/event-stream' } -ContentType 'application/json' -Body $payload -TimeoutSec 6 -UseBasicParsing
  $json = Parse-SseOrJsonBody -Body $resp.Content

  if ($json.PSObject.Properties.Name -contains 'error' -and $json.error) {
    throw "tool call error: $($json.error.message)"
  }

  $textPayload = $null
  if ($json.PSObject.Properties.Name -contains 'result' -and $json.result -and $json.result.content) {
    $textPayload = $json.result.content[0].text
  }
  $toolResult = $null
  if ($textPayload) {
    try { $toolResult = $textPayload | ConvertFrom-Json } catch { $toolResult = @{ raw = $textPayload } }
  }

  @{ status = [int]$resp.StatusCode; result = $toolResult }
}

Add-Check -Name 'neo4j-auth-tx-commit' -Required $true -ScriptBlock {
  if (-not $neo4jUser.value -or -not $neo4jPass.value) {
    throw "NEO4J_USER or NEO4J_PASSWORD missing"
  }

  $basic = [Convert]::ToBase64String([Text.Encoding]::UTF8.GetBytes("$($neo4jUser.value):$($neo4jPass.value)"))
  $payload = '{"statements":[{"statement":"RETURN 1 AS ok"}]}'
  $uri = 'http://127.0.0.1:7474/db/neo4j/tx/commit'
  $res = Invoke-WebRequest -Method Post -Uri $uri -Headers @{ Authorization = "Basic $basic"; Accept = 'application/json' } -ContentType 'application/json' -Body $payload -TimeoutSec 6 -UseBasicParsing

  $json = $res.Content | ConvertFrom-Json
  if ($json.errors -and $json.errors.Count -gt 0) {
    throw $json.errors[0].message
  }

  @{
    status = [int]$res.StatusCode
    uri = $uri
    user_source = $neo4jUser.source
    password_source = $neo4jPass.source
    authenticated = $true
  }
}

Add-Check -Name 'redis' -Required $false -ScriptBlock {
  $redisCli = Get-Command redis-cli -ErrorAction SilentlyContinue
  if ($redisCli) {
    $pong = & $redisCli.Source -h 127.0.0.1 -p 6379 ping
    if (-not ($pong -match 'PONG')) {
      throw "redis-cli returned: $pong"
    }
    return @{ method = 'redis-cli'; pong = $pong }
  }

  Test-TcpPort -HostName '127.0.0.1' -Port 6379 -TimeoutMs 2000
}

Add-Check -Name 'qdrant' -Required $false -ScriptBlock {
  $res = Invoke-WebRequest -UseBasicParsing -TimeoutSec 4 -Uri 'http://127.0.0.1:6333/collections'
  @{ status = [int]$res.StatusCode }
}

Add-Check -Name 'bifrost' -Required $false -ScriptBlock {
  $res = Invoke-WebRequest -UseBasicParsing -TimeoutSec 4 -Uri 'http://127.0.0.1:3040/v1/models'
  @{ status = [int]$res.StatusCode }
}

Add-Check -Name 'llama-server-health' -Required $false -ScriptBlock {
  $res = Invoke-WebRequest -UseBasicParsing -TimeoutSec 4 -Uri 'http://127.0.0.1:8090/health'
  @{ status = [int]$res.StatusCode }
}

Add-Check -Name 'llama-server-props' -Required $false -ScriptBlock {
  $res = Invoke-RestMethod -TimeoutSec 4 -Uri 'http://127.0.0.1:8090/props'
  $props = @{}
  if ($res -is [System.Collections.IDictionary]) {
    foreach ($k in @('model', 'n_ctx', 'chat_format', 'n_gpu_layers')) {
      if ($res.Contains($k)) { $props[$k] = $res[$k] }
    }
  }
  if ($props.Count -eq 0) {
    $props['raw_type'] = $res.GetType().FullName
  }
  $props
}

Add-Check -Name 'rg-version' -Required $true -ScriptBlock {
  $v = rg --version | Select-Object -First 1
  if (-not $v) { throw 'rg not found' }
  @{ version = $v }
}

Add-Check -Name 'ast-grep-version' -Required $false -ScriptBlock {
  $sg = Get-Command ast-grep -ErrorAction SilentlyContinue
  if (-not $sg) {
    throw 'ast-grep not found in PATH'
  }
  $v = ast-grep --version | Select-Object -First 1
  @{ version = $v }
}

Add-Check -Name 'dotenv-resolution' -Required $true -ScriptBlock {
  $out = node -e "require('dotenv'); process.stdout.write('ok')"
  if ($LASTEXITCODE -ne 0 -or $out -ne 'ok') {
    throw 'dotenv require failed'
  }
  @{ node = 'ok' }
}

if ($report.ok -and $Strict) {
  $failedOptional = @($report.checks.Keys | Where-Object { -not $report.checks[$_].ok })
  if ($failedOptional.Count -gt 0) {
    $report.ok = $false
  }
}

if (-not $report.ok -and $report.errors.Count -gt 0) {
  $report.recovery = @(
    'Run npm run services:health:json to cross-check core infrastructure.',
    'If TRACE MCP checks fail, restart the managed TRACE process bound to port 8788 and rerun this script.',
    'If Neo4j auth fails, verify .env NEO4J_USER/NEO4J_PASSWORD and test POST http://127.0.0.1:7474/db/neo4j/tx/commit with Basic auth.',
    'If Redis/Qdrant/Bifrost checks fail, verify docker compose services and local port mapping before retries.'
  )
}

$outPath = Join-Path $repoRoot $OutFile
$outDir = Split-Path -Path $outPath -Parent
New-Item -ItemType Directory -Path $outDir -Force | Out-Null

$json = $report | ConvertTo-Json -Depth 20
Set-Content -Path $outPath -Value $json -Encoding UTF8

if ($JsonOnly) {
  Write-Output $json
} else {
  Write-Host 'Startup Health And Trace'
  Write-Host ("Overall OK: {0}" -f $report.ok)
  Write-Host ("Report: {0}" -f $outPath)
  Write-Host ''

  foreach ($name in $report.checks.Keys) {
    $item = $report.checks[$name]
    if ($item.ok) {
      Write-Host ("[OK]   {0}" -f $name) -ForegroundColor Green
    } else {
      Write-Host ("[FAIL] {0}" -f $name) -ForegroundColor Red
      Write-Host ("       {0}" -f $item.error) -ForegroundColor Yellow
    }
  }

  if ($report.errors.Count -gt 0) {
    Write-Host ''
    Write-Host 'Errors:' -ForegroundColor Yellow
    $report.errors | ForEach-Object { Write-Host (" - {0}" -f $_) -ForegroundColor Yellow }
  }
}

exit $(if ($report.ok) { 0 } else { 1 })
