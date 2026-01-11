# Ultra-Fast Batch Error Parser using regex -split (much faster than line-by-line)
# Strategy: Read whole file, split by "file:line:col", process in batches

param(
    [string]$LogFile = "reports/svelte_raw.log",
    [string]$OutputJsonl = "reports/errors.jsonl"
)

$ErrorActionPreference = "Stop"

Write-Host "📖 Loading error log (222 MB)..." -ForegroundColor Cyan
$sw = [Diagnostics.Stopwatch]::StartNew()

# Read entire file
$content = [System.IO.File]::ReadAllText($LogFile, [System.Text.Encoding]::UTF8)

# Strip ANSI codes
$content = $content -replace '\x1b\[\d+m', ''

Write-Host "✅ Loaded in $([int]$sw.Elapsed.TotalSeconds)s, splitting..." -ForegroundColor Green

# Split by file:line:col pattern (this creates blocks where first element is junk, rest are [fileinfo, rest of block])
# Pattern: word chars, colon, digits, colon, digits (file:line:col)
$blocks = [regex]::Split($content, '(?=^[A-Za-z]:[\\][^:]+:\d+:\d+$)', [System.Text.RegularExpressions.RegexOptions]::Multiline)

Write-Host "⚡ Found ~$($blocks.Count) blocks, parsing errors..." -ForegroundColor Green

$jsonlWriter = [System.IO.StreamWriter]::new($OutputJsonl, $false, [System.Text.Encoding]::UTF8)
$eventCount = 0

foreach ($i in 1..($blocks.Count - 1)) {
    $block = $blocks[$i]

    # Progress
    if ($i % 500 -eq 0) {
        $elapsed = [int]$sw.Elapsed.TotalSeconds
        $pct = [int](($i / $blocks.Count) * 100)
        Write-Progress -Activity "Parsing blocks" -Status "$pct% | $eventCount events in ${elapsed}s" -PercentComplete $pct
    }

    # First line of block is file:line:col
    $lines = $block -split "`n", 2
    $firstLine = $lines[0].Trim()
    $rest = if ($lines.Count -gt 1) { $lines[1] } else { "" }

    # Parse file:line:col
    if ($firstLine -match '^([A-Za-z]:[\\][^:]+):(\d+):(\d+)') {
        $file = $matches[1]
        $line = [int]$matches[2]
        $col = [int]$matches[3]

        # Find "Error: ..." line in rest
        $errorMatch = $rest | Select-String -Pattern '^Error:\s+(.+)' -List
        if ($errorMatch) {
            $message = $errorMatch.Matches[0].Groups[1].Value

            # Truncate message to 500 chars
            $message = $message.Substring(0, [Math]::Min(500, $message.Length))

            # Create event
            $errorEvent = @{
                fingerprint = ($file + ":" + $line + ":" + $message).GetHashCode().ToString("x8")
                file = $file
                line = $line
                col = $col
                message = $message
                severity = "error"
                timestamp = [DateTime]::UtcNow.ToString("o")
            } | ConvertTo-Json -Compress

            $jsonlWriter.WriteLine($errorEvent)
            $eventCount++
        }
    }
}

$jsonlWriter.Flush()
$jsonlWriter.Dispose()

Write-Progress -Activity "Parsing blocks" -Completed

$elapsed = [int]$sw.Elapsed.TotalSeconds
Write-Host "`n✅ Extracted: $eventCount events in ${elapsed}s" -ForegroundColor Green
Write-Host "📊 Output: $OutputJsonl" -ForegroundColor Cyan

# Show sample
Write-Host "`n📋 Sample events (first 5):" -ForegroundColor Yellow
Get-Content $OutputJsonl -TotalCount 5 | ForEach-Object {
    $obj = $_ | ConvertFrom-Json
    Write-Host "  $($obj.file):$($obj.line) - $($obj.message.Substring(0, 70))" -ForegroundColor Gray
}
