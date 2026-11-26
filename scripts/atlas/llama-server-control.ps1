[CmdletBinding()]
param(
    [ValidateSet('status', 'start', 'unload', 'switch')][string]$Action = 'status',
    # Omit on start to restore what the last unload recorded, else the Gemma 4 text profile.
    [ValidateSet('gemma4-legal-iq4xs', 'gemma4-legal-iq4xs-vlm', 'ornith-1.5', 'ornith-1.5-vlm')][string]$Profile = 'gemma4-legal-iq4xs',
    [switch]$ConfirmControl,
    # Progress bars go to stderr so stdout stays a single JSON receipt.
    [switch]$ShowProgress,
    # Set only by the gated MCP runner (sveltekit-frontend/src/mcp/llama-runtime-tools.ts).
    [string]$Caller,
    [string]$StatePath = (Join-Path $PSScriptRoot '../../.tmp/atlas/llama-restore-profile.json'),
    [string]$ModelRoot = (Join-Path $PSScriptRoot '../../models')
)

$ErrorActionPreference = 'Stop'
$ProgressPreference = 'SilentlyContinue'
$baseUrl = 'http://127.0.0.1:8090'
$profileExplicit = $PSBoundParameters.ContainsKey('Profile')
# Identity of each supported launcher profile: served alias, model file and vision.
$profiles = [ordered]@{
    'gemma4-legal-iq4xs'     = @{ modelId = 'gemma4-legal-iq4xs-direct.gguf'; modelFile = 'gemma4-legal-iq4xs-direct.gguf'; vision = $false; files = @('gemma4-legal-iq4xs-direct.gguf') }
    'gemma4-legal-iq4xs-vlm' = @{ modelId = 'gemma4-legal-iq4xs-direct.gguf'; modelFile = 'gemma4-legal-iq4xs-direct.gguf'; vision = $true; files = @('gemma4-legal-iq4xs-direct.gguf', 'mmproj-F16.gguf') }
    'ornith-1.5'             = @{ modelId = 'ornith-1.5-9b'; modelFile = 'hforf.gguf'; vision = $false; files = @('ornith-1_5-9b-ad-q5_k-q4_k/hforf.gguf') }
    'ornith-1.5-vlm'         = @{ modelId = 'ornith-1.5-9b'; modelFile = 'hforf.gguf'; vision = $true; files = @('ornith-1_5-9b-ad-q5_k-q4_k/hforf.gguf', 'mmproj-Ornith-1.5-9B-BF16.gguf') }
}
$receipt = [ordered]@{
    schema = 'atlas.llama-runtime-control.v1'
    action = $Action
    port = 8090
    status = 'ERROR'
    serviceMutationPerformed = $false
    before = $null
    after = $null
    memoryDeltas = @()
    memoryReleaseObserved = $null
    restoreProfile = $null
    profileSource = $null
    previousProfile = $null
    rolledBack = $null
    error = $null
}

function Get-RuntimeSnapshot {
    $listeners = @(Get-NetTCPConnection -LocalPort 8090 -State Listen -ErrorAction SilentlyContinue |
        Select-Object -ExpandProperty OwningProcess -Unique)
    $processes = @(Get-CimInstance Win32_Process -Filter "Name='llama-server.exe'" |
        Where-Object { $_.CommandLine -match '(?:^|\s)--port(?:=|\s+)8090(?:\s|$)' })
    $healthy = $false
    $modelId = $null
    $vision = $null
    $slots = $null
    if ($listeners.Count -gt 0) {
        try {
            $health = Invoke-RestMethod -Uri "$baseUrl/health" -TimeoutSec 3
            $healthy = $health.status -eq 'ok'
        } catch { $healthy = $false }
        try { $modelId = (Invoke-RestMethod -Uri "$baseUrl/v1/models" -TimeoutSec 3).data[0].id } catch { }
        try {
            $reportedVision = (Invoke-RestMethod -Uri "$baseUrl/props" -TimeoutSec 3).modalities.vision
            if ($reportedVision -is [bool]) { $vision = $reportedVision }
        } catch { }
        try { $slots = @(Invoke-RestMethod -Uri "$baseUrl/slots" -TimeoutSec 3) } catch { }
    }
    $modelFile = $null
    if ($processes.Count -eq 1 -and $processes[0].CommandLine -match '(?:^|\s)(?:-m|--model)(?:=|\s+)(?:"([^"]+)"|(\S+))') {
        $modelPath = if ($Matches[1]) { $Matches[1] } else { $Matches[2] }
        $modelFile = ($modelPath -split '[\\/]')[-1]
    }
    $gpus = @()
    $gpuError = $null
    try {
        $lines = @(& nvidia-smi --query-gpu=uuid,memory.total,memory.used,memory.free --format=csv,noheader,nounits 2>$null)
        if ($LASTEXITCODE -ne 0) { throw 'NVIDIA_QUERY_FAILED' }
        foreach ($line in $lines) {
            $fields = $line.Split(',').Trim()
            if ($fields.Count -ne 4) { throw 'INVALID_NVIDIA_SAMPLE' }
            $gpus += [ordered]@{
                uuid = $fields[0]
                totalMiB = [int]$fields[1]
                usedMiB = [int]$fields[2]
                freeMiB = [int]$fields[3]
            }
        }
    } catch { $gpus = @(); $gpuError = $_.Exception.Message }
    return [pscustomobject]@{
        observedAt = [DateTime]::UtcNow.ToString('o')
        listenerPids = @($listeners)
        processIds = @($processes | ForEach-Object { [int]$_.ProcessId })
        healthy = [bool]$healthy
        modelId = $modelId
        modelFile = $modelFile
        vision = $vision
        slots = $slots
        gpus = @($gpus)
        gpuError = $gpuError
    }
}

# True only when model id and vision are both observed and match; the model file must match when visible.
function Test-ProfileMatch($Snapshot, $Expected) {
    if ($Snapshot.modelId -ne $Expected.modelId) { return $false }
    if ($Snapshot.vision -isnot [bool] -or $Snapshot.vision -ne $Expected.vision) { return $false }
    return (-not $Snapshot.modelFile) -or ($Snapshot.modelFile -eq $Expected.modelFile)
}

function Resolve-RunningProfile($Snapshot) {
    $matching = @($profiles.Keys | Where-Object { Test-ProfileMatch $Snapshot $profiles[$_] })
    if ($matching.Count -ne 1) { return $null }
    return $matching[0]
}

function Assert-ScopedOwnership($Snapshot) {
    foreach ($listenerId in $Snapshot.listenerPids) {
        if ($listenerId -notin $Snapshot.processIds) { throw 'PORT_8090_OWNED_BY_UNEXPECTED_PROCESS' }
    }
    if ($Snapshot.processIds.Count -gt 1) { throw 'AMBIGUOUS_LLAMA_PROCESS_8090' }
}

function Assert-IdleSlots($Snapshot) {
    if ($null -eq $Snapshot.slots -or @($Snapshot.slots).Count -eq 0) { throw 'SLOTS_UNAVAILABLE_REFUSING_STOP' }
    foreach ($slot in $Snapshot.slots) {
        if ($slot.is_processing -isnot [bool] -or $slot.is_processing) { throw 'SLOT_BUSY_OR_UNKNOWN_REFUSING_STOP' }
    }
}

# Pure text builder. $Percent -lt 0 means unknown, so no bar fill is invented.
function Format-ProgressLine([string]$Label, [int]$Percent, [string]$Detail) {
    if ($Percent -lt 0) { return ('{0,-22} [..........] {1}' -f $Label, $Detail) }
    $filled = [Math]::Min(10, [int][Math]::Floor($Percent / 10))
    return ('{0,-22} [{1}{2}] {3}' -f $Label, ('#' * $filled), ('-' * (10 - $filled)), $Detail)
}

# Estimate only: llama-server reports no load percentage. Capped below 100 until readback passes.
function Get-LoadPercentEstimate($UsedMiB, $BaselineMiB, $ExpectedMiB) {
    if ($null -eq $UsedMiB -or $null -eq $BaselineMiB -or $null -eq $ExpectedMiB -or $ExpectedMiB -le $BaselineMiB) { return -1 }
    $ratio = ($UsedMiB - $BaselineMiB) / ($ExpectedMiB - $BaselineMiB)
    return [int][Math]::Max(0, [Math]::Min(95, [Math]::Floor($ratio * 100)))
}

function Write-ProgressLine([string]$Line, [switch]$Final) {
    if (-not $ShowProgress) { return }
    [Console]::Error.Write("`r" + $Line.PadRight(90))
    if ($Final) { [Console]::Error.WriteLine() }
}

# Idle-checked, port-scoped, verified stop. Refuses a server it could not put back.
function Invoke-StopStep($Before) {
    if ($Before.processIds.Count -gt 0) {
        Assert-IdleSlots $Before
        # Never stop a server this script could not put back.
        $running = Resolve-RunningProfile $Before
        if (-not $running) { throw 'RESTORE_PROFILE_UNIDENTIFIED_REFUSING_STOP' }
        $receipt.restoreProfile = $running
        $receipt.profileSource = 'observed-running'
        $current = Get-RuntimeSnapshot
        Assert-ScopedOwnership $current
        Assert-IdleSlots $current
        if (@($current.processIds).Count -ne 1 -or $current.processIds[0] -ne $Before.processIds[0]) { throw 'PROCESS_CHANGED_REFUSING_STOP' }
        # Saved before the stop, so a manual restore knows the profile even if verification fails.
        New-Item -ItemType Directory -Force -Path (Split-Path -Parent $StatePath) | Out-Null
        [ordered]@{
            schema = 'atlas.llama-restore-profile.v1'
            restoreProfile = $running
            modelId = $Before.modelId
            vision = $Before.vision
            usedMiBBeforeUnload = $(if (@($Before.gpus).Count -gt 0) { $Before.gpus[0].usedMiB } else { $null })
            savedAt = [DateTime]::UtcNow.ToString('o')
        } | ConvertTo-Json | Set-Content -LiteralPath $StatePath -Encoding utf8
        Write-ProgressLine (Format-ProgressLine 'Freeing GPU memory' -1 "idle check passed, stopping $($Before.modelId)")
        Stop-Process -Id $current.processIds[0] -ErrorAction Stop
        $receipt.serviceMutationPerformed = $true
    }
    $deadline = [DateTime]::UtcNow.AddSeconds(20)
    do {
        $receipt.after = Get-RuntimeSnapshot
        if ($receipt.after.listenerPids.Count -eq 0 -and $receipt.after.processIds.Count -eq 0) { break }
        if (@($receipt.after.gpus).Count -gt 0) { Write-ProgressLine (Format-ProgressLine 'Freeing GPU memory' -1 "waiting, $($receipt.after.gpus[0].freeMiB) MiB free") }
        Start-Sleep -Milliseconds 500
    } while ([DateTime]::UtcNow -lt $deadline)
    if ($receipt.after.listenerPids.Count -gt 0 -or $receipt.after.processIds.Count -gt 0) { throw 'STOP_NOT_VERIFIED_NO_FORCE_KILL' }
    $receipt.status = 'STOPPED'
    if (@($receipt.after.gpus).Count -gt 0) { Write-ProgressLine (Format-ProgressLine 'Freeing GPU memory' 100 "stopped, $($receipt.after.gpus[0].freeMiB) MiB free") -Final }
    if ($receipt.serviceMutationPerformed) {
        foreach ($beforeGpu in $Before.gpus) {
            $afterGpu = $receipt.after.gpus | Where-Object { $_.uuid -eq $beforeGpu.uuid } | Select-Object -First 1
            if ($afterGpu) {
                $receipt.memoryDeltas += [ordered]@{
                    uuid = $beforeGpu.uuid
                    usedMiBChange = $afterGpu.usedMiB - $beforeGpu.usedMiB
                    freeMiBChange = $afterGpu.freeMiB - $beforeGpu.freeMiB
                }
            }
        }
        if ($receipt.memoryDeltas.Count -gt 0) {
            $receipt.memoryReleaseObserved = @($receipt.memoryDeltas | Where-Object { $_.usedMiBChange -lt 0 -and $_.freeMiBChange -gt 0 }).Count -gt 0
        }
    }
}

function Invoke-StartStep($Target, $Saved, $Before) {
    if ($Before.listenerPids.Count -gt 0 -or $Before.processIds.Count -gt 0) {
        if (-not $Before.healthy) { throw 'EXISTING_RUNTIME_UNHEALTHY_NO_AUTOMATIC_RESTART' }
        $receipt.status = 'ALREADY_RUNNING'
    } else {
        $launcher = Join-Path $PSScriptRoot '../launch-turboquant.ps1'
        $env:TURBO_PORT = '8090'
        # The vision profiles are run with the projector on CPU on this 8 GiB card.
        if ($profiles[$Target].vision -and -not $env:LLAMA_ARG_MMPROJ_OFFLOAD) { $env:LLAMA_ARG_MMPROJ_OFFLOAD = '0' }
        $receipt.serviceMutationPerformed = $true
        if ($ShowProgress) {
            $expectedMiB = if ($saved -and $Saved.restoreProfile -eq $Target) { $Saved.usedMiBBeforeUnload } else { $null }
            $baselineMiB = if (@($Before.gpus).Count -gt 0) { $Before.gpus[0].usedMiB } else { $null }
            $log = Join-Path ([IO.Path]::GetTempPath()) "llama-launch-$PID"
            $launch = Start-Process pwsh -PassThru -WindowStyle Hidden -RedirectStandardOutput "$log.out.log" -RedirectStandardError "$log.err.log" -ArgumentList @(
                '-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', "`"$launcher`"", '-Detached', '-NoEvict', '-StartupProfile', $Target)
            $null = $launch.Handle
            $started = [DateTime]::UtcNow
            while (-not $launch.HasExited) {
                $elapsed = [int]([DateTime]::UtcNow - $started).TotalSeconds
                if ($elapsed -gt 240) { throw "LAUNCH_TIMEOUT_NO_KILL_SEE_$log.out.log" }
                $sample = @(& nvidia-smi --query-gpu=uuid,memory.total,memory.used,memory.free --format=csv,noheader,nounits 2>$null) | Select-Object -First 1
                $usedMiB = if ($sample) { [int]$sample.Split(',')[2].Trim() } else { $null }
                $percent = Get-LoadPercentEstimate $usedMiB $baselineMiB $expectedMiB
                $about = if ($percent -ge 0) { "about $percent%, " } else { '' }
                Write-ProgressLine (Format-ProgressLine "Loading $Target" $percent "${about}loading, ${elapsed}s")
                Start-Sleep -Milliseconds 1000
            }
            if ($launch.ExitCode -ne 0) { throw "LAUNCHER_FAILED_SEE_$log.out.log" }
        } else {
            $launchOutput = & pwsh -NoProfile -ExecutionPolicy Bypass -File $launcher -Detached -NoEvict -StartupProfile $Target 2>&1 | Out-String
            if ($LASTEXITCODE -ne 0) { throw 'LAUNCHER_FAILED_CHECK_LAUNCHER_LOGS' }
        }
        $receipt.status = 'RUNNING'
    }
    $receipt.after = Get-RuntimeSnapshot
    Assert-ScopedOwnership $receipt.after
    if (-not $receipt.after.healthy -or $receipt.after.processIds.Count -ne 1 -or $receipt.after.listenerPids.Count -ne 1 -or -not (Test-ProfileMatch $receipt.after $profiles[$Target])) { throw 'START_READBACK_NOT_VERIFIED' }
    Write-ProgressLine (Format-ProgressLine "Loading $Target" 100 "verified $($receipt.after.modelId), vision=$($receipt.after.vision)") -Final
}

$mutex = $null
$locked = $false
try {
    if (-not $IsWindows) { throw 'WINDOWS_RUNTIME_CONTROL_ONLY' }
    if ($Action -ne 'status') {
        # A tool server still running pre-gate code calls with -NonInteractive and no caller marker.
        if ([Environment]::GetCommandLineArgs() -contains '-NonInteractive' -and $Caller -ne 'mcp-gate-v1') { throw 'UNGATED_NONINTERACTIVE_CALLER_REFUSED_RESTART_TOOL_SERVER' }
        if (-not $ConfirmControl) { throw 'EXPLICIT_CONFIRMATION_REQUIRED' }
        $mutex = [System.Threading.Mutex]::new($false, 'Local\ParentAtlasLlama8090ControlV1')
        try { $locked = $mutex.WaitOne(0) } catch [System.Threading.AbandonedMutexException] { $locked = $true }
        if (-not $locked) { throw 'RUNTIME_CONTROL_BUSY' }
    }
    $receipt.before = Get-RuntimeSnapshot
    Assert-ScopedOwnership $receipt.before
    if ($Action -eq 'status') {
        $receipt.status = if ($receipt.before.healthy) { 'RUNNING' } elseif ($receipt.before.listenerPids.Count -eq 0 -and $receipt.before.processIds.Count -eq 0) { 'STOPPED' } else { 'UNHEALTHY' }
        $receipt.restoreProfile = Resolve-RunningProfile $receipt.before
        $receipt.after = $receipt.before
    } elseif ($Action -eq 'unload') {
        Invoke-StopStep $receipt.before
    } elseif ($Action -eq 'switch') {
        if (-not $profileExplicit) { throw 'SWITCH_REQUIRES_EXPLICIT_PROFILE' }
        # Check the target can be loaded before anything is stopped.
        foreach ($relative in $profiles[$Profile].files) {
            if (-not (Test-Path -LiteralPath (Join-Path $ModelRoot $relative) -PathType Leaf)) { throw "TARGET_MODEL_MISSING_REFUSING_STOP: $relative" }
        }
        $receipt.restoreProfile = $Profile
        $receipt.profileSource = 'explicit'
        $running = if ($receipt.before.processIds.Count -gt 0) { Resolve-RunningProfile $receipt.before } else { $null }
        $receipt.previousProfile = $running
        if ($running -eq $Profile -and $receipt.before.healthy) {
            $receipt.status = 'ALREADY_RUNNING'
            $receipt.after = $receipt.before
        } else {
            if ($receipt.before.listenerPids.Count -gt 0 -and $receipt.before.processIds.Count -eq 0) { throw 'PORT_8090_OWNED_BY_UNEXPECTED_PROCESS' }
            Invoke-StopStep $receipt.before
            $receipt.restoreProfile = $Profile
            $receipt.profileSource = 'explicit'
            $stopped = $receipt.after
            try {
                Invoke-StartStep $Profile $null $stopped
                # A later plain restore must bring back the model switched to, not the one replaced.
                [ordered]@{
                    schema = 'atlas.llama-restore-profile.v1'
                    restoreProfile = $Profile
                    modelId = $receipt.after.modelId
                    vision = $receipt.after.vision
                    usedMiBBeforeUnload = $(if (@($receipt.after.gpus).Count -gt 0) { $receipt.after.gpus[0].usedMiB } else { $null })
                    savedAt = [DateTime]::UtcNow.ToString('o')
                } | ConvertTo-Json | Set-Content -LiteralPath $StatePath -Encoding utf8
            } catch {
                $switchError = $_.Exception.Message
                $now = Get-RuntimeSnapshot
                # Roll back only onto an empty port; a half-started or wrong server is left for the operator.
                if ($running -and $now.listenerPids.Count -eq 0 -and $now.processIds.Count -eq 0) {
                    try {
                        Invoke-StartStep $running $null $now
                        $receipt.rolledBack = $true
                    } catch { $receipt.rolledBack = $false }
                } else { $receipt.rolledBack = $false }
                throw "SWITCH_FAILED: $switchError"
            }
        }
    } else {
        $saved = $null
        if (Test-Path -LiteralPath $StatePath) {
            try { $saved = Get-Content -Raw -LiteralPath $StatePath | ConvertFrom-Json } catch { throw 'RESTORE_STATE_UNREADABLE_PASS_PROFILE' }
        }
        $receipt.profileSource = 'explicit'
        if (-not $profileExplicit) {
            if ($saved) {
                if (-not $profiles.Contains([string]$saved.restoreProfile)) { throw 'RESTORE_STATE_UNKNOWN_PROFILE_PASS_PROFILE' }
                $Profile = [string]$saved.restoreProfile
                $receipt.profileSource = 'saved-by-unload'
            } else { $receipt.profileSource = 'default' }
        }
        $receipt.restoreProfile = $Profile
        Invoke-StartStep $Profile $saved $receipt.before
    }
} catch {
    $receipt.status = 'ERROR'
    $receipt.error = $_.Exception.Message
    Write-ProgressLine "FAILED: $($receipt.error)" -Final
} finally {
    if ($locked) { $mutex.ReleaseMutex() }
    if ($mutex) { $mutex.Dispose() }
}
$receipt | ConvertTo-Json -Depth 12 -Compress
if ($receipt.status -eq 'ERROR') { exit 1 }
