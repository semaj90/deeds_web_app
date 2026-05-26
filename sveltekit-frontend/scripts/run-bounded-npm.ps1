param(
    [Parameter(Mandatory = $true)]
    [string]$ScriptName,

    [int]$TimeoutSec = 300,

    [string]$SummaryFile = "",

    [string]$LogDir = "c:\Users\james\Videos\deeds-web-app\logs\pipeline-runs"
)

$ErrorActionPreference = 'Stop'

$AppRoot = Split-Path -Parent $PSScriptRoot
$NpmCmd = (Get-Command 'npm.cmd').Source

New-Item -ItemType Directory -Force -Path $LogDir | Out-Null

$stamp = Get-Date -Format 'yyyyMMdd_HHmmss'
$safeName = $ScriptName -replace ':', '_'

if ([string]::IsNullOrWhiteSpace($SummaryFile)) {
    $SummaryFile = Join-Path $LogDir ("bounded_" + $safeName + "_" + $stamp + ".log")
}

$stdoutFile = Join-Path $LogDir ($safeName + "_" + $stamp + ".out.log")
$stderrFile = Join-Path $LogDir ($safeName + "_" + $stamp + ".err.log")

"START $ScriptName" | Tee-Object -FilePath $SummaryFile -Append | Out-Host
"STDOUT_FILE=$stdoutFile" | Tee-Object -FilePath $SummaryFile -Append | Out-Host
"STDERR_FILE=$stderrFile" | Tee-Object -FilePath $SummaryFile -Append | Out-Host

$process = Start-Process -FilePath $NpmCmd `
    -ArgumentList @('run', $ScriptName) `
    -WorkingDirectory $AppRoot `
    -PassThru `
    -RedirectStandardOutput $stdoutFile `
    -RedirectStandardError $stderrFile

$null = $process | Wait-Process -Timeout $TimeoutSec -ErrorAction SilentlyContinue

if ($process.HasExited) {
    $exitCode = [int]$process.ExitCode
    "NPM_EXIT_CODE $ScriptName=$exitCode" | Tee-Object -FilePath $SummaryFile -Append | Out-Host
    exit $exitCode
}

Stop-Process -Id $process.Id -Force
"NPM_EXIT_CODE $ScriptName=124" | Tee-Object -FilePath $SummaryFile -Append | Out-Host
"TIMEOUT_SEC $ScriptName=$TimeoutSec" | Tee-Object -FilePath $SummaryFile -Append | Out-Host
exit 124