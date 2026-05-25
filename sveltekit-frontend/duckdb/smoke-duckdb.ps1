$ErrorActionPreference = 'Stop'
$scriptRoot = Split-Path -Parent $MyInvocation.MyCommand.Path
$delegate = Join-Path $scriptRoot '..\scripts\duckdb\smoke-duckdb.ps1'
& powershell.exe -NoProfile -ExecutionPolicy Bypass -File $delegate
