<#
.SYNOPSIS
Read docker-compose.detected.yml, add native healthchecks, auto-map host ports resolving collisions, and emit docker-compose.merged.yml + .env.sample

.DESCRIPTION
This helper reads the previously-generated docker-compose.detected.yml file and attempts to:
 - Add realistic native healthchecks for known services (e.g., neo4j -> neo4j-admin status)
 - Ensure a sensible restart policy (unless-stopped) is present
 - Auto-assign host ports for known container ports, resolving collisions by incrementing
 - Collect env var placeholders and write a .env.sample
 - Write the merged compose to docker-compose.merged.yml

Run locally after running the detection script.

.EXAMPLE
PS> .\merge-detected-compose.ps1 -Detected docker-compose.detected.yml -Merged docker-compose.merged.yml -EnvOut .env.sample
#>

param(
    [string]$Detected = "docker-compose.detected.yml",
    [string]$Merged = "docker-compose.merged.yml",
    [string]$EnvOut = ".env.sample"
)

function Abort($msg) { Write-Error $msg; exit 1 }

if (-not (Test-Path $Detected)) { Abort "Detected compose file not found: $Detected" }

if (-not (Get-Command ConvertFrom-Yaml -ErrorAction SilentlyContinue)) {
    Write-Host "ConvertFrom-Yaml / ConvertTo-Yaml not available in this PowerShell. Please install PowerShell 7+ or add a YAML helper module." -ForegroundColor Yellow
    Abort "ConvertFrom-Yaml required"
}

$raw = Get-Content -Raw -Path $Detected
$compose = $raw | ConvertFrom-Yaml
if (-not $compose.services) { Abort "No services found in detected compose" }

# Known default container ports for common services
$defaults = @{
    neo4j = @(7474,7687)
    postgres = @(5432)
    redis = @(6379)
    minio = @(9000,9001)
    qdrant = @(6333)
    ollama = @(11434)
    sveltekit = @(5173)
    sveltekit-dev = @(5174)
    elasticsearch = @(9200)
    kibana = @(5601)
}

# utility: parse host port if mapping like "host:container" or "host:container/proto"
function Get-HostPortFromMapping($map) {
    if ($map -match '^(\d+):') { return [int]$matches[1] }
    return $null
}

# build used host ports set from existing explicit mappings
$used = [System.Collections.Generic.HashSet[int]]::new()
foreach ($svc in $compose.services.Values) {
    if ($svc.ports) {
        foreach ($p in $svc.ports) {
            $hp = Get-HostPortFromMapping $p
            if ($hp) { $used.Add($hp) | Out-Null }
        }
    }
}

# helper to test local port availability
function Is-Port-InUse([int]$port) {
    try {
        $r = Test-NetConnection -ComputerName '127.0.0.1' -Port $port -WarningAction SilentlyContinue
        return $r.TcpTestSucceeded
    } catch {
        # If Test-NetConnection is missing, assume not in use
        return $false
    }
}

# helper to find next free port starting at desired
function Find-FreePort([int]$start) {
    $p = $start
    while ($used.Contains($p) -or (Is-Port-InUse -port $p)) { $p++ }
    $used.Add($p) | Out-Null
    return $p
}

# collect env placeholders
$envPlaceholders = @{}

# process each service
foreach ($svcName in $compose.services.Keys) {
    $svc = $compose.services[$svcName]
    $image = ($svc.image -as [string]) -or ''
    $lowerImg = $image.ToLower()

    # Ensure restart policy
    if (-not $svc.restart) { $svc.restart = 'unless-stopped' }

    # Add native healthchecks for known images
    if ($lowerImg -match 'neo4j') {
        # prefer neo4j-admin status (available in the image)
        $svc.healthcheck = @{ test = @('CMD-SHELL', 'neo4j-admin status || exit 1'); interval = '30s'; timeout = '5s'; retries = 5 }
    } elseif ($lowerImg -match 'postgres') {
        # check pg_isready
        $svc.healthcheck = @{ test = @('CMD-SHELL', 'pg_isready -U postgres || exit 1'); interval = '20s'; timeout = '5s'; retries = 5 }
    } elseif ($lowerImg -match 'redis') {
        $svc.healthcheck = @{ test = @('CMD', 'redis-cli', 'ping'); interval = '20s'; timeout = '5s'; retries = 3 }
    } elseif ($lowerImg -match 'minio') {
        $svc.healthcheck = @{ test = @('CMD-SHELL', 'curl -fsS http://localhost:9000/minio/health/live || exit 1'); interval = '30s'; timeout = '5s'; retries = 5 }
    } elseif ($lowerImg -match 'qdrant') {
        $svc.healthcheck = @{ test = @('CMD-SHELL', 'curl -fsS http://localhost:6333/health || exit 1'); interval = '30s'; timeout = '5s'; retries = 5 }
    }

    # ports mapping: if already explicit keep, otherwise try defaults
    $finalPorts = @()
    if ($svc.ports -and $svc.ports.Count -gt 0) {
        # normalize existing ports and capture used
        foreach ($p in $svc.ports) {
            $hp = Get-HostPortFromMapping $p
            if ($hp) { $used.Add($hp) | Out-Null }
            $finalPorts += $p
        }
    } else {
        # pick defaults based on image or service name
        $candidatePorts = @()
        foreach ($k in $defaults.Keys) {
            if ($lowerImg -match $k -or $svcName.ToLower() -match $k) {
                $candidatePorts = $defaults[$k]
                break
            }
        }
        if ($candidatePorts.Count -gt 0) {
            foreach ($cp in $candidatePorts) {
                $hp = Find-FreePort $cp
                $finalPorts += "${hp}:${cp}"
            }
        }
    }
    if ($finalPorts.Count -gt 0) { $svc.ports = $finalPorts }

    # collect env placeholders if env uses ${VAR}
    if ($svc.environment) {
        foreach ($e in $svc.environment) {
            if ($e -match '^(.+?)=(\$\{?([A-Za-z0-9_:-]+)\}?)') {
                $var = $matches[3]
                if ($var) { $envPlaceholders[$var] = "REPLACE_ME" }
            } elseif ($e -match '^(.+?)=(.*)$') {
                $k = $matches[1]; $v = $matches[2]
                # if value looks like ${VAR} or contains placeholder
                if ($v -match '\$\{?([A-Za-z0-9_:-]+)\}?') {
                    $envPlaceholders[$matches[1]] = 'REPLACE_ME'
                }
            }
        }
    }

    # write back modifications
    $compose.services[$svcName] = $svc
}

# write .env.sample
$envLines = @()
foreach ($key in $envPlaceholders.Keys) { $envLines += "# set $key"; $envLines += "$key=$($envPlaceholders[$key])"; $envLines += "" }
if ($envLines.Count -gt 0) {
    $envLines | Out-File -FilePath $EnvOut -Encoding utf8
    Write-Host "Wrote env sample: $EnvOut"
} else {
    Write-Host "No env placeholders detected; skipping $EnvOut"
}

# dump merged compose
$yaml = $compose | ConvertTo-Yaml -Depth 10
Set-Content -Path $Merged -Value $yaml -Encoding utf8
Write-Host "Wrote merged compose: $Merged"

# quick summary of mapped ports
Write-Host "Port mapping summary:" -ForegroundColor Cyan
foreach ($svcName in $compose.services.Keys) {
    $s = $compose.services[$svcName]
    if ($s.ports) { Write-Host " - $svcName -> $($s.ports -join ', ')" }
}

Write-Host "Done. Review $Merged and $EnvOut before running 'docker compose up'." -ForegroundColor Green
