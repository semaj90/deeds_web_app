param(
  [string]$Message = 'chore: save workspace changes',
  [string]$Remote = 'origin'
)
Set-Location -Path $PSScriptRoot + '\..'
$s = git status --porcelain
if ([string]::IsNullOrWhiteSpace($s)) {
  Write-Host 'NO_CHANGES'
  exit 0
}
git add -A
git commit -m $Message
$branch = git rev-parse --abbrev-ref HEAD
Write-Host "PUSHING_BRANCH: $branch"
git push $Remote $branch
