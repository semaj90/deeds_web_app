#!/usr/bin/env pwsh
<#
.SYNOPSIS
    Phase 89: Complete System Wiring Verification
.DESCRIPTION
    Verifies all data stores, caches, and integrations are properly connected:
    - PostgreSQL tables and row counts
    - Redis cache keys and hit rates
    - Qdrant collections and point counts
    - File system outputs
    - GPU/CUDA availability
    - Learning loop integrity
.EXAMPLE
    .\scripts\phase89-verify-wiring.ps1
    .\scripts\phase89-verify-wiring.ps1 -Detailed
#>

param(
    [switch]$Detailed = $false
)

Write-Host "`n🔌 Phase 89: System Wiring Verification`n" -ForegroundColor Cyan

$script:errors = @()
$script:warnings = @()
$script:success = @()

function Test-PostgreSQL {
    Write-Host "1️⃣  PostgreSQL Truth Source..." -ForegroundColor Yellow

    try {
        # Test connection
        $connTest = docker exec phase66-postgres psql -U legal_admin -d legal_ai_db -c "SELECT 1;" 2>&1
        if ($LASTEXITCODE -ne 0) {
            $script:errors += "PostgreSQL connection failed"
            Write-Host "   ❌ Connection failed" -ForegroundColor Red
            return
        }

        # Get counts
        $query = @"
SELECT
  (SELECT COUNT(*) FROM phase89_error_instances) as instances,
  (SELECT COUNT(*) FROM phase89_embeddings) as embeddings,
  (SELECT COUNT(*) FROM phase89_fix_attempts) as fixes,
  (SELECT COUNT(*) FROM phase89_kb_cards) as kb_cards,
  (SELECT COUNT(*) FROM kag_nodes) as kag_nodes,
  (SELECT COUNT(*) FROM kag_edges) as kag_edges
"@

        $result = docker exec phase66-postgres psql -U legal_admin -d legal_ai_db -t -c $query 2>&1

        if ($result -match '(\d+)\s*\|\s*(\d+)\s*\|\s*(\d+)\s*\|\s*(\d+)\s*\|\s*(\d+)\s*\|\s*(\d+)') {
            $instances = [int]$matches[1]
            $embeddings = [int]$matches[2]
            $fixes = [int]$matches[3]
            $kbCards = [int]$matches[4]
            $kagNodes = [int]$matches[5]
            $kagEdges = [int]$matches[6]

            Write-Host "   ✅ phase89_error_instances: $instances rows" -ForegroundColor Green

            if ($embeddings -gt 0) {
                $dedupeRatio = [math]::Round($instances / $embeddings, 2)
                Write-Host "   ✅ phase89_embeddings: $embeddings rows (dedupe ratio: ${dedupeRatio}x)" -ForegroundColor Green
                $script:success += "Dedupe ratio: ${dedupeRatio}x (${embeddings} unique embeddings)"
            } else {
                $script:warnings += "No embeddings found - run incremental-embedder.mjs"
                Write-Host "   ⚠️  phase89_embeddings: 0 rows (need to run embedder)" -ForegroundColor Yellow
            }

            Write-Host "   ✅ phase89_fix_attempts: $fixes rows" -ForegroundColor Green
            Write-Host "   ✅ phase89_kb_cards: $kbCards rows" -ForegroundColor Green

            if ($kagNodes -gt 0) {
                Write-Host "   ✅ kag_nodes: $kagNodes rows" -ForegroundColor Green
                Write-Host "   ✅ kag_edges: $kagEdges rows" -ForegroundColor Green
                $script:success += "Knowledge graph active: $kagNodes nodes, $kagEdges edges"
            } else {
                Write-Host "   ℹ️  Knowledge graph empty (will populate after fixes)" -ForegroundColor Gray
            }

            if ($Detailed) {
                # Status breakdown
                Write-Host "`n   📊 Error Status Breakdown:" -ForegroundColor Cyan
                $statusQuery = "SELECT status, COUNT(*) FROM phase89_error_instances GROUP BY status ORDER BY COUNT(*) DESC;"
                docker exec phase66-postgres psql -U legal_admin -d legal_ai_db -c $statusQuery
            }

        } else {
            $script:errors += "Failed to parse PostgreSQL counts"
            Write-Host "   ❌ Failed to parse counts" -ForegroundColor Red
        }

    } catch {
        $script:errors += "PostgreSQL error: $_"
        Write-Host "   ❌ Error: $_" -ForegroundColor Red
    }

    Write-Host ""
}

function Test-Redis {
    Write-Host "2️⃣  Redis Cache Layer..." -ForegroundColor Yellow

    try {
        # Test connection
        $ping = docker exec -it phase66-redis redis-cli PING 2>&1
        if ($ping -notmatch "PONG") {
            $script:errors += "Redis connection failed"
            Write-Host "   ❌ Connection failed" -ForegroundColor Red
            return
        }

        # Count keys by pattern
        $embKeys = (docker exec -it phase66-redis redis-cli --scan --pattern "emb:*" | Measure-Object -Line).Lines
        $phase89Keys = (docker exec -it phase66-redis redis-cli --scan --pattern "phase89:*" | Measure-Object -Line).Lines
        $topkKeys = (docker exec -it phase66-redis redis-cli --scan --pattern "topk:*" | Measure-Object -Line).Lines

        Write-Host "   ✅ Embedding cache keys: $embKeys" -ForegroundColor Green
        Write-Host "   ✅ Phase89 keys: $phase89Keys" -ForegroundColor Green
        Write-Host "   ✅ Top-K cache keys: $topkKeys" -ForegroundColor Green

        if ($embKeys -eq 0) {
            $script:warnings += "No embedding cache - first run will be slower"
        } else {
            $script:success += "Embedding cache active: $embKeys cached embeddings"
        }

        # Get cache hit stats
        if ($Detailed) {
            Write-Host "`n   📊 Redis Stats:" -ForegroundColor Cyan
            $stats = docker exec -it phase66-redis redis-cli INFO stats 2>&1
            $hits = ($stats | Select-String "keyspace_hits:(\d+)").Matches.Groups[1].Value
            $misses = ($stats | Select-String "keyspace_misses:(\d+)").Matches.Groups[1].Value

            if ($hits -and $misses) {
                $total = [int]$hits + [int]$misses
                if ($total -gt 0) {
                    $hitRate = [math]::Round(([int]$hits / $total) * 100, 2)
                    Write-Host "   Cache hit rate: ${hitRate}%" -ForegroundColor $(if ($hitRate -gt 60) { "Green" } else { "Yellow" })
                }
            }
        }

    } catch {
        $script:errors += "Redis error: $_"
        Write-Host "   ❌ Error: $_" -ForegroundColor Red
    }

    Write-Host ""
}

function Test-Qdrant {
    Write-Host "3️⃣  Qdrant Vector Storage..." -ForegroundColor Yellow

    try {
        # Get collections list
        $collections = curl -s http://127.0.0.1:6333/collections | ConvertFrom-Json

        if (-not $collections) {
            $script:errors += "Qdrant connection failed"
            Write-Host "   ❌ Connection failed" -ForegroundColor Red
            return
        }

        $expectedCollections = @(
            'phase89_ast_embeddings',
            'phase89_error_chunks',
            'phase89_error_clusters',
            'phase89_rag_patterns',
            'phase89_kb_cards'
        )

        foreach ($collectionName in $expectedCollections) {
            $info = curl -s "http://127.0.0.1:6333/collections/$collectionName" | ConvertFrom-Json

            if ($info.result) {
                $points = $info.result.points_count
                $status = $info.result.status

                if ($points -gt 0) {
                    Write-Host "   ✅ $collectionName : $points points ($status)" -ForegroundColor Green
                    $script:success += "${collectionName}: $points vectors indexed"
                } else {
                    Write-Host "   ⚠️  $collectionName : 0 points (needs indexing)" -ForegroundColor Yellow
                    $script:warnings += "$collectionName is empty"
                }
            } else {
                Write-Host "   ℹ️  $collectionName : Not created yet" -ForegroundColor Gray
            }
        }

        if ($Detailed) {
            Write-Host "`n   📊 Qdrant Details:" -ForegroundColor Cyan
            foreach ($collectionName in $expectedCollections) {
                $info = curl -s "http://127.0.0.1:6333/collections/$collectionName" | ConvertFrom-Json
                if ($info.result) {
                    Write-Host "   $collectionName :" -ForegroundColor Cyan
                    Write-Host "     - Vectors: $($info.result.config.params.vectors.size)" -ForegroundColor Gray
                    Write-Host "     - Distance: $($info.result.config.params.vectors.distance)" -ForegroundColor Gray
                    Write-Host "     - HNSW m: $($info.result.config.hnsw_config.m)" -ForegroundColor Gray
                }
            }
        }

    } catch {
        $script:errors += "Qdrant error: $_"
        Write-Host "   ❌ Error: $_" -ForegroundColor Red
    }

    Write-Host ""
}

function Test-CUDA {
    Write-Host "4️⃣  GPU/CUDA Availability..." -ForegroundColor Yellow

    try {
        $pythonPath = "C:\Users\james\Videos\deeds-web-app\.venv\Scripts\python.exe"

        $cudaCheck = & $pythonPath -c @"
import torch
print(f'CUDA:{torch.cuda.is_available()}')
if torch.cuda.is_available():
    print(f'Device:{torch.cuda.get_device_name(0)}')
    print(f'Memory:{torch.cuda.get_device_properties(0).total_memory // (1024**3)}GB')
"@ 2>&1

        if ($cudaCheck -match 'CUDA:True') {
            $device = ($cudaCheck | Select-String "Device:(.+)").Matches.Groups[1].Value
            $memory = ($cudaCheck | Select-String "Memory:(\d+)GB").Matches.Groups[1].Value

            Write-Host "   ✅ CUDA available: $device ($memory GB)" -ForegroundColor Green
            $script:success += "GPU acceleration ready: $device"
        } else {
            Write-Host "   ⚠️  CUDA not available (will use CPU)" -ForegroundColor Yellow
            $script:warnings += "No GPU detected - clustering will be slower"
        }

    } catch {
        Write-Host "   ⚠️  Cannot check CUDA: $_" -ForegroundColor Yellow
    }

    Write-Host ""
}

function Test-Ollama {
    Write-Host "5️⃣  Ollama Models..." -ForegroundColor Yellow

    try {
        $models = docker exec ollama-gemma ollama list 2>&1

        if ($models -match 'embeddinggemma:latest') {
            Write-Host "   ✅ embeddinggemma:latest installed" -ForegroundColor Green
        } else {
            $script:warnings += "embeddinggemma:latest not found"
            Write-Host "   ⚠️  embeddinggemma:latest NOT FOUND" -ForegroundColor Yellow
        }

        if ($models -match 'gemma3-legal:latest') {
            Write-Host "   ✅ gemma3-legal:latest installed" -ForegroundColor Green
        } else {
            $script:warnings += "gemma3-legal:latest not found"
            Write-Host "   ⚠️  gemma3-legal:latest NOT FOUND" -ForegroundColor Yellow
        }

    } catch {
        $script:errors += "Ollama error: $_"
        Write-Host "   ❌ Error: $_" -ForegroundColor Red
    }

    Write-Host ""
}

function Test-LearningLoop {
    Write-Host "6️⃣  Learning Loop Integrity..." -ForegroundColor Yellow

    try {
        # Check if KB cards are searchable after creation
        $query = @"
SELECT
  k.id,
  k.title,
  k.tags,
  f.success,
  k.created_at
FROM phase89_kb_cards k
LEFT JOIN phase89_fix_attempts f ON k.source_fix_attempt_id = f.id
ORDER BY k.created_at DESC
LIMIT 3;
"@

        $result = docker exec phase66-postgres psql -U legal_admin -d legal_ai_db -t -c $query 2>&1

        if ($result -match '\d+') {
            Write-Host "   ✅ KB cards linked to fix attempts" -ForegroundColor Green

            if ($Detailed) {
                Write-Host "`n   📊 Recent KB Cards:" -ForegroundColor Cyan
                docker exec phase66-postgres psql -U legal_admin -d legal_ai_db -c $query
            }

            # Verify KB cards are in Qdrant
            $kbInfo = curl -s "http://127.0.0.1:6333/collections/phase89_kb_cards" | ConvertFrom-Json
            if ($kbInfo.result.points_count -gt 0) {
                Write-Host "   ✅ KB cards indexed in Qdrant ($($kbInfo.result.points_count) vectors)" -ForegroundColor Green
                $script:success += "Learning loop active: KB auto-indexing working"
            } else {
                Write-Host "   ⚠️  KB cards not indexed in Qdrant yet" -ForegroundColor Yellow
                $script:warnings += "KB cards exist but not vectorized"
            }

        } else {
            Write-Host "   ℹ️  No KB cards yet (will populate after successful fixes)" -ForegroundColor Gray
        }

    } catch {
        Write-Host "   ⚠️  Cannot verify learning loop: $_" -ForegroundColor Yellow
    }

    Write-Host ""
}

function Test-FileSystem {
    Write-Host "7️⃣  File System Outputs..." -ForegroundColor Yellow

    $reportFiles = @(
        'reports/phase89-cuda-clustering-report.json',
        'reports/phase89-enhanced-pipeline-summary.json',
        'reports/phase89-agentic-summary.json'
    )

    foreach ($file in $reportFiles) {
        if (Test-Path $file) {
            $size = (Get-Item $file).Length
            Write-Host "   ✅ $file ($size bytes)" -ForegroundColor Green
        } else {
            Write-Host "   ℹ️  $file not generated yet" -ForegroundColor Gray
        }
    }

    # Check KB directory
    if (Test-Path "kb/phase89") {
        $kbFiles = (Get-ChildItem "kb/phase89" -File).Count
        if ($kbFiles -gt 0) {
            Write-Host "   ✅ KB markdown files: $kbFiles" -ForegroundColor Green
        } else {
            Write-Host "   ℹ️  KB directory exists but empty" -ForegroundColor Gray
        }
    } else {
        Write-Host "   ℹ️  KB directory will be created on first learn" -ForegroundColor Gray
    }

    Write-Host ""
}

function Show-Summary {
    Write-Host "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━" -ForegroundColor Cyan
    Write-Host "`n📊 Verification Summary`n" -ForegroundColor Cyan

    if ($script:errors.Count -gt 0) {
        Write-Host "❌ ERRORS ($($script:errors.Count)):" -ForegroundColor Red
        foreach ($err in $script:errors) {
            Write-Host "   • $err" -ForegroundColor Red
        }
        Write-Host ""
    }

    if ($script:warnings.Count -gt 0) {
        Write-Host "⚠️  WARNINGS ($($script:warnings.Count)):" -ForegroundColor Yellow
        foreach ($warn in $script:warnings) {
            Write-Host "   • $warn" -ForegroundColor Yellow
        }
        Write-Host ""
    }

    if ($script:success.Count -gt 0) {
        Write-Host "✅ SUCCESS ($($script:success.Count)):" -ForegroundColor Green
        foreach ($succ in $script:success) {
            Write-Host "   • $succ" -ForegroundColor Green
        }
        Write-Host ""
    }

    if ($script:errors.Count -eq 0) {
        Write-Host "🎉 All core systems verified and operational!`n" -ForegroundColor Green

        Write-Host "📚 Next Steps:" -ForegroundColor Cyan
        Write-Host "   1. Run embedder:      node scripts/phase89-incremental-embedder.mjs" -ForegroundColor Gray
        Write-Host "   2. Build chunks:      node scripts/phase89-adaptive-chunker.mjs --build" -ForegroundColor Gray
        Write-Host "   3. CUDA cluster:      python scripts/phase89-cuda-clustering.py" -ForegroundColor Gray
        Write-Host "   4. Run pipeline:      node scripts/phase89-enhanced-pipeline.mjs 1" -ForegroundColor Gray
        Write-Host "   5. Start dev server:  npm run dev" -ForegroundColor Gray
        Write-Host "   6. Open topology:     http://localhost:5175/ast-topology`n" -ForegroundColor Gray
    } else {
        Write-Host "⚠️  Please resolve errors above before proceeding.`n" -ForegroundColor Yellow
    }
}

# Run all tests
Test-PostgreSQL
Test-Redis
Test-Qdrant
Test-CUDA
Test-Ollama
Test-LearningLoop
Test-FileSystem

# Show summary
Show-Summary

# Exit with error code if there are errors
if ($script:errors.Count -gt 0) {
    exit 1
}

exit 0
