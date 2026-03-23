param(
    [switch]$Json
)

$ErrorActionPreference = 'SilentlyContinue'

function Write-Status($name, $ok, $detail) {
    if ($Json) {
        return [pscustomobject]@{ service = $name; status = $(if ($ok) { 'UP' } else { 'DOWN' }); detail = $detail }
    } else {
        $status = if ($ok) { 'OK' } else { 'FAIL' }
        Write-Host ("{0,-28} : {1} {2}" -f $name, $status, $detail)
    }
}

function Check-Port($name, [int]$port) {
    try {
        $r = Test-NetConnection -ComputerName localhost -Port $port -WarningAction SilentlyContinue
        return Write-Status $name $($r.TcpTestSucceeded) ("port {0}" -f $port)
    } catch {
        return Write-Status $name $false ("port {0}" -f $port)
    }
}

function Check-Http($name, $url) {
    try {
        $resp = Invoke-WebRequest -Uri $url -TimeoutSec 3 -UseBasicParsing
        $ok = $resp.StatusCode -ge 200 -and $resp.StatusCode -lt 400
        return Write-Status $name $ok ("{0} => {1}" -f $url, $resp.StatusCode)
    } catch {
        return Write-Status $name $false ("{0} => no response" -f $url)
    }
}

$results = @()

# HTTP endpoints
$results += Check-Http 'Frontend (5174)' 'http://localhost:5174/'
$results += Check-Http 'Frontend (5177)' 'http://localhost:5177/'
$results += Check-Http 'Frontend (5178)' 'http://localhost:5178/'
$results += Check-Http 'GPU Server (8097)' 'http://localhost:8097/health'
$results += Check-Http 'MinIO API (4002)' 'http://localhost:4002/minio/health/live'
$results += Check-Http 'MinIO Console (4003)' 'http://localhost:4003/'
$results += Check-Http 'Qdrant (6333)' 'http://localhost:6333/collections'
$results += Check-Http 'Ollama (11434)' 'http://localhost:11434/api/version'

# TCP ports
$results += Check-Port 'PostgreSQL (5432)' 5432
$results += Check-Port 'Redis (6379)' 6379
$results += Check-Port 'Redis (4005)' 4005

if ($Json) {
    $results | ConvertTo-Json -Depth 4
}
