[CmdletBinding()]
param(
    [ValidateSet('status', 'start', 'unload')][string]$Action = 'status',
    [ValidateSet('ornith-1.5', 'ornith-1.5-vlm')][string]$Profile = 'ornith-1.5',
    [switch]$ConfirmControl
)

$ErrorActionPreference = 'Stop'
$ProgressPreference = 'SilentlyContinue'
$baseUrl = 'http://127.0.0.1:8090'
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
    error = $null
}

function Get-RuntimeSnapshot {
    $listeners = @(Get-NetTCPConnection -LocalPort 8090 -State Listen -ErrorAction SilentlyContinue |
        Select-Object -ExpandProperty OwningProcess -Unique)
    $processes = @(Get-CimInstance Win32_Process -Filter "Name='llama-server.exe'" |
        Where-Object { $_.CommandLine -match '(?:^|\s)--port(?:=|\s+)8090(?:\s|$)' })
    $healthy = $false
    $modelId = $null
    $slots = $null
    if ($listeners.Count -gt 0) {
        try {
            $health = Invoke-RestMethod -Uri "$baseUrl/health" -TimeoutSec 3
            $healthy = $health.status -eq 'ok'
        } catch { $healthy = $false }
        try { $modelId = (Invoke-RestMethod -Uri "$baseUrl/v1/models" -TimeoutSec 3).data[0].id } catch { }
        try { $slots = @(Invoke-RestMethod -Uri "$baseUrl/slots" -TimeoutSec 3) } catch { }
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
        slots = $slots
        gpus = @($gpus)
        gpuError = $gpuError
    }
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

$mutex = $null
$locked = $false
try {
    if (-not $IsWindows) { throw 'WINDOWS_RUNTIME_CONTROL_ONLY' }
    if ($Action -ne 'status') {
        if (-not $ConfirmControl) { throw 'EXPLICIT_CONFIRMATION_REQUIRED' }
        $mutex = [System.Threading.Mutex]::new($false, 'Local\ParentAtlasLlama8090ControlV1')
        try { $locked = $mutex.WaitOne(0) } catch [System.Threading.AbandonedMutexException] { $locked = $true }
        if (-not $locked) { throw 'RUNTIME_CONTROL_BUSY' }
    }
    $receipt.before = Get-RuntimeSnapshot
    Assert-ScopedOwnership $receipt.before
    if ($Action -eq 'status') {
        $receipt.status = if ($receipt.before.healthy) { 'RUNNING' } elseif ($receipt.before.listenerPids.Count -eq 0 -and $receipt.before.processIds.Count -eq 0) { 'STOPPED' } else { 'UNHEALTHY' }
        $receipt.after = $receipt.before
    } elseif ($Action -eq 'unload') {
        if ($receipt.before.processIds.Count -gt 0) {
            Assert-IdleSlots $receipt.before
            $current = Get-RuntimeSnapshot
            Assert-ScopedOwnership $current
            Assert-IdleSlots $current
            if (@($current.processIds).Count -ne 1 -or $current.processIds[0] -ne $receipt.before.processIds[0]) { throw 'PROCESS_CHANGED_REFUSING_STOP' }
            Stop-Process -Id $current.processIds[0] -ErrorAction Stop
            $receipt.serviceMutationPerformed = $true
        }
        $deadline = [DateTime]::UtcNow.AddSeconds(20)
        do {
            $receipt.after = Get-RuntimeSnapshot
            if ($receipt.after.listenerPids.Count -eq 0 -and $receipt.after.processIds.Count -eq 0) { break }
            Start-Sleep -Milliseconds 500
        } while ([DateTime]::UtcNow -lt $deadline)
        if ($receipt.after.listenerPids.Count -gt 0 -or $receipt.after.processIds.Count -gt 0) { throw 'STOP_NOT_VERIFIED_NO_FORCE_KILL' }
        $receipt.status = 'STOPPED'
        if ($receipt.serviceMutationPerformed) {
            foreach ($beforeGpu in $receipt.before.gpus) {
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
    } else {
        if ($receipt.before.listenerPids.Count -gt 0 -or $receipt.before.processIds.Count -gt 0) {
            if (-not $receipt.before.healthy) { throw 'EXISTING_RUNTIME_UNHEALTHY_NO_AUTOMATIC_RESTART' }
            $receipt.status = 'ALREADY_RUNNING'
        } else {
            $launcher = Join-Path $PSScriptRoot '../launch-turboquant.ps1'
            $env:TURBO_PORT = '8090'
            $receipt.serviceMutationPerformed = $true
            $launchOutput = & pwsh -NoProfile -ExecutionPolicy Bypass -File $launcher -Detached -NoEvict -StartupProfile $Profile 2>&1 | Out-String
            if ($LASTEXITCODE -ne 0) { throw 'EXISTING_ORNITH_LAUNCHER_FAILED_CHECK_LAUNCHER_LOGS' }
            $receipt.status = 'RUNNING'
        }
        $receipt.after = Get-RuntimeSnapshot
        Assert-ScopedOwnership $receipt.after
        if (-not $receipt.after.healthy -or $receipt.after.processIds.Count -ne 1 -or $receipt.after.listenerPids.Count -ne 1 -or $receipt.after.modelId -ne 'ornith-1.5-9b') { throw 'ORNITH_START_READBACK_NOT_VERIFIED' }
    }
} catch {
    $receipt.status = 'ERROR'
    $receipt.error = $_.Exception.Message
} finally {
    if ($locked) { $mutex.ReleaseMutex() }
    if ($mutex) { $mutex.Dispose() }
}
$receipt | ConvertTo-Json -Depth 12 -Compress
if ($receipt.status -eq 'ERROR') { exit 1 }
