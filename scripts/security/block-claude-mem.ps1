<#
Block claude-mem HTTP API (port 37777) quickly on Windows.
Run as Administrator.

Usage:
  # Create the firewall rule
  .\block-claude-mem.ps1 -Action Block

  # Remove the firewall rule
  .\block-claude-mem.ps1 -Action Unblock

  # Kill the process currently listening on the port
  .\block-claude-mem.ps1 -KillListener
#>

param(
    [ValidateSet('Block','Unblock')]
    [string]$Action = 'Block',
    [switch]$KillListener
)

$port = 37777
$ruleName = "Block claude-mem $port"

function New-BlockRule {
    if (-not (Get-NetFirewallRule -DisplayName $ruleName -ErrorAction SilentlyContinue)) {
        New-NetFirewallRule -DisplayName $ruleName -Direction Inbound -LocalPort $port -Protocol TCP -Action Block | Out-Null
        Write-Output "Firewall rule created: $ruleName"
    } else {
        Write-Output "Firewall rule already exists: $ruleName"
    }
}

function Remove-BlockRule {
    $r = Get-NetFirewallRule -DisplayName $ruleName -ErrorAction SilentlyContinue
    if ($r) {
        Remove-NetFirewallRule -InputObject $r
        Write-Output "Firewall rule removed: $ruleName"
    } else {
        Write-Output "No firewall rule found: $ruleName"
    }
}

function Kill-Listener {
    $conn = Get-NetTCPConnection -LocalPort $port -State Listen -ErrorAction SilentlyContinue
    if ($conn) {
        $pids = $conn.OwningProcess | Select-Object -Unique
        foreach ($pid in $pids) {
            try {
                Stop-Process -Id $pid -Force -ErrorAction Stop
                Write-Output "Killed process $pid listening on port $port"
            } catch {
                Write-Warning "Failed to kill process $pid: $_"
            }
        }
    } else {
        Write-Output "No listener on port $port"
    }
}

if ($Action -eq 'Block') {
    New-BlockRule
} elseif ($Action -eq 'Unblock') {
    Remove-BlockRule
}

if ($KillListener) {
    Kill-Listener
}
