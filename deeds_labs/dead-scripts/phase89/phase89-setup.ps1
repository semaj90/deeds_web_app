# Phase 89: Agentic Self-Improving Error Fixing System
# Quick start script to set up and run the complete pipeline

Write-Host "`n🚀 Phase 89: Agentic Auto-Fix Setup`n" -ForegroundColor Cyan

# ============================================================
# Step 1: Check Dependencies
# ============================================================
Write-Host "1️⃣  Checking dependencies..." -ForegroundColor Yellow

$services = @(
    @{Name="PostgreSQL"; Container="phase66-postgres"; Port=5434},
    @{Name="Redis"; Container="phase66-redis"; Port=6379},
    @{Name="Ollama"; Container="ollama-gemma"; Port=11434}
)

$allRunning = $true
foreach ($svc in $services) {
    $status = docker ps --filter "name=$($svc.Container)" --format "{{.Status}}"
    if ($status) {
        Write-Host "   ✅ $($svc.Name) running" -ForegroundColor Green
    } else {
        Write-Host "   ❌ $($svc.Name) NOT running - starting..." -ForegroundColor Red
        docker start $svc.Container
        $allRunning = $false
    }
}

if (-not $allRunning) {
    Write-Host "`n   ⏳ Waiting for services to start (5 seconds)...`n" -ForegroundColor Yellow
    Start-Sleep -Seconds 5
}

# ============================================================
# Step 2: Ensure Schema
# ============================================================
Write-Host "`n2️⃣  Ensuring database schema..." -ForegroundColor Yellow

docker exec phase66-postgres psql -U legal_admin -d legal_ai_db -c "
CREATE TABLE IF NOT EXISTS raw_error_embeddings (
    id SERIAL PRIMARY KEY,
    source TEXT NOT NULL,
    file_path TEXT NOT NULL,
    line INTEGER,
    error_code TEXT,
    message TEXT,
    raw_text TEXT NOT NULL,
    embedding vector(768),
    tags TEXT[],
    content_hash TEXT NOT NULL,
    version INTEGER DEFAULT 1,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(source, file_path, line, content_hash)
);

CREATE TABLE IF NOT EXISTS error_embedding_history (
    id SERIAL PRIMARY KEY,
    error_id INTEGER REFERENCES raw_error_embeddings(id),
    version INTEGER NOT NULL,
    raw_text TEXT NOT NULL,
    embedding vector(768),
    tags TEXT[],
    content_hash TEXT NOT NULL,
    changed_at TIMESTAMPTZ DEFAULT NOW(),
    change_type TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS error_fix_history (
    id SERIAL PRIMARY KEY,
    error_id INTEGER REFERENCES raw_error_embeddings(id),
    error_code TEXT NOT NULL,
    error_message TEXT NOT NULL,
    file_path TEXT NOT NULL,
    line_number INTEGER,
    fix_strategy TEXT NOT NULL,
    fix_content TEXT NOT NULL,
    fix_diff TEXT,
    surrounding_code TEXT,
    file_type TEXT,
    tags TEXT[],
    validated BOOLEAN DEFAULT false,
    validation_method TEXT,
    success_score FLOAT DEFAULT 0.0,
    fixed_at TIMESTAMPTZ DEFAULT NOW(),
    fixed_by TEXT DEFAULT 'autonomous',
    llm_provider TEXT,
    llm_model TEXT,
    prompt_tokens INTEGER,
    completion_tokens INTEGER
);

CREATE TABLE IF NOT EXISTS learned_fix_patterns (
    id SERIAL PRIMARY KEY,
    pattern_name TEXT UNIQUE NOT NULL,
    error_code TEXT NOT NULL,
    description TEXT,
    trigger_conditions JSONB,
    solution_template TEXT NOT NULL,
    times_applied INTEGER DEFAULT 0,
    success_count INTEGER DEFAULT 0,
    failure_count INTEGER DEFAULT 0,
    confidence_score FLOAT DEFAULT 0.0,
    applicable_file_types TEXT[],
    required_tags TEXT[],
    pattern_embedding vector(768),
    learned_at TIMESTAMPTZ DEFAULT NOW(),
    last_applied TIMESTAMPTZ,
    last_updated TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_embeddings_source ON raw_error_embeddings(source);
CREATE INDEX IF NOT EXISTS idx_embeddings_hash ON raw_error_embeddings(content_hash);
CREATE INDEX IF NOT EXISTS idx_embeddings_version ON raw_error_embeddings(version);
CREATE INDEX IF NOT EXISTS idx_history_error_id ON error_embedding_history(error_id);
CREATE INDEX IF NOT EXISTS idx_fix_error_code ON error_fix_history(error_code);
CREATE INDEX IF NOT EXISTS idx_fix_validated ON error_fix_history(validated);
CREATE INDEX IF NOT EXISTS idx_pattern_error_code ON learned_fix_patterns(error_code);
CREATE INDEX IF NOT EXISTS idx_pattern_confidence ON learned_fix_patterns(confidence_score);
" 2>&1 | Out-Null

Write-Host "   ✅ Schema ready`n" -ForegroundColor Green

# ============================================================
# Step 3: Incremental Embedding
# ============================================================
Write-Host "3️⃣  Running incremental embedder (NO DELETION)...`n" -ForegroundColor Yellow
Write-Host "   This preserves existing embeddings and only updates changed errors`n" -ForegroundColor Gray

node scripts/phase89-incremental-embedder.mjs svelte-check ../svelte-check-errors.json

# ============================================================
# Step 4: Check Results
# ============================================================
Write-Host "`n4️⃣  Checking embedding results..." -ForegroundColor Yellow

$total = docker exec phase66-postgres psql -U legal_admin -d legal_ai_db -t -c "SELECT COUNT(*) FROM raw_error_embeddings WHERE source='svelte-check'" 2>&1 | Select-String "\d+" | ForEach-Object { $_.Matches.Value }
$embedded = docker exec phase66-postgres psql -U legal_admin -d legal_ai_db -t -c "SELECT COUNT(*) FROM raw_error_embeddings WHERE source='svelte-check' AND embedding IS NOT NULL" 2>&1 | Select-String "\d+" | ForEach-Object { $_.Matches.Value }
$avgVersion = docker exec phase66-postgres psql -U legal_admin -d legal_ai_db -t -c "SELECT AVG(version)::NUMERIC(10,2) FROM raw_error_embeddings WHERE source='svelte-check'" 2>&1 | Select-String "[\d\.]+" | ForEach-Object { $_.Matches.Value }

Write-Host "`n   📊 Embedding Statistics:"
Write-Host "      Total errors: $total" -ForegroundColor Gray
Write-Host "      Embedded: $embedded" -ForegroundColor Green
Write-Host "      Avg version: $avgVersion" -ForegroundColor Gray
Write-Host ""

# ============================================================
# Step 5: Next Steps
# ============================================================
Write-Host "✅ Phase 89 Setup Complete!`n" -ForegroundColor Green

Write-Host "📚 Available Commands:`n" -ForegroundColor Cyan

Write-Host "  Incremental Embedding:" -ForegroundColor Yellow
Write-Host "    node scripts/phase89-incremental-embedder.mjs svelte-check ../svelte-check-errors.json`n"

Write-Host "  Fix Single Error:" -ForegroundColor Yellow
Write-Host "    node scripts/phase89-gemma3-prompt.mjs fix <error_id>`n"

Write-Host "  Batch Fix:" -ForegroundColor Yellow
Write-Host "    node scripts/phase89-gemma3-prompt.mjs batch <id1> <id2> <id3>`n"

Write-Host "  Run Agentic Loop (test mode):" -ForegroundColor Yellow
Write-Host "    node scripts/phase89-agentic-rag-pipeline.mjs run 5`n"

Write-Host "  Extract Learnings:" -ForegroundColor Yellow
Write-Host "    node scripts/phase89-knowledge-consolidator.mjs full`n"

Write-Host "  Check Status:" -ForegroundColor Yellow
Write-Host "    .\scripts\phase89-quick-status.ps1`n"

Write-Host "📖 Read the full guide:" -ForegroundColor Cyan
Write-Host "   PHASE89_AGENTIC_GUIDE.md`n"
