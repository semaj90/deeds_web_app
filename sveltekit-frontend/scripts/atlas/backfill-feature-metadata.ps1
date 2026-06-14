Param(
  [Parameter(ValueFromRemainingArguments = $true)]
  [string[]]$Args
)

$scriptRoot = Split-Path -Parent $MyInvocation.MyCommand.Path
$repoRoot = Split-Path -Parent (Split-Path -Parent $scriptRoot)
$forwarded = @($Args)

if (($env:npm_config_argv -like '*--apply*') -and ($forwarded -notcontains '--apply')) {
  $forwarded += '--apply'
}
if (($env:npm_config_argv -like '*--verify*') -and ($forwarded -notcontains '--verify')) {
  $forwarded += '--verify'
}

Push-Location $repoRoot
try {
  & node scripts/atlas/backfill-feature-metadata.mjs @forwarded
  exit $LASTEXITCODE
} finally {
  Pop-Location
}
