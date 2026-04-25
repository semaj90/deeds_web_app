param(
    [Parameter(ValueFromRemainingArguments=$true)]
    $RemainingArgs
)

# Convenience wrapper that forwards to scripts/docker/merge-detected-compose.ps1
$target = Join-Path -Path $PSScriptRoot -ChildPath 'docker\merge-detected-compose.ps1'
if (-not (Test-Path $target)) {
    Write-Error "Target script not found: $target"
    exit 1
}

# Reinvoke PowerShell to run the real script with all original args preserved
& pwsh -NoProfile -ExecutionPolicy Bypass -File $target @RemainingArgs
