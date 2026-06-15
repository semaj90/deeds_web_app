#!/usr/bin/env pwsh
#Requires -Version 7.0
<#
.SYNOPSIS
    Batch-summarize atlas_summary_layers stubs via llama-server (Gemma4).

.DESCRIPTION
    Queries Postgres for unfilled summary stubs, groups by source_ref,
    calls llama-server /v1/chat/completions (stream:true, think:false),
    and writes summary_text + model_name back to atlas_summary_layers
    and nes_chrom_packets.summary.

    Batch=1 (sequential) — Gemma4 cannot serve parallel completions.

.PARAMETER Level
    Summary level to process: chunk | file | feature | community | folder | system
    Default: chunk

.PARAMETER Limit
    Max rows to process per run. Default: 50

.PARAMETER LlamaUrl
    llama-server base URL. Default: http://127.0.0.1:8090

.PARAMETER Model
    Model name to pass in the request body.
    Default: gemma4-legal-iq4xs-direct.gguf

.PARAMETER DryRun
    Preview prompts without calling llama-server or writing to DB.

.PARAMETER MaxTokens
    Max tokens per completion. Default: 200

.EXAMPLE
    .\Invoke-AtlasSummarize.ps1 -Level chunk -Limit 20
    .\Invoke-AtlasSummarize.ps1 -Level chunk -Limit 5 -DryRun
    .\Invoke-AtlasSummarize.ps1 -Level file -Limit 100 -MaxTokens 300
#>
param(
    [ValidateSet('chunk','file','feature','community','folder','system')]
    [string]$Level    = 'chunk',
    [int]   $Limit    = 50,
    [string]$LlamaUrl = 'http://127.0.0.1:8090',
    [string]$Model    = 'gemma4-legal-iq4xs-direct.gguf',
    [switch]$DryRun,
    [int]   $MaxTokens = 200
)

$ErrorActionPreference = 'Stop'

# ── helpers ───────────────────────────────────────────────────────────────────
function Write-Header($t) {
    Write-Host ''
    Write-Host ('═' * 64) -ForegroundColor Cyan
    Write-Host "  $t" -ForegroundColor Cyan
    Write-Host ('═' * 64) -ForegroundColor Cyan
    Write-Host ''
}
function Write-Ok($t)   { Write-Host "  ✅ $t" -ForegroundColor Green  }
function Write-Warn($t) { Write-Host "  ⚠️  $t" -ForegroundColor Yellow }
function Write-Err($t)  { Write-Host "  ❌ $t" -ForegroundColor Red    }
function Write-Info($t) { Write-Host "  ℹ️  $t" -ForegroundColor Gray   }

# ── load .env ─────────────────────────────────────────────────────────────────
$repoRoot = Resolve-Path "$PSScriptRoot\..\.."
$envFile  = "$repoRoot\.env"
$dbUrl    = $null

if (Test-Path $envFile) {
    Get-Content $envFile | ForEach-Object {
        if ($_ -match '^DATABASE_URL=(.+)$') { $dbUrl = $Matches[1].Trim('"').Trim("'") }
        if ($_ -match '^LLAMA_SERVER_PATH=(.+)$') {
            # override LlamaUrl default only if not user-supplied
            # (we use HTTP endpoint, not exe path — just informational)
        }
    }
}
if (-not $dbUrl) {
    Write-Err 'DATABASE_URL not found in .env'
    exit 1
}

# ── postgres helper ───────────────────────────────────────────────────────────
function Invoke-Psql([string]$Query) {
    $result = docker exec legal-ai-postgres psql -U legal_admin -d legal_ai_db -t -A -c $Query 2>&1
    return $result
}

function Invoke-PsqlJson([string]$Query) {
    $json = docker exec legal-ai-postgres psql -U legal_admin -d legal_ai_db -t -A -c "
        SELECT json_agg(row_to_json(t)) FROM ($Query) t" 2>&1
    if ([string]::IsNullOrWhiteSpace($json) -or $json -eq 'null') { return @() }
    return ($json | ConvertFrom-Json)
}

# ── llama-server SSE call ─────────────────────────────────────────────────────
function Invoke-LlamaCompletion([string]$Prompt, [int]$MaxTok = 200) {
    # Single user turn — avoids system-role drop when template lacks system support.
    # Instruction is embedded inline so the model sees it regardless of template state.
    $body = @{
        model       = $Model
        messages    = @(
            @{ role = 'user'; content = "TASK: Write a concise 1-3 sentence technical summary of the following code artifact. Do not introduce yourself. Do not ask questions. Output ONLY the summary text.`n`n$Prompt" }
        )
        max_tokens  = $MaxTok
        temperature = 0.2
        stream      = $true
    } | ConvertTo-Json -Depth 5 -Compress

    try {
        $req = [System.Net.HttpWebRequest]::Create("$LlamaUrl/v1/chat/completions")
        $req.Method      = 'POST'
        $req.ContentType = 'application/json'
        $req.Timeout     = 90000
        $req.ReadWriteTimeout = 90000

        $bytes = [System.Text.Encoding]::UTF8.GetBytes($body)
        $req.ContentLength = $bytes.Length
        $stream = $req.GetRequestStream()
        $stream.Write($bytes, 0, $bytes.Length)
        $stream.Close()

        $resp   = $req.GetResponse()
        $reader = [System.IO.StreamReader]::new($resp.GetResponseStream())

        $assembled = [System.Text.StringBuilder]::new()
        while (-not $reader.EndOfStream) {
            $line = $reader.ReadLine()
            if (-not $line.StartsWith('data:')) { continue }
            $payload = $line.Substring(5).Trim()
            if ($payload -eq '[DONE]') { break }
            try {
                $parsed = $payload | ConvertFrom-Json -ErrorAction Stop
                $delta  = $parsed.choices[0].delta.content
                if ($delta) { $null = $assembled.Append($delta) }
            } catch { }
        }
        $reader.Close()
        $resp.Close()

        $text = $assembled.ToString().Trim()
        # Strip Gemma thinking blocks (llama-server --jinja without --reasoning-format none)
        # Pattern: <|channel>thought ... <|channel>response  OR  <think>...</think>
        $text = $text -replace '(?s)<\|channel>thought.*?<\|channel>response\s*', ''
        $text = $text -replace '(?s)<think>.*?</think>\s*', ''
        # Strip Gemma turn tokens that leak into output
        $text = $text -replace '^</?(?:start_of_turn|end_of_turn)>\s*', ''
        $text = $text -replace '\s*</?(?:start_of_turn|end_of_turn)>$', ''
        return $text.Trim()
    } catch {
        throw "llama-server call failed: $($_.Exception.Message)"
    }
}

# ── build prompt ──────────────────────────────────────────────────────────────
function Build-Prompt([string]$SourceRef, [string]$FeatureLabel, [string]$FeatureId, [string]$Level) {
    $what = switch ($Level) {
        'chunk'     { "a code chunk" }
        'file'      { "a source file" }
        'feature'   { "a feature group" }
        'community' { "a community cluster" }
        'folder'    { "a directory" }
        'system'    { "a system-level grouping" }
    }

    $label = if ($FeatureLabel -and $FeatureLabel -notmatch '^[0-9a-f]{12,}$') {
        $FeatureLabel
    } else {
        $FeatureId
    }

    return "Summarize $what in a legal AI codebase. Source: ``$SourceRef``. Label: ``$label``. What does this code do and why does it matter?"
}

# ── main ──────────────────────────────────────────────────────────────────────
Write-Header "Atlas Batch Summarizer — Level: $Level   Limit: $Limit$(if ($DryRun) { '   [DRY RUN]' })"

# 1. Health + template sanity check
Write-Info "Checking llama-server at $LlamaUrl ..."
try {
    $health = Invoke-RestMethod "$LlamaUrl/health" -TimeoutSec 5
    if ($health.status -eq 'ok') { Write-Ok "llama-server healthy" }
    else { Write-Warn "llama-server status: $($health.status)" }
} catch {
    Write-Err "llama-server not reachable at $LlamaUrl — is it running?"
    exit 1
}

Write-Info "Sanity-checking chat template (system-role probe)..."
try {
    $probeResult = Invoke-LlamaCompletion "Reply with exactly the word READY and nothing else." 16
    if ($probeResult -match 'READY') {
        Write-Ok "Template OK — model responds to instruction"
    } elseif ($probeResult -match '-2b-it|Self-Correction|trained by Google|large language model') {
        Write-Err "Poisoned template detected. llama-server must be restarted with:"
        Write-Host "  --chat-template-file configs/templates/gemma4-opencode.jinja --jinja" -ForegroundColor Yellow
        Write-Host "  (See CLAUDE.md 'OpenCode + llama-server Config' section)" -ForegroundColor Gray
        exit 1
    } else {
        Write-Warn "Template probe unclear (got: $($probeResult.Substring(0,[Math]::Min(60,$probeResult.Length))))"
        Write-Warn "Continuing — watch for poisoned outputs"
    }
} catch {
    Write-Warn "Template probe failed: $($_.Exception.Message.Substring(0,60)) — continuing anyway"
}

# 2. Fetch stubs
Write-Info "Fetching up to $Limit unfilled '$Level' stubs from Postgres..."

$query = @"
SELECT
    sl.summary_id::text AS summary_id,
    sl.packet_key,
    sl.summary_level,
    COALESCE(tn.source_ref, p.source_ref, sl.packet_key) AS source_ref,
    COALESCE(p.feature_label, p.feature_id, sl.packet_key) AS feature_label,
    COALESCE(p.feature_id, sl.packet_key) AS feature_id
FROM atlas_summary_layers sl
LEFT JOIN atlas_tree_nodes tn
    ON tn.packet_key = sl.packet_key AND tn.node_type = 'chunk'
LEFT JOIN atlas_codebase_packets p
    ON p.packet_key = sl.packet_key
WHERE sl.summary_level = '$Level'
  AND sl.summary_text IS NULL
ORDER BY sl.packet_key
LIMIT $Limit
"@

$rows = Invoke-PsqlJson $query

if (-not $rows -or $rows.Count -eq 0) {
    Write-Ok "No unfilled '$Level' stubs found — nothing to do."
    exit 0
}

Write-Ok "Found $($rows.Count) stubs to summarize"
Write-Host ''

# 3. Process each stub
$ok      = 0
$failed  = 0
$startTs = [DateTime]::UtcNow

for ($i = 0; $i -lt $rows.Count; $i++) {
    $row    = $rows[$i]
    $num    = $i + 1
    $pct    = [int]([Math]::Round(100 * $i / $rows.Count))

    Write-Progress `
        -Activity "Summarizing $Level stubs ($Model)" `
        -Status   "$num/$($rows.Count)  ok=$ok  failed=$failed  |  $($row.source_ref)" `
        -PercentComplete $pct

    $prompt = Build-Prompt $row.source_ref $row.feature_label $row.feature_id $Level

    if ($DryRun) {
        Write-Host "  [$num] DRY  $($row.packet_key)" -ForegroundColor DarkGray
        Write-Host "       $prompt" -ForegroundColor DarkGray
        $ok++
        continue
    }

    try {
        $summary = Invoke-LlamaCompletion $prompt $MaxTokens

        if ([string]::IsNullOrWhiteSpace($summary)) {
            Write-Warn "[$num] Empty response for $($row.packet_key)"
            $failed++
            continue
        }

        # Detect training-trace contamination (template not loaded)
        if ($summary -match '-2b-it|Self-Correction|gemma3\.5-27|I am a (large language )?model|trained by Google|How can I help you today') {
            Write-Warn "[$num] Poisoned response — restart llama-server with --chat-template-file. Skipping."
            $failed++
            continue
        }

        # Escape single quotes for SQL
        $safeSummary = $summary.Replace("'", "''")
        $safeModel   = $Model.Replace("'", "''")
        $safeLevel   = $Level.Replace("'", "''")

        # Write to atlas_summary_layers
        $updateSl = @"
UPDATE atlas_summary_layers
SET summary_text  = '$safeSummary',
    model_name    = '$safeModel',
    generated_at  = NOW()
WHERE summary_id = '$($row.summary_id)'
"@
        $null = Invoke-Psql $updateSl

        # Also write to nes_chrom_packets.summary if chunk level and null
        if ($Level -eq 'chunk') {
            $updateNes = @"
UPDATE nes_chrom_packets
SET summary    = '$safeSummary',
    updated_at = NOW()
WHERE packet_key = '$($row.packet_key)'
  AND summary IS NULL
"@
            $null = Invoke-Psql $updateNes
        }

        # And to atlas_codebase_packets.summary if null
        $updatePkt = @"
UPDATE atlas_codebase_packets
SET summary    = '$safeSummary',
    updated_at = NOW()
WHERE packet_key = '$($row.packet_key)'
  AND summary IS NULL
"@
        $null = Invoke-Psql $updatePkt

        $ok++
        $elapsed = ([DateTime]::UtcNow - $startTs).TotalSeconds
        $rate    = [Math]::Round($ok / $elapsed, 2)
        Write-Host "  [$num/$($rows.Count)] ✅ $($row.source_ref.Substring([Math]::Max(0,$row.source_ref.Length-60)))  ($rate/s)" -ForegroundColor Green

    } catch {
        Write-Warn "[$num] $($row.packet_key): $($_.Exception.Message.Substring(0,[Math]::Min(80,$_.Exception.Message.Length)))"
        $failed++
    }
}

Write-Progress -Activity 'Summarizing' -Completed

# 4. Final report
$elapsed = ([DateTime]::UtcNow - $startTs).TotalSeconds
Write-Host ''
Write-Header "Results"
Write-Host "  Level    : $Level" -ForegroundColor White
Write-Host "  Processed: $($rows.Count)" -ForegroundColor White
Write-Host "  Written  : $ok" -ForegroundColor Green
Write-Host "  Failed   : $failed" -ForegroundColor $(if ($failed -gt 0) { 'Yellow' } else { 'Gray' })
Write-Host "  Elapsed  : $([Math]::Round($elapsed,1))s" -ForegroundColor Gray
if (-not $DryRun -and $ok -gt 0) {
    Write-Host "  Rate     : $([Math]::Round($ok/$elapsed,2)) summaries/s" -ForegroundColor Gray
}
Write-Host ''

# 5. Quick coverage check
$coverage = Invoke-PsqlJson "
    SELECT summary_level,
           COUNT(*) AS total,
           COUNT(summary_text) AS filled
    FROM atlas_summary_layers
    GROUP BY summary_level ORDER BY summary_level"

Write-Host '  Coverage after this run:' -ForegroundColor Cyan
foreach ($c in $coverage) {
    $pct = if ($c.total -gt 0) { [int]([Math]::Round(100 * $c.filled / $c.total)) } else { 0 }
    $color = if ($pct -ge 95) { 'Green' } elseif ($pct -ge 50) { 'Yellow' } else { 'Gray' }
    Write-Host "    $($c.summary_level.PadRight(12)) $($c.filled.ToString().PadLeft(5))/$($c.total)  ($pct%)" -ForegroundColor $color
}
Write-Host ''

if ($DryRun) { Write-Warn 'DRY RUN — no DB writes, no llama-server calls' }
if ($ok -gt 0 -and -not $DryRun) { Write-Ok "Run again with -Limit $Limit to continue filling remaining stubs" }
