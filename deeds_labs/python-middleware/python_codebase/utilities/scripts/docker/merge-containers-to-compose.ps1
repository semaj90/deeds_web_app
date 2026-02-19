<#
.SYNOPSIS
Detect running Docker containers and generate a deduplicated docker-compose YAML.

.DESCRIPTION
This script queries the local Docker daemon for running containers, inspects each container,
and produces a docker-compose YAML that recreates the containers' service definitions in a
best-effort manner. It's intended as a convenience for rebuilding local stacks. The script
attempts to capture image, container name, ports, environment variables, volumes, and
command/entrypoint. It does not attempt to extract secrets from Docker secrets or
sensitive host paths; review the output carefully before use.

.PARAMETER Output
Path to write the generated docker-compose YAML. Defaults to ./docker-compose.detected.yml

.PARAMETER Force
If set, overwrite existing output file without prompting.

.PARAMETER IncludeStopped
If set, include stopped containers as well as running ones.

.EXAMPLE
.
PS> .\merge-containers-to-compose.ps1 -Output .\docker-compose.detected.yml -Force
#>

param(
    [string]$Output = "docker-compose.detected.yml",
    [switch]$Force,
    [switch]$IncludeStopped
)

function Assert-DockerAvailable {
    try {
        docker version > $null 2>&1
        return $true
    } catch {
        return $false
    }
}

if (-not (Assert-DockerAvailable)) {
    Write-Error "Docker CLI or daemon not available. Ensure Docker Desktop is running and you can run 'docker ps'."
    exit 2
}

if ((Test-Path $Output) -and (-not $Force)) {
    Write-Host "Output file '$Output' already exists. Use -Force to overwrite." -ForegroundColor Yellow
    exit 1
}

# Build docker ps arg list correctly (avoid passing empty string)
$psArgsBase = @('ps')
if ($IncludeStopped) { $psArgsBase += '-a' }

# Get JSON-formatted list of containers
$psArgsJson = @($psArgsBase + @('--format', '{{json .}}'))
$containersJsonRaw = & docker @psArgsJson 2>$null
$containersJson = @()
if ($containersJsonRaw) {
    $containersJson = $containersJsonRaw | ForEach-Object { $_ } | ConvertFrom-Json -ErrorAction SilentlyContinue
}
if (-not $containersJson) {
    Write-Host "No containers found." -ForegroundColor Yellow
    exit 0
}

$services = @{}

function Parse-PortBindings($inspect) {
    $ports = @()
    if ($inspect.NetworkSettings.Ports) {
        foreach ($k in $inspect.NetworkSettings.Ports.Keys) {
            $binding = $inspect.NetworkSettings.Ports[$k]
            # k looks like "80/tcp" or "443/tcp"
            $parts = $k -split "/"
            $containerPort = $parts[0]
            $proto = $parts[1]
            if ($binding -and $binding.Count -gt 0) {
                foreach ($b in $binding) {
                    $hostIp = $b.HostIp
                    $hostPort = $b.HostPort
                    if ($hostIp -and $hostIp -ne "0.0.0.0") {
                        $ports += "${hostIp}:${hostPort}:${containerPort}/${proto}"
                    } else {
                        $ports += "${hostPort}:${containerPort}/${proto}"
                    }
                }
            } else {
                # no host binding (internal only)
                $ports += "${containerPort}/${proto}"
            }
        }
    }
    return $ports
}

function Parse-Env($inspect) {
    $envList = @()
    foreach ($e in $inspect.Config.Env) {
        if ($e -match "^(.+?)=(.*)$") {
            $k = $matches[1]
            $v = $matches[2]
            # Avoid including empty values that may be secrets
            $envList += "${k}=${v}"
        }
    }
    return $envList
}

function Parse-Volumes($inspect) {
    $vols = @()
    if ($inspect.Mounts) {
        foreach ($m in $inspect.Mounts) {
            # Best-effort: use long syntax where we can
            if ($m.Type -eq 'bind') {
                # Protect against system paths that are likely sensitive
                $hostPath = $m.Source
                $containerPath = $m.Destination
                $readonly = $m.RW -eq $false
                $opt = $readonly ? ":ro" : ""
                $vols += "${hostPath}:${containerPath}${opt}"
            } elseif ($m.Type -eq 'volume') {
                $name = $m.Name
                $containerPath = $m.Destination
                $readonly = $m.RW -eq $false
                $opt = $readonly ? ":ro" : ""
                $vols += "${name}:${containerPath}${opt}"
            }
        }
    }
    return $vols
}

function Inspect-ContainerToService($containerId) {
    $inspect = docker inspect $containerId | ConvertFrom-Json
    $nm = $inspect.Name.TrimStart('/').Replace('/', '-')
    $svc = @{ }
    $svc.image = $inspect.Config.Image
    if ($inspect.Config.Cmd -and $inspect.Config.Cmd.Count -gt 0) {
        $svc.command = $inspect.Config.Cmd -join ' '
    }
    if ($inspect.Config.Entrypoint -and $inspect.Config.Entrypoint.Count -gt 0) {
        $svc.entrypoint = $inspect.Config.Entrypoint -join ' '
    }
    $ports = Parse-PortBindings $inspect
    if ($ports.Count -gt 0) { $svc.ports = $ports }
    $env = Parse-Env $inspect
    if ($env.Count -gt 0) { $svc.environment = $env }
    $vols = Parse-Volumes $inspect
    if ($vols.Count -gt 0) { $svc.volumes = $vols }
    # Try to capture restart policy if present
    if ($inspect.HostConfig.RestartPolicy -and $inspect.HostConfig.RestartPolicy.Name) {
        $svc.restart = $inspect.HostConfig.RestartPolicy.Name
    }
    # Capture labels useful to rewire networks
    if ($inspect.Config.Labels) { $svc.labels = $inspect.Config.Labels }
    return @{ name = $nm; service = $svc }
}

# Iterate running containers and collect service definitions
$psArgsQ = @($psArgsBase + @('-q'))
$containerIds = (& docker @psArgsQ) | ForEach-Object { $_ } | Where-Object { $_ -ne '' }
foreach ($id in $containerIds) {
    $entry = Inspect-ContainerToService $id
    $name = $entry.name
    $svc = $entry.service
    # Avoid duplicates: if service exists with same image and identical ports/env, skip
    if ($services.ContainsKey($name)) {
        Write-Host "Skipping duplicate container $name" -ForegroundColor Yellow
        continue
    }
    $services[$name] = $svc
}

# Compose generation
$compose = @{
    version = '3.8'
    services = @{}
}

foreach ($k in $services.Keys) {
    $svc = $services[$k]
    $svcYaml = @{}
    $svcYaml.image = $svc.image
    if ($svc.command) { $svcYaml.command = $svc.command }
    if ($svc.entrypoint) { $svcYaml.entrypoint = $svc.entrypoint }
    if ($svc.ports) { $svcYaml.ports = $svc.ports }
    if ($svc.environment) { $svcYaml.environment = $svc.environment }
    if ($svc.volumes) { $svcYaml.volumes = $svc.volumes }
    if ($svc.restart) { $svcYaml.restart = $svc.restart }
    if ($svc.labels) { $svcYaml.labels = $svc.labels }

    $compose.services[$k] = $svcYaml
}

# Minimal networks/volumes section for referenced named volumes
$namedVolumes = @{}
foreach ($k in $compose.services.Keys) {
    $svc = $compose.services[$k]
    if ($svc.volumes) {
        foreach ($v in $svc.volumes) {
            if ($v -match "^([^:]+):") {
                $name = $matches[1]
                # if host path absolute (starts with C:\ or /) skip volume declaration
                if ($name -notmatch '^[A-Za-z]:\\' -and $name -notmatch '^/') {
                    $namedVolumes[$name] = @{ }
                }
            }
        }
    }
}

$yaml = @()
$yaml += "version: '3.8'"
$yaml += "services:"
foreach ($k in $compose.services.Keys) {
    $svc = $compose.services[$k]
    $yaml += "  ${k}:"
    if ($svc.image) { $yaml += "    image: $($svc.image)" }
    if ($svc.command) { $yaml += "    command: $($svc.command)" }
    if ($svc.entrypoint) { $yaml += "    entrypoint: $($svc.entrypoint)" }
    if ($svc.ports) {
        $yaml += "    ports:"
        foreach ($p in $svc.ports) { $yaml += "      - '$p'" }
    }
    if ($svc.environment) {
        $yaml += "    environment:"
        foreach ($e in $svc.environment) { $yaml += "      - '$e'" }
    }
    if ($svc.volumes) {
        $yaml += "    volumes:"
        foreach ($v in $svc.volumes) { $yaml += "      - '$v'" }
    }
    if ($svc.restart) { $yaml += "    restart: $($svc.restart)" }
    if ($svc.labels) {
        $yaml += "    labels:"
        foreach ($labelKey in $svc.labels.Keys) { $yaml += "      ${labelKey}: '$($svc.labels[$labelKey])'" }
    }
}

if ($namedVolumes.Keys.Count -gt 0) {
    $yaml += "volumes:"
    foreach ($nv in $namedVolumes.Keys) { $yaml += "  ${nv}: {}" }
}

$yaml -join "`n" | Out-File -FilePath $Output -Encoding utf8
Write-Host "Generated compose: $Output" -ForegroundColor Green
Write-Host "Review the file for secrets, host paths, or sensitive data before use." -ForegroundColor Yellow
