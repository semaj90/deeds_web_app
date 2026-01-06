
param(
    [string]$InputFile = "svelte-check-output.txt",
    [string]$OutputFile = "top-errors.json",
    [int]$Top = 100
)

$ErrorActionPreference = "Stop"

if (-not (Test-Path $InputFile)) {
    Write-Error "Input file '$InputFile' not found."
}

Write-Host "Reading error report..."
$lines = Get-Content $InputFile

$fileCounts = @{}

Write-Host "Parsing errors..."
foreach ($line in $lines) {
    # Format: TIMESTAMP ERROR "path" LINE:COL "Message"
    if ($line -match 'ERROR "([^"]+)"') {
        $path = $matches[1]
        # Resolve path if it creates issues, but distinct strings are fine for counting
        # Normalize slashes
        $path = $path -replace '\\', '/'
        # Remove relative prefixes like ../../../
        # But be careful not to merge distinct files. resolving to absolute is safest if possible,
        # but pure string grouping is enough for "top files".

        # Determine simple count
        if ($fileCounts.ContainsKey($path)) {
            $fileCounts[$path]++
        }
        else {
            $fileCounts[$path] = 1
        }
    }
}

Write-Host "Sorting and selecting top $Top..."
$sorted = $fileCounts.GetEnumerator() | Sort-Object Value -Descending | Select-Object -First $Top

$results = @()
foreach ($item in $sorted) {
    $results += @{
        file = $item.Key
        count = $item.Value
    }
}

$json = $results | ConvertTo-Json -Depth 2
Set-Content -Path $OutputFile -Value $json
Write-Host "Top errors saved to $OutputFile"
$results | Format-Table -AutoSize
