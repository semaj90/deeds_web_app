# Phase 3 AI Files Audit Script
# Analyzes existing AI infrastructure to guide consolidation

Write-Host "`n╔══════════════════════════════════════════════════════════════╗" -ForegroundColor Cyan
Write-Host "║   Phase 3: AI Files Audit & Consolidation Analysis          ║" -ForegroundColor Cyan
Write-Host "╚══════════════════════════════════════════════════════════════╝`n" -ForegroundColor Cyan

$projectRoot = "C:\Users\james\Videos\deeds-web-app\sveltekit-frontend"
Set-Location $projectRoot

# Category 1: RAG Implementations
Write-Host "📚 RAG Pipeline Implementations" -ForegroundColor Magenta
Write-Host "═══════════════════════════════════════════════════════════════`n" -ForegroundColor Cyan

$ragFiles = @(
    "src\lib\server\ai\rag-pipeline-enhanced.ts",
    "src\lib\server\ai\rag-pipeline.ts",
    "..\langchain-rag-service\main.py"
)

foreach ($file in $ragFiles) {
    if (Test-Path $file) {
        $lines = (Get-Content $file).Count
        $size = [math]::Round((Get-Item $file).Length / 1KB, 2)

        Write-Host "  ✅ $file" -ForegroundColor Green
        Write-Host "     Lines: $lines | Size: ${size}KB" -ForegroundColor Gray

        # Check for key patterns
        $content = Get-Content $file -Raw
        $hasOllama = $content -match "ollama|Ollama"
        $hasPGVector = $content -match "pgvector|PGVector"
        $hasQdrant = $content -match "qdrant|Qdrant"
        $hasLangChain = $content -match "langchain|LangChain"

        if ($hasOllama) { Write-Host "     ├─ Ollama: ✅" -ForegroundColor Blue }
        if ($hasPGVector) { Write-Host "     ├─ pgvector: ✅" -ForegroundColor Blue }
        if ($hasQdrant) { Write-Host "     ├─ Qdrant: ✅" -ForegroundColor Blue }
        if ($hasLangChain) { Write-Host "     └─ LangChain: ✅" -ForegroundColor Blue }
        Write-Host ""
    } else {
        Write-Host "  ⚠️  $file (NOT FOUND)" -ForegroundColor Yellow
    }
}

# Category 2: AI Orchestrators
Write-Host "`n🎯 AI Orchestrator Services" -ForegroundColor Magenta
Write-Host "═══════════════════════════════════════════════════════════════`n" -ForegroundColor Cyan

$orchestratorFiles = @(
    "src\lib\server\ai\enhanced-ai-synthesis-orchestrator.ts",
    "src\lib\server\ai\enhanced-orchestrator.ts",
    "src\lib\orchestration\complete-legal-ai-orchestrator.ts"
)

foreach ($file in $orchestratorFiles) {
    if (Test-Path $file) {
        $lines = (Get-Content $file).Count
        $size = [math]::Round((Get-Item $file).Length / 1KB, 2)

        Write-Host "  ✅ $file" -ForegroundColor Green
        Write-Host "     Lines: $lines | Size: ${size}KB" -ForegroundColor Gray

        $content = Get-Content $file -Raw
        $hasXState = $content -match "xstate|createMachine|createActor"
        $hasNeo4j = $content -match "neo4j|Neo4j"
        $hasRedis = $content -match "redis|Redis"

        if ($hasXState) { Write-Host "     ├─ XState: ✅" -ForegroundColor Blue }
        if ($hasNeo4j) { Write-Host "     ├─ Neo4j: ✅" -ForegroundColor Blue }
        if ($hasRedis) { Write-Host "     └─ Redis: ✅" -ForegroundColor Blue }
        Write-Host ""
    }
}

# Category 3: AI Stores
Write-Host "`n🗄️  AI Svelte Stores" -ForegroundColor Magenta
Write-Host "═══════════════════════════════════════════════════════════════`n" -ForegroundColor Cyan

$storeFiles = Get-ChildItem -Path "src\lib\stores" -Filter "ai-*.ts" -Recurse | Select-Object -ExpandProperty FullName

foreach ($file in $storeFiles) {
    $relativePath = $file.Replace($projectRoot + "\", "")
    $lines = (Get-Content $file).Count
    $size = [math]::Round((Get-Item $file).Length / 1KB, 2)

    $content = Get-Content $file -Raw
    $isSvelte5 = $content -match '\$state|\$derived|\$effect'
    $isCanonical = $relativePath -match 'ai-assistant\.svelte\.ts|ai-chat-store\.svelte\.ts'

    $icon = if ($isCanonical) { "🌟" } elseif ($isSvelte5) { "✅" } else { "⚠️ " }
    $color = if ($isCanonical) { "Green" } elseif ($isSvelte5) { "Cyan" } else { "Yellow" }

    Write-Host "  $icon $relativePath" -ForegroundColor $color
    Write-Host "     Lines: $lines | Size: ${size}KB" -ForegroundColor Gray
    if ($isSvelte5) { Write-Host "     Svelte 5 Runes: ✅" -ForegroundColor Blue }
    if ($isCanonical) { Write-Host "     Status: CANONICAL STORE" -ForegroundColor Green }
    Write-Host ""
}

# Category 4: AI Types & Interfaces
Write-Host "`n📝 Type Definitions" -ForegroundColor Magenta
Write-Host "═══════════════════════════════════════════════════════════════`n" -ForegroundColor Cyan

$typeFiles = Get-ChildItem -Path "src\lib\types" -Filter "ai-*.ts" -Recurse | Select-Object -ExpandProperty FullName

foreach ($file in $typeFiles) {
    $relativePath = $file.Replace($projectRoot + "\", "")
    $lines = (Get-Content $file).Count

    Write-Host "  ✅ $relativePath" -ForegroundColor Green
    Write-Host "     Lines: $lines" -ForegroundColor Gray
    Write-Host ""
}

# Category 5: Configuration Files
Write-Host "`n⚙️  Configuration Files" -ForegroundColor Magenta
Write-Host "═══════════════════════════════════════════════════════════════`n" -ForegroundColor Cyan

$configFiles = @(
    "src\lib\config\ai-providers.ts",
    "src\lib\services\ollama-config-service.ts",
    ".env.development"
)

foreach ($file in $configFiles) {
    if (Test-Path $file) {
        Write-Host "  ✅ $file" -ForegroundColor Green

        if ($file -match "\.env") {
            $envContent = Get-Content $file
            $hasOllamaConfig = $envContent -match "OLLAMA"
            $hasOpenAI = $envContent -match "OPENAI_API_KEY"
            $hasAnthropic = $envContent -match "ANTHROPIC_API_KEY"

            if ($hasOllamaConfig) { Write-Host "     ├─ Ollama Config: ✅" -ForegroundColor Blue }
            if ($hasOpenAI) { Write-Host "     ├─ OpenAI Key: ✅" -ForegroundColor Blue } else { Write-Host "     ├─ OpenAI Key: ❌ (Add for Phase 3)" -ForegroundColor Yellow }
            if ($hasAnthropic) { Write-Host "     └─ Anthropic Key: ✅" -ForegroundColor Blue } else { Write-Host "     └─ Anthropic Key: ❌ (Add for Phase 3)" -ForegroundColor Yellow }
        }
        Write-Host ""
    } else {
        Write-Host "  ⚠️  $file (NOT FOUND - Will create in Phase 3)" -ForegroundColor Yellow
        Write-Host ""
    }
}

# Summary & Recommendations
Write-Host "`n═══════════════════════════════════════════════════════════════" -ForegroundColor Cyan
Write-Host "📊 Consolidation Recommendations`n" -ForegroundColor Magenta

Write-Host "1️⃣  RAG Pipelines:" -ForegroundColor Yellow
Write-Host "   → KEEP: rag-pipeline-enhanced.ts (most comprehensive)" -ForegroundColor Green
Write-Host "   → REFACTOR: rag-pipeline.ts → merge into enhanced version" -ForegroundColor Cyan
Write-Host "   → OPTIONAL: Python service (can run alongside TypeScript)" -ForegroundColor Gray

Write-Host "`n2️⃣  Orchestrators:" -ForegroundColor Yellow
Write-Host "   → CREATE: ai-service-orchestrator.ts (new unified service)" -ForegroundColor Green
Write-Host "   → INTEGRATE: enhanced-ai-synthesis-orchestrator.ts patterns" -ForegroundColor Cyan
Write-Host "   → DEPRECATE: enhanced-orchestrator.ts after migration" -ForegroundColor Gray

Write-Host "`n3️⃣  Stores:" -ForegroundColor Yellow
Write-Host "   → CANONICAL: ai-assistant.svelte.ts (keep as primary)" -ForegroundColor Green
Write-Host "   → REVIEW: Other ai-* stores for potential consolidation" -ForegroundColor Cyan

Write-Host "`n4️⃣  Configuration:" -ForegroundColor Yellow
Write-Host "   → CREATE: src\lib\config\ai-providers.ts" -ForegroundColor Green
Write-Host "   → ADD: OPENAI_API_KEY and ANTHROPIC_API_KEY to .env" -ForegroundColor Cyan

Write-Host "`n═══════════════════════════════════════════════════════════════`n" -ForegroundColor Cyan
Write-Host "✅ Audit Complete! Review recommendations above." -ForegroundColor Green
Write-Host "Next: Run Phase 3 health check with: node ..\scripts\phase3-health-check.mjs`n" -ForegroundColor Cyan
