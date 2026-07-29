<#
.SYNOPSIS
Phase 88: CouchDB quickstart

.DESCRIPTION
Starts CouchDB, creates the system databases, and verifies access.
#>

param(
    [switch]$SkipDocker
)

$ErrorActionPreference = 'Stop'
$couchdbName = 'phase87-couchdb'
$couchdbUser = $env:COUCHDB_USER
if (-not $couchdbUser) { $couchdbUser = 'admin' }
$couchdbPassword = $env:COUCHDB_PASSWORD
if (-not $couchdbPassword) { $couchdbPassword = 'deeds123' }
$authBytes = [System.Text.Encoding]::ASCII.GetBytes("$couchdbUser`:$couchdbPassword")
$authToken = [Convert]::ToBase64String($authBytes)
$authHeaders = @{ Authorization = "Basic $authToken" }
$systemDatabases = @('_users', '_replicator', '_global_changes')

Write-Host 'Phase 88 CouchDB quickstart' -ForegroundColor Cyan

if (-not $SkipDocker) {
    $existing = docker ps --filter "publish=5984" --format "{{.Names}}"
    if ($existing) {
        Write-Host "Using existing CouchDB container(s) on port 5984: $($existing -join ', ')" -ForegroundColor Gray
    } else {
        docker run -d `
            --name $couchdbName `
            --network deeds-web-app_legal-ai-network `
            -p 5984:5984 `
            -e COUCHDB_USER=admin `
            -e COUCHDB_PASSWORD=$couchdbPassword `
            -v couchdb_data:/opt/couchdb/data `
            -v "${PSScriptRoot}\..\..\docker\couchdb\local.d\10-single-node.ini:/opt/couchdb/etc/local.d/10-single-node.ini:ro" `
            couchdb:3.3 | Out-Null
        Start-Sleep -Seconds 10
    }
}

$health = Invoke-RestMethod -Uri 'http://127.0.0.1:5984/_up' -Method Get -TimeoutSec 10
if ($health.status -ne 'ok') {
    throw 'CouchDB did not report healthy.'
}

foreach ($database in $systemDatabases) {
    try {
        $result = Invoke-RestMethod `
            -Uri "http://127.0.0.1:5984/$database" `
            -Headers $authHeaders `
            -Method Put `
            -TimeoutSec 10 `
            -ErrorAction Stop

        if ($result.ok) {
            Write-Host "Created system database: $database" -ForegroundColor Green
        }
    } catch {
        $statusCode = $null
        if ($_.Exception.Response) {
            $statusCode = [int]$_.Exception.Response.StatusCode
        }

        if ($statusCode -eq 412) {
            Write-Host "System database already exists: $database" -ForegroundColor Gray
        } elseif ($statusCode -eq 401) {
            throw 'CouchDB admin authentication failed.'
        } else {
            throw
        }
    }
}

$allDbs = Invoke-RestMethod -Uri 'http://127.0.0.1:5984/_all_dbs' -Headers $authHeaders -Method Get -TimeoutSec 10
Write-Host "Databases: $($allDbs -join ', ')" -ForegroundColor Gray
Write-Host 'CouchDB quickstart complete.' -ForegroundColor Green
