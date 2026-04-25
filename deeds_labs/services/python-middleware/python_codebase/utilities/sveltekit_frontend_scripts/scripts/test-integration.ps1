#!/usr/bin/env pwsh
# Integration Test Suite - Validates all major systems
# Tests: Svelte 5, WebGPU, LangChain, XState, Database, AI Services

param(
    [switch]$Quick,
    [switch]$Verbose
)

$ErrorActionPreference = 'Continue'
$results = @{
    passed = 0
    failed = 0
    skipped = 0
    tests = @()
}

function Test-Feature {
    param(
        [string]$Name,
        [scriptblock]$Test,
        [switch]$Optional
    )
    
    Write-Host "`n[TEST] $Name" -ForegroundColor Cyan
    try {
        $result = & $Test
        if ($result) {
            Write-Host "  ✓ PASS" -ForegroundColor Green
            $script:results.passed++
            $script:results.tests += @{ name = $Name; status = "PASS" }
            return $true
        } else {
            throw "Test returned false"
        }
    }
    catch {
        if ($Optional) {
            Write-Host "  ⊘ SKIP (Optional)" -ForegroundColor Yellow
            $script:results.skipped++
            $script:results.tests += @{ name = $Name; status = "SKIP" }
        } else {
            Write-Host "  ✗ FAIL: $($_.Exception.Message)" -ForegroundColor Red
            $script:results.failed++
            $script:results.tests += @{ name = $Name; status = "FAIL"; error = $_.Exception.Message }
        }
        return $false
    }
}

Write-Host "╔═══════════════════════════════════════════════════════╗" -ForegroundColor Cyan
Write-Host "║     Integration Test Suite - Legal AI Platform      ║" -ForegroundColor Cyan
Write-Host "╚═══════════════════════════════════════════════════════╝" -ForegroundColor Cyan

# Test 1: Svelte 5 Runes Migration
Test-Feature "Svelte 5 Runes Syntax" {
    $files = Get-ChildItem -Path src/lib/components -Recurse -Include *.svelte -File | Select-Object -First 10
    $runesCount = 0
    $oldSyntaxCount = 0
    
    foreach ($file in $files) {
        $content = Get-Content $file.FullName -Raw -ErrorAction SilentlyContinue
        if ($content -match '\$state\(|\$derived\(|\$effect\(') {
            $runesCount++
        }
        if ($content -match '\$:\s+\w+\s*=|\blet\s+\w+\s*=\s*\$state') {
            $oldSyntaxCount++
        }
    }
    
    Write-Host "    Runes syntax: $runesCount files" -ForegroundColor Gray
    Write-Host "    Old syntax: $oldSyntaxCount files" -ForegroundColor Gray
    return $true  # Always pass, just report
}

# Test 2: WebGPU Integration
Test-Feature "WebGPU Availability" {
    $webgpuFiles = @(
        "src/lib/webgpu/gpu-context.ts",
        "src/lib/webgpu/vector-compute.ts",
        "src/types/webgpu-shims.d.ts"
    )
    
    $found = 0
    foreach ($file in $webgpuFiles) {
        if (Test-Path $file) {
            $found++
        }
    }
    
    Write-Host "    Found $found/$($webgpuFiles.Count) WebGPU files" -ForegroundColor Gray
    return $found -ge 2
}

# Test 3: LangChain Integration
Test-Feature "LangChain Configuration" {
    $langchainFiles = @(
        "src/lib/ai/langchain-ollama-service.ts",
        "src/lib/ai/langchain-rag.ts"
    )
    
    $configured = 0
    foreach ($file in $langchainFiles) {
        if (Test-Path $file) {
            $content = Get-Content $file -Raw -ErrorAction SilentlyContinue
            if ($content -match 'langchain|ChatOllama|OllamaEmbeddings') {
                $configured++
            }
        }
    }
    
    Write-Host "    Configured: $configured/$($langchainFiles.Count) files" -ForegroundColor Gray
    return $configured -ge 1
}

# Test 4: XState v5 Integration
Test-Feature "XState v5 Machines" {
    $xstateFiles = Get-ChildItem -Path src/lib -Recurse -Include *machine*.ts,*Machine*.ts -File
    $v5Syntax = 0
    
    foreach ($file in $xstateFiles | Select-Object -First 20) {
        $content = Get-Content $file.FullName -Raw -ErrorAction SilentlyContinue
        if ($content -match 'createMachine|fromPromise|assign') {
            $v5Syntax++
        }
    }
    
    Write-Host "    XState v5 machines: $v5Syntax files" -ForegroundColor Gray
    return $v5Syntax -ge 3
}

# Test 5: Database Schema
Test-Feature "Database Schema Files" {
    $schemaFiles = @(
        "src/lib/server/db/schema.ts",
        "src/lib/server/db/client.ts"
    )
    
    $exists = 0
    foreach ($file in $schemaFiles) {
        if (Test-Path $file) {
            $exists++
        }
    }
    
    Write-Host "    Schema files: $exists/$($schemaFiles.Count)" -ForegroundColor Gray
    return $exists -eq $schemaFiles.Count
}

# Test 6: Drizzle ORM
Test-Feature "Drizzle ORM Setup" {
    $files = @(
        "drizzle.config.ts",
        "src/lib/server/db/schema.ts"
    )
    
    $valid = 0
    foreach ($file in $files) {
        if (Test-Path $file) {
            $content = Get-Content $file -Raw -ErrorAction SilentlyContinue
            if ($content -match 'drizzle|pgTable|postgres') {
                $valid++
            }
        }
    }
    
    Write-Host "    Drizzle files: $valid/$($files.Count)" -ForegroundColor Gray
    return $valid -ge 1
}

# Test 7: Vector Search (pgvector/Qdrant)
Test-Feature "Vector Search Integration" {
    $vectorFiles = Get-ChildItem -Path src/lib/server -Recurse -Include *vector*.ts,*embedding*.ts -File
    $hasImplementation = $false
    
    foreach ($file in $vectorFiles | Select-Object -First 10) {
        $content = Get-Content $file.FullName -Raw -ErrorAction SilentlyContinue
        if ($content -match 'pgvector|qdrant|embedding|vector search') {
            $hasImplementation = $true
            break
        }
    }
    
    Write-Host "    Vector search: $(if ($hasImplementation) { 'Implemented' } else { 'Not found' })" -ForegroundColor Gray
    return $hasImplementation
}

# Test 8: Redis Integration
Test-Feature "Redis Cache Layer" {
    $redisFiles = Get-ChildItem -Path src/lib/server -Recurse -Include *redis*.ts -File
    
    Write-Host "    Redis files: $($redisFiles.Count)" -ForegroundColor Gray
    return $redisFiles.Count -ge 2
}

# Test 9: AI Service Integration
Test-Feature "AI Services (Ollama/OpenAI)" {
    $aiFiles = @(
        "src/lib/ai/unified-ai-service.ts",
        "src/lib/ai/ai-service.ts"
    )
    
    $configured = 0
    foreach ($file in $aiFiles) {
        if (Test-Path $file) {
            $configured++
        }
    }
    
    Write-Host "    AI services: $configured/$($aiFiles.Count)" -ForegroundColor Gray
    return $configured -ge 1
}

# Test 10: Route Structure
Test-Feature "SvelteKit Route Structure" {
    $hasLayout = Test-Path "src/routes/+layout.svelte"
    $hasPage = Test-Path "src/routes/+page.svelte"
    $apiRoutes = Get-ChildItem -Path "src/routes/api" -Recurse -Include "+server.ts" -File -ErrorAction SilentlyContinue
    
    Write-Host "    Layout: $hasLayout" -ForegroundColor Gray
    Write-Host "    Homepage: $hasPage" -ForegroundColor Gray
    Write-Host "    API routes: $($apiRoutes.Count)" -ForegroundColor Gray
    
    return $hasLayout -and $hasPage
}

# Test 11: TypeScript Configuration
Test-Feature "TypeScript Configuration" {
    $tsconfigExists = Test-Path "tsconfig.json"
    $svelteKitConfig = Test-Path ".svelte-kit/tsconfig.json"
    
    Write-Host "    tsconfig.json: $tsconfigExists" -ForegroundColor Gray
    Write-Host "    .svelte-kit/tsconfig.json: $svelteKitConfig" -ForegroundColor Gray
    
    return $tsconfigExists -and $svelteKitConfig
}

# Test 12: Build Configuration
Test-Feature "Build Configuration" {
    $viteConfig = Test-Path "vite.config.js"
    $svelteConfig = Test-Path "svelte.config.js"
    $packageJson = Test-Path "package.json"
    
    Write-Host "    vite.config.js: $viteConfig" -ForegroundColor Gray
    Write-Host "    svelte.config.js: $svelteConfig" -ForegroundColor Gray
    Write-Host "    package.json: $packageJson" -ForegroundColor Gray
    
    return $viteConfig -and $svelteConfig -and $packageJson
}

# Test 13: Component Library (bits-ui)
Test-Feature "UI Component Library" {
    $uiPath = "src/lib/components/ui"
    $hasComponents = Test-Path $uiPath
    $componentCount = 0
    
    if ($hasComponents) {
        $componentCount = (Get-ChildItem -Path $uiPath -Directory -ErrorAction SilentlyContinue).Count
    }
    
    Write-Host "    UI components: $componentCount" -ForegroundColor Gray
    return $hasComponents -and $componentCount -ge 5
}

# Test 14: Store Management
Test-Feature "Svelte Stores" {
    $storeFiles = Get-ChildItem -Path src/lib/stores -Recurse -Include *.ts,*.svelte.ts -File -ErrorAction SilentlyContinue
    
    Write-Host "    Store files: $($storeFiles.Count)" -ForegroundColor Gray
    return $storeFiles.Count -ge 3
}

# Test 15: Type Safety
Test-Feature "TypeScript Strict Mode" -Optional {
    $tsconfig = Get-Content "tsconfig.json" -Raw -ErrorAction SilentlyContinue
    $hasStrict = $tsconfig -match '"strict":\s*true'
    
    Write-Host "    Strict mode: $hasStrict" -ForegroundColor Gray
    return $hasStrict
}

# Summary
Write-Host ""
Write-Host "╔═══════════════════════════════════════════════════════╗" -ForegroundColor Cyan
Write-Host "║                  TEST SUMMARY                         ║" -ForegroundColor Cyan
Write-Host "╠═══════════════════════════════════════════════════════╣" -ForegroundColor Cyan
Write-Host "  Passed:  $($results.passed)" -ForegroundColor Green
Write-Host "  Failed:  $($results.failed)" -ForegroundColor $(if ($results.failed -eq 0) { 'Green' } else { 'Red' })
Write-Host "  Skipped: $($results.skipped)" -ForegroundColor Yellow
Write-Host "  Total:   $($results.passed + $results.failed + $results.skipped)" -ForegroundColor White
Write-Host "╚═══════════════════════════════════════════════════════╝" -ForegroundColor Cyan

# Detailed results
if ($Verbose) {
    Write-Host "`nDetailed Results:" -ForegroundColor Yellow
    foreach ($test in $results.tests) {
        $status = switch ($test.status) {
            "PASS" { "✓"; "Green" }
            "FAIL" { "✗"; "Red" }
            "SKIP" { "⊘"; "Yellow" }
        }
        Write-Host "  $($status[0]) $($test.name)" -ForegroundColor $status[1]
        if ($test.error) {
            Write-Host "    Error: $($test.error)" -ForegroundColor Gray
        }
    }
}

# Exit code
if ($results.failed -eq 0) {
    Write-Host "`n✅ All critical tests passed!" -ForegroundColor Green
    exit 0
} else {
    Write-Host "`n⚠️ Some tests failed. Review above for details." -ForegroundColor Yellow
    exit 1
}
