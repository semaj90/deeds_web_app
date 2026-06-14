Param(
  [Parameter(ValueFromRemainingArguments = $true)]
  [string[]]$Args
)

$scriptRoot = Split-Path -Parent $MyInvocation.MyCommand.Path
$repoRoot = Split-Path -Parent (Split-Path -Parent $scriptRoot)

Push-Location $repoRoot
try {
  & node scripts/atlas/backfill-feature-metadata.mjs @Args
  exit $LASTEXITCODE
} finally {
  Pop-Location
}
