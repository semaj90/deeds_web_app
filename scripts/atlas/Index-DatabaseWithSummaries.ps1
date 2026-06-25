#Requires -Version 7.0
<#
.SYNOPSIS
    Background indexing service for database summaries using Gemma4 + EmbeddingGemma.

.DESCRIPTION
    This script orchestrates the token remapping phase pipeline:
    1. Summarize all files using Gemma4 (LLM summaries)
    2. Extract embeddings using EmbeddingGemma (768-dim vectors)
    3. Extract feature_id, feature_label, source_ref via langextract reranker
    4. Persist summaries + embeddings + features to database
    5. Cache in Redis for L1 access

    Runs as a background job with progress tracking.

.PARAMETER BatchSize
    Number of packets to process in parallel (default: 10)

.PARAMETER MaxWorkers
    Maximum concurrent Gemma4/EmbeddingGemma calls (default: 4)

.PARAMETER OutputDir
    Directory for logs and progress tracking (default: .tmp/summarization)

.PARAMETER DryRun
    If set, simulate all operations without persisting to DB

.PARAMETER Verbose
    If set, log all details to console

.EXAMPLE
    .\Index-DatabaseWithSummaries.ps1 -BatchSize 20 -MaxWorkers 4 -Verbose

.EXAMPLE
    .\Index-DatabaseWithSummaries.ps1 -DryRun -OutputDir ./test-logs
#>

param(
    [int]$BatchSize = 10,
    [int]$MaxWorkers = 4,
    [string]$OutputDir = ".tmp/summarization",
    [switch]$DryRun,
    [switch]$Verbose
)

# ============================================================================
# CONFIGURATION
# ============================================================================

$ErrorActionPreference = "Stop"
$ProgressPreference = if ($Verbose) { "Continue" } else { "SilentlyContinue" }

# Resolve paths
$RepoRoot = git rev-parse --show-toplevel 2>$null || (Get-Location).Path
$OutputDir = Join-Path $RepoRoot $OutputDir
$LogFile = Join-Path $OutputDir "indexing-$(Get-Date -Format 'yyyy-MM-dd-HHmmss').log"

# Service endpoints (read from env with fallbacks)
$GemmaUrl = $env:LLAMA_SERVER_URL -or $env:TURBOQUANT_BASE_URL -or "http://127.0.0.1:8090/v1/chat/completions"
$OllamaUrl = $env:OLLAMA_URL -or "http://127.0.0.1:11434/api/chat"
$EmbeddingUrl = $env:EMBEDDING_SERVICE_URL -or "http://127.0.0.1:11434/api/embeddings"
$DatabaseUrl = $env:DATABASE_URL -or "postgresql://legal_admin:123456@127.0.0.1:5434/legal_ai_db"
$RedisUrl = $env:REDIS_URL -or "redis://:redis@127.0.0.1:6379"

# Model IDs
$GemmaModel = $env:GEMMA4_MODEL -or "gemma4-legal-iq4xs-direct.gguf"
$EmbeddingModel = $env:EMBEDDING_MODEL -or "embeddinggemma:latest"

# ============================================================================
# LOGGING & UTILITIES
# ============================================================================

function Ensure-Directory {
    param([string]$Path)
    if (-not (Test-Path $Path)) {
        New-Item -ItemType Directory -Path $Path -Force | Out-Null
    }
}

function Write-Log {
    param(
        [string]$Message,
        [ValidateSet("INFO", "WARN", "ERROR", "SUCCESS", "DEBUG")]
        [string]$Level = "INFO"
    )

    $timestamp = Get-Date -Format "yyyy-MM-dd HH:mm:ss"
    $logEntry = "[$timestamp] [$Level] $Message"

    if ($Verbose -or $Level -in @("ERROR", "SUCCESS")) {
        Write-Host $logEntry -ForegroundColor $(switch ($Level) {
            "ERROR" { "Red" }
            "SUCCESS" { "Green" }
            "WARN" { "Yellow" }
            "DEBUG" { "Gray" }
            default { "White" }
        })
    }

    Add-Content -Path $LogFile -Value $logEntry -Force
}

function Invoke-WithRetry {
    param(
        [scriptblock]$ScriptBlock,
        [int]$MaxRetries = 3,
        [int]$DelaySeconds = 2
    )

    $attempt = 0
    while ($attempt -lt $MaxRetries) {
        try {
            return & $ScriptBlock
        }
        catch {
            $attempt++
            if ($attempt -ge $MaxRetries) {
                throw $_
            }
            Write-Log "Retry $attempt/$MaxRetries after ${DelaySeconds}s: $_" "WARN"
            Start-Sleep -Seconds $DelaySeconds
        }
    }
}

function Test-Service {
    param([string]$Url, [string]$ServiceName)

    try {
        $response = Invoke-WebRequest -Uri $Url -TimeoutSec 5 -ErrorAction Stop -Method Head
        Write-Log "$ServiceName available at $Url" "SUCCESS"
        return $true
    }
    catch {
        Write-Log "$ServiceName unavailable at $Url: $_" "WARN"
        return $false
    }
}

# ============================================================================
# DATABASE ACCESS
# ============================================================================

function Get-PacketsToIndex {
    param([int]$Limit = 100)

    Write-Log "Fetching up to $Limit packets to index..." "DEBUG"

    # Call Node.js helper to fetch from Postgres
    $nodeScript = @'
import pg from 'pg';
const pool = new pg.Pool({
  connectionString: process.env.DATABASE_URL,
  max: 5,
  idle_in_transaction_session_timeout: 30000
});

try {
  const result = await pool.query(`
    SELECT
      packet_key, source_ref, file_path, feature_id, feature_label, summary
    FROM atlas_packets
    WHERE summary IS NULL OR summary = ''
    ORDER BY created_at DESC
    LIMIT $1
  `, [process.argv[2]]);

  console.log(JSON.stringify(result.rows));
  process.exit(0);
} catch (err) {
  console.error(JSON.stringify({ error: err.message }));
  process.exit(1);
} finally {
  await pool.end();
}
'@

    $tmpScript = Join-Path $OutputDir "fetch-packets.mjs"
    Set-Content -Path $tmpScript -Value $nodeScript

    $env:DATABASE_URL = $DatabaseUrl
    $output = node $tmpScript $Limit 2>$null

    if ($output -and $output -notlike '{"error"*) {
        return $output | ConvertFrom-Json
    }

    Write-Log "Failed to fetch packets from database" "WARN"
    return @()
}

function Update-PacketSummary {
    param(
        [string]$PacketKey,
        [string]$Summary,
        [array]$Embedding,
        [string]$SourceRef,
        [string]$FeatureId,
        [string]$FeatureLabel
    )

    if ($DryRun) {
        Write-Log "DRY_RUN: Would update $PacketKey with summary (${$Summary.Length} chars)" "DEBUG"
        return $true
    }

    # Call Node.js helper to update Postgres + Redis
    $nodeScript = @'
import pg from 'pg';
import Redis from 'ioredis';

const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });
const redis = new Redis(process.env.REDIS_URL);

try {
  const { packet_key, summary, embedding, source_ref, feature_id, feature_label } = JSON.parse(process.env.PACKET_DATA);

  // Update Postgres
  await pool.query(`
    UPDATE atlas_packets
    SET summary = $1, source_ref = COALESCE($2, source_ref), feature_id = COALESCE($3, feature_id),
        feature_label = COALESCE($4, feature_label), updated_at = now()
    WHERE packet_key = $5
  `, [summary, source_ref, feature_id, feature_label, packet_key]);

  // Cache in Redis
  const cacheKey = `packet:summary:${packet_key}`;
  await redis.setex(cacheKey, 86400, JSON.stringify({ summary, embedding, source_ref, feature_id, feature_label }));

  console.log(`Updated ${packet_key}`);
  process.exit(0);
} catch (err) {
  console.error(JSON.stringify({ error: err.message }));
  process.exit(1);
} finally {
  await pool.end();
  await redis.quit();
}
'@

    $packetData = @{
        packet_key = $PacketKey
        summary = $Summary
        embedding = $Embedding
        source_ref = $SourceRef
        feature_id = $FeatureId
        feature_label = $FeatureLabel
    } | ConvertTo-Json -Compress

    $tmpScript = Join-Path $OutputDir "update-packet.mjs"
    Set-Content -Path $tmpScript -Value $nodeScript

    $env:DATABASE_URL = $DatabaseUrl
    $env:REDIS_URL = $RedisUrl
    $env:PACKET_DATA = $packetData

    $output = node $tmpScript 2>$null
    Write-Log $output "DEBUG"
    return $?
}

# ============================================================================
# GEMMA4 SUMMARIZATION
# ============================================================================

function Invoke-GemmaSummarize {
    param(
        [string]$Content,
        [int]$TimeoutSeconds = 30
    )

    # Truncate content to ~2K tokens for safety
    $maxChars = 4000
    if ($Content.Length -gt $maxChars) {
        $Content = $Content.Substring(0, $maxChars) + "..."
    }

    $prompt = @"
You are a code archivist. Summarize the following code/document in ONE concise sentence (under 20 words).
Focus on: What does it do? Who uses it? Why is it important?

---
$Content
---

Return ONLY the summary sentence, no explanation.
"@

    $payload = @{
        model = $GemmaModel
        messages = @(
            @{ role = "user"; content = $prompt }
        )
        temperature = 0.3
        max_tokens = 100
        stream = $false
    } | ConvertTo-Json

    try {
        Write-Log "Calling Gemma4 for summarization..." "DEBUG"
        $response = Invoke-WebRequest -Uri $GemmaUrl -Method Post -ContentType "application/json" `
            -Body $payload -TimeoutSec $TimeoutSeconds -ErrorAction Stop

        $data = $response.Content | ConvertFrom-Json
        $summary = $data.choices[0].message.content -or $data.choices[0].text
        return $summary.Trim()
    }
    catch {
        Write-Log "Gemma4 call failed: $_" "ERROR"
        return $null
    }
}

# ============================================================================
# EMBEDDINGGEMMA EMBEDDINGS
# ============================================================================

function Get-Embedding {
    param(
        [string]$Text,
        [int]$TimeoutSeconds = 30
    )

    # Truncate to ~8K tokens for EmbeddingGemma (768-dim output)
    $maxChars = 12000
    if ($Text.Length -gt $maxChars) {
        $Text = $Text.Substring(0, $maxChars) + "..."
    }

    $payload = @{
        model = $EmbeddingModel
        prompt = $Text
    } | ConvertTo-Json

    try {
        Write-Log "Calling EmbeddingGemma for 768-dim embedding..." "DEBUG"
        $response = Invoke-WebRequest -Uri $EmbeddingUrl -Method Post -ContentType "application/json" `
            -Body $payload -TimeoutSec $TimeoutSeconds -ErrorAction Stop

        $data = $response.Content | ConvertFrom-Json
        $embedding = $data.embedding -or @()

        if ($embedding.Count -eq 768) {
            Write-Log "Got 768-dim embedding" "DEBUG"
            return $embedding
        }
        else {
            Write-Log "Unexpected embedding dimension: $($embedding.Count)" "WARN"
            return @()
        }
    }
    catch {
        Write-Log "EmbeddingGemma call failed: $_" "WARN"
        return @()
    }
}

# ============================================================================
# LANGEXTRACT RERANKER
# ============================================================================

function Extract-Features {
    param(
        [string]$PacketKey,
        [string]$SourceRef,
        [string]$Summary,
        [array]$Embedding
    )

    # Call langextract reranker (Node.js)
    $nodeScript = @'
import { execSync } from 'child_process';

const { packet_key, source_ref, summary, embedding } = JSON.parse(process.env.FEATURE_DATA);

try {
  // Call langextract CLI for feature extraction
  const output = execSync(`node scripts/langextract/extract-features.mjs --source-ref "${source_ref}" --summary "${summary.slice(0, 200)}"`, {
    encoding: 'utf-8',
    stdio: ['pipe', 'pipe', 'pipe']
  });

  const features = JSON.parse(output);
  console.log(JSON.stringify({
    feature_id: features.feature_id || source_ref,
    feature_label: features.feature_label || 'unknown',
    confidence: features.confidence || 0.5
  }));
} catch (err) {
  console.log(JSON.stringify({
    feature_id: source_ref,
    feature_label: 'extraction-failed',
    confidence: 0.0,
    error: err.message
  }));
}
'@

    $featureData = @{
        packet_key = $PacketKey
        source_ref = $SourceRef
        summary = $Summary
        embedding = $Embedding
    } | ConvertTo-Json -Compress

    $tmpScript = Join-Path $OutputDir "extract-features.mjs"
    Set-Content -Path $tmpScript -Value $nodeScript

    $env:FEATURE_DATA = $featureData

    try {
        $output = node $tmpScript 2>$null
        if ($output) {
            return $output | ConvertFrom-Json
        }
    }
    catch {
        Write-Log "Feature extraction failed: $_" "WARN"
    }

    return @{
        feature_id = $SourceRef
        feature_label = "unknown"
        confidence = 0.0
    }
}

# ============================================================================
# MAIN INDEXING PIPELINE
# ============================================================================

function Start-IndexingPipeline {
    Write-Log "════════════════════════════════════════════════════════════" "INFO"
    Write-Log "Starting Database Indexing Pipeline (Token Remapping Phase)" "INFO"
    Write-Log "════════════════════════════════════════════════════════════" "INFO"

    Ensure-Directory $OutputDir
    Write-Log "Output directory: $OutputDir" "INFO"
    Write-Log "Log file: $LogFile" "INFO"

    # Health check
    Write-Log "Checking service availability..." "INFO"
    $gemmaOk = Test-Service $GemmaUrl "Gemma4"
    $embeddingOk = Test-Service $EmbeddingUrl "EmbeddingGemma"

    if (-not ($gemmaOk -and $embeddingOk)) {
        Write-Log "Required services not available. Exiting." "ERROR"
        return
    }

    # Fetch packets to index
    $packets = Get-PacketsToIndex -Limit 1000
    if ($packets.Count -eq 0) {
        Write-Log "No packets to index. Exiting." "INFO"
        return
    }

    Write-Log "Found $($packets.Count) packets to index" "SUCCESS"

    # Process in batches
    $processed = 0
    $failed = 0
    $startTime = Get-Date

    for ($i = 0; $i -lt $packets.Count; $i += $BatchSize) {
        $batch = $packets[$i .. [Math]::Min($i + $BatchSize - 1, $packets.Count - 1)]
        Write-Log "Processing batch $([Math]::Floor($i / $BatchSize) + 1) (${$batch.Count} packets)..." "INFO"

        foreach ($packet in $batch) {
            try {
                Write-Log "Processing $($packet.packet_key)..." "DEBUG"

                # Step 1: Summarize with Gemma4
                $summary = Invoke-GemmaSummarize -Content ($packet.file_path + ": " + ($packet.summary -or ""))
                if (-not $summary) {
                    Write-Log "  ⚠️  Summarization failed for $($packet.packet_key)" "WARN"
                    $failed++
                    continue
                }
                Write-Log "  ✅ Summary: $($summary.Substring(0, 60))..." "DEBUG"

                # Step 2: Get embedding
                $embedding = Get-Embedding -Text $summary
                if ($embedding.Count -ne 768) {
                    Write-Log "  ⚠️  Embedding failed for $($packet.packet_key)" "WARN"
                    $failed++
                    continue
                }
                Write-Log "  ✅ Embedding: 768-dim vector obtained" "DEBUG"

                # Step 3: Extract features
                $features = Extract-Features -PacketKey $packet.packet_key -SourceRef $packet.source_ref `
                    -Summary $summary -Embedding $embedding
                Write-Log "  ✅ Features: feature_id=$($features.feature_id), label=$($features.feature_label)" "DEBUG"

                # Step 4: Update database + cache
                $updateOk = Update-PacketSummary -PacketKey $packet.packet_key -Summary $summary `
                    -Embedding $embedding -SourceRef $features.feature_id -FeatureId $features.feature_id `
                    -FeatureLabel $features.feature_label

                if ($updateOk) {
                    Write-Log "✅ $($packet.packet_key) indexed" "SUCCESS"
                    $processed++
                }
                else {
                    $failed++
                }
            }
            catch {
                Write-Log "❌ Error processing $($packet.packet_key): $_" "ERROR"
                $failed++
            }
        }
    }

    # Summary
    $elapsed = (Get-Date) - $startTime
    Write-Log "" "INFO"
    Write-Log "════════════════════════════════════════════════════════════" "INFO"
    Write-Log "Indexing Complete" "SUCCESS"
    Write-Log "  Processed: $processed packets" "INFO"
    Write-Log "  Failed: $failed packets" "INFO"
    Write-Log "  Elapsed: $($elapsed.TotalMinutes.ToString('F1')) minutes" "INFO"
    Write-Log "  Log file: $LogFile" "INFO"
    Write-Log "════════════════════════════════════════════════════════════" "INFO"
}

# ============================================================================
# ENTRY POINT
# ============================================================================

try {
    Start-IndexingPipeline
}
catch {
    Write-Log "Fatal error: $_" "ERROR"
    exit 1
}
