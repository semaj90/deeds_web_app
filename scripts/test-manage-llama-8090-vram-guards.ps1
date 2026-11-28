$ErrorActionPreference = 'Stop'
. (Join-Path $PSScriptRoot 'lib\llama-8090-vram-guards.ps1')

Describe 'llama-server VRAM release guards' {
  It 'counts active slots only after a strict schema read' {
    $result = ConvertTo-ValidatedLlamaSlotsV1 -Response @(
      [pscustomobject]@{ id = 0; is_processing = $false },
      [pscustomobject]@{ id = 1; is_processing = $true }
    )
    $result.valid | Should Be $true
    $result.total | Should Be 2
    $result.busy | Should Be 1
  }

  It 'rejects empty, null, and malformed slot payloads' {
    (ConvertTo-ValidatedLlamaSlotsV1 -Response $null).valid | Should Be $false
    (ConvertTo-ValidatedLlamaSlotsV1 -Response @()).valid | Should Be $false
    (ConvertTo-ValidatedLlamaSlotsV1 -Response @([pscustomobject]@{ id = 0 })).valid | Should Be $false
    (ConvertTo-ValidatedLlamaSlotsV1 -Response @([pscustomobject]@{ is_processing = 'false' })).valid | Should Be $false
  }

  It 'refuses release when slots are unreachable or unproven' {
    $slots = [pscustomobject]@{ reachable = $false; valid = $false; total = 0; busy = 0; reason = 'SLOTS_UNREACHABLE' }
    { Assert-LlamaVramReleasePreconditionsV1 -Slots $slots -ListenerIdentityVerified $true -InferenceDrainGateVerified $true } |
      Should Throw 'REFUSED_SLOTS_UNVERIFIED: SLOTS_UNREACHABLE'
  }

  It 'refuses release while any slot is active' {
    $slots = [pscustomobject]@{ reachable = $true; valid = $true; total = 1; busy = 1; reason = $null }
    { Assert-LlamaVramReleasePreconditionsV1 -Slots $slots -ListenerIdentityVerified $true -InferenceDrainGateVerified $true } |
      Should Throw 'REFUSED_SLOTS_BUSY: 1 active slot(s).'
  }

  It 'refuses a listener without verified llama-server port identity' {
    $slots = [pscustomobject]@{ reachable = $true; valid = $true; total = 1; busy = 0; reason = $null }
    { Assert-LlamaVramReleasePreconditionsV1 -Slots $slots -ListenerIdentityVerified $false -InferenceDrainGateVerified $true } |
      Should Throw 'REFUSED_LISTENER_IDENTITY_UNVERIFIED'
  }

  It 'refuses idle slots if no ingress drain gate can block new requests' {
    $slots = [pscustomobject]@{ reachable = $true; valid = $true; total = 1; busy = 0; reason = $null }
    { Assert-LlamaVramReleasePreconditionsV1 -Slots $slots -ListenerIdentityVerified $true -InferenceDrainGateVerified $false } |
      Should Throw 'REFUSED_INFERENCE_DRAIN_GATE_UNAVAILABLE'
  }

  It 'accepts only the expected llama-server process listening on the requested port' {
    $valid = [pscustomobject]@{ ProcessId = 123; Name = 'llama-server'; CommandLine = 'llama-server.exe --port 8090 --model model.gguf' }
    $wrongPort = [pscustomobject]@{ ProcessId = 123; Name = 'llama-server'; CommandLine = 'llama-server.exe --port 8091' }
    $otherProcess = [pscustomobject]@{ ProcessId = 123; Name = 'python'; CommandLine = 'python.exe --port 8090' }
    (Test-LlamaPortProcessIdentityV1 -Port 8090 -Process $valid) | Should Be $true
    (Test-LlamaPortProcessIdentityV1 -Port 8090 -Process $wrongPort) | Should Be $false
    (Test-LlamaPortProcessIdentityV1 -Port 8090 -Process $otherProcess) | Should Be $false
  }

  It 'keeps the command-line release path fail-closed and non-forcing' {
    $manager = Get-Content -Raw (Join-Path $PSScriptRoot 'manage-llama-8090-vram.ps1')
    $manager | Should Not Match '\[switch\]\s*\$Force'
    $manager | Should Not Match 'Stop-Process\s+-Id\s+\$listenPid'
    $manager | Should Match 'InferenceDrainGateVerified\s+\$false'
  }
}
