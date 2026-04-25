#!/usr/bin/env pwsh
<#
.SYNOPSIS
    Automated bulk fix for TypeScript service files with systematic syntax errors
.DESCRIPTION
    Fixes 4 common patterns found in broken service files:
    1. Stray } after interface declarations
    2. Missing closing parentheses ) in function calls
    3. Malformed object literals like { [key,: strin,g]: any }
    4. Parameter naming mismatches (_key in signature, key in body)
.EXAMPLE
    .\fix-service-syntax-errors.ps1
#>

$ErrorActionPreference = "Stop"
$baseDir = "C:\Users\james\Videos\deeds-web-app\sveltekit-frontend\src\lib"

# Service files to fix
$serviceFiles = @(
    "$baseDir\api\services\cache-service.ts",
    "$baseDir\api\services\case-service.ts",
    "$baseDir\api\services\chat-service.ts",
    "$baseDir\api\services\document-service.ts",
    "$baseDir\api\services\embedding-service.ts",
    "$baseDir\api\services\evidence-service.ts",
    "$baseDir\api\services\health-service.ts",
    "$baseDir\api\services\job-cache-service.ts",
    "$baseDir\api\services\metrics-service.ts",
    "$baseDir\api\services\note-service.ts",
    "$baseDir\api\services\ollama-service.ts",
    "$baseDir\api\services\processing-service.ts",
    "$baseDir\api\services\search-service.ts",
    "$baseDir\api\services\upload-service.ts",
    "$baseDir\api\services\user-service.ts",
    "$baseDir\api\services\vector-service.ts",
    "$baseDir\api\services\clients\api-client.ts",
    "$baseDir\auth\auth-store.ts",
    "$baseDir\auth\roles.ts",
    "$baseDir\binary\flatbuffer-legal-schema.ts",
    "$baseDir\binary\flatbuffer-node-data.ts"
)

$fixCount = 0
$totalFixes = 0

Write-Host "`n🔧 TypeScript Service File Bulk Fix Script" -ForegroundColor Cyan
Write-Host "=" * 60 -ForegroundColor Gray

foreach ($file in $serviceFiles) {
    if (-not (Test-Path $file)) {
        Write-Host "⚠️  Skipping (not found): $file" -ForegroundColor Yellow
        continue
    }

    Write-Host "`n📄 Processing: $(Split-Path $file -Leaf)" -ForegroundColor White
    $content = Get-Content -Path $file -Raw
    $originalContent = $content
    $fileFixes = 0

    # FIX 1: Remove stray } after interface/type declarations
    # Pattern: "}\n}\nexport interface" or "}\n}\nexport type"
    $pattern1 = '(?m)^}\s*\n}\s*\n(export (interface|type|class))'
    if ($content -match $pattern1) {
        $content = $content -replace $pattern1, "}`n`$1"
        $fileFixes++
        Write-Host "  ✓ Fixed stray closing braces after declarations" -ForegroundColor Green
    }

    # FIX 2: Fix malformed object literals like { [key,: strin,g]: any }
    # Replace with proper Record type
    $pattern2 = '\{\s*\[key,:\s*strin,g\]:\s*any\s*\}'
    if ($content -match $pattern2) {
        $content = $content -replace $pattern2, 'Record<string, any>'
        $fileFixes++
        Write-Host "  ✓ Fixed malformed object literal type" -ForegroundColor Green
    }

    # FIX 3: Fix missing closing parentheses in common patterns
    # JSON.stringify(user; -> JSON.stringify(user)
    $pattern3a = 'JSON\.stringify\(([^)]+);'
    if ($content -match $pattern3a) {
        $content = $content -replace $pattern3a, 'JSON.stringify($1)'
        $fileFixes++
        Write-Host "  ✓ Fixed JSON.stringify missing )" -ForegroundColor Green
    }

    # JSON.parse(atob(...; -> JSON.parse(atob(...))
    $pattern3b = 'JSON\.parse\(atob\(([^)]+)\);'
    if ($content -match $pattern3b) {
        $content = $content -replace $pattern3b, 'JSON.parse(atob($1))'
        $fileFixes++
        Write-Host "  ✓ Fixed JSON.parse(atob()) missing )" -ForegroundColor Green
    }

    # FIX 4: Fix double closing braces like )})
    $pattern4 = '\)\}\)'
    if ($content -match $pattern4) {
        $content = $content -replace '\)\}\)', ')'
        $fileFixes++
        Write-Host "  ✓ Fixed double closing braces )})" -ForegroundColor Green
    }

    # FIX 5: Fix malformed fetch body like { refreshToken, )})
    $pattern5 = '\{\s*(\w+),\s*\)\}\)'
    if ($content -match $pattern5) {
        $content = $content -replace $pattern5, '{ $1 }'
        $fileFixes++
        Write-Host "  ✓ Fixed malformed fetch body" -ForegroundColor Green
    }

    # FIX 6: Fix parameter naming mismatch (_key -> key)
    # This is more conservative - only fix in function bodies
    $pattern6 = 'async\s+(\w+)\((_\w+):\s*string\):\s*Promise<[^>]+>\s*\{[^}]*?\n\s+try\s*\{[^}]*?const\s+result\s*=\s*await\s+[^.]+\.get\(\2\)'
    if ($content -match $pattern6) {
        # Replace _key with key in function signature
        $content = $content -replace '(_\w+):\s*string', '$1:string' # Normalize first
        $content = $content -replace 'async\s+get<T>\((_\w+):', 'async get<T>(key:'
        $content = $content -replace '\.get\(_key\)', '.get(key)'
        $fileFixes++
        Write-Host "  ✓ Fixed parameter naming mismatch" -ForegroundColor Green
    }

    # FIX 7: Fix stray } before export statements (common pattern)
    $pattern7 = '(?m)^}\s*\n(export\s+(interface|type|class|function|const))'
    if ($content -match $pattern7) {
        $content = $content -replace $pattern7, "`$1"
        $fileFixes++
        Write-Host "  ✓ Removed stray } before export" -ForegroundColor Green
    }

    # Write fixed content back to file
    if ($content -ne $originalContent) {
        Set-Content -Path $file -Value $content -NoNewline
        $fixCount++
        $totalFixes += $fileFixes
        Write-Host "  ✅ Applied $fileFixes fixes to $(Split-Path $file -Leaf)" -ForegroundColor Green
    } else {
        Write-Host "  ℹ️  No fixes needed" -ForegroundColor Gray
    }
}

Write-Host "`n" + ("=" * 60) -ForegroundColor Gray
Write-Host "📊 Summary:" -ForegroundColor Cyan
Write-Host "  Files processed: $($serviceFiles.Count)" -ForegroundColor White
Write-Host "  Files fixed: $fixCount" -ForegroundColor Green
Write-Host "  Total fixes applied: $totalFixes" -ForegroundColor Green

Write-Host "`n🧪 Running TypeScript validation..." -ForegroundColor Cyan
Set-Location "C:\Users\james\Videos\deeds-web-app\sveltekit-frontend"

$tscOutput = npx tsc --noEmit --skipLibCheck 2>&1 | Out-String
$errorMatches = [regex]::Matches($tscOutput, 'error TS')
$errorCount = $errorMatches.Count

if ($errorCount -eq 0) {
    Write-Host "`n🎉🎉🎉 ZERO TYPESCRIPT ERRORS - BUILD IS CLEAN! 🎉🎉🎉" -ForegroundColor Green
} else {
    Write-Host "`n⚠️  $errorCount TypeScript errors remaining" -ForegroundColor Yellow
    Write-Host "First 20 errors:" -ForegroundColor Gray
    npx tsc --noEmit --skipLibCheck 2>&1 | Select-String "error TS" | Select-Object -First 20
}

Write-Host "`n✅ Bulk fix complete!" -ForegroundColor Green
