# Production-Ready Validation & Fix Script
# Ensures all Svelte 5, SvelteKit 2, and full-stack wiring is correct

$ErrorActionPreference = "Continue"

Write-Host "🔍 Full-Stack Production Readiness Validation" -ForegroundColor Green
Write-Host "=" * 80 -ForegroundColor Gray

$checks = @{
    Passed = @()
    Failed = @()
    Warnings = @()
}

# Check 1: Environment Variables
Write-Host "`n📋 Check 1: Environment Variables" -ForegroundColor Cyan
$requiredEnvVars = @(
    'DATABASE_URL', 'REDIS_URL', 'OLLAMA_URL', 'QDRANT_URL',
    'RABBITMQ_URL', 'PUBLIC_API_URL'
)

$envFile = ".env"
if (Test-Path $envFile) {
    $envContent = Get-Content $envFile -Raw
    foreach ($var in $requiredEnvVars) {
        if ($envContent -match $var) {
            Write-Host "  ✓ $var configured" -ForegroundColor Green
            $checks.Passed += "ENV:$var"
        } else {
            Write-Host "  ✗ $var missing" -ForegroundColor Red
            $checks.Failed += "ENV:$var"
        }
    }
} else {
    Write-Host "  ⚠ .env file not found" -ForegroundColor Yellow
    $checks.Warnings += "ENV file missing"
}

# Check 2: Dependencies
Write-Host "`n📦 Check 2: Critical Dependencies" -ForegroundColor Cyan
$criticalDeps = @(
    '@sveltejs/kit', 'svelte', 'drizzle-orm', 'xstate',
    'unocss', '@unocss/preset-forms', '@unocss/preset-radix',
    'bits-ui', 'postgres', 'ioredis', 'amqplib'
)

if (Test-Path "package.json") {
    $packageJson = Get-Content "package.json" | ConvertFrom-Json
    $allDeps = @{}
    if ($packageJson.dependencies) {
        $packageJson.dependencies.PSObject.Properties | ForEach-Object {
            $allDeps[$_.Name] = $_.Value
        }
    }
    if ($packageJson.devDependencies) {
        $packageJson.devDependencies.PSObject.Properties | ForEach-Object {
            $allDeps[$_.Name] = $_.Value
        }
    }
    
    foreach ($dep in $criticalDeps) {
        if ($allDeps.ContainsKey($dep)) {
            Write-Host "  ✓ $dep installed" -ForegroundColor Green
            $checks.Passed += "DEP:$dep"
        } else {
            Write-Host "  ✗ $dep missing" -ForegroundColor Red
            $checks.Failed += "DEP:$dep"
        }
    }
}

# Check 3: Svelte 5 Patterns
Write-Host "`n🎨 Check 3: Svelte 5 Compliance" -ForegroundColor Cyan
$deprecatedPatterns = @(
    @{ Pattern = 'on:click'; Replacement = 'onclick'; Name = 'Event handlers' },
    @{ Pattern = 'export let'; Replacement = '$props()'; Name = 'Props syntax' },
    @{ Pattern = '\$:'; Replacement = '$derived'; Name = 'Reactive declarations' }
)

$svelteFiles = Get-ChildItem -Path "src" -Recurse -Include "*.svelte" -File | Select-Object -First 10

foreach ($pattern in $deprecatedPatterns) {
    $found = $svelteFiles | Select-String -Pattern $pattern.Pattern -List
    if ($found) {
        Write-Host "  ⚠ Found deprecated pattern: $($pattern.Name)" -ForegroundColor Yellow
        Write-Host "    Use $($pattern.Replacement) instead" -ForegroundColor Gray
        $checks.Warnings += "SVELTE5:$($pattern.Name)"
    } else {
        Write-Host "  ✓ $($pattern.Name) compliant" -ForegroundColor Green
        $checks.Passed += "SVELTE5:$($pattern.Name)"
    }
}

# Check 4: API Endpoints
Write-Host "`n🔌 Check 4: API Endpoint Structure" -ForegroundColor Cyan
$requiredEndpoints = @(
    'src/routes/api/contextual/state/+server.ts',
    'src/routes/api/contextual/predictions/+server.ts',
    'src/routes/api/contextual/chat/+server.ts',
    'src/routes/api/health/+server.ts'
)

foreach ($endpoint in $requiredEndpoints) {
    if (Test-Path $endpoint) {
        Write-Host "  ✓ $(Split-Path $endpoint -Leaf)" -ForegroundColor Green
        $checks.Passed += "API:$endpoint"
    } else {
        Write-Host "  ✗ $(Split-Path $endpoint -Leaf) missing" -ForegroundColor Red
        $checks.Failed += "API:$endpoint"
    }
}

# Check 5: UnoCSS Configuration
Write-Host "`n🎨 Check 5: UnoCSS Setup" -ForegroundColor Cyan
if (Test-Path "uno.config.ts") {
    $unoConfig = Get-Content "uno.config.ts" -Raw
    if ($unoConfig -match "presetForms" -and $unoConfig -match "presetRadix") {
        Write-Host "  ✓ UnoCSS presets configured" -ForegroundColor Green
        $checks.Passed += "UNOCSS:presets"
    } else {
        Write-Host "  ⚠ UnoCSS presets missing" -ForegroundColor Yellow
        $checks.Warnings += "UNOCSS:presets"
    }
}

# Check 6: Docker Services
Write-Host "`n🐳 Check 6: Docker Services" -ForegroundColor Cyan
$dockerServices = @(
    'postgres', 'redis', 'rabbitmq', 'qdrant', 'ollama', 'neo4j', 'minio'
)

if (Get-Command docker -ErrorAction SilentlyContinue) {
    $runningContainers = docker ps --format "{{.Names}}" 2>$null
    foreach ($service in $dockerServices) {
        if ($runningContainers -match $service) {
            Write-Host "  ✓ $service running" -ForegroundColor Green
            $checks.Passed += "DOCKER:$service"
        } else {
            Write-Host "  ⚠ $service not running" -ForegroundColor Yellow
            $checks.Warnings += "DOCKER:$service"
        }
    }
} else {
    Write-Host "  ⚠ Docker not available" -ForegroundColor Yellow
    $checks.Warnings += "DOCKER:not-installed"
}

# Check 7: Drizzle Schema
Write-Host "`n🗄️  Check 7: Database Schema" -ForegroundColor Cyan
if (Test-Path "src/lib/server/db/schema-postgres.ts") {
    $schema = Get-Content "src/lib/server/db/schema-postgres.ts" -Raw
    if ($schema -match "vector\(" -and $schema -match "pgTable") {
        Write-Host "  ✓ pgvector schema defined" -ForegroundColor Green
        $checks.Passed += "DB:pgvector"
    }
}

if (Test-Path "drizzle.config.ts") {
    Write-Host "  ✓ Drizzle config exists" -ForegroundColor Green
    $checks.Passed += "DB:drizzle-config"
}

# Summary
Write-Host "`n📊 Validation Summary" -ForegroundColor Green
Write-Host "=" * 80 -ForegroundColor Gray
Write-Host "✅ Passed: $($checks.Passed.Count)" -ForegroundColor Green
Write-Host "❌ Failed: $($checks.Failed.Count)" -ForegroundColor Red
Write-Host "⚠️  Warnings: $($checks.Warnings.Count)" -ForegroundColor Yellow

if ($checks.Failed.Count -eq 0) {
    Write-Host "`n🎉 Production Ready!" -ForegroundColor Green
} else {
    Write-Host "`n⚠️  Issues found - review failed checks" -ForegroundColor Yellow
    Write-Host "`nFailed checks:" -ForegroundColor Red
    $checks.Failed | ForEach-Object { Write-Host "  - $_" -ForegroundColor Red }
}

# Generate report
$report = @{
    timestamp = Get-Date -Format 'o'
    passed = $checks.Passed
    failed = $checks.Failed
    warnings = $checks.Warnings
    productionReady = ($checks.Failed.Count -eq 0)
} | ConvertTo-Json

$report | Out-File "production-readiness-report.json"
Write-Host "`n📄 Report saved to production-readiness-report.json" -ForegroundColor Cyan
