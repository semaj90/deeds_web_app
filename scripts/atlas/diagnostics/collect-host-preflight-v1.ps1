[CmdletBinding()]
param()

$ErrorActionPreference = 'Stop'

function Invoke-ReadOnlyCommand {
    param([string]$Name, [string[]]$Arguments)
    $command = Get-Command $Name -ErrorAction SilentlyContinue
    if (-not $command) { return @{ status = 'UNAVAILABLE'; output = @() } }
    $output = @(& $command.Source @Arguments 2>$null)
    if ($LASTEXITCODE -ne 0) { return @{ status = 'DEGRADED'; output = @($output | Select-Object -First 30) } }
    return @{ status = 'AVAILABLE'; output = @($output | Select-Object -First 100) }
}

$os = Get-CimInstance Win32_OperatingSystem
$cpu = @(Get-CimInstance Win32_Processor | ForEach-Object {
    [ordered]@{
        name = $_.Name
        physicalCores = $_.NumberOfCores
        logicalProcessors = $_.NumberOfLogicalProcessors
        loadPercent = if ($null -eq $_.LoadPercentage) { $null } else { [double]$_.LoadPercentage }
    }
})
$disks = @(Get-CimInstance Win32_LogicalDisk -Filter 'DriveType=3' | ForEach-Object {
    [ordered]@{
        drive = $_.DeviceID
        freeGiB = [math]::Round($_.FreeSpace / 1GB, 2)
        totalGiB = [math]::Round($_.Size / 1GB, 2)
    }
})
$processes = @(Get-Process | Sort-Object WorkingSet64 -Descending | Select-Object -First 30 | ForEach-Object {
    [ordered]@{
        name = $_.ProcessName
        cpuSeconds = if ($null -eq $_.CPU) { $null } else { [math]::Round($_.CPU, 2) }
        workingSetMiB = [math]::Round($_.WorkingSet64 / 1MB, 1)
    }
})

$gpu = Invoke-ReadOnlyCommand 'nvidia-smi' @(
    '--query-gpu=name,driver_version,memory.total,memory.free,utilization.gpu',
    '--format=csv,noheader,nounits'
)
$docker = Invoke-ReadOnlyCommand 'docker' @(
    'ps', '--all', '--format', '{{.Names}}|{{.Image}}|{{.Status}}'
)
$dockerStats = Invoke-ReadOnlyCommand 'docker' @(
    'stats', '--no-stream', '--format', '{{.Name}}|{{.CPUPerc}}|{{.MemUsage}}'
)
$wslRunning = Invoke-ReadOnlyCommand 'wsl.exe' @('--list', '--running', '--quiet')
$wslConfigPath = Join-Path $env:USERPROFILE '.wslconfig'
$wslLimits = [ordered]@{
    status = 'UNVERIFIED'
    source = $wslConfigPath
    memory = $null
    processors = $null
    swap = $null
}
if (Test-Path -LiteralPath $wslConfigPath -PathType Leaf) {
    $inWsl2Section = $false
    $hasWslLimitSettings = $false
    foreach ($line in Get-Content -LiteralPath $wslConfigPath) {
        if ($line -match '^\s*\[([^\]]+)\]\s*$') {
            $inWsl2Section = $Matches[1] -ieq 'wsl2'
            continue
        }
        if ($inWsl2Section -and $line -match '^\s*(memory|processors|swap)\s*=\s*(.*?)\s*$') {
            $key = $Matches[1].ToLowerInvariant()
            $wslLimits[$key] = $Matches[2]
            $hasWslLimitSettings = $true
        }
    }
    if ($hasWslLimitSettings) { $wslLimits.status = 'CONFIGURED_ONLY_RUNTIME_NOT_VERIFIED' }
}

[ordered]@{
    schema = 'atlas.host-preflight.v1'
    observedAtUtc = [DateTime]::UtcNow.ToString('o')
    host = [ordered]@{
        status = 'AVAILABLE'
        osVersion = $os.Version
        osCaption = $os.Caption
        freeRamMiB = [math]::Round($os.FreePhysicalMemory / 1024)
        cpu = $cpu
        disks = $disks
        topProcesses = $processes
    }
    gpu = $gpu
    docker = [ordered]@{ containers = $docker; stats = $dockerStats }
    wsl = [ordered]@{
        runningDistributions = $wslRunning
        configuredLimits = $wslLimits
        runtimeResourceUsage = [ordered]@{
            status = 'UNVERIFIED'
            reason = 'The collector does not start a stopped distribution to read Linux runtime metrics.'
        }
    }
    authority = 'DIAGNOSTIC_ONLY_NO_ADMISSION_OR_EXECUTION_AUTHORITY'
} | ConvertTo-Json -Depth 8 -Compress
