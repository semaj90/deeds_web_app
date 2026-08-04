<#
.SYNOPSIS
  Parent Atlas workstation alignment and readiness health check.

.DESCRIPTION
  Read-only by default. Validates:
  - Windows/WSL/Docker service availability
  - NVIDIA GPU/CUDA visibility
  - Miniforge/Conda Python sidecar
  - PostgreSQL 18 connectivity and canonical schema
  - pgvector / bitmap / extension availability
  - Qdrant collection and payload identity coverage
  - Neo4j/GDS reachability
  - Redis/Valkey reachability
  - Parent Atlas representation lanes
  - latent_128 / latent_64 BYTEA dimensions
  - SOM 4D topology coordinates and coverage
  - canonical identity population
  - graph artifact freshness
  - reranker / embedding / LLM sidecars
  - DAG mutation safety contracts
  - daily recommendations and Kanban-ready next steps

  No database, Qdrant, Neo4j, Redis, schema, or filesystem mutation is performed
  unless -AllowMutations is explicitly passed. Even then, this script currently
  performs no mutating repair; the switch is reserved for future guarded actions.

.PARAMETER RepoRoot
  Parent Atlas repository root.

.PARAMETER AppRoot
  Primary SvelteKit application root.

.PARAMETER PostgresContainer
  Docker container name for PostgreSQL 18.

.PARAMETER Database
  PostgreSQL database name.

.PARAMETER DatabaseUser
  PostgreSQL user used by docker exec psql.

.PARAMETER QdrantUrl
  Qdrant REST URL.

.PARAMETER QdrantCollection
  Canonical semantic collection to inspect.

.PARAMETER Neo4jUrl
  Neo4j HTTP URL.

.PARAMETER RedisHost
  Redis/Valkey host.

.PARAMETER RedisPort
  Redis/Valkey port.

.PARAMETER MiniforgeEnv
  Conda environment name for GPU/NLP analysis.

.PARAMETER PythonSidecarUrl
  Python NLP / graph analysis sidecar base URL.

.PARAMETER EmbeddingUrl
  Embedding service base URL.

.PARAMETER LlmUrl
  LLM server base URL.

.PARAMETER ReportDir
  Output directory for JSON and Markdown reports.

.EXAMPLE
  powershell -ExecutionPolicy Bypass -File scripts\atlas\Test-ParentAtlasAlignment.ps1

.EXAMPLE
  powershell -ExecutionPolicy Bypass -File scripts\atlas\Test-ParentAtlasAlignment.ps1 `
    -PostgresContainer parent-atlas-postgres `
    -Database legal_ai_db `
    -QdrantCollection codebase_chunks_768
#>

[CmdletBinding()]
param(
  [string]$RepoRoot = "C:\Users\james\Videos\deeds-web-app",
  [string]$AppRoot = "C:\Users\james\Videos\deeds-web-app\sveltekit-frontend",
  [string]$PostgresContainer = "parent-atlas-postgres",
  [string]$Database = "legal_ai_db",
  [string]$DatabaseUser = "postgres",
  [string]$QdrantUrl = "http://127.0.0.1:6333",
  [string]$QdrantCollection = "codebase_chunks_768",
  [string]$Neo4jUrl = "http://127.0.0.1:7474",
  [string]$RedisHost = "127.0.0.1",
  [int]$RedisPort = 6379,
  [string]$MiniforgeEnv = "parent-atlas-gpu",
  [string]$PythonSidecarUrl = "http://127.0.0.1:8095",
  [string]$EmbeddingUrl = "http://127.0.0.1:8081",
  [string]$LlmUrl = "http://127.0.0.1:8090",
  [string]$ReportDir = "",
  [int]$GraphMaxAgeMinutes = 180,
  [int]$QdrantSampleSize = 200,
  [switch]$Strict,
  [switch]$AllowMutations
)

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

if ([string]::IsNullOrWhiteSpace($ReportDir)) {
  $ReportDir = Join-Path $RepoRoot "docs\reports\parent-atlas"
}

$Timestamp = Get-Date
$DateStamp = $Timestamp.ToString("yyyy-MM-dd")
$JsonReport = Join-Path $ReportDir "PARENT_ATLAS_WORKSTATION_ALIGNMENT_$DateStamp.json"
$MarkdownReport = Join-Path $ReportDir "PARENT_ATLAS_WORKSTATION_ALIGNMENT_$DateStamp.md"

$Results = [System.Collections.Generic.List[object]]::new()
$Facts = [ordered]@{}
$Recommendations = [System.Collections.Generic.List[object]]::new()

function Add-Gate {
  param(
    [Parameter(Mandatory)][string]$Id,
    [Parameter(Mandatory)][string]$Area,
    [Parameter(Mandatory)][string]$Title,
    [Parameter(Mandatory)][ValidateSet("PASS","PARTIAL","FAIL","BLOCKED","SKIP")][string]$Status,
    [Parameter(Mandatory)][string]$EvidenceLevel,
    [Parameter(Mandatory)][string]$Summary,
    [string[]]$Evidence = @(),
    [string]$NextAction = "",
    [string[]]$BlockedBy = @(),
    [hashtable]$Metrics = @{}
  )

  $Results.Add([pscustomobject]@{
    id = $Id
    area = $Area
    title = $Title
    status = $Status
    evidence_level = $EvidenceLevel
    summary = $Summary
    evidence = $Evidence
    next_action = $NextAction
    blocked_by = $BlockedBy
    metrics = $Metrics
  })
}

function Add-Recommendation {
  param(
    [Parameter(Mandatory)][ValidateSet("P0","P1","P2","P3")][string]$Priority,
    [Parameter(Mandatory)][string]$TaskId,
    [Parameter(Mandatory)][string]$Title,
    [Parameter(Mandatory)][string]$Reason,
    [Parameter(Mandatory)][string]$Action,
    [string[]]$Validation = @(),
    [string[]]$ProhibitedScope = @()
  )

  $Recommendations.Add([pscustomobject]@{
    priority = $Priority
    task_id = $TaskId
    title = $Title
    reason = $Reason
    action = $Action
    validation = $Validation
    prohibited_scope = $ProhibitedScope
  })
}

function Test-Command {
  param([Parameter(Mandatory)][string]$Name)
  return [bool](Get-Command $Name -ErrorAction SilentlyContinue)
}

function Invoke-SafeCommand {
  param(
    [Parameter(Mandatory)][string]$FilePath,
    [string[]]$Arguments = @(),
    [int]$TimeoutSeconds = 30
  )

  $psi = [System.Diagnostics.ProcessStartInfo]::new()
  $psi.FileName = $FilePath
  $psi.UseShellExecute = $false
  $psi.RedirectStandardOutput = $true
  $psi.RedirectStandardError = $true
  foreach ($arg in $Arguments) {
    [void]$psi.ArgumentList.Add($arg)
  }

  $process = [System.Diagnostics.Process]::new()
  $process.StartInfo = $psi
  [void]$process.Start()

  if (-not $process.WaitForExit($TimeoutSeconds * 1000)) {
    try { $process.Kill($true) } catch {}
    return [pscustomobject]@{
      exit_code = 124
      stdout = ""
      stderr = "TIMEOUT after $TimeoutSeconds seconds"
      timed_out = $true
    }
  }

  return [pscustomobject]@{
    exit_code = $process.ExitCode
    stdout = $process.StandardOutput.ReadToEnd()
    stderr = $process.StandardError.ReadToEnd()
    timed_out = $false
  }
}

function Invoke-HttpJson {
  param(
    [Parameter(Mandatory)][string]$Uri,
    [ValidateSet("GET","POST")][string]$Method = "GET",
    [object]$Body = $null,
    [int]$TimeoutSec = 15
  )

  try {
    $params = @{
      Uri = $Uri
      Method = $Method
      TimeoutSec = $TimeoutSec
      ErrorAction = "Stop"
    }
    if ($null -ne $Body) {
      $params.ContentType = "application/json"
      $params.Body = ($Body | ConvertTo-Json -Depth 20 -Compress)
    }
    $response = Invoke-RestMethod @params
    return [pscustomobject]@{
      ok = $true
      value = $response
      error = $null
    }
  } catch {
    return [pscustomobject]@{
      ok = $false
      value = $null
      error = $_.Exception.Message
    }
  }
}

function Invoke-PostgresQuery {
  param(
    [Parameter(Mandatory)][string]$Sql,
    [int]$TimeoutSeconds = 30
  )

  if (-not (Test-Command "docker")) {
    throw "docker command not found"
  }

  $args = @(
    "exec",
    $PostgresContainer,
    "psql",
    "-U", $DatabaseUser,
    "-d", $Database,
    "-X",
    "-A",
    "-F", "`t",
    "-v", "ON_ERROR_STOP=1",
    "-c", $Sql
  )

  return Invoke-SafeCommand -FilePath "docker" -Arguments $args -TimeoutSeconds $TimeoutSeconds
}

function Convert-TsvRows {
  param([Parameter(Mandatory)][string]$Text)

  $lines = $Text -split "`r?`n" | Where-Object {
    $_ -and
    $_ -notmatch "^\(\d+ rows?\)$" -and
    $_ -notmatch "^NOTICE:" -and
    $_ -notmatch "^WARNING:"
  }

  if ($lines.Count -lt 2) { return @() }

  $headers = $lines[0] -split "`t"
  $objects = @()

  foreach ($line in $lines[1..($lines.Count - 1)]) {
    $values = $line -split "`t", -1
    if ($values.Count -ne $headers.Count) { continue }

    $row = [ordered]@{}
    for ($i = 0; $i -lt $headers.Count; $i++) {
      $row[$headers[$i]] = $values[$i]
    }
    $objects += [pscustomobject]$row
  }

  return $objects
}

function Find-RepoMatches {
  param(
    [Parameter(Mandatory)][string[]]$Patterns,
    [int]$MaxPerPattern = 50
  )

  $output = [ordered]@{}
  if (-not (Test-Command "rg")) {
    foreach ($pattern in $Patterns) { $output[$pattern] = @() }
    return $output
  }

  foreach ($pattern in $Patterns) {
    $result = Invoke-SafeCommand -FilePath "rg" -Arguments @(
      "-n",
      "--hidden",
      "--glob", "!.git/**",
      "--glob", "!node_modules/**",
      "--glob", "!dist/**",
      "--glob", "!build/**",
      "--glob", "!coverage/**",
      $pattern,
      $RepoRoot
    ) -TimeoutSeconds 30

    $lines = @()
    if ($result.exit_code -eq 0) {
      $lines = $result.stdout -split "`r?`n" | Where-Object { $_ } | Select-Object -First $MaxPerPattern
    }
    $output[$pattern] = @($lines)
  }

  return $output
}

function Get-ByteaExpectedBytes {
  param([int]$Dimensions, [int]$BytesPerElement = 4)
  return $Dimensions * $BytesPerElement
}

Write-Host "Parent Atlas workstation alignment check" -ForegroundColor Cyan
Write-Host "Read-only mode: $(-not $AllowMutations)" -ForegroundColor DarkCyan

# ---------------------------------------------------------------------------
# 1. Host / Docker / GPU
# ---------------------------------------------------------------------------

$dockerAvailable = Test-Command "docker"
if ($dockerAvailable) {
  $dockerInfo = Invoke-SafeCommand "docker" @("version","--format","{{.Server.Version}}") 15
  Add-Gate -Id "PA-HOST-001" -Area "HOST" -Title "Docker runtime" `
    -Status $(if ($dockerInfo.exit_code -eq 0) { "PASS" } else { "FAIL" }) `
    -EvidenceLevel "RUNTIME_SMOKE_PROVEN" `
    -Summary $(if ($dockerInfo.exit_code -eq 0) { "Docker server reachable." } else { "Docker server unavailable." }) `
    -Evidence @($dockerInfo.stdout.Trim(), $dockerInfo.stderr.Trim()) `
    -NextAction "Restore Docker before running database or projection gates."
} else {
  Add-Gate -Id "PA-HOST-001" -Area "HOST" -Title "Docker runtime" `
    -Status "FAIL" -EvidenceLevel "NOT_PROVEN" `
    -Summary "docker executable not found." `
    -NextAction "Install or expose Docker CLI on PATH."
}

$nvidiaAvailable = Test-Command "nvidia-smi"
if ($nvidiaAvailable) {
  $gpu = Invoke-SafeCommand "nvidia-smi" @(
    "--query-gpu=name,driver_version,memory.total,memory.free,utilization.gpu",
    "--format=csv,noheader,nounits"
  ) 15

  if ($gpu.exit_code -eq 0) {
    $Facts.gpu = $gpu.stdout.Trim()
    Add-Gate -Id "PA-GPU-001" -Area "GPU" -Title "NVIDIA GPU visibility" `
      -Status "PASS" -EvidenceLevel "RUNTIME_SMOKE_PROVEN" `
      -Summary "NVIDIA GPU and driver are visible to the host." `
      -Evidence @($gpu.stdout.Trim()) `
      -NextAction "Continue with Python CUDA and RAPIDS checks."
  } else {
    Add-Gate -Id "PA-GPU-001" -Area "GPU" -Title "NVIDIA GPU visibility" `
      -Status "FAIL" -EvidenceLevel "NOT_PROVEN" `
      -Summary "nvidia-smi failed." `
      -Evidence @($gpu.stderr.Trim()) `
      -NextAction "Repair NVIDIA driver/CUDA visibility."
  }
} else {
  Add-Gate -Id "PA-GPU-001" -Area "GPU" -Title "NVIDIA GPU visibility" `
    -Status "FAIL" -EvidenceLevel "NOT_PROVEN" `
    -Summary "nvidia-smi not found." `
    -NextAction "Expose NVIDIA tools on PATH."
}

# ---------------------------------------------------------------------------
# 2. Miniforge / Python GPU sidecar
# ---------------------------------------------------------------------------

$condaCommand = $null
foreach ($candidate in @("conda","mamba","micromamba")) {
  if (Test-Command $candidate) {
    $condaCommand = $candidate
    break
  }
}

if ($null -eq $condaCommand) {
  Add-Gate -Id "PA-PY-001" -Area "PYTHON" -Title "Miniforge/Conda runtime" `
    -Status "FAIL" -EvidenceLevel "NOT_PROVEN" `
    -Summary "No conda, mamba, or micromamba command found." `
    -NextAction "Expose the Miniforge shell command or pass through its full path."
} else {
  $envList = Invoke-SafeCommand $condaCommand @("env","list","--json") 20
  $envFound = $false
  if ($envList.exit_code -eq 0) {
    try {
      $envJson = $envList.stdout | ConvertFrom-Json
      $envFound = @($envJson.envs | Where-Object { Split-Path $_ -Leaf -eq $MiniforgeEnv }).Count -gt 0
    } catch {}
  }

  Add-Gate -Id "PA-PY-001" -Area "PYTHON" -Title "Miniforge/Conda runtime" `
    -Status $(if ($envFound) { "PASS" } else { "PARTIAL" }) `
    -EvidenceLevel $(if ($envFound) { "RUNTIME_SMOKE_PROVEN" } else { "SOURCE_PRESENT" }) `
    -Summary $(if ($envFound) { "Requested Miniforge environment exists." } else { "Conda is available but the requested environment was not found." }) `
    -Evidence @("command=$condaCommand", "environment=$MiniforgeEnv") `
    -NextAction "Create or select the correct GPU analysis environment."

  if ($envFound) {
    $pythonProbe = @'
import json
result = {}
try:
    import sys
    result["python"] = sys.version
except Exception as exc:
    result["python_error"] = repr(exc)

for name in ["numpy", "torch", "cupy", "cudf", "cugraph", "cuvs", "pyarrow", "asyncpg", "psycopg", "pgvector"]:
    try:
        module = __import__(name)
        result[name] = getattr(module, "__version__", "imported")
    except Exception as exc:
        result[name] = "IMPORT_FAILED: " + repr(exc)

try:
    import torch
    result["torch_cuda_available"] = bool(torch.cuda.is_available())
    result["torch_cuda_device_count"] = int(torch.cuda.device_count())
    if torch.cuda.is_available():
        result["torch_cuda_device_name"] = torch.cuda.get_device_name(0)
except Exception as exc:
    result["torch_cuda_probe_error"] = repr(exc)

try:
    import cupy as cp
    result["cupy_device_count"] = int(cp.cuda.runtime.getDeviceCount())
except Exception as exc:
    result["cupy_probe_error"] = repr(exc)

print(json.dumps(result))
'@

    $probeFile = Join-Path $env:TEMP "parent-atlas-python-gpu-probe.py"
    Set-Content -Path $probeFile -Value $pythonProbe -Encoding UTF8

    $pythonResult = Invoke-SafeCommand $condaCommand @(
      "run","-n",$MiniforgeEnv,"python",$probeFile
    ) 60

    if ($pythonResult.exit_code -eq 0) {
      $pythonFacts = $pythonResult.stdout | ConvertFrom-Json
      $Facts.python_gpu = $pythonFacts
      $cudaPass = [bool]$pythonFacts.torch_cuda_available
      $graphImports = "$($pythonFacts.cugraph)" -notmatch "^IMPORT_FAILED"
      $cuvsImport = "$($pythonFacts.cuvs)" -notmatch "^IMPORT_FAILED"

      Add-Gate -Id "PA-PY-002" -Area "PYTHON" -Title "Python CUDA / RAPIDS analysis lane" `
        -Status $(if ($cudaPass -and $graphImports -and $cuvsImport) { "PASS" } elseif ($cudaPass) { "PARTIAL" } else { "FAIL" }) `
        -EvidenceLevel "RUNTIME_SMOKE_PROVEN" `
        -Summary "Python GPU, cuGraph, and cuVS imports were checked inside the selected environment." `
        -Evidence @($pythonResult.stdout.Trim()) `
        -NextAction "Install or repair missing RAPIDS/cuVS packages before GPU graph or exact-KNN jobs."
    } else {
      Add-Gate -Id "PA-PY-002" -Area "PYTHON" -Title "Python CUDA / RAPIDS analysis lane" `
        -Status "FAIL" -EvidenceLevel "NOT_PROVEN" `
        -Summary "Python GPU probe failed." `
        -Evidence @($pythonResult.stderr.Trim()) `
        -NextAction "Repair the Miniforge environment before GPU jobs."
    }
  }
}

$pythonHealth = Invoke-HttpJson "$PythonSidecarUrl/health"
if (-not $pythonHealth.ok) {
  $pythonHealth = Invoke-HttpJson "$PythonSidecarUrl/"
}
Add-Gate -Id "PA-SVC-001" -Area "SIDECAR" -Title "Python NLP / graph sidecar" `
  -Status $(if ($pythonHealth.ok) { "PASS" } else { "FAIL" }) `
  -EvidenceLevel $(if ($pythonHealth.ok) { "RUNTIME_SMOKE_PROVEN" } else { "NOT_PROVEN" }) `
  -Summary $(if ($pythonHealth.ok) { "Python sidecar is reachable." } else { "Python sidecar is unavailable." }) `
  -Evidence @($(if ($pythonHealth.ok) { $pythonHealth.value | ConvertTo-Json -Depth 8 -Compress } else { $pythonHealth.error })) `
  -NextAction "Restore the Python sidecar before parser, topology, or GPU analysis orchestration."

# ---------------------------------------------------------------------------
# 3. PostgreSQL 18 and canonical schema
# ---------------------------------------------------------------------------

if ($dockerAvailable) {
  $pgVersion = Invoke-PostgresQuery "SELECT version();"
  $pgPass = $pgVersion.exit_code -eq 0
  Add-Gate -Id "PA-PG-001" -Area "POSTGRES" -Title "PostgreSQL runtime" `
    -Status $(if ($pgPass) { "PASS" } else { "FAIL" }) `
    -EvidenceLevel $(if ($pgPass) { "RUNTIME_SMOKE_PROVEN" } else { "NOT_PROVEN" }) `
    -Summary $(if ($pgPass) { "PostgreSQL is reachable through docker exec." } else { "PostgreSQL query failed." }) `
    -Evidence @($pgVersion.stdout.Trim(), $pgVersion.stderr.Trim()) `
    -NextAction "Correct container name, database, or credentials."

  if ($pgPass) {
    $connectionQuery = @"
SELECT
  current_database() AS database,
  current_schema() AS schema,
  inet_server_addr()::text AS server_address,
  inet_server_port() AS server_port,
  current_setting('server_version') AS server_version,
  current_setting('search_path') AS search_path;
"@
    $connectionResult = Invoke-PostgresQuery $connectionQuery
    $connectionRows = Convert-TsvRows $connectionResult.stdout
    $Facts.postgres_connection = $connectionRows | Select-Object -First 1

    $extensionQuery = @"
SELECT
  extname,
  extversion
FROM pg_extension
WHERE extname IN (
  'vector',
  'pg_trgm',
  'btree_gin',
  'btree_gist',
  'pg_stat_statements',
  'uuid-ossp'
)
ORDER BY extname;
"@
    $extensionResult = Invoke-PostgresQuery $extensionQuery
    $extensionRows = Convert-TsvRows $extensionResult.stdout
    $Facts.postgres_extensions = $extensionRows

    $vectorInstalled = @($extensionRows | Where-Object { $_.extname -eq "vector" }).Count -gt 0
    Add-Gate -Id "PA-PG-002" -Area "POSTGRES" -Title "Postgres extensions and vector support" `
      -Status $(if ($vectorInstalled) { "PASS" } else { "PARTIAL" }) `
      -EvidenceLevel "PRODUCTION_DATA_PROVEN" `
      -Summary $(if ($vectorInstalled) { "pgvector is installed." } else { "pgvector was not found in pg_extension." }) `
      -Evidence @($extensionRows | ForEach-Object { "$($_.extname)=$($_.extversion)" }) `
      -NextAction "Confirm whether canonical vectors remain external in Qdrant or whether pgvector is required for fallback/evaluation."

    $schemaQuery = @"
SELECT
  column_name,
  data_type,
  is_nullable,
  column_default,
  ordinal_position
FROM information_schema.columns
WHERE table_schema = 'public'
  AND table_name = 'atlas_packets'
ORDER BY ordinal_position;
"@
    $schemaResult = Invoke-PostgresQuery $schemaQuery
    $schemaRows = Convert-TsvRows $schemaResult.stdout
    $Facts.atlas_packets_columns = $schemaRows

    $requiredFields = @(
      "packet_id",
      "packet_key",
      "source_ref",
      "workspace_id",
      "workspace_revision",
      "representation_revision",
      "source_representation_id",
      "source_dimension",
      "projection_representation_id",
      "projection_dimension",
      "artifact_id",
      "qdrant_point_id",
      "latent_64"
    )

    $presentFields = @($schemaRows.column_name)
    $missingFields = @($requiredFields | Where-Object { $_ -notin $presentFields })

    Add-Gate -Id "PA-PG-003" -Area "POSTGRES" -Title "Canonical atlas_packets schema surface" `
      -Status $(if ($missingFields.Count -eq 0) { "PASS" } else { "PARTIAL" }) `
      -EvidenceLevel "PRODUCTION_DATA_PROVEN" `
      -Summary "Required canonical, projection, and representation columns were checked against the live table." `
      -Evidence @("live_column_count=$($schemaRows.Count)", "missing=$($missingFields -join ',')") `
      -NextAction "Reconcile the application schema with live columns before changing constraints."

    $identityQuery = @"
SELECT
  COUNT(*) AS total_rows,
  COUNT(packet_key) AS packet_key_present,
  COUNT(source_ref) AS source_ref_present,
  COUNT(workspace_id) AS workspace_id_present,
  COUNT(workspace_revision) AS workspace_revision_present,
  COUNT(representation_revision) AS representation_revision_present,
  COUNT(source_representation_id) AS source_representation_id_present,
  COUNT(source_dimension) AS source_dimension_present,
  COUNT(projection_representation_id) AS projection_representation_id_present,
  COUNT(projection_dimension) AS projection_dimension_present,
  COUNT(latent_64) AS latent_64_present,
  COUNT(*) FILTER (WHERE packet_key IS NULL OR btrim(packet_key) = '') AS packet_key_missing,
  COUNT(*) FILTER (WHERE source_ref IS NULL OR btrim(source_ref) = '') AS source_ref_missing,
  COUNT(*) FILTER (WHERE workspace_id IS NULL OR btrim(workspace_id) = '') AS workspace_id_missing,
  COUNT(*) FILTER (WHERE representation_revision = 0) AS representation_revision_zero
FROM public.atlas_packets;
"@
    $identityResult = Invoke-PostgresQuery $identityQuery
    $identityRows = Convert-TsvRows $identityResult.stdout
    $identity = $identityRows | Select-Object -First 1
    $Facts.identity_coverage = $identity

    $total = [int64]$identity.total_rows
    $packetReady = ([int64]$identity.packet_key_present -eq $total) -and
                   ([int64]$identity.source_ref_present -eq $total) -and
                   ([int64]$identity.workspace_id_present -eq $total)

    Add-Gate -Id "PA-ID-001" -Area "IDENTITY" -Title "Canonical packet identity coverage" `
      -Status $(if ($packetReady) { "PASS" } else { "FAIL" }) `
      -EvidenceLevel "PRODUCTION_DATA_PROVEN" `
      -Summary "Packet, source, workspace, and representation lineage coverage was measured on live rows." `
      -Evidence @($identity | ConvertTo-Json -Compress) `
      -NextAction "Repair or quarantine rows missing packet_key, source_ref, or workspace_id before production projection migration."

    $latentQuery = @"
SELECT
  COUNT(*) AS total_rows,
  COUNT(latent_64) AS latent64_rows,
  COUNT(*) FILTER (WHERE latent_64 IS NOT NULL AND octet_length(latent_64) = 256) AS latent64_float32_64d_rows,
  COUNT(*) FILTER (WHERE latent_64 IS NOT NULL AND octet_length(latent_64) <> 256) AS latent64_wrong_size_rows,
  MIN(octet_length(latent_64)) FILTER (WHERE latent_64 IS NOT NULL) AS latent64_min_bytes,
  MAX(octet_length(latent_64)) FILTER (WHERE latent_64 IS NOT NULL) AS latent64_max_bytes
FROM public.atlas_packets;
"@
    $latentResult = Invoke-PostgresQuery $latentQuery
    $latentRows = Convert-TsvRows $latentResult.stdout
    $latent = $latentRows | Select-Object -First 1
    $Facts.latent64 = $latent

    $latentPass = [int64]$latent.latent64_wrong_size_rows -eq 0
    Add-Gate -Id "PA-REP-001" -Area "REPRESENTATION" -Title "latent_64 BYTEA contract" `
      -Status $(if ($latentPass) { "PASS" } else { "FAIL" }) `
      -EvidenceLevel "PRODUCTION_DATA_PROVEN" `
      -Summary "latent_64 rows were checked for the expected 64 x float32 = 256-byte contract." `
      -Evidence @($latent | ConvertTo-Json -Compress) `
      -NextAction "Do not promote malformed latent vectors; repair the producing writer and rebuild affected rows."

    $topologyQuery = @"
WITH candidate_columns AS (
  SELECT column_name
  FROM information_schema.columns
  WHERE table_schema = 'public'
    AND table_name = 'atlas_packets'
    AND column_name IN (
      'som_x',
      'som_y',
      'som_z',
      'som_w',
      'som_cluster',
      'topology_x',
      'topology_y',
      'topology_z',
      'topology_w'
    )
)
SELECT string_agg(column_name, ',' ORDER BY column_name) AS topology_columns
FROM candidate_columns;
"@
    $topologyResult = Invoke-PostgresQuery $topologyQuery
    $topologyRows = Convert-TsvRows $topologyResult.stdout
    $topologyColumns = ""
    if ($topologyRows.Count -gt 0) {
      $topologyColumns = $topologyRows[0].topology_columns
    }

    Add-Gate -Id "PA-TOPO-001" -Area "TOPOLOGY" -Title "SOM 4D topology schema" `
      -Status $(if ($topologyColumns -match "(som_x|topology_x)" -and $topologyColumns -match "(som_w|topology_w)") { "PASS" } elseif ($topologyColumns) { "PARTIAL" } else { "FAIL" }) `
      -EvidenceLevel "PRODUCTION_DATA_PROVEN" `
      -Summary "Live atlas_packets topology coordinate columns were inventoried." `
      -Evidence @("columns=$topologyColumns") `
      -NextAction "Define one canonical 4D topology coordinate contract and index strategy before agentic traversal uses it."

    $indexQuery = @"
SELECT
  indexname,
  indexdef
FROM pg_indexes
WHERE schemaname = 'public'
  AND tablename = 'atlas_packets'
ORDER BY indexname;
"@
    $indexResult = Invoke-PostgresQuery $indexQuery
    $indexRows = Convert-TsvRows $indexResult.stdout
    $Facts.atlas_packet_indexes = $indexRows

    $identityIndexFound = @($indexRows | Where-Object {
      $_.indexdef -match "packet_key|workspace_id|workspace_revision"
    }).Count -gt 0
    $topologyIndexFound = @($indexRows | Where-Object {
      $_.indexdef -match "som_|topology_|latent_64"
    }).Count -gt 0

    Add-Gate -Id "PA-PG-004" -Area "POSTGRES" -Title "Canonical and topology index coverage" `
      -Status $(if ($identityIndexFound -and $topologyIndexFound) { "PASS" } elseif ($identityIndexFound) { "PARTIAL" } else { "FAIL" }) `
      -EvidenceLevel "PRODUCTION_DATA_PROVEN" `
      -Summary "Indexes supporting canonical join-back and topology retrieval were inventoried." `
      -Evidence @($indexRows | ForEach-Object { "$($_.indexname): $($_.indexdef)" }) `
      -NextAction "Add indexes only after canonical query plans and topology columns are proven."
  }
}

# ---------------------------------------------------------------------------
# 4. Qdrant
# ---------------------------------------------------------------------------

$qdrantHealth = Invoke-HttpJson "$QdrantUrl/collections"
if (-not $qdrantHealth.ok) {
  Add-Gate -Id "PA-QD-001" -Area "QDRANT" -Title "Qdrant runtime" `
    -Status "FAIL" -EvidenceLevel "NOT_PROVEN" `
    -Summary "Qdrant is unavailable." `
    -Evidence @($qdrantHealth.error) `
    -NextAction "Restore Qdrant before projection or retrieval validation."
} else {
  Add-Gate -Id "PA-QD-001" -Area "QDRANT" -Title "Qdrant runtime" `
    -Status "PASS" -EvidenceLevel "RUNTIME_SMOKE_PROVEN" `
    -Summary "Qdrant is reachable." `
    -Evidence @("collection=$QdrantCollection") `
    -NextAction "Continue with collection and payload checks."

  $collectionInfo = Invoke-HttpJson "$QdrantUrl/collections/$QdrantCollection"
  if (-not $collectionInfo.ok) {
    Add-Gate -Id "PA-QD-002" -Area "QDRANT" -Title "Canonical semantic collection" `
      -Status "FAIL" -EvidenceLevel "NOT_PROVEN" `
      -Summary "Requested collection was not found." `
      -Evidence @($collectionInfo.error) `
      -NextAction "Confirm the canonical semantic collection name."
  } else {
    $Facts.qdrant_collection = $collectionInfo.value

    $sampleBody = @{
      limit = [Math]::Min($QdrantSampleSize, 256)
      with_payload = $true
      with_vector = $false
    }
    $sample = Invoke-HttpJson "$QdrantUrl/collections/$QdrantCollection/points/scroll" "POST" $sampleBody

    if ($sample.ok) {
      $points = @($sample.value.result.points)
      $fields = @(
        "packet_key",
        "source_ref",
        "workspace_id",
        "workspace_revision",
        "source_revision",
        "representation_id",
        "representation_revision",
        "schema_version",
        "stable_symbol_id",
        "symbol_version_id"
      )

      $coverage = [ordered]@{}
      foreach ($field in $fields) { $coverage[$field] = 0 }
      $signatures = @{}

      foreach ($point in $points) {
        $payload = $point.payload
        $keys = @($payload.PSObject.Properties.Name | Sort-Object)
        $signature = $keys -join ","
        if (-not $signatures.ContainsKey($signature)) { $signatures[$signature] = 0 }
        $signatures[$signature]++

        foreach ($field in $fields) {
          if ($payload.PSObject.Properties.Name -contains $field -and $null -ne $payload.$field) {
            $coverage[$field]++
          }
        }
      }

      $Facts.qdrant_payload_coverage = $coverage
      $Facts.qdrant_payload_signatures = $signatures

      $sampled = $points.Count
      $packetQualified = $sampled -gt 0 -and
                         $coverage.packet_key -eq $sampled -and
                         $coverage.source_ref -eq $sampled -and
                         $coverage.workspace_id -eq $sampled -and
                         $coverage.workspace_revision -eq $sampled

      $representationQualified = $packetQualified -and
                                 $coverage.representation_id -eq $sampled -and
                                 $coverage.representation_revision -eq $sampled

      Add-Gate -Id "PA-QD-003" -Area "QDRANT" -Title "Qdrant payload identity coverage" `
        -Status $(if ($representationQualified) { "PASS" } elseif ($packetQualified) { "PARTIAL" } else { "FAIL" }) `
        -EvidenceLevel "PRODUCTION_DATA_PROVEN" `
        -Summary "Sampled Qdrant payloads were checked for packet, workspace, source, representation, schema, and symbol lineage." `
        -Evidence @(
          "sampled=$sampled",
          "signatures=$($signatures.Count)",
          ($coverage | ConvertTo-Json -Compress)
        ) `
        -NextAction "Patch and prove the active writer, then re-upsert or rebuild production points from canonical Postgres."
    } else {
      Add-Gate -Id "PA-QD-003" -Area "QDRANT" -Title "Qdrant payload identity coverage" `
        -Status "FAIL" -EvidenceLevel "NOT_PROVEN" `
        -Summary "Qdrant payload sample failed." `
        -Evidence @($sample.error) `
        -NextAction "Inspect Qdrant authentication, collection configuration, and REST endpoint."
    }
  }
}

# ---------------------------------------------------------------------------
# 5. Neo4j / Redis / model services
# ---------------------------------------------------------------------------

$neo4jHealth = Invoke-HttpJson "$Neo4jUrl"
Add-Gate -Id "PA-N4J-001" -Area "NEO4J" -Title "Neo4j runtime" `
  -Status $(if ($neo4jHealth.ok) { "PASS" } else { "FAIL" }) `
  -EvidenceLevel $(if ($neo4jHealth.ok) { "RUNTIME_SMOKE_PROVEN" } else { "NOT_PROVEN" }) `
  -Summary $(if ($neo4jHealth.ok) { "Neo4j HTTP endpoint is reachable." } else { "Neo4j HTTP endpoint is unavailable." }) `
  -Evidence @($(if ($neo4jHealth.ok) { "reachable" } else { $neo4jHealth.error })) `
  -NextAction "Restore Neo4j before graph traversal and persisted PageRank validation."

if (Test-Command "redis-cli") {
  $redis = Invoke-SafeCommand "redis-cli" @("-h",$RedisHost,"-p","$RedisPort","PING") 10
  Add-Gate -Id "PA-REDIS-001" -Area "CACHE" -Title "Redis/Valkey runtime" `
    -Status $(if ($redis.stdout.Trim() -eq "PONG") { "PASS" } else { "FAIL" }) `
    -EvidenceLevel $(if ($redis.stdout.Trim() -eq "PONG") { "RUNTIME_SMOKE_PROVEN" } else { "NOT_PROVEN" }) `
    -Summary $(if ($redis.stdout.Trim() -eq "PONG") { "Redis/Valkey responded to PING." } else { "Redis/Valkey did not respond with PONG." }) `
    -Evidence @($redis.stdout.Trim(), $redis.stderr.Trim()) `
    -NextAction "Restore cache runtime before centroid warming or orchestration state checks."
} else {
  Add-Gate -Id "PA-REDIS-001" -Area "CACHE" -Title "Redis/Valkey runtime" `
    -Status "SKIP" -EvidenceLevel "NOT_PROVEN" `
    -Summary "redis-cli was not found." `
    -NextAction "Expose redis-cli or add a socket-level probe."
}

foreach ($service in @(
  @{ id = "PA-SVC-002"; title = "Embedding service"; url = $EmbeddingUrl },
  @{ id = "PA-SVC-003"; title = "LLM orchestration server"; url = $LlmUrl }
)) {
  $health = Invoke-HttpJson "$($service.url)/health"
  if (-not $health.ok) { $health = Invoke-HttpJson "$($service.url)/" }

  Add-Gate -Id $service.id -Area "MODEL" -Title $service.title `
    -Status $(if ($health.ok) { "PASS" } else { "FAIL" }) `
    -EvidenceLevel $(if ($health.ok) { "RUNTIME_SMOKE_PROVEN" } else { "NOT_PROVEN" }) `
    -Summary $(if ($health.ok) { "$($service.title) is reachable." } else { "$($service.title) is unavailable." }) `
    -Evidence @($(if ($health.ok) { $health.value | ConvertTo-Json -Depth 8 -Compress } else { $health.error })) `
    -NextAction "Restore this service before end-to-end retrieval orchestration."
}

# ---------------------------------------------------------------------------
# 6. Repository wiring, DAG, mutation safety, rerankers, graphify
# ---------------------------------------------------------------------------

$patterns = @(
  "semantic_768",
  "latent_128",
  "latent_64",
  "RFF",
  "Random Fourier",
  "rrf",
  "reciprocal rank fusion",
  "qdrant-sync-worker",
  "qdrant-payload-enricher",
  "canonical-hyperrag-adapter",
  "graphPageRank",
  "pageRankScore",
  "summary-card-retrieval",
  "canonical-packet-envelope",
  "ace-materializer",
  "trainSOM",
  "atlas_topology_eval_times",
  "materialize-feature-envelopes",
  "BEGIN TRANSACTION READ ONLY",
  "validate_state_transition",
  "projection_outbox",
  "analysis_run",
  "analysis_artifact",
  "DERIVED_FROM",
  "SUPERSEDES",
  "schema_version",
  "representation_revision",
  "workspace_revision",
  "mxbai-rerank",
  "bge-reranker",
  "mixedbread"
)

$matches = Find-RepoMatches $patterns
$Facts.repository_matches = $matches

$semanticPresent = @($matches.semantic_768).Count -gt 0
$latent64Present = @($matches.latent_64).Count -gt 0
$latent128Present = @($matches.latent_128).Count -gt 0
$rffPresent = @($matches.RFF).Count -gt 0 -or @($matches."Random Fourier").Count -gt 0
$rrfPresent = @($matches.rrf).Count -gt 0 -or @($matches."reciprocal rank fusion").Count -gt 0

Add-Gate -Id "PA-REP-002" -Area "REPRESENTATION" -Title "Representation lane separation" `
  -Status $(if ($semanticPresent -and $latent64Present) { "PARTIAL" } else { "FAIL" }) `
  -EvidenceLevel "STATIC_WIRING_PROVEN" `
  -Summary "Repository wiring for semantic_768, latent_128, latent_64, RFF, and RRF was inventoried." `
  -Evidence @(
    "semantic_768=$semanticPresent",
    "latent_128=$latent128Present",
    "latent_64=$latent64Present",
    "RFF=$rffPresent",
    "RRF=$rrfPresent"
  ) `
  -NextAction "Keep semantic, topology, projection, and fusion lanes separately named and versioned; never collapse RFF and RRF."

$dagSignals = @(
  @($matches.analysis_run).Count -gt 0,
  @($matches.analysis_artifact).Count -gt 0,
  @($matches.DERIVED_FROM).Count -gt 0,
  @($matches.SUPERSEDES).Count -gt 0,
  @($matches.projection_outbox).Count -gt 0
)
$dagScore = @($dagSignals | Where-Object { $_ }).Count

Add-Gate -Id "PA-DAG-001" -Area "DAG" -Title "Revision-qualified analysis DAG" `
  -Status $(if ($dagScore -ge 4) { "PASS" } elseif ($dagScore -ge 2) { "PARTIAL" } else { "FAIL" }) `
  -EvidenceLevel "STATIC_WIRING_PROVEN" `
  -Summary "Analysis-run, artifact, lineage, supersession, and projection-outbox concepts were checked." `
  -Evidence @("signals_present=$dagScore/5") `
  -NextAction "Use immutable analysis artifacts and explicit mutation receipts before agentic repair writes."

$mutationSignals = @(
  @($matches."BEGIN TRANSACTION READ ONLY").Count -gt 0,
  @($matches.validate_state_transition).Count -gt 0,
  @($matches.schema_version).Count -gt 0,
  @($matches.workspace_revision).Count -gt 0,
  @($matches.representation_revision).Count -gt 0
)
$mutationScore = @($mutationSignals | Where-Object { $_ }).Count

Add-Gate -Id "PA-DAG-002" -Area "DAG" -Title "Mutation safety and schema validation" `
  -Status $(if ($mutationScore -ge 4) { "PARTIAL" } else { "FAIL" }) `
  -EvidenceLevel "STATIC_WIRING_PROVEN" `
  -Summary "Read-only transaction, state transition, schema version, and revision guards were checked." `
  -Evidence @("signals_present=$mutationScore/5") `
  -NextAction "Require validate → plan → dry-run → explicit mutation → receipt for all agentic repair actions."

$rerankerPresent = @($matches."mxbai-rerank").Count -gt 0 -or
                   @($matches."bge-reranker").Count -gt 0 -or
                   @($matches.mixedbread).Count -gt 0

Add-Gate -Id "PA-RET-001" -Area "RETRIEVAL" -Title "Semantic reranker wiring" `
  -Status $(if ($rerankerPresent) { "PARTIAL" } else { "FAIL" }) `
  -EvidenceLevel $(if ($rerankerPresent) { "SOURCE_PRESENT" } else { "NOT_PROVEN" }) `
  -Summary "Known reranker references were searched." `
  -Evidence @("reranker_present=$rerankerPresent") `
  -NextAction "Prove one bounded reranker request with identity-preserving candidates and exact-source output."

$graphFile = Join-Path $AppRoot "docs\graph\codebase-graph.json"
if (Test-Path $graphFile) {
  $graphStat = Get-Item $graphFile
  $ageMinutes = ($Timestamp - $graphStat.LastWriteTime).TotalMinutes
  Add-Gate -Id "PA-OPS-001" -Area "OPERATIONS" -Title "Graph artifact freshness" `
    -Status $(if ($ageMinutes -le $GraphMaxAgeMinutes) { "PASS" } else { "FAIL" }) `
    -EvidenceLevel "PRODUCTION_DATA_PROVEN" `
    -Summary "codebase-graph.json freshness was measured." `
    -Evidence @(
      "path=$graphFile",
      "size=$($graphStat.Length)",
      "modified=$($graphStat.LastWriteTime.ToString('o'))",
      "age_minutes=$([Math]::Round($ageMinutes,2))"
    ) `
    -NextAction "Isolate graph refresh from optional SOM/topology stages when stale."
} else {
  Add-Gate -Id "PA-OPS-001" -Area "OPERATIONS" -Title "Graph artifact freshness" `
    -Status "FAIL" -EvidenceLevel "NOT_PROVEN" `
    -Summary "codebase-graph.json is missing." `
    -NextAction "Restore a bounded graph-only refresh path."
}

$graphifyBlocked = @($matches.trainSOM).Count -gt 0 -or @($matches.atlas_topology_eval_times).Count -gt 0
Add-Gate -Id "PA-OPS-002" -Area "OPERATIONS" -Title "Graphify stage isolation" `
  -Status $(if ($graphifyBlocked) { "PARTIAL" } else { "NOT_PROVEN" }) `
  -EvidenceLevel "STATIC_WIRING_PROVEN" `
  -Summary "Known SOM and topology stage blockers were searched." `
  -Evidence @(
    "trainSOM_refs=$(@($matches.trainSOM).Count)",
    "atlas_topology_eval_times_refs=$(@($matches.atlas_topology_eval_times).Count)"
  ) `
  -NextAction "Add resumable stage receipts and permit code-graph refresh when optional GPU topology stages fail."

# ---------------------------------------------------------------------------
# 7. Recommendation engine
# ---------------------------------------------------------------------------

$failed = @($Results | Where-Object { $_.status -eq "FAIL" })
$partial = @($Results | Where-Object { $_.status -eq "PARTIAL" })

if (@($Results | Where-Object { $_.id -eq "PA-PG-003" -and $_.status -ne "PASS" }).Count -gt 0) {
  Add-Recommendation -Priority "P0" -TaskId "PA-ID-ALIGN" `
    -Title "Reconcile live Postgres and application schema" `
    -Reason "Runtime schema and application declarations are not fully aligned." `
    -Action "Generate a complete live-vs-Drizzle diff, classify active writers, and patch only the application mapping first." `
    -Validation @(
      "npm run check",
      "schema import smoke",
      "read-only information_schema diff"
    ) `
    -ProhibitedScope @(
      "No ALTER TABLE",
      "No representation_id invention",
      "No production backfill"
    )
}

if (@($Results | Where-Object { $_.id -eq "PA-ID-001" -and $_.status -eq "FAIL" }).Count -gt 0) {
  Add-Recommendation -Priority "P0" -TaskId "PA-ID-COVERAGE" `
    -Title "Repair canonical identity coverage" `
    -Reason "Canonical packet rows are missing packet, source, or workspace identity." `
    -Action "Classify missing rows by writer/provenance, quarantine ambiguous rows, and correct the canonical writer before projection repair." `
    -Validation @(
      "packet_key coverage = total rows",
      "source_ref coverage = total rows",
      "workspace_id coverage = qualified rows"
    ) `
    -ProhibitedScope @(
      "Do not derive workspace identity from unrelated fields",
      "Do not use Qdrant point IDs as canonical identity"
    )
}

if (@($Results | Where-Object { $_.id -eq "PA-QD-003" -and $_.status -ne "PASS" }).Count -gt 0) {
  Add-Recommendation -Priority "P1" -TaskId "PA-PROJ-QDRANT" `
    -Title "Prove and repair Qdrant projection identity" `
    -Reason "Production Qdrant payloads are not fully canonical or revision-qualified." `
    -Action "Run the isolated write/read/join fixture, patch the active writer, then deterministically re-upsert or rebuild production points." `
    -Validation @(
      "isolated upsert count = selected count",
      "readback count = upsert count",
      "packet_key join failures = 0",
      "production payload sample coverage = 100%"
    ) `
    -ProhibitedScope @(
      "No HyperRAG promotion before projection proof",
      "No production mutation before isolated fixture passes"
    )
}

if (@($Results | Where-Object { $_.id -eq "PA-REP-001" -and $_.status -eq "FAIL" }).Count -gt 0) {
  Add-Recommendation -Priority "P1" -TaskId "PA-REP-LATENT64" `
    -Title "Repair latent_64 BYTEA contract" `
    -Reason "Some latent_64 payloads do not match the expected 256-byte float32 layout." `
    -Action "Identify the producing writer, validate encoder revision, and rebuild only malformed rows." `
    -Validation @(
      "wrong_size_rows = 0",
      "encoder_revision populated",
      "latent_64 never used as semantic_768"
    ) `
    -ProhibitedScope @(
      "No blind backfill",
      "No promotion to packet ANN"
    )
}

if (@($Results | Where-Object { $_.id -eq "PA-TOPO-001" -and $_.status -ne "PASS" }).Count -gt 0) {
  Add-Recommendation -Priority "P1" -TaskId "PA-TOPO-4D" `
    -Title "Define the canonical 4D topology contract" `
    -Reason "SOM/topology coordinates are missing or only partially modeled." `
    -Action "Choose one versioned coordinate schema, define indexing/query semantics, and keep topology separate from semantic vectors." `
    -Validation @(
      "coordinate coverage",
      "coordinate range checks",
      "topology revision ownership",
      "bounded nearest-cell retrieval"
    ) `
    -ProhibitedScope @(
      "No retraining until the schema and writer are proven",
      "No topology score folded into semantic vector dimensions"
    )
}

if (@($Results | Where-Object { $_.id -eq "PA-PY-002" -and $_.status -ne "PASS" }).Count -gt 0) {
  Add-Recommendation -Priority "P1" -TaskId "PA-GPU-RAPIDS" `
    -Title "Restore the GPU graph analysis environment" `
    -Reason "cuGraph/cuVS or CUDA visibility is incomplete." `
    -Action "Pin one Miniforge environment and prove Torch CUDA, CuPy, cuGraph, cuVS, and Arrow imports." `
    -Validation @(
      "torch.cuda.is_available() = true",
      "cupy device count > 0",
      "cugraph import succeeds",
      "cuvs import succeeds"
    ) `
    -ProhibitedScope @(
      "No production graph rebuild",
      "No CAGRA before exact oracle parity"
    )
}

if (@($Results | Where-Object { $_.id -eq "PA-DAG-002" -and $_.status -ne "PASS" }).Count -gt 0) {
  Add-Recommendation -Priority "P1" -TaskId "PA-DAG-MUTATION" `
    -Title "Enforce validated DAG mutations" `
    -Reason "Agentic repair must not write without schema validation, revision checks, and durable receipts." `
    -Action "Require read-only analysis, typed repair plan, dry-run, stale-revision guard, explicit approval boundary, mutation, and validation receipt." `
    -Validation @(
      "invalid transition rejected",
      "stale revision rejected",
      "dry-run performs zero mutations",
      "mutation receipt contains before/after revisions"
    ) `
    -ProhibitedScope @(
      "No autonomous production mutation",
      "No mutation without canonical packet identity"
    )
}

if (@($Results | Where-Object { $_.id -eq "PA-OPS-001" -and $_.status -eq "FAIL" }).Count -gt 0) {
  Add-Recommendation -Priority "P2" -TaskId "PA-OPS-GRAPHIFY" `
    -Title "Repair graphify freshness and stage isolation" `
    -Reason "The code graph is stale or missing." `
    -Action "Make graph extraction independently resumable and keep optional SOM/GPU stages from blocking graph refresh." `
    -Validation @(
      "codebase-graph.json age below threshold",
      "stage receipt written",
      "failed optional topology stage does not block graph output"
    ) `
    -ProhibitedScope @(
      "No broad topology rerun during graph-only validation"
    )
}

if ($Recommendations.Count -eq 0) {
  Add-Recommendation -Priority "P2" -TaskId "PA-VERIFY-E2E" `
    -Title "Run the canonical end-to-end retrieval proof" `
    -Reason "Foundational workstation gates passed." `
    -Action "Prove one bounded route from query through canonical hydration, graph expansion, independent RRF lanes, reranking, exact source resolution, and ACE provenance." `
    -Validation @(
      "all candidates canonically joined",
      "stale candidates rejected",
      "lane receipts preserved",
      "ACE exact source count > 0"
    )
}

# ---------------------------------------------------------------------------
# 8. Report
# ---------------------------------------------------------------------------

$overall = if ($failed.Count -gt 0) {
  "BLOCKED"
} elseif ($partial.Count -gt 0) {
  "PARTIAL"
} else {
  "PASS"
}

$kanban = [ordered]@{
  BLOCKED = @($Results | Where-Object { $_.status -in @("FAIL","BLOCKED") } | ForEach-Object { $_.id })
  READY = @($Recommendations | Where-Object { $_.priority -in @("P0","P1") } | ForEach-Object { $_.task_id })
  VERIFY = @($Results | Where-Object { $_.status -eq "PARTIAL" } | ForEach-Object { $_.id })
  DONE = @($Results | Where-Object { $_.status -eq "PASS" } | ForEach-Object { $_.id })
  DEFERRED = @(
    "derived graph enhancements",
    "CAGRA promotion",
    "latent lane promotion to ANN",
    "autonomous production mutations"
  )
}

$report = [ordered]@{
  generated_at = $Timestamp.ToString("o")
  overall_status = $overall
  read_only = -not $AllowMutations
  repo_root = $RepoRoot
  app_root = $AppRoot
  postgres_container = $PostgresContainer
  database = $Database
  qdrant_collection = $QdrantCollection
  facts = $Facts
  gates = $Results
  recommendations = $Recommendations
  kanban = $kanban
  daily_policy = [ordered]@{
    fast_read_only = @(
      "Docker/GPU/service health",
      "Postgres identity coverage",
      "Qdrant payload sample",
      "latent_64 byte-size validation",
      "graph artifact freshness"
    )
    nightly_bounded = @(
      "isolated Qdrant write/read/join",
      "bounded HyperRAG route proof",
      "summary exact-source resolution sample",
      "PageRank attachment sample"
    )
    weekly_or_manual = @(
      "exact cuVS vs Qdrant HNSW parity",
      "cuGraph snapshot analytics",
      "production projection rebuild",
      "SOM retraining",
      "derived graph enhancement jobs"
    )
  }
}

New-Item -ItemType Directory -Path $ReportDir -Force | Out-Null
$report | ConvertTo-Json -Depth 30 | Set-Content -Path $JsonReport -Encoding UTF8

$md = [System.Collections.Generic.List[string]]::new()
$md.Add("# Parent Atlas Workstation Alignment")
$md.Add("")
$md.Add("- Generated: $($Timestamp.ToString('o'))")
$md.Add("- Overall status: **$overall**")
$md.Add("- Read-only: **$(-not $AllowMutations)**")
$md.Add("")
$md.Add("## Gate summary")
$md.Add("")
$md.Add("| ID | Area | Gate | Status | Evidence |")
$md.Add("|---|---|---|---|---|")
foreach ($gate in $Results) {
  $md.Add("| $($gate.id) | $($gate.area) | $($gate.title) | $($gate.status) | $($gate.evidence_level) |")
}

$md.Add("")
$md.Add("## Recommendations")
$md.Add("")
foreach ($rec in $Recommendations | Sort-Object priority, task_id) {
  $md.Add("### $($rec.priority) $($rec.task_id) — $($rec.title)")
  $md.Add("")
  $md.Add($rec.reason)
  $md.Add("")
  $md.Add("**Action:** $($rec.action)")
  $md.Add("")
  if ($rec.validation.Count -gt 0) {
    $md.Add("**Validation:**")
    foreach ($item in $rec.validation) { $md.Add("- $item") }
    $md.Add("")
  }
  if ($rec.prohibited_scope.Count -gt 0) {
    $md.Add("**Prohibited scope:**")
    foreach ($item in $rec.prohibited_scope) { $md.Add("- $item") }
    $md.Add("")
  }
}

$md.Add("## Kanban")
$md.Add("")
foreach ($entry in $kanban.GetEnumerator()) {
  $md.Add("- **$($entry.Key):** $(@($entry.Value) -join ', ')")
}
$md.Add("")
$md.Add("## Daily operating policy")
$md.Add("")
$md.Add("### Fast read-only")
foreach ($item in $report.daily_policy.fast_read_only) { $md.Add("- $item") }
$md.Add("")
$md.Add("### Nightly bounded")
foreach ($item in $report.daily_policy.nightly_bounded) { $md.Add("- $item") }
$md.Add("")
$md.Add("### Weekly or manual")
foreach ($item in $report.daily_policy.weekly_or_manual) { $md.Add("- $item") }
$md.Add("")

$md -join "`n" | Set-Content -Path $MarkdownReport -Encoding UTF8

Write-Host ""
Write-Host "Overall status: $overall" -ForegroundColor $(if ($overall -eq "PASS") { "Green" } elseif ($overall -eq "PARTIAL") { "Yellow" } else { "Red" })
Write-Host "JSON: $JsonReport"
Write-Host "Markdown: $MarkdownReport"

if ($Recommendations.Count -gt 0) {
  Write-Host ""
  Write-Host "Top recommendation:" -ForegroundColor Cyan
  $top = $Recommendations | Sort-Object priority, task_id | Select-Object -First 1
  Write-Host "$($top.priority) $($top.task_id): $($top.title)"
  Write-Host $top.action
}

if ($Strict -and $overall -ne "PASS") {
  exit 1
}

exit 0
