param([int]$CooldownSeconds = 3600)

$stamp = 'logs/task-output/.ace-startup-last-run'
New-Item -Path logs/task-output -ItemType Directory -Force | Out-Null

if ((Test-Path $stamp) -and ((Get-Date) - (Get-Item $stamp).LastWriteTime).TotalSeconds -lt $CooldownSeconds) {
    $minutesAgo = [int]((Get-Date) - (Get-Item $stamp).LastWriteTime).TotalMinutes
    Write-Host "ACE pipeline skipped — last run $minutesAgo min ago (1h cooldown)"
    exit 0
}

$output = npm --prefix sveltekit-frontend run atlas:startup 2>&1 |
    Tee-Object logs/task-output/ace-startup-latest.log |
    Out-String
$npmExitCode = $LASTEXITCODE
$gatesPassed = [regex]::Match($output, 'Gates:\s+(\d+)\/7').Groups[1].Value
if ($npmExitCode -eq 0 -and $gatesPassed -eq '7') {
    Set-Content -Path $stamp -Value (Get-Date -Format o)
    Write-Host 'ACE startup pipeline green'
} else {
    Write-Host "ACE startup pipeline FAILED — npm=$npmExitCode gates=$gatesPassed/7; check logs/task-output/ace-startup-latest.log"
    exit 1
}
