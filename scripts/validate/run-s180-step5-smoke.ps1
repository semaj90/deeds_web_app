[CmdletBinding()]
param(
  [string]$RepoRoot = "C:\Users\james\Videos\deeds-web-app",
  [string]$AppRoot = "C:\Users\james\Videos\deeds-web-app\sveltekit-frontend",
  [string]$QdrantUrl = "http://127.0.0.1:6333",
  [string]$Collection = "codebase_chunks_768",
  [string]$McpUrl = "http://127.0.0.1:8788",
  [int]$TimeoutSeconds = 8
)

$ErrorActionPreference = "Stop"
Set-StrictMode -Version Latest

$script = Join-Path $PSScriptRoot "s180-step5-smoke.mjs"

$env:S180_REPO_ROOT = $RepoRoot
$env:S180_APP_ROOT = $AppRoot
$env:QDRANT_URL = $QdrantUrl
$env:QDRANT_COLLECTION = $Collection
$env:MCP_BASE_URL = $McpUrl
$env:SMOKE_TIMEOUT_MS = [string]($TimeoutSeconds * 1000)

if (-not $env:PGHOST) { $env:PGHOST = "127.0.0.1" }
if (-not $env:PGPORT) { $env:PGPORT = "5434" }
if (-not $env:PGDATABASE) { $env:PGDATABASE = "legal_ai_db" }
if (-not $env:PGUSER) { $env:PGUSER = "legal_admin" }
if (-not $env:PGCONNECT_TIMEOUT) { $env:PGCONNECT_TIMEOUT = "5" }

node $script
exit $LASTEXITCODE
