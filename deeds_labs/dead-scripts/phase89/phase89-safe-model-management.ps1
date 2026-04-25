# Phase 89: Safe Model Management
# Ensures models are pulled to persistent volume (ollama_data)
# NEVER deletes containers or rebuilds - only manages models

Write-Host "`n🔒 Phase 89: Safe Model Management`n" -ForegroundColor Cyan

# ============================================================
# 1. Verify Persistent Volume
# ============================================================
Write-Host "1️⃣  Verifying persistent storage..." -ForegroundColor Yellow

$volume = docker volume inspect ollama_data 2>&1
if ($LASTEXITCODE -eq 0) {
    Write-Host "   ✅ ollama_data volume exists (persistent)" -ForegroundColor Green
    $volumeInfo = $volume | ConvertFrom-Json
    Write-Host "      Mountpoint: $($volumeInfo.Mountpoint)" -ForegroundColor Gray
} else {
    Write-Host "   ⚠️  ollama_data volume NOT FOUND - creating..." -ForegroundColor Yellow
    docker volume create ollama_data
    Write-Host "   ✅ Volume created" -ForegroundColor Green
}

# ============================================================
# 2. Check Container Mount
# ============================================================
Write-Host "`n2️⃣  Checking container mounts..." -ForegroundColor Yellow

$mounts = docker inspect ollama-gemma --format '{{json .Mounts}}' | ConvertFrom-Json
$ollamaMount = $mounts | Where-Object { $_.Name -eq 'ollama_data' }

if ($ollamaMount) {
    Write-Host "   ✅ ollama-gemma → ollama_data (RW: $($ollamaMount.RW))" -ForegroundColor Green
    Write-Host "      Destination: $($ollamaMount.Destination)" -ForegroundColor Gray
} else {
    Write-Host "   ❌ ollama-gemma NOT using persistent volume!" -ForegroundColor Red
    Write-Host "      Container must be recreated with: -v ollama_data:/root/.ollama" -ForegroundColor Yellow
    Write-Host "      DO NOT RUN docker-compose down -v (will delete volume!)" -ForegroundColor Red
    exit 1
}

# ============================================================
# 3. List Installed Models
# ============================================================
Write-Host "`n3️⃣  Checking installed models..." -ForegroundColor Yellow

$models = docker exec ollama-gemma ollama list 2>&1

if ($models -match "embeddinggemma") {
    Write-Host "   ✅ embeddinggemma:latest installed" -ForegroundColor Green
    $needsEmbedding = $false
} else {
    Write-Host "   ❌ embeddinggemma:latest NOT installed" -ForegroundColor Yellow
    $needsEmbedding = $true
}

if ($models -match "gemma") {
    $gemmaModel = ($models | Select-String "gemma").Matches.Value | Select-Object -First 1
    Write-Host "   ✅ $gemmaModel installed" -ForegroundColor Green
    $needsGemma = $false
} else {
    Write-Host "   ❌ No Gemma model found" -ForegroundColor Yellow
    $needsGemma = $true
}

# ============================================================
# 4. Pull Missing Models (with confirmation)
# ============================================================
if ($needsEmbedding -or $needsGemma) {
    Write-Host "`n4️⃣  Missing models detected`n" -ForegroundColor Yellow

    if ($needsEmbedding) {
        Write-Host "   📥 embeddinggemma:latest (~1.7GB) - Required for Phase 89" -ForegroundColor Cyan
    }

    if ($needsGemma) {
        Write-Host "   📥 gemma2:2b (~1.6GB) - Lightweight LLM for testing" -ForegroundColor Cyan
        Write-Host "      (Alternative: qwen2.5:3b, llama3.2:3b)" -ForegroundColor Gray
    }

    Write-Host "`n   Models will be saved to persistent volume (ollama_data)" -ForegroundColor Green
    Write-Host "   Safe to pull - will survive container restarts`n" -ForegroundColor Green

    $confirm = Read-Host "Pull missing models? (y/n)"

    if ($confirm -eq 'y') {
        if ($needsEmbedding) {
            Write-Host "`n   🔄 Pulling embeddinggemma:latest..." -ForegroundColor Cyan
            docker exec ollama-gemma ollama pull embeddinggemma:latest

            if ($LASTEXITCODE -eq 0) {
                Write-Host "   ✅ embeddinggemma:latest pulled successfully`n" -ForegroundColor Green
            } else {
                Write-Host "   ❌ Failed to pull embeddinggemma:latest`n" -ForegroundColor Red
            }
        }

        if ($needsGemma) {
            Write-Host "   🔄 Pulling gemma2:2b..." -ForegroundColor Cyan
            docker exec ollama-gemma ollama pull gemma2:2b

            if ($LASTEXITCODE -eq 0) {
                Write-Host "   ✅ gemma2:2b pulled successfully`n" -ForegroundColor Green
            } else {
                Write-Host "   ❌ Failed to pull gemma2:2b`n" -ForegroundColor Red
            }
        }
    } else {
        Write-Host "`n   ⏭️  Skipping model pull`n" -ForegroundColor Yellow
    }
} else {
    Write-Host "`n   ✅ All required models installed`n" -ForegroundColor Green
}

# ============================================================
# 5. Verify Model Storage
# ============================================================
Write-Host "5️⃣  Verifying model persistence..." -ForegroundColor Yellow

$finalModels = docker exec ollama-gemma ollama list 2>&1

Write-Host "`n   📦 Installed Models:" -ForegroundColor Cyan
$finalModels | ForEach-Object {
    if ($_ -match '^\w') {
        Write-Host "      $_" -ForegroundColor Gray
    }
}

# ============================================================
# Summary
# ============================================================
Write-Host "`n✅ Model Management Complete!`n" -ForegroundColor Green

Write-Host "🔒 Safety Reminders:" -ForegroundColor Cyan
Write-Host "   ❌ NEVER run: docker-compose down -v (deletes volumes!)" -ForegroundColor Red
Write-Host "   ✅ Safe restart: docker restart ollama-gemma" -ForegroundColor Green
Write-Host "   ✅ Safe stop: docker stop ollama-gemma" -ForegroundColor Green
Write-Host "   ✅ Volume backup: docker run --rm -v ollama_data:/data -v `${PWD}:/backup alpine tar czf /backup/ollama_backup.tar.gz /data`n" -ForegroundColor Green
