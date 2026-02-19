#!/usr/bin/env pwsh
# Phase 4: Aggressive Colon-to-Comma Syntax Fix
# Targets complex corruption: colons replacing commas in function signatures and object literals

$ErrorActionPreference = "Stop"

$srcPath = "C:\Users\james\Videos\deeds-web-app\sveltekit-frontend\src"
$tsFiles = Get-ChildItem -Path $srcPath -Filter "*.ts" -Recurse -File

$fixedCount = 0
$totalFixes = 0

Write-Host "🔧 Phase 4: Aggressive Colon-to-Comma Fix..." -ForegroundColor Cyan
Write-Host "Target: Complex syntax corruption (colons replacing commas)`n" -ForegroundColor Yellow

foreach ($file in $tsFiles) {
    try {
        $content = Get-Content -LiteralPath $file.FullName -Raw
        $original = $content
        $fileFixes = 0
        
        # Fix 1: Function parameters - Type: nextParam → Type, nextParam
        # Matches: (param: Type: nextParam) → (param: Type, nextParam)
        $before = $content
        $content = $content -replace '\(([^)]*?):\s*([A-Z][a-zA-Z0-9<>\[\]|&\s]*?):\s*([a-z])', '($1: $2, $3'
        if ($content -ne $before) { $fileFixes++ }
        
        # Fix 2: Multiple parameters with colon separation
        # Matches: (a: string: b: number) → (a: string, b: number)
        $before = $content
        $content = $content -replace '([a-z][a-zA-Z0-9]*)\s*:\s*([A-Z][a-zA-Z0-9<>\[\]|&\s]*?):\s*([a-z][a-zA-Z0-9]*)\s*:', '$1: $2, $3:'
        if ($content -ne $before) { $fileFixes++ }
        
        # Fix 3: Object literal properties - key: value: nextKey → key: value, nextKey
        # Matches: {key: value: another} → {key: value, another}
        $before = $content
        $content = $content -replace '(\{[^}]*?)([a-z][a-zA-Z0-9]*)\s*:\s*([^:,}\n]+?):\s*([a-z][a-zA-Z0-9]*)', '$1$2: $3, $4'
        if ($content -ne $before) { $fileFixes++ }
        
        # Fix 4: Array/object destructuring with colons
        # Matches: [a: b: c] → [a, b, c] or {a: b: c} → {a, b, c}
        $before = $content
        $content = $content -replace '([\[{])([a-z][a-zA-Z0-9]*)\s*:\s*([a-z][a-zA-Z0-9]*)\s*:', '$1$2, $3:'
        if ($content -ne $before) { $fileFixes++ }
        
        # Fix 5: Function call arguments - arg: nextArg → arg, nextArg
        # Matches: func(arg1: arg2) → func(arg1, arg2) when not type annotation
        $before = $content
        $content = $content -replace '(\w+)\(([^)]*?)([a-z][a-zA-Z0-9]*)\s*:\s*([a-z][a-zA-Z0-9]*)', '$1($2$3, $4'
        if ($content -ne $before) { $fileFixes++ }
        
        # Fix 6: Import/export statements with colons
        # Matches: import { a: b: c } → import { a, b, c }
        $before = $content
        $content = $content -replace '(import|export)\s*\{([^}]*?)([A-Z][a-zA-Z0-9]*)\s*:\s*([A-Z][a-zA-Z0-9]*)', '$1 {$2$3, $4'
        if ($content -ne $before) { $fileFixes++ }
        
        # Fix 7: Type union/intersection with colons
        # Matches: Type: OtherType → Type | OtherType (in type contexts)
        $before = $content
        $content = $content -replace ':\s*([A-Z][a-zA-Z0-9<>]*)\s*:\s*([A-Z][a-zA-Z0-9<>]*)', ': $1 | $2'
        if ($content -ne $before) { $fileFixes++ }
        
        # Fix 8: Return type with colon separation
        # Matches: ): Type: other → ): Type, other
        $before = $content
        $content = $content -replace '\)\s*:\s*([A-Z][a-zA-Z0-9<>\[\]|&\s]*?):\s*([a-z])', '): $1, $2'
        if ($content -ne $before) { $fileFixes++ }
        
        # Fix 9: Generic type parameters with colons
        # Matches: <T: U: V> → <T, U, V>
        $before = $content
        $content = $content -replace '<([A-Z][a-zA-Z0-9]*)\s*:\s*([A-Z][a-zA-Z0-9]*)\s*:', '<$1, $2:'
        if ($content -ne $before) { $fileFixes++ }
        
        # Fix 10: Array element separation
        # Matches: [item: item: item] → [item, item, item]
        $before = $content
        $content = $content -replace '\[([^\]]*?)(\w+)\s*:\s*(\w+)', '[$1$2, $3'
        if ($content -ne $before) { $fileFixes++ }
        
        # Fix 11: Conditional/ternary with colons (careful not to break ternary operator)
        # Matches: condition ? value: other → condition ? value : other (ensure spacing)
        $before = $content
        $content = $content -replace '\?\s*([^:\n]+?):([^:\n]+?)\s*:', '? $1 : $2:'
        if ($content -ne $before) { $fileFixes++ }
        
        # Fix 12: Multi-line object properties
        # Matches newline patterns: prop: value:\n  nextProp → prop: value,\n  nextProp
        $before = $content
        $content = $content -replace '([a-z][a-zA-Z0-9]*)\s*:\s*([^:,\n]+?):\s*\n', '$1: $2,`n'
        if ($content -ne $before) { $fileFixes++ }
        
        if ($content -ne $original) {
            Set-Content -LiteralPath $file.FullName -Value $content
            $fixedCount++
            $totalFixes += $fileFixes
            Write-Host "✅ $(($file.FullName -replace [regex]::Escape($srcPath), 'src').PadRight(80)) [$fileFixes fixes]" -ForegroundColor Green
        }
    }
    catch {
        Write-Host "❌ Error in: $($file.Name)" -ForegroundColor Red
        Write-Host "   $($_.Exception.Message)" -ForegroundColor DarkRed
    }
}

Write-Host "`n═══════════════════════════════════════════════════" -ForegroundColor Cyan
Write-Host "✨ Phase 4 Complete!" -ForegroundColor Green
Write-Host "   Files fixed: $fixedCount" -ForegroundColor Yellow
Write-Host "   Total pattern fixes: $totalFixes" -ForegroundColor Yellow
Write-Host "═══════════════════════════════════════════════════`n" -ForegroundColor Cyan

Write-Host "📝 Next steps:" -ForegroundColor Cyan
Write-Host "   1. Run: npm run check" -ForegroundColor White
Write-Host "   2. Validate: git diff src/workers/" -ForegroundColor White
Write-Host "   3. Re-scan: node scripts/prioritize-error-fixes.mjs`n" -ForegroundColor White

exit 0
