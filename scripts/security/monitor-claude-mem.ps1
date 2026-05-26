<#
Monitor claude-mem listener on port 37777 and optionally kill it.
Run as Administrator if you plan to kill processes or update firewall rules.

Usage:
  # Run once (prints status)
  .\monitor-claude-mem.ps1

  # Run continuously (every 60s)
  .\monitor-claude-mem.ps1 -Loop

  # Run and auto-kill listener if found
  .\monitor-claude-mem.ps1 -Loop -AutoKill
#>

param(
    [switch]$Loop,
    [switch]$AutoKill,
    [int]$IntervalSeconds = 60
)

$port = 37777
$log = Join-Path $PSScriptRoot "monitor-claude-mem.log"

function Check-Listener {
    $conn = Get-NetTCPConnection -LocalPort $port -State Listen -ErrorAction SilentlyContinue
    if ($conn) {
        $pids = $conn.OwningProcess | Select-Object -Unique
        $msg = "Listener found on port $port (PIDs: $($pids -join ', '))"
        Add-Content -Path $log -Value ("$(Get-Date -Format o) - $msg")
        Write-Output $msg
        return $pids
    } else {
        $msg = "No listener on port $port"
        Add-Content -Path $log -Value ("$(Get-Date -Format o) - $msg")
        Write-Output $msg
        return @()
    }
}

function Kill-Pids($pids) {
    foreach ($pid in $pids) {
        try { Stop-Process -Id $pid -Force; Write-Output "Killed PID $pid" } catch { Write-Warning "Failed to kill $pid: $_" }
    }
}

if ($Loop) {
    while ($true) {
        $pids = Check-Listener
        if ($AutoKill -and $pids.Count -gt 0) { Kill-Pids $pids }
        Start-Sleep -Seconds $IntervalSeconds
    }
} else {
    $pids = Check-Listener
    if ($AutoKill -and $pids.Count -gt 0) { Kill-Pids $pids }
}
