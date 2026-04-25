<#
.SYNOPSIS
  Move remaining root clutter files into deeds_labs archive subdirectories.

.DESCRIPTION
  71 files remain in root. This script moves the ~40 that are clutter
  (old test scripts, fix codemods, stale docker-compose variants, stale env files)
  into organized deeds_labs/ subdirectories.

  ~30 files are KEPT in root (essential project config).

  DRY-RUN by default. Pass -Execute to actually move.

.EXAMPLE
  .\deeds_labs\move-root-files.ps1           # dry-run
  .\deeds_labs\move-root-files.ps1 -Execute  # actually move
#>

param(
    [switch]$Execute
)

$ErrorActionPreference = 'Stop'
Set-Location "c:\Users\james\Videos\deeds-web-app"

$archiveBase = "deeds_labs\root-archive-20260315"

# =============================================================================
# FILES TO KEEP IN ROOT (essential project config — DO NOT MOVE)
# =============================================================================
# .clangd                        — C++ LSP config for simd-bridge
# .copilotignore                 — GitHub Copilot ignore rules
# .dockerignore                  — Docker build context ignore
# .env                           — Active environment variables
# .env.example                   — Template for new devs
# .env.local                     — Local dev overrides
# .eslintignore                  — ESLint ignore rules
# .gitattributes                 — Git line ending / LFS config
# .gitignore                     — Git ignore rules
# .npmrc                         — npm config
# .prettierignore                — Prettier ignore rules
# .prettierrc                    — Prettier config
# .python-version                — pyenv Python version pin
# .wslconfig                     — WSL2 memory/CPU config
# CLAUDE.md                      — Claude project instructions
# copilot.md                     — Copilot instructions
# deeds-web-app.code-workspace   — VS Code workspace
# docker-compose.yaml            — Primary docker-compose (canonical)
# docker-compose.yml             — Primary docker-compose (symlink/alt)
# docker-compose.dev.yml         — Dev compose overrides
# docker-compose.test.yml        — Test compose overrides
# Dockerfile                     — Main Dockerfile
# Dockerfile.dev                 — Dev Dockerfile
# Dockerfile.sveltekit           — SvelteKit production Dockerfile
# Dockerfile.trtllm              — TensorRT-LLM Dockerfile
# ecosystem.config.cjs           — PM2 config
# ecosystem.dev.config.cjs       — PM2 dev config
# ecosystem.prod.config.cjs      — PM2 prod config
# package.json                   — Root package.json
# package-lock.json              — Lock file
# playwright.config.js           — Playwright test config
# svelte.config.js               — SvelteKit config

$keepFiles = @(
    '.clangd'
    '.copilotignore'
    '.dockerignore'
    '.env'
    '.env.example'
    '.env.local'
    '.eslintignore'
    '.gitattributes'
    '.gitignore'
    '.npmrc'
    '.prettierignore'
    '.prettierrc'
    '.python-version'
    '.wslconfig'
    'CLAUDE.md'
    'copilot.md'
    'deeds-web-app.code-workspace'
    'docker-compose.yaml'
    'docker-compose.yml'
    'docker-compose.dev.yml'
    'docker-compose.test.yml'
    'Dockerfile'
    'Dockerfile.dev'
    'Dockerfile.sveltekit'
    'Dockerfile.trtllm'
    'ecosystem.config.cjs'
    'ecosystem.dev.config.cjs'
    'ecosystem.prod.config.cjs'
    'package.json'
    'package-lock.json'
    'playwright.config.js'
    'svelte.config.js'
    'tsconfig.json'
    'uno.config.js'
    'litellm_config.yaml'
)

# =============================================================================
# ARCHIVE MAPPINGS — category subdirs inside deeds_labs/root-archive-20260315/
# =============================================================================

$moveMap = @{
    # --- Stale docker-compose variants → infra/ ---
    'docker-compose-backup.yml'                = 'docker-compose'
    'docker-compose-full-stack-384.yml'        = 'docker-compose'
    'docker-compose-pgvector-gpu.yml'          = 'docker-compose'
    'docker-compose-phase70.yml'               = 'docker-compose'
    'docker-compose-phase72.yml'               = 'docker-compose'
    'docker-compose-vector-384.yml'            = 'docker-compose'
    'docker-compose.agentic.yml'               = 'docker-compose'
    'docker-compose.ai-stack.yml'              = 'docker-compose'
    'docker-compose.deeds.yml'                 = 'docker-compose'
    'docker-compose.detected.yml'              = 'docker-compose'
    'docker-compose.dynamic.yml'               = 'docker-compose'
    'docker-compose.elk.yml'                   = 'docker-compose'
    'docker-compose.embeddings.yml'            = 'docker-compose'
    'docker-compose.existing-stack.yml'        = 'docker-compose'
    'docker-compose.fixed.yml'                 = 'docker-compose'
    'docker-compose.generated.yml'             = 'docker-compose'
    'docker-compose.gpu-rag-full-stack.yml'    = 'docker-compose'
    'docker-compose.gpu.yml'                   = 'docker-compose'
    'docker-compose.grpc.yml'                  = 'docker-compose'
    'docker-compose.integrated-gpu-stack.yml'  = 'docker-compose'
    'docker-compose.langfuse.yml'              = 'docker-compose'
    'docker-compose.legal-ai-optimized.yml'    = 'docker-compose'
    'docker-compose.legal-ai.yml'              = 'docker-compose'
    'docker-compose.legal-stack.yml'           = 'docker-compose'
    'docker-compose.middleware.yml'            = 'docker-compose'
    'docker-compose.multimodal-retriever.yml'  = 'docker-compose'
    'docker-compose.ollama-fix.yml'            = 'docker-compose'
    'docker-compose.optimized.yml'             = 'docker-compose'
    'docker-compose.phase-h.yml'               = 'docker-compose'
    'docker-compose.phase66-full.yml'          = 'docker-compose'
    'docker-compose.phase66.yml'               = 'docker-compose'
    'docker-compose.phase71.yml'               = 'docker-compose'
    'docker-compose.phase72.yml'               = 'docker-compose'
    'docker-compose.phase75-standalone.yml'    = 'docker-compose'
    'docker-compose.phase76.yml'               = 'docker-compose'
    'docker-compose.phase78-vlm-stack.yml'     = 'docker-compose'
    'docker-compose.production.yml'            = 'docker-compose'
    'docker-compose.qlora.yml'                 = 'docker-compose'
    'docker-compose.quic.yml'                  = 'docker-compose'
    'docker-compose.redis-postgres.yml'        = 'docker-compose'
    'docker-compose.searxng.yml'               = 'docker-compose'
    'docker-compose.sveltekit-optimized.yml'   = 'docker-compose'
    'docker-compose.sveltekit-prod.yml'        = 'docker-compose'
    'docker-compose.sveltekit-simple.yml'      = 'docker-compose'
    'docker-compose.sveltekit.yml'             = 'docker-compose'
    'docker-compose.triton.yml'                = 'docker-compose'
    'docker-compose.unified.yml'               = 'docker-compose'
    'docker-compose.workers.yml'               = 'docker-compose'
    'codegen.yml'                              = 'misc'
    'litellm_config.yaml'                      = 'misc'

    # --- Old test scripts → scripts/ ---
    'test-ai-chat-demo.mjs'                   = 'scripts'
    'test-ai-chat.mjs'                        = 'scripts'
    'test-ai-chat.js'                         = 'scripts'
    'test-ai-integration.mjs'                 = 'scripts'
    'test-all-api-endpoints.js'               = 'scripts'
    'test-api-integration.mjs'                = 'scripts'
    'test-avatar-upload.mjs'                  = 'scripts'
    'test-cache-implementations.mjs'          = 'scripts'
    'test-complete-crud-system.js'            = 'scripts'
    'test-comprehensive-api.mjs'              = 'scripts'
    'test-comprehensive-evidence-system.mjs'  = 'scripts'
    'test-comprehensive-system.mjs'           = 'scripts'
    'test-context-switching.js'               = 'scripts'
    'test-cuda-enhanced-endpoints.mjs'        = 'scripts'
    'test-cuda-indexing.mjs'                  = 'scripts'
    'test-cuda-search.js'                     = 'scripts'
    'test-cuda-service.js'                    = 'scripts'
    'test-deployment-endpoints.mjs'           = 'scripts'
    'test-deployment-final.mjs'               = 'scripts'
    'test-enhanced-analysis.mjs'              = 'scripts'
    'test-enhanced-integration.js'            = 'scripts'
    'test-enhanced-rag.js'                    = 'scripts'
    'test-enhanced-system.js'                 = 'scripts'
    'test-error-logger.js'                    = 'scripts'
    'test-evidence-ai.mjs'                    = 'scripts'
    'test-fast-rag.js'                        = 'scripts'
    'test-full-stack-integration.mjs'         = 'scripts'
    'test-full-stack-phase14.mjs'             = 'scripts'
    'test-gemma-embeddings.js'                = 'scripts'
    'test-gemma-integration.mjs'              = 'scripts'
    'test-gpu-inference-demo.js'              = 'scripts'
    'test-integrated-system.mjs'              = 'scripts'
    'test-integration.mjs'                    = 'scripts'
    'test-legal-ai-complete.mjs'              = 'scripts'
    'test-legal-ai-summary.mjs'              = 'scripts'
    'test-login-session.js'                   = 'scripts'
    'test-lucia-login.js'                     = 'scripts'
    'test-minimal.mjs'                        = 'scripts'
    'test-minio.mjs'                          = 'scripts'
    'test-node-servers.js'                    = 'scripts'
    'test-parallel-extraction.js'             = 'scripts'
    'test-performance.js'                     = 'scripts'
    'test-pgvector-search.mjs'                = 'scripts'
    'test-pgvector.mjs'                       = 'scripts'
    'test-phase14-integration.mjs'            = 'scripts'
    'test-phase71-integration.mjs'            = 'scripts'
    'test-rag-api.js'                         = 'scripts'
    'test-rag-kag-gpu-phase72.mjs'            = 'scripts'
    'test-realtime-integration.mjs'           = 'scripts'
    'test-redis-docs.js'                      = 'scripts'
    'test-redis-integration.mjs'              = 'scripts'
    'test-redis-integration.js'               = 'scripts'
    'test-redis-predictor.js'                 = 'scripts'
    'test-semantic-search.mjs'                = 'scripts'
    'test-shared-memory-search.mjs'           = 'scripts'
    'test-simd-parser.mjs'                    = 'scripts'
    'test-simd-performance.js'                = 'scripts'
    'test-simple-api.mjs'                     = 'scripts'
    'test-simple-login.js'                    = 'scripts'
    'test-vector-similarity.mjs'              = 'scripts'
    'test-wasm-simd.js'                       = 'scripts'
    'test-websocket-connection.js'            = 'scripts'
    'test-zero-errors.js'                     = 'scripts'

    # --- Fix/codemod scripts → scripts/ ---
    'fix-component-exports.mjs'               = 'scripts'
    'fix-css-spacing.mjs'                     = 'scripts'
    'fix-event-handlers.mjs'                  = 'scripts'
    'fix-html-comment-damage.mjs'             = 'scripts'
    'fix-html-damage.mjs'                     = 'scripts'
    'fix-html-structure.mjs'                  = 'scripts'
    'fix-imports-exports.mjs'                 = 'scripts'
    'fix-imports.mjs'                         = 'scripts'
    'fix-js-syntax.mjs'                       = 'scripts'
    'fix-state-syntax.mjs'                    = 'scripts'
    'fix-structural-errors.mjs'               = 'scripts'
    'fix-superform-types.mjs'                 = 'scripts'
    'fix-type-definitions.mjs'                = 'scripts'
    'fix-typescript-patterns.mjs'             = 'scripts'
    'fix-use-directives.mjs'                  = 'scripts'
    'fix_batch.js'                            = 'scripts'
    'fix_schema.js'                           = 'scripts'
    'fix_adapters.cjs'                        = 'scripts'
    'fix_batch.cjs'                           = 'scripts'
    'fix_dup_state.cjs'                       = 'scripts'
    'fix_iife.cjs'                            = 'scripts'
    'fix_schema.cjs'                          = 'scripts'
    'fix_transitions.cjs'                     = 'scripts'
    'fix-all-syntax.cjs'                      = 'scripts'
    'fix-interfaces.cjs'                      = 'scripts'
    'fix-typescript-errors.cjs'               = 'scripts'

    # --- Stale .env variants → env/ ---
    '.env.actual'                             = 'env'
    '.env.ai-infrastructure'                  = 'env'
    '.env.backup-pre-clean'                   = 'env'
    '.env.development'                        = 'env'
    '.env.docker'                             = 'env'
    '.env.gpu'                                = 'env'
    '.env.minio'                              = 'env'
    '.env.ollama'                             = 'env'
    '.env.phase1.template'                    = 'env'
    '.env.phase14'                            = 'env'
    '.env.phase52.local'                      = 'env'
    '.env.phase66.generated'                  = 'env'
    '.env.phase76'                            = 'env'
    '.env.phase87'                            = 'env'
    '.env.production'                         = 'env'
    '.env.summary'                            = 'env'

    # --- Stale config/build artifacts → misc/ ---
    '.air-gpu.toml'                           = 'misc'
    '.air-rag.toml'                           = 'misc'
    '.air.toml'                               = 'misc'
    '.dev-server.pid'                         = 'misc'
    '.gitstatus_tmp.txt'                      = 'misc'
    '.qdrant-initialized'                     = 'misc'
    '.rooignore'                              = 'misc'
    '.roomodes'                               = 'misc'
    '.svelte-errors-raw.log'                  = 'misc'
    '.svelte-errors.jsonl'                    = 'misc'
    '.svelte-errors-top.json'                 = 'misc'
    '.tsc_full_output.txt'                    = 'misc'
    '.tsc_output.txt'                         = 'misc'
    'CMakePresets.json'                       = 'misc'
    'compile_commands.json'                   = 'misc'
    'mcp-multicore-config.json'               = 'misc'
    'mcp-tasks.json'                          = 'misc'
    'nul'                                     = 'misc'
}

# =============================================================================
# EXECUTION
# =============================================================================

$moved = 0
$skipped = 0
$missing = 0

# Create archive subdirs
$categories = $moveMap.Values | Sort-Object -Unique
foreach ($cat in $categories) {
    $dir = Join-Path $archiveBase $cat
    if (-not (Test-Path $dir)) {
        if ($Execute) {
            New-Item -ItemType Directory -Path $dir -Force | Out-Null
            Write-Host "[MKDIR] $dir" -ForegroundColor Cyan
        } else {
            Write-Host "[DRY-RUN] Would create: $dir" -ForegroundColor Cyan
        }
    }
}

# Move files
foreach ($entry in $moveMap.GetEnumerator()) {
    $fileName = $entry.Key
    $category = $entry.Value
    $src = $fileName
    $dst = Join-Path $archiveBase (Join-Path $category $fileName)

    if (-not (Test-Path $src)) {
        $missing++
        continue
    }

    if ($Execute) {
        Move-Item -Path $src -Destination $dst -Force
        Write-Host "[MOVED] $fileName -> $archiveBase/$category/" -ForegroundColor Green
        $moved++
    } else {
        Write-Host "[DRY-RUN] $fileName -> $archiveBase/$category/" -ForegroundColor Yellow
        $moved++
    }
}

# Summary
Write-Host ""
Write-Host "========================================" -ForegroundColor White
if ($Execute) {
    Write-Host "DONE: $moved files moved, $missing not found (already moved?)" -ForegroundColor Green
} else {
    Write-Host "DRY-RUN: $moved files would move, $missing not found" -ForegroundColor Yellow
    Write-Host "Run with -Execute to actually move files" -ForegroundColor Yellow
}
Write-Host "========================================" -ForegroundColor White

# Show what remains in root
$remaining = Get-ChildItem -File | Where-Object { $_.Name -in $keepFiles }
$unexpected = Get-ChildItem -File | Where-Object { $_.Name -notin $keepFiles -and $_.Name -notin $moveMap.Keys }
Write-Host ""
Write-Host "Remaining in root (KEEP): $($remaining.Count) files" -ForegroundColor Cyan
Write-Host "Unexpected (not in keep or move list): $($unexpected.Count) files" -ForegroundColor Magenta
if ($unexpected) {
    $unexpected | ForEach-Object { Write-Host "  ? $($_.Name)" -ForegroundColor Magenta }
}
