param(
    [string]$OutputPath = ''
)

$ErrorActionPreference = 'Stop'

function Invoke-DockerCapture([string[]]$Arguments, [int]$TimeoutSeconds = 180) {
    $dockerCommand = Get-Command docker.exe -ErrorAction Stop
    $processInfo = [System.Diagnostics.ProcessStartInfo]::new()
    $processInfo.FileName = $dockerCommand.Source
    $processInfo.UseShellExecute = $false
    $processInfo.CreateNoWindow = $true
    $processInfo.RedirectStandardOutput = $true
    $processInfo.RedirectStandardError = $true
    foreach ($argument in $Arguments) { $processInfo.ArgumentList.Add($argument) }
    $process = [System.Diagnostics.Process]::new()
    $process.StartInfo = $processInfo
    if (-not $process.Start()) { throw "DOCKER_START_FAILED:$($Arguments -join ' ')" }
    $stdoutTask = $process.StandardOutput.ReadToEndAsync()
    $stderrTask = $process.StandardError.ReadToEndAsync()
    if (-not $process.WaitForExit($TimeoutSeconds * 1000)) {
        $process.Kill($true)
        $process.WaitForExit()
        throw "DOCKER_TIMEOUT:$($Arguments -join ' ')"
    }
    $stdout = $stdoutTask.GetAwaiter().GetResult()
    $stderr = $stderrTask.GetAwaiter().GetResult()
    $exitCode = $process.ExitCode
    $process.Dispose()
    if ($exitCode -ne 0) { throw "DOCKER_EXIT_${exitCode}:$($Arguments -join ' '):$($stderr.Trim())" }
    return $stdout
}

function Get-ApproximateBytes([string]$SizeText) {
    if ($SizeText -notmatch '^([0-9]+(?:\.[0-9]+)?)(B|kB|MB|GB|TB)$') { return $null }
    $multipliers = @{ B = 1; kB = 1000; MB = 1000000; GB = 1000000000; TB = 1000000000000 }
    return [long][math]::Round(([double]$Matches[1]) * $multipliers[$Matches[2]])
}

$volumeNames = @((Invoke-DockerCapture @('volume', 'ls', '--quiet')) -split "`r?`n" | Where-Object { $_.Trim() } | ForEach-Object { $_.Trim() })
$containerIds = @((Invoke-DockerCapture @('ps', '--all', '--quiet')) -split "`r?`n" | Where-Object { $_.Trim() } | ForEach-Object { $_.Trim() })
$tab = [string][char]9
$volumeTemplate = '{{.Name}}' + $tab + '{{.CreatedAt}}' + $tab + '{{.Driver}}' + $tab + '{{.Scope}}' + $tab + '{{index .Labels "com.docker.compose.project"}}' + $tab + '{{index .Labels "com.docker.compose.volume"}}'
$containerTemplate = '{{.Name}}' + $tab + '{{.Config.Image}}' + $tab + '{{.State.Status}}' + $tab + '{{index .Config.Labels "com.docker.compose.project"}}' + $tab + '{{index .Config.Labels "com.docker.compose.service"}}' + $tab + '{{range .Mounts}}{{if eq .Type "volume"}}{{.Name}}:{{.Destination}};{{end}}{{end}}'
$collectionErrors = [System.Collections.Generic.List[string]]::new()
$volumeMetadata = @{}
foreach ($volumeName in $volumeNames) {
    try {
        $line = (Invoke-DockerCapture @('volume', 'inspect', '--format', $volumeTemplate, $volumeName)).TrimEnd([char[]]"`r`n")
        $parts = $line -split [regex]::Escape($tab), 6
        if ($parts.Count -lt 6 -or $parts[0] -ne $volumeName) { throw 'VOLUME_INSPECT_SHAPE_INVALID' }
        $volumeMetadata[$volumeName] = [pscustomobject]@{
            name = $parts[0]
            createdAt = $parts[1]
            driver = $parts[2]
            scope = $parts[3]
            composeProject = if ($parts[4] -eq '<no value>') { $null } else { $parts[4] }
            composeVolume = if ($parts[5] -eq '<no value>') { $null } else { $parts[5] }
            metadataError = $null
        }
    } catch {
        $collectionErrors.Add("volume:${volumeName}:$($_.Exception.Message)")
        $volumeMetadata[$volumeName] = [pscustomobject]@{
            name = $volumeName
            createdAt = $null
            driver = $null
            scope = $null
            composeProject = $null
            composeVolume = $null
            metadataError = $_.Exception.Message
        }
    }
}
$containerMetadata = @()
foreach ($containerId in $containerIds) {
    try {
        $line = (Invoke-DockerCapture @('inspect', '--format', $containerTemplate, $containerId)).Trim()
        if ($line) { $containerMetadata += $line }
    } catch {
        $collectionErrors.Add("container:${containerId}:$($_.Exception.Message)")
    }
}

$mountsByVolume = @{}
foreach ($line in $containerMetadata) {
    $parts = $line -split [regex]::Escape($tab), 6
    if ($parts.Count -lt 6) { continue }
    $container = [ordered]@{
        name = $parts[0].TrimStart('/')
        image = $parts[1]
        status = $parts[2]
        composeProject = if ($parts[3] -eq '<no value>') { $null } else { $parts[3] }
        composeService = if ($parts[4] -eq '<no value>') { $null } else { $parts[4] }
    }
    foreach ($mount in ($parts[5] -split ';' | Where-Object { $_ })) {
        $mountParts = $mount -split ':', 2
        if ($mountParts.Count -ne 2) { continue }
        if (-not $mountsByVolume.ContainsKey($mountParts[0])) { $mountsByVolume[$mountParts[0]] = @() }
        $mountsByVolume[$mountParts[0]] += [pscustomobject](@{ container = [pscustomobject]$container; destination = $mountParts[1] })
    }
}

$sizeStatus = 'UNAVAILABLE'
$sizeByVolume = @{}
try {
    $diskReport = Invoke-DockerCapture @('system', 'df', '--verbose')
    $lines = $diskReport -split "`r?`n"
    $sectionIndex = [array]::FindIndex($lines, [Predicate[string]]{ param($line) $line -match '^Local Volumes space usage:' })
    if ($sectionIndex -ge 0) {
        $headerIndex = $sectionIndex + 1
        while ($headerIndex -lt $lines.Length -and $lines[$headerIndex] -notmatch 'VOLUME NAME\s+LINKS\s+SIZE') { $headerIndex++ }
        if ($headerIndex -lt $lines.Length) {
            for ($index = $headerIndex + 1; $index -lt $lines.Length; $index++) {
                $line = $lines[$index].Trim()
                if (-not $line) { break }
                if ($line -match '^(.+?)\s+(\d+)\s+(\S+)\s*$') {
                    $name = $Matches[1].Trim()
                    $sizeText = $Matches[3]
                    $sizeByVolume[$name] = [pscustomobject]@{ text = $sizeText; approximateBytes = Get-ApproximateBytes $sizeText }
                }
            }
            $sizeStatus = 'DOCKER_SYSTEM_DF_VERBOSE'
        }
    }
} catch {
    $sizeStatus = "UNAVAILABLE:$($_.Exception.Message)"
}

$volumes = foreach ($metadata in $volumeMetadata.Values) {
    $name = $metadata.name
    $attachments = if ($mountsByVolume.ContainsKey($name)) { @($mountsByVolume[$name]) } else { @() }
    $size = $sizeByVolume[$name]
    $isAnonymousHash = $name -match '^[a-f0-9]{64}$'
    $composeProject = $metadata.composeProject
    $composeVolume = $metadata.composeVolume
    $verdict = if ($metadata.metadataError) { 'UNKNOWN_METADATA_KEEP' } elseif ($attachments.Count -gt 0) { 'PRESERVE_MOUNTED_BY_CURRENT_OR_STOPPED_CONTAINER' } elseif ($composeProject) { 'PRESERVE_COMPOSE_LABELED_OWNER_UNRESOLVED' } else { 'UNKNOWN_OWNER_KEEP' }
    [pscustomobject]@{
        name = $name
        anonymousHashName = $isAnonymousHash
        createdAt = $metadata.createdAt
        driver = $metadata.driver
        scope = $metadata.scope
        composeProject = $composeProject
        composeVolume = $composeVolume
        metadataError = $metadata.metadataError
        mounts = @($attachments)
        mountCount = $attachments.Count
        dockerReportedSize = $size.text
        approximateBytesFromDockerSize = $size.approximateBytes
        verdict = $verdict
    }
}

$timestamp = [DateTime]::UtcNow.ToString('yyyyMMddTHHmmssZ')
if (-not $OutputPath) {
    $inventoryDirectory = Join-Path $env:LOCALAPPDATA 'DeedsWebApp/inventory'
    $OutputPath = Join-Path $inventoryDirectory "docker-volume-owner-audit-$timestamp.json"
} else {
    $OutputPath = [System.IO.Path]::GetFullPath($OutputPath)
    $inventoryDirectory = Split-Path -Parent $OutputPath
}
New-Item -ItemType Directory -Path $inventoryDirectory -Force | Out-Null

$attached = @($volumes | Where-Object { $_.mountCount -gt 0 })
$unattached = @($volumes | Where-Object { $_.mountCount -eq 0 })
$report = [ordered]@{
    schema = 'atlas.docker-volume-ownership-readonly.v1'
    generatedAt = [DateTime]::UtcNow.ToString('o')
    readOnly = $true
    writesPerformed = $false
    datastoreMutations = @()
    dockerServerVersion = (Invoke-DockerCapture @('version', '--format', '{{.Server.Version}}')).Trim()
    volumeCount = $volumes.Count
    anonymousHashVolumeCount = @($volumes | Where-Object anonymousHashName).Count
    namedVolumeCount = @($volumes | Where-Object { -not $_.anonymousHashName }).Count
    mountedByAnyContainerCount = $attached.Count
    unattachedCount = $unattached.Count
    dockerSizeStatus = $sizeStatus
    sizeSemantics = 'Docker system df verbose reported size; approximate bytes use decimal units and do not equal measured NTFS allocation or reclaimable VHDX space.'
    containerScope = 'docker inspect over all containers returned by docker ps --all, including stopped containers; removed container provenance is unavailable.'
    creatorProvenance = 'Docker volume metadata does not identify its creating container; no creator is inferred from age, image, or volume name.'
    collectionErrors = @($collectionErrors)
    volumes = @($volumes | Sort-Object @{ Expression = 'anonymousHashName'; Descending = $true }, @{ Expression = 'approximateBytesFromDockerSize'; Descending = $true }, name)
    totals = [ordered]@{
        approximateDockerReportedBytes = [long](($volumes | Measure-Object -Property approximateBytesFromDockerSize -Sum).Sum)
        anonymousUnattached = @($unattached | Where-Object anonymousHashName).Count
        anonymousAttached = @($attached | Where-Object anonymousHashName).Count
    }
}
$json = $report | ConvertTo-Json -Depth 12
[System.IO.File]::WriteAllText($OutputPath, "$json`n", [System.Text.UTF8Encoding]::new($false))
Write-Output ([pscustomobject]$report | Select-Object schema, generatedAt, volumeCount, anonymousHashVolumeCount, mountedByAnyContainerCount, unattachedCount, dockerSizeStatus, totals | ConvertTo-Json -Depth 5)
Write-Output "receipt=$OutputPath"
