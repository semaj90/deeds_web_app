#!/usr/bin/env pwsh
# Fix TypeScript Syntax Errors
# Targets common syntax issues found by the error scanner

$ErrorActionPreference = "Stop"

# Get all TypeScript files
$srcPath = Join-Path $PSScriptRoot "..\src"
$tsFiles = Get-ChildItem -Path $srcPath -Filter "*.ts" -Recurse -File

$fixedCount = 0
$errorCount = 0

Write-Host "🔧 Fixing TypeScript syntax errors..." -ForegroundColor Cyan
Write-Host "Found $($tsFiles.Count) TypeScript files`n"

foreach ($file in $tsFiles) {
    try {
        $content = Get-Content -LiteralPath $file.FullName -Raw
        $original = $content
        
        # Fix 1: Remove stray quotes after console.error/log
        $content = $content -replace "(console\.(error|log|warn|info)\([^)]+\));[\r\n]+'", '$1;'
        
        # Fix 2: {, pattern to { (opening brace with comma)
        $content = $content -replace '\{\s*,\s*', '{ '
        
        # Fix 3: ;, pattern to ; (semicolon followed by comma)
        $content = $content -replace ';,\s*', '; '
        
        # Fix 4: backtick quotes in strings (template literals misuse)
        $content = $content -replace "code:\s*``([A-Z_]+)``", "code: '`$1'"
        
        # Fix 5: Mixed quotes in strings
        $content = $content -replace "message:\s*``([^``]+)``\s*\}", "message: '`$1' }"
        
        # Fix 6: }' }` patterns (malformed closing)
        $content = $content -replace "\}['\`]\s*\}[\`'\}]", '} }'
        $content = $content -replace "\}'\s*\}", '} }'
        $content = $content -replace "\}\`\s*\}", '} }'
        
        # Fix 7: Trailing commas in object literals before closing brace
        $content = $content -replace ',(\s*\})', '$1'
        
        # Fix 8: ;' at line endings
        $content = $content -replace ";[\r\n]+'", ';'
        $content = $content -replace ';\s*"\s*\}', '; }'
        
        # Fix 9: Double semicolons
        $content = $content -replace ';\s*;', ';'
        
        # Fix 10: Malformed type unions (;| instead of |)
        $content = $content -replace ';[\r\n]+\s*\|', '|'
        
        # Only save if changes were made
        if ($content -ne $original) {
            Set-Content -LiteralPath $file.FullName -Value $content
            $fixedCount++
            Write-Host "✅ Fixed: $($file.FullName.Replace($srcPath, 'src'))" -ForegroundColor Green
        }
    }
    catch {
        $errorCount++
        Write-Host "❌ Error in: $($file.FullName.Replace($srcPath, 'src'))" -ForegroundColor Red
        Write-Host "   $($_.Exception.Message)" -ForegroundColor DarkRed
    }
}

Write-Host "`n═══════════════════════════════════════════════════" -ForegroundColor Cyan
Write-Host "✨ Syntax Fix Complete!" -ForegroundColor Green
Write-Host "   Files fixed: $fixedCount" -ForegroundColor Yellow
Write-Host "   Errors: $errorCount" -ForegroundColor $(if ($errorCount -gt 0) { 'Red' } else { 'Green' })
Write-Host "═══════════════════════════════════════════════════`n" -ForegroundColor Cyan

if ($fixedCount -gt 0) {
    Write-Host "📝 Next steps:" -ForegroundColor Cyan
    Write-Host "   1. Run: npm run check" -ForegroundColor White
    Write-Host "   2. Review changes: git diff" -ForegroundColor White
    Write-Host "   3. Run error scanner again: node scripts/prioritize-error-fixes.mjs`n" -ForegroundColor White
}

exit 0
