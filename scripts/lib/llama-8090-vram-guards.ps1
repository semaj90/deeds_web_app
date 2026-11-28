function ConvertTo-ValidatedLlamaSlotsV1 {
  [CmdletBinding()]
  param([AllowNull()][object] $Response)

  if ($null -eq $Response) {
    return [pscustomobject]@{ reachable = $true; valid = $false; total = 0; busy = 0; reason = 'SLOTS_RESPONSE_NULL' }
  }

  $items = @($Response)
  if ($items.Count -eq 0) {
    return [pscustomobject]@{ reachable = $true; valid = $false; total = 0; busy = 0; reason = 'SLOTS_RESPONSE_EMPTY' }
  }

  $busy = 0
  foreach ($slot in $items) {
    if ($null -eq $slot -or $slot -is [string]) {
      return [pscustomobject]@{ reachable = $true; valid = $false; total = 0; busy = 0; reason = 'SLOTS_RESPONSE_MALFORMED' }
    }
    $property = $slot.PSObject.Properties['is_processing']
    if ($null -eq $property -or $property.Value -isnot [bool]) {
      return [pscustomobject]@{ reachable = $true; valid = $false; total = 0; busy = 0; reason = 'SLOTS_PROCESSING_STATE_UNPROVEN' }
    }
    if ($property.Value) { $busy++ }
  }

  return [pscustomobject]@{ reachable = $true; valid = $true; total = $items.Count; busy = $busy; reason = $null }
}

function Assert-LlamaVramReleasePreconditionsV1 {
  [CmdletBinding()]
  param(
    [Parameter(Mandatory)][object] $Slots,
    [Parameter(Mandatory)][bool] $ListenerIdentityVerified,
    [Parameter(Mandatory)][bool] $InferenceDrainGateVerified
  )

  if (-not $Slots.reachable -or $Slots.total -le 0) {
    throw "REFUSED_SLOTS_UNVERIFIED: $($Slots.reason)"
  }
  if ($Slots.busy -ne 0) {
    throw "REFUSED_SLOTS_BUSY: $($Slots.busy) active slot(s)."
  }
  if (-not $ListenerIdentityVerified) {
    throw 'REFUSED_LISTENER_IDENTITY_UNVERIFIED'
  }
  if (-not $InferenceDrainGateVerified) {
    throw 'REFUSED_INFERENCE_DRAIN_GATE_UNAVAILABLE'
  }
}

function Test-LlamaPortProcessIdentityV1 {
  [CmdletBinding()]
  param(
    [Parameter(Mandatory)][int] $Port,
    [AllowNull()][object] $Process
  )

  if ($null -eq $Process -or [int]$Process.ProcessId -le 0) { return $false }
  if ([string]$Process.Name -notmatch '^llama-server(?:\.exe)?$') { return $false }
  $commandLine = [string]$Process.CommandLine
  if ([string]::IsNullOrWhiteSpace($commandLine)) { return $false }
  return $commandLine -match "(?:--port\s+$Port(?:\s|$)|--port=$Port(?:\s|$))"
}
