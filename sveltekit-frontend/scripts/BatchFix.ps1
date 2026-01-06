
param(
    [string]$InputFile = "top-errors.json",
    [int]$Count = 10
)

if (-not (Test-Path $InputFile)) {
    Write-Error "Input file not found."
}

$json = Get-Content $InputFile | ConvertFrom-Json
$top = $json | Select-Object -First $Count

foreach ($item in $top) {
    # Clean path: ..//..//src -> src
    # Also handle standard separators
    $raw = $item.file
    $clean = $raw -replace '\.\.//\.\.//', '' -replace '//', '/' -replace '\\', '/'

    if (-not (Test-Path $clean)) {
        Write-Warning "File not found: $clean (Raw: $raw)"
        continue
    }

    Write-Host "`n🔧 Fixing: $clean (Errors: $($item.count))" -ForegroundColor Cyan
    node scripts/agentic-corruption-fixer.mjs $clean
}
