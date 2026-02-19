#!/usr/bin/env pwsh
# Worker File Recovery Script
# Targets severely corrupted worker files with specialized patterns

$ErrorActionPreference = "Stop"

$workerFiles = @(
    "C:\Users\james\Videos\deeds-web-app\sveltekit-frontend\src\workers\ingestion-worker.ts",
    "C:\Users\james\Videos\deeds-web-app\sveltekit-frontend\src\workers\webllama.worker.ts"
)

Write-Host "🔧 Worker File Recovery..." -ForegroundColor Cyan

foreach ($filePath in $workerFiles) {
    if (-not (Test-Path -LiteralPath $filePath)) {
        Write-Host "⚠️  File not found: $(Split-Path $filePath -Leaf)" -ForegroundColor Yellow
        continue
    }
    
    try {
        $content = Get-Content -LiteralPath $filePath -Raw
        $original = $content
        
        # Worker-specific fixes
        
        # Fix 1: postMessage parameters
        $content = $content -replace 'postMessage\(([^)]*?):\s*([a-z])', 'postMessage($1, $2'
        
        # Fix 2: addEventListener parameters  
        $content = $content -replace "addEventListener\('(\w+)'\s*:\s*\(", "addEventListener('$1', ("
        
        # Fix 3: Switch case with colons
        $content = $content -replace 'case\s+[''"](\w+)[''"]\s*:\s*\{', 'case ''$1'': {'
        
        # Fix 4: Import worker types
        $content = $content -replace 'import\s+type\s+\{([^}]*?):\s*([A-Z])', 'import type {$1, $2'
        
        # Fix 5: Worker message data destructuring
        $content = $content -replace 'const\s+\{([^}]*?):\s*([a-z][a-zA-Z0-9]*)\s*\}', 'const {$1, $2}'
        
        # Fix 6: Worker response object
        $content = $content -replace '\{([^}]*?):\s*([a-z][a-zA-Z0-9]*)\s*:\s*', '{$1, $2: '
        
        # Fix 7: Try-catch in worker context
        $content = $content -replace 'catch\s*\(([^)]*?):\s*([a-z])', 'catch ($1) {'
        
        # Fix 8: Worker type assertions
        $content = $content -replace '\s+as\s+:\s+', ' as '
        
        # Fix 9: Async function signatures in workers
        $content = $content -replace 'async\s+function\s+(\w+)\(([^)]*?):\s*([a-z])', 'async function $1($2, $3'
        
        # Fix 10: Worker error handling
        $content = $content -replace 'error\s*:\s*([^,}\n]+?)\s*:\s*', 'error: $1, '
        
        if ($content -ne $original) {
            # Create backup
            $backupPath = "$filePath.backup-$(Get-Date -Format 'yyyyMMdd-HHmmss')"
            Copy-Item -LiteralPath $filePath -Destination $backupPath
            
            Set-Content -LiteralPath $filePath -Value $content
            Write-Host "✅ Fixed: $(Split-Path $filePath -Leaf)" -ForegroundColor Green
            Write-Host "   Backup: $(Split-Path $backupPath -Leaf)" -ForegroundColor Gray
        } else {
            Write-Host "   No changes: $(Split-Path $filePath -Leaf)" -ForegroundColor Gray
        }
    }
    catch {
        Write-Host "❌ Error in: $(Split-Path $filePath -Leaf)" -ForegroundColor Red
        Write-Host "   $($_.Exception.Message)" -ForegroundColor DarkRed
    }
}

Write-Host "`n✨ Worker recovery complete!`n" -ForegroundColor Green

exit 0
