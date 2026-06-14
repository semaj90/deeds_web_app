#Requires -Version 7.0
<#
.SYNOPSIS
  Phase 14/15 Offline Summarization Pipeline Launcher

.DESCRIPTION
  Complete offline summarization pipeline with two-lane architecture:
  - Lane 1: Fast MapReduce (existing feature cards)
  - Lane 2: Slow Gemma4 batch summarization (semantic enrichment)

  Outputs: Enriched JSON + DuckDB tables + Qdrant payload updates

.PARAMETER Mode
  Execution mode: 'dry', 'verify', or 'apply' (default: 'verify')

.PARAMETER Limit
  Number of cards to process (default: 50)

.PARAMETER Verbose
  Enable verbose output

.PARAMETER SkipMapReduce
  Skip MapReduce lane, go straight to Gemma4

.EXAMPLE
  .\launch-phase-14-15-pipeline.ps1 -Mode dry -Limit 10 -Verbose

.EXAMPLE
  .\launch-phase-14-15-pipeline.ps1 -Mode apply -Limit 100
#>

param(
  [ValidateSet('dry', 'verify', 'apply')]
  [string]$Mode = 'verify',

  [int]$Limit = 50,

  [switch]$Verbose,

  [switch]$SkipMapReduce
)

$ErrorActionPreference = 'Stop'
$ProgressPreference = 'Continue'

# Colors for output
$colors = @{
  Header = 'Cyan'
  Success = 'Green'
  Warning = 'Yellow'
  Error = 'Red'
  Info = 'DarkCyan'
}

function Write-Header {
  param([string]$Message)
  Write-Host "`n=== $Message ===" -ForegroundColor $colors.Header
}

function Write-Success {
  param([string]$Message)
  Write-Host "✅ $Message" -ForegroundColor $colors.Success
}

function Write-Warning {
  param([string]$Message)
  Write-Host "⚠️  $Message" -ForegroundColor $colors.Warning
}

function Write-Error {
  param([string]$Message)
  Write-Host "❌ $Message" -ForegroundColor $colors.Error
}

function Write-Info {
  param([string]$Message)
  Write-Host "ℹ️  $Message" -ForegroundColor $colors.Info
}

# Verify prerequisites
Write-Header "Phase 14/15: Offline Summarization Pipeline"
Write-Info "Mode: $Mode | Limit: $Limit | Verbose: $Verbose"

# Check Node.js
if (-not (Get-Command node -ErrorAction SilentlyContinue)) {
  Write-Error "Node.js not found. Install Node.js 22+ first."
  exit 1
}

$nodeVersion = node -v
Write-Success "Node.js: $nodeVersion"

# Check environment
$env_ok = $true
if (-not $env:DATABASE_URL) {
  Write-Warning "DATABASE_URL not set. Database operations will fail."
  $env_ok = $false
}

if (-not $env:OLLAMA_HOST) {
  Write-Info "OLLAMA_HOST not set, will use default http://127.0.0.1:11434"
  $env:OLLAMA_HOST = 'http://127.0.0.1:11434'
}

if (-not $env:QDRANT_URL) {
  Write-Info "QDRANT_URL not set, will use default http://127.0.0.1:6333"
  $env:QDRANT_URL = 'http://127.0.0.1:6333'
}

# Navigate to project root
$scriptPath = Split-Path -Resolve $PSCommandPath
$repoRoot = Split-Path -Parent (Split-Path -Parent (Split-Path -Parent $scriptPath))
$svelteKitPath = Join-Path $repoRoot 'sveltekit-frontend'

Write-Info "Working directory: $svelteKitPath"
Push-Location $svelteKitPath

try {
  # Build task list
  $tasks = @(
    @{
      name = 'Task 2: Offline Gemma4 Batch Summarizer'
      cmd = 'npm run atlas:summaries:gemma4:batch'
      apply = 'npm run atlas:summaries:gemma4:batch:apply'
      description = 'Generates semantic summaries using Gemma4'
    },
    @{
      name = 'Task 3: DuckDB Import'
      cmd = 'npm run atlas:summaries:import'
      apply = 'npm run atlas:summaries:import:apply'
      description = 'Imports enriched summaries into DuckDB offline tables'
    },
    @{
      name = 'Task 4: Embedding Prep'
      cmd = 'npm run atlas:summaries:embed'
      apply = 'npm run atlas:summaries:embed:apply'
      description = 'Generates embeddings for enriched summaries'
    },
    @{
      name = 'Task 5: Pruning Report'
      cmd = 'npm run atlas:summaries:prune-report'
      apply = 'npm run atlas:summaries:prune-report'
      description = 'Detects orphaned and stale packets'
    }
  )

  # Execute tasks
  $results = @()

  foreach ($task in $tasks) {
    Write-Header $task.name
    Write-Info $task.description

    # Prepare command with flags
    $fullCmd = if ($Mode -eq 'apply') { $task.apply } else { $task.cmd }

    if ($Mode -eq 'dry') {
      $fullCmd += ' --dry-run'
    }

    $fullCmd += " --limit=$Limit"

    if ($Verbose) {
      $fullCmd += ' --verbose'
    }

    Write-Info "Running: $fullCmd"

    # Execute
    $startTime = Get-Date
    try {
      Invoke-Expression $fullCmd
      $elapsed = (Get-Date) - $startTime

      $result = @{
        task = $task.name
        status = 'success'
        duration = $elapsed.TotalSeconds
      }

      Write-Success "$($task.name) completed in $($elapsed.TotalSeconds.ToString('F1'))s"
      $results += $result
    } catch {
      $result = @{
        task = $task.name
        status = 'failed'
        error = $_.Exception.Message
      }

      Write-Error "$($task.name) failed: $($_.Exception.Message)"
      $results += $result

      # Continue on non-critical errors (allow pipeline to complete)
      if ($_ -notmatch 'DATABASE|connection') {
        Write-Warning "Continuing to next task..."
      } else {
        Write-Warning "Database error detected. Remaining tasks may fail."
      }
    }
  }

  # Summary
  Write-Header "Pipeline Summary"

  foreach ($result in $results) {
    if ($result.status -eq 'success') {
      Write-Success "$($result.task): completed in $($result.duration.ToString('F1'))s"
    } else {
      Write-Error "$($result.task): $($result.error)"
    }
  }

  $successCount = ($results | Where-Object { $_.status -eq 'success' }).Count
  $totalCount = $results.Count

  Write-Host "`n" -NoNewline
  if ($successCount -eq $totalCount) {
    Write-Success "All tasks completed successfully!"
  } else {
    Write-Warning "$successCount/$totalCount tasks completed. Review errors above."
  }

  # Next steps
  Write-Header "Next Steps"
  Write-Info "1. Review the enriched summaries: docs/reports/feature-summaries/"
  Write-Info "2. Check the pruning report: docs/reports/pruning-report-*.json"
  Write-Info "3. Verify Qdrant consistency: npm run atlas:qdrant:payload:debug"
  Write-Info "4. Decide on orphan consolidation strategy"
  Write-Info "5. Monitor for pipeline divergence"

  if ($Mode -ne 'apply') {
    Write-Warning "VERIFY mode completed. Run with -Mode apply to persist changes."
  }

} finally {
  Pop-Location
}
