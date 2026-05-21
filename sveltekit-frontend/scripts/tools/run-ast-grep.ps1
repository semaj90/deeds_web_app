param(
    [Parameter(ValueFromRemainingArguments = $true)]
    [string[]]$AstGrepArgs
)

$ErrorActionPreference = "Stop"

$candidate = Get-Command ast-grep -ErrorAction SilentlyContinue
if (-not $candidate) {
    $candidate = Get-Command sg -ErrorAction SilentlyContinue
}

if (-not $candidate) {
    Write-Error "Neither ast-grep nor sg is available on PATH."
    exit 127
}

& $candidate.Source @AstGrepArgs
exit $LASTEXITCODE
