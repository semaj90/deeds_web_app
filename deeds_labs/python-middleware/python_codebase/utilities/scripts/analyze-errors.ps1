# Analyze Svelte errors and generate top 100 report
$logPath = "svelte-check.log"

if (-not (Test-Path $logPath)) {
    Write-Error "Log file not found: $logPath"
    exit 1
}

Write-Host "Reading svelte-check.log..."
$content = Get-Content $logPath -Raw

# Extract error messages
$errorPattern = 'error TS\d+:\s*(.+?)(?=\r?\n|$)'
$errors = [regex]::Matches($content, $errorPattern) | ForEach-Object {
    $msg = $_.Groups[1].Value.Trim()
    # Remove ANSI codes
    $msg = $msg -replace '\x1B\[[0-9;]*m', ''
    # Normalize whitespace
    $msg = $msg -replace '\s+', ' '
    $msg.Trim()
} | Where-Object { $_ -ne '' }

Write-Host "Found $($errors.Count) total errors"

# Group and count
$grouped = $errors | Group-Object | Sort-Object Count -Descending | Select-Object -First 100

# Create formatted output
$textOutput = $grouped | ForEach-Object {
    "{0,6}  {1}" -f $_.Count, $_.Name
}

# Create JSON output
$jsonOutput = @{}
$grouped | ForEach-Object {
    $jsonOutput[$_.Name] = $_.Count
}

# Write files
$textOutput | Out-File -FilePath "svelte-top100.txt" -Encoding UTF8
$jsonOutput | ConvertTo-Json | Out-File -FilePath "svelte-top100.json" -Encoding UTF8

Write-Host "Created svelte-top100.txt and svelte-top100.json"
Write-Host ""
Write-Host "Top 10 errors:"
$grouped | Select-Object -First 10 | ForEach-Object {
    Write-Host ("{0,6}  {1}" -f $_.Count, $_.Name)
}