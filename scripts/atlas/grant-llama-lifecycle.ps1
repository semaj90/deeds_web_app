<#
.SYNOPSIS
  Operator-only: approve ONE llama-server MCP request for a few minutes.
.DESCRIPTION
  Writes a one-use grant read by sveltekit-frontend/src/mcp/llama-runtime-gate.ts. Requires an
  interactive console and a typed confirmation, so run it yourself in a terminal. Agents must
  never run this or create the grant file. This does not stop or start anything.
.EXAMPLE
  pwsh -File scripts/atlas/grant-llama-lifecycle.ps1 -Action switch -Profile ornith-1.5
#>
[CmdletBinding()]
param(
    [Parameter(Mandatory = $true)][ValidateSet('start', 'unload', 'switch')][string]$Action,
    [ValidateSet('gemma4-legal-iq4xs', 'gemma4-legal-iq4xs-vlm', 'ornith-1.5', 'ornith-1.5-vlm')][string]$Profile,
    [ValidateRange(1, 10)][int]$Minutes = 5
)

$ErrorActionPreference = 'Stop'
if ([Console]::IsInputRedirected) { throw 'REFUSED_NON_INTERACTIVE: run this yourself in a terminal.' }
if ($Action -eq 'switch' -and -not $Profile) { throw 'switch needs -Profile.' }
if ($Action -eq 'unload' -and $Profile) { throw 'unload takes no -Profile.' }

$target = if ($Profile) { " -> $Profile" } else { '' }
$phrase = "APPROVE $($Action.ToUpperInvariant())"
$answer = Read-Host "Allow one MCP request: $Action$target within $Minutes minute(s)? Type '$phrase'"
if ($answer -cne $phrase) { Write-Host 'CANCELLED: no grant written.'; exit 3 }

$directory = Join-Path $PSScriptRoot '../../.tmp/atlas'
New-Item -ItemType Directory -Force -Path $directory | Out-Null
$now = [DateTime]::UtcNow
[ordered]@{
    schema = 'atlas.llama-lifecycle-grant.v1'
    nonce = [Guid]::NewGuid().ToString('N')
    action = $Action
    profile = $(if ($Profile) { $Profile } else { $null })
    createdAt = $now.ToString('o')
    expiresAt = $now.AddMinutes($Minutes).ToString('o')
} | ConvertTo-Json | Set-Content -LiteralPath (Join-Path $directory 'llama-lifecycle-grant.json') -Encoding utf8
Write-Host "Granted: $Action$target, one use, expires in $Minutes minute(s)."
