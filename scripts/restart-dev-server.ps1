$port = 5173
$match = netstat -ano | Select-String ":$port\s"
if ($match) {
  $foundPid = ($match -replace '.*\s+(\d+)$','$1').Split("`n")[0].Trim()
  Write-Host ("Found PID on port " + $port + ": " + $foundPid)
  try {
    Stop-Process -Id ([int]$foundPid) -Force -ErrorAction Stop
    Write-Host ("Killed PID " + $foundPid)
  } catch {
    Write-Host ("Failed to kill PID " + $foundPid + ": " + $_)
  }
} else {
  Write-Host "No process listening on port $port"
}

$logdir = Join-Path (Get-Location) 'sveltekit-frontend\logs'
New-Item -Path $logdir -ItemType Directory -Force | Out-Null
Start-Process -FilePath 'cmd.exe' -ArgumentList '/c','cd sveltekit-frontend && npm run dev > logs/dev-server.log 2>&1' -WorkingDirectory (Get-Location) -WindowStyle Hidden
Start-Sleep -Seconds 2
if (Test-Path 'sveltekit-frontend\logs\dev-server.log') {
  Get-Content 'sveltekit-frontend\logs\dev-server.log' -Tail 120
} else {
  Write-Host 'Log file not yet created'
}
