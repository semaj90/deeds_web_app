<#
Generate a .env.local file with resolved service URLs based on running Docker containers.

Usage:
  pwsh ./scripts/generate-docker-env.ps1           # Will attempt to detect containers and write .env.local
  pwsh ./scripts/generate-docker-env.ps1 -Preview  # Print what would be written (dry-run)
  pwsh ./scripts/generate-docker-env.ps1 -Force    # Overwrite .env.local without prompting

Notes:
 - This script runs locally and requires Docker CLI available in PATH.
 - If Docker is not reachable from this environment, run the script on your machine where Docker is available.
 - The script is conservative: it will only set env vars for services it can reasonably detect.
#>

[CmdletBinding()]
param(
    [switch]$Preview,
    [switch]$Force
)

function Write-Log($msg, $level = 'INFO') {
    $color = if ($level -eq 'ERROR') { 'Red' } elseif ($level -eq 'WARN') { 'Yellow' } else { 'Green' }
    Write-Host "[$level] $msg" -ForegroundColor $color
}

function Run-DockerPs {
    try {
        $out = docker ps --format "{{.Names}}||{{.Image}}||{{.Ports}}" 2>&1
        if ($LASTEXITCODE -ne 0) {
            Write-Log "Docker command failed: $out" 'ERROR'
            return $null
        }
        return $out -split "`n" | Where-Object { $_ -ne '' }
    } catch {
        Write-Log "Docker command threw an exception: $_" 'ERROR'
        return $null
    }
}

function Parse-PortMapping($portsField) {
    # Example ports string: "0.0.0.0:5432->5432/tcp, :::5432->5432/tcp"
    if (-not $portsField) { return @() }
    $maps = $portsField -split ',' | ForEach-Object { $_.Trim() }
    $results = @()
    foreach ($m in $maps) {
        if ($m -match '^(?:\d+\.\d+\.\d+\.\d+:)?(\d+)->(\d+)/') {
            $hostPort = $matches[1]
            $containerPort = $matches[2]
            $results += [PSCustomObject]@{ HostPort = $hostPort; ContainerPort = $containerPort }
        } elseif ($m -match '^(?:\[::\]:)?(\d+)->(\d+)/') {
            $hostPort = $matches[1]
            $containerPort = $matches[2]
            $results += [PSCustomObject]@{ HostPort = $hostPort; ContainerPort = $containerPort }
        } elseif ($m -match '^(\d+)/(tcp|udp)$') {
            $results += [PSCustomObject]@{ HostPort = $matches[1]; ContainerPort = $matches[1] }
        }
    }
    return $results
}

$serviceDefaults = {
    return @{
        postgres = @{ EnvName = 'DATABASE_URL'; Default = 'postgresql://postgres:postgres@localhost:5432/legal_ai_db'; Ports = @(5432) }
        redis    = @{ EnvName = 'REDIS_URL'; Default = 'redis://localhost:6379'; Ports = @(6379) }
        qdrant   = @{ EnvName = 'QDRANT_URL'; Default = 'http://localhost:6333'; Ports = @(6333) }
        rabbitmq = @{ EnvName = 'RABBITMQ_URL'; Default = 'amqp://guest:guest@localhost:5672'; Ports = @(5672,15672) }
        minio    = @{ EnvName = 'MINIO_URL'; Default = 'http://localhost:9000'; Ports = @(9000,9001) }
        ollama   = @{ EnvName = 'OLLAMA_URL'; Default = 'http://localhost:11434'; Ports = @(11434) }
        triton   = @{ EnvName = 'TRITON_URL'; Default = 'http://localhost:8000'; Ports = @(8000) }
    }
}

Write-Log "Starting .env.local generation (preview=$Preview)"

$rows = Run-DockerPs
if ($null -eq $rows) {
    Write-Log "No docker output. Docker may not be reachable; continuing with defaults." 'WARN'
    $rows = @()
}

$detected = @{}

foreach ($row in $rows) {
    $parts = $row -split '\|\|'
    if ($parts.Length -lt 3) { continue }
    $name = $parts[0]
    $image = $parts[1]
    $ports = $parts[2]

    $serviceKey = $null
    if ($name -match 'postgres' -or $image -match 'postgres') { $serviceKey = 'postgres' }
    elseif ($name -match 'redis' -or $image -match 'redis') { $serviceKey = 'redis' }
    elseif ($name -match 'qdrant' -or $image -match 'qdrant') { $serviceKey = 'qdrant' }
    elseif ($name -match 'rabbit' -or $image -match 'rabbit') { $serviceKey = 'rabbitmq' }
    elseif ($name -match 'minio' -or $image -match 'minio') { $serviceKey = 'minio' }
    elseif ($name -match 'ollama' -or $image -match 'ollama') { $serviceKey = 'ollama' }
    elseif ($name -match 'triton' -or $image -match 'triton') { $serviceKey = 'triton' }

    if ($serviceKey) {
        $maps = Parse-PortMapping $ports
        $detected[$serviceKey] = @{ Name = $name; Image = $image; Ports = $maps }
    }
}

if ($detected.Count -eq 0) {
    Write-Log "No known services detected from 'docker ps' output. Will write defaults." 'WARN'
}

$envLines = @()

$defaults = & $serviceDefaults

# Attempt to detect WSL host IP (useful when Windows host exposes services to WSL2)
function Get-WSLHostIP {
    try {
        # Read resolv.conf inside default WSL distro to find the nameserver (Windows host IP)
        $res = wsl cat /etc/resolv.conf 2>$null
        if ($LASTEXITCODE -ne 0 -or -not $res) { return $null }
        foreach ($line in $res -split "`n") {
            if ($line -match 'nameserver\s+([0-9]+\.[0-9]+\.[0-9]+\.[0-9]+)') {
                return $matches[1].Trim()
            }
        }
    } catch {
        return $null
    }
    return $null
}

$wslIp = Get-WSLHostIP
if ($wslIp) {
    Write-Log "Detected WSL host IP: $wslIp - preferring it for OLLAMA_URL" 'INFO'
    # prefer WSL host for Ollama access if present
    $defaults['ollama'].Default = "http://$wslIp:11434"
}

foreach ($k in $defaults.Keys) {
    $conf = $defaults[$k]
        if ($detected.ContainsKey($k)) {
        $entry = $detected[$k]
        # prefer host port mapped to container port if available
        $svcHost = 'localhost'
        $port = ($conf.Ports | Select-Object -First 1)
        if ($entry.Ports -and $entry.Ports.Count -gt 0) {
            # try to find a mapping for any of the container ports we care about
            $match = $entry.Ports | Where-Object { $conf.Ports -contains ([int]$_.ContainerPort) } | Select-Object -First 1
            if ($match) { $port = [int]$match.HostPort }
        }
        switch ($k) {
            'postgres' { $val = "postgresql://postgres:postgres@${svcHost}:${port}/legal_ai_db" }
            'redis'    { $val = "redis://${svcHost}:${port}" }
            'qdrant'   { $val = "http://${svcHost}:${port}" }
            'rabbitmq' { $val = "amqp://guest:guest@${svcHost}:${port}" }
            'minio'    { $val = "http://${svcHost}:${port}" }
            'ollama'   { $val = "http://${svcHost}:${port}" }
            'triton'   { $val = "http://${svcHost}:${port}" }
            default    { $val = $conf.Default }
        }
    } else {
        $val = $conf.Default
    }
    $envLines += "$($conf.EnvName)=$val"
}

$envFile = Join-Path -Path (Get-Location) -ChildPath '.env.local'

if ($Preview) {
    Write-Log ".env.local content (preview):" 'INFO'
    $envLines | ForEach-Object { Write-Host $_ }
    Write-Log "Preview mode - not writing file." 'INFO'
    exit 0
}

if (Test-Path $envFile) {
    if ($Force) {
        Write-Log "-Force given: will overwrite existing .env.local" 'INFO'
        try {
            $envLines | Out-File -FilePath $envFile -Encoding utf8
            Write-Log ".env.local written to $envFile (overwritten)" 'INFO'
        } catch {
            Write-Log "Failed to write .env.local: $_" 'ERROR'
            exit 1
        }
    } else {
        Write-Host "A .env.local file already exists at $envFile. Choose action: (O)verwrite / (M)erge / (C)ancel" -NoNewline
        $resp = Read-Host
        switch ($resp.ToUpper()) {
            'O' {
                try {
                    $envLines | Out-File -FilePath $envFile -Encoding utf8
                    Write-Log ".env.local written to $envFile (overwritten)" 'INFO'
                } catch {
                    Write-Log "Failed to write .env.local: $_" 'ERROR'
                    exit 1
                }
            }
            'M' {
                try {
                    # Preserve comments and ordering from the existing file while updating values.
                    $existingLines = Get-Content -Path $envFile -ErrorAction SilentlyContinue
                    $newMap = @{}
                    foreach ($l in $envLines) {
                        $eq = $l.IndexOf('=')
                        if ($eq -gt 0) {
                            $k = $l.Substring(0, $eq).Trim()
                            $v = $l.Substring($eq + 1).Trim()
                            $newMap[$k] = $v
                        }
                    }

                    $outLines = @()
                    $seen = @{}
                    foreach ($line in $existingLines) {
                        if ($line -match '^\s*#') {
                            # comment - keep as-is
                            $outLines += $line
                            continue
                        }
                        if ($line -match '^\s*$') {
                            $outLines += $line
                            continue
                        }
                        $eq = $line.IndexOf('=')
                        if ($eq -gt 0) {
                            $k = $line.Substring(0, $eq).Trim()
                            if ($newMap.ContainsKey($k)) {
                                $outLines += "$k=$($newMap[$k])"
                                $seen[$k] = $true
                            } else {
                                $outLines += $line
                                $seen[$k] = $true
                            }
                        } else {
                            $outLines += $line
                        }
                    }

                    # Append any new keys not present in the existing file
                    $toAppend = $newMap.Keys | Where-Object { -not $seen.ContainsKey($_) }
                    if ($toAppend.Count -gt 0) {
                        $outLines += ''
                        $outLines += '# Added by generate-docker-env.ps1'
                        foreach ($k in $toAppend) {
                            $outLines += "$k=$($newMap[$k])"
                        }
                    }

                    $outLines | Out-File -FilePath $envFile -Encoding utf8
                    Write-Log ".env.local written to $envFile (merged, comments preserved)" 'INFO'
                } catch {
                    Write-Log "Failed to merge/write .env.local: $_" 'ERROR'
                    exit 1
                }
            }
            default {
                Write-Log 'Aborting - not modifying .env.local' 'WARN'
                exit 0
            }
        }
    }
} else {
    try {
        $envLines | Out-File -FilePath $envFile -Encoding utf8
        Write-Log ".env.local written to $envFile" 'INFO'
    } catch {
        Write-Log "Failed to write .env.local: $_" 'ERROR'
        exit 1
    }
}

Write-Log "Done. Review .env.local and restart services as needed." 'INFO'
