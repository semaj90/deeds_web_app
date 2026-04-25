<#
.SYNOPSIS
  Phase46 Full Pipeline Orchestrator
  Starts backend stack, runs adapter, ingests docs, executes full RAG pipeline.
#>

[CmdletBinding()]
param(
    [string]$DocsDir,
    [int]$AdapterPort = 8092,
    [string]$ComposeFile
)

$ErrorActionPreference = 'Stop'

function Write-Step {
    param([string]$Message)
    Write-Host "[phase46] $Message"
}

function Wait-ForPort {
    param(
        [int]$Port,
        [string]$Name,
        [int]$TimeoutSeconds = 120
    )

    $elapsed = 0
    while ($true) {
        try {
            $tcp = Test-NetConnection -ComputerName 'localhost' -Port $Port -WarningAction SilentlyContinue
            if ($tcp.TcpTestSucceeded) {
                Write-Step "$Name is accepting connections on port $Port."
                break
            }
        } catch {
            Start-Sleep -Seconds 1
        }

        Start-Sleep -Seconds 2
        $elapsed += 2
        if ($elapsed -ge $TimeoutSeconds) {
            Write-Step "Timeout while waiting for $Name on port $Port. Continuing anyway."
            break
        }
    }
}

function Wait-ForHttp {
    param(
        [string]$Url,
        [string]$Name,
        [int]$TimeoutSeconds = 120
    )

    $elapsed = 0
    while ($true) {
        try {
            $response = Invoke-WebRequest -Uri $Url -UseBasicParsing -TimeoutSec 5
            if ($response.StatusCode -ge 200 -and $response.StatusCode -lt 400) {
                Write-Step "$Name responded successfully at $Url."
                break
            }
        } catch {
            Start-Sleep -Seconds 2
        }

        $elapsed += 2
        if ($elapsed -ge $TimeoutSeconds) {
            Write-Step "Timeout while waiting for $Name at $Url. Continuing anyway."
            break
        }
    }
}

function Get-ServiceContainerId {
    param(
        [string]$ServiceName
    )

    $containerId = docker compose -f $ComposeFile ps -q $ServiceName 2>$null
    return $containerId
}

function Safe-DockerExec {
    param(
        [string]$ServiceName,
        [string[]]$Command
    )

    $containerId = Get-ServiceContainerId -ServiceName $ServiceName
    if (-not $containerId) {
        Write-Step "Skipping $ServiceName command; service not available."
        return
    }

    docker exec $containerId @Command
}

Write-Step "Orchestration starting..."

Push-Location (Join-Path $PSScriptRoot '..')
try {
    if (-not $DocsDir) {
        $DocsDir = Join-Path $PWD 'web_docs'
    }

    if (-not $ComposeFile) {
        $ComposeFile = Join-Path $PWD 'docker-compose-vector-384.yml'
    }

    if (-not (Test-Path $ComposeFile)) {
        throw "Compose file '$ComposeFile' not found. Provide the correct -ComposeFile path."
    }

    $availableServices = docker compose -f $ComposeFile config --services 2>$null | Where-Object { $_ } | ForEach-Object { $_.Trim() }
    if (-not $availableServices) {
        throw "No services found in compose file '$ComposeFile'."
    }

    $serviceDefinitions = @(
        @{ Name = 'redis'; Display = 'Redis'; Health = 'port'; Port = 6379 },
        @{ Name = 'postgres'; Display = 'Postgres'; Health = 'port'; Port = 5432 },
        @{ Name = 'minio'; Display = 'MinIO'; Health = 'port'; Port = 9000 },
        @{ Name = 'qdrant'; Display = 'Qdrant'; Health = 'http'; Url = 'http://localhost:6333/health' }
    )

    $servicesToManage = $serviceDefinitions | Where-Object { $availableServices -contains $_.Name }
    if (-not ($servicesToManage | Where-Object { $_.Name -in @('redis','postgres') })) {
        throw "Compose file '$ComposeFile' must include at least redis and postgres services for the pipeline."
    }

    # --- 1️⃣ Start backend services ---
    Write-Host "🚀 Starting Docker services: redis, postgres, neo4j, minio, qdrant..."
    docker compose -f docker-compose-full-stack-384.yml up -d redis postgres neo4j qdrant minio

    # --- 2️⃣ Health checks ---
    function Wait-For-Port($port, $name) {
        param(
            [int]$port,
            [string]$name
        )

        Wait-ForPort -Port $port -Name $name -TimeoutSeconds 60
    }

    Wait-For-Port 7687 "Neo4j"
    Wait-For-Port 9000 "MinIO"
    Wait-For-Port 6333 "Qdrant"

    # --- 3️⃣ Create MinIO bucket if missing ---
    Write-Host "📦 Ensuring MinIO bucket 'web_docs' exists..."
    docker exec -it legal-minio-384 mc alias set local http://localhost:9000 minioadmin minioadmin123 2>$null
    docker exec -it legal-minio-384 mc mb local/web_docs 2>$null

    # --- 4️⃣ Start Python Adapter ---
    Write-Host "⚙️ Starting Python adapter (doc_ingest) on port $AdapterPort..."
    $adapter = Start-Process -NoNewWindow -PassThru \
        -FilePath ".\.venv-phase46\Scripts\python.exe" \
        -ArgumentList "-m","uvicorn","python-services.doc_ingest:app","--host","0.0.0.0","--port",$AdapterPort
    Start-Sleep -Seconds 5

    # --- 5️⃣ Start Phase47 Graph Analyzer ---
    Write-Host "🧠 Starting Phase47 Graph Analyzer on port 8093..."
    $analyzer = Start-Process -NoNewWindow -PassThru \
        -FilePath ".\.venv-phase46\Scripts\python.exe" \
        -ArgumentList "-m","uvicorn","python-services.phase47_graph_analyzer:app","--host","0.0.0.0","--port","8093"
    Start-Sleep -Seconds 5

    # --- 6️⃣ Run AST Exporter ---
    Write-Host "✨ Running AST Exporter..."
    $env:PHASE47_GRAPH_URL = "http://localhost:8093"
    npx tsx go-microservice/cmd/phase47_astgraph.ts

    # --- 7️⃣ Ingest all docs from $DocsDir ---
    if (!(Test-Path $DocsDir)) {
        Write-Step "Docs directory was missing at $DocsDir. Creating it now."
        New-Item -ItemType Directory -Path $DocsDir -Force | Out-Null
    }

    $files = Get-ChildItem -Path $DocsDir -File
    if ($files.Count -eq 0) {
        Write-Step "No files found in $DocsDir. Skipping ingestion upload step."
    } else {
        foreach ($file in $files) {
            Write-Step ("Uploading {0}..." -f $file.Name)
            try {
                Invoke-RestMethod -Uri "http://127.0.0.1:$AdapterPort/upload" -Method Post -Form @{
                    file = Get-Item $file.FullName
                    source = 'typescript'
                } | Out-Null
            } catch {
                Write-Warning ("Failed to upload {0}: {1}" -f $file.Name, $_)
            }
        }

        Write-Step ("Uploaded {0} document(s) to adapter." -f $files.Count)
    }

    # --- 8️⃣ Run the Node pipeline ---
    Write-Host "🧠 Running Phase46 full pipeline..."
    $env:PHASE46_PIPELINE_AGENTIC = "1"
    npm run phase46-full-pipeline

    # --- 9️⃣ Verify data flow ---
    Write-Host "🔎 Verifying Redis, pgvector, Neo4j, and Qdrant..."
    docker exec -it legal-redis-384 redis-cli dbsize
    docker exec -it legal-postgres-384 psql -U legal_admin -d legal_ai_db -c "SELECT COUNT(*) FROM document_embeddings;"
    docker exec -it legal-neo4j-384 cypher-shell -u neo4j -p password "MATCH (d:Document)-[r:RELATED]->() RETURN COUNT(r);"
    docker exec -it legal-qdrant-384 curl -s http://localhost:6333/collections

    # --- 🔟 Done ---
    Write-Host "`n🎉 Phase46 pipeline complete!"
    Write-Host "Adapter PID: $($adapter.Id)"
    Write-Host "Analyzer PID: $($analyzer.Id)"
    Write-Host "Stop them anytime via: Stop-Process -Id $($adapter.Id), Stop-Process -Id $($analyzer.Id)"
} finally {
    Pop-Location
}
