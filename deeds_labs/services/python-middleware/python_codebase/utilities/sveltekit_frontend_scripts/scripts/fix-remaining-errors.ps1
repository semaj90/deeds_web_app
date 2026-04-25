#!/usr/bin/env pwsh
# Fix Remaining TypeScript Errors - Phase 3
# Targets specific patterns found in top priority files

$ErrorActionPreference = "Stop"

Write-Host "🔧 Phase 3: Fixing Remaining Patterns..." -ForegroundColor Cyan

$srcPath = Join-Path $PSScriptRoot "..\src"
$fixedCount = 0

# Get top priority files based on error scanner results
$topFiles = @(
    "lib\types\external-services.ts",
    "lib\data\routes-config.ts",
    "lib\services\legal-ai-client.ts",
    "lib\services\enhanced-rag-suggestions-service.ts",
    "lib\ai\gpu-acceleration-pipeline.ts",
    "lib\services\go-microservice-client.ts",
    "lib\components\ui\modular\types.ts",
    "lib\optimization\index.ts",
    "lib\proto\enhanced-rag.ts",
    "lib\services\enhanced-rag-semantic-analyzer.ts"
)

foreach ($relativePath in $topFiles) {
    $filePath = Join-Path $srcPath $relativePath
    
    if (-not (Test-Path -LiteralPath $filePath)) {
        Write-Host "⚠️  File not found: $relativePath" -ForegroundColor Yellow
        continue
    }
    
    try {
        $content = Get-Content -LiteralPath $filePath -Raw
        $original = $content
        
        # Fix 1: Interface closing with extra space and braces
        $content = $content -replace '}\s+}\s*$', '}'
        
        # Fix 2: Export with double closing
        $content = $content -replace 'export\s+(interface|type|const)\s+(\w+)[^{]*\{[^}]*}\s+}', 'export $1 $2 {'
        
        # Fix 3: Function signature spacing
        $content = $content -replace '\(\s*\)\s*:\s+Promise', '(): Promise'
        $content = $content -replace '\]\s*\)\s*:\s+Promise', ']): Promise'
        
        # Fix 4: Clean up spacing in type definitions
        $content = $content -replace ':\s{2,}', ': '
        
        # Fix 5: Remove spaces before commas in type parameters
        $content = $content -replace '\s+,\s+', ', '
        
        # Fix 6: Fix malformed as casting
        $content = $content -replace '\)\s+as\s+:', ') as '
        
        # Fix 7: Clean up export default patterns
        $content = $content -replace 'export\s+default\s+}\s+as\s+const', 'export default'
        
        if ($content -ne $original) {
            Set-Content -LiteralPath $filePath -Value $content
            $fixedCount++
            Write-Host "✅ Fixed: $relativePath" -ForegroundColor Green
        } else {
            Write-Host "   No changes: $relativePath" -ForegroundColor Gray
        }
    }
    catch {
        Write-Host "❌ Error in: $relativePath" -ForegroundColor Red
        Write-Host "   $($_.Exception.Message)" -ForegroundColor DarkRed
    }
}

Write-Host "`n═══════════════════════════════════════════════════" -ForegroundColor Cyan
Write-Host "✨ Phase 3 Complete!" -ForegroundColor Green
Write-Host "   Files fixed: $fixedCount / $($topFiles.Count)" -ForegroundColor Yellow
Write-Host "═══════════════════════════════════════════════════`n" -ForegroundColor Cyan

if ($fixedCount -gt 0) {
    Write-Host "📝 Next: Run 'npm run check' to validate" -ForegroundColor Cyan
}

exit 0
