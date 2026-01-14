# Phase 97: Dry-Run Batch Fixer
# Safe preview of fixes before applying them

param(
    [switch]$DryRun = $false,
    [int]$Limit = 5,
    [switch]$Apply = $false
)

$ErrorActionPreference = 'Continue'

Write-Host "🔍 Phase 97: Dry-Run Batch Fixer" -ForegroundColor Cyan
Write-Host "=" * 70
Write-Host ""

if ($DryRun) {
    Write-Host "🛡️  DRY-RUN MODE: No files will be modified" -ForegroundColor Yellow
} else {
    Write-Host "⚠️  APPLY MODE: Files will be modified!" -ForegroundColor Red
}
Write-Host ""

# Priority fix patterns for Iteration 2
$fixPatterns = @(
    @{
        Name = "Function Param Type Corruption"
        Description = "Fix 'param, Type' -> 'param: Type' (Excluding Map<string, Type>)"
        Regex = "(?<!<\s*)\b([a-z]\w*)\s*,\s*([A-Z]\w{2,})\b"
        Replacement = '$1: $2'
        FilePattern = "*ai-service-worker.ts"
        Priority = 1
    },
    @{
        Name = "Function Param Duplicate"
        Description = "Fix 'taskId, taskId: string' -> 'taskId: string'"
        Regex = "\b([a-z]\w*)\s*,\s*\1\s*:"
        Replacement = '$1:'
        FilePattern = "*ai-service-worker.ts"
        Priority = 1
    },
    @{
        Name = "Restoration of Closing Parenthesis"
        Description = "Fix 'Type: Promise' -> 'Type): Promise'"
        Regex = "(AbortSignal|AITask|AIProviderConfig|string|number|boolean|void|unknown)\s*:\s*Promise"
        Replacement = '$1): Promise'
        FilePattern = "*ai-service-worker.ts"
        Priority = 1
    },
    @{
        Name = "Function Param Type Corruption (Lowercase Types)"
        Description = "Fix 'param, type' -> 'param: type' (for primitive types)"
        Regex = "(?<!<\s*)\b([a-z]\w*)\s*,\s*(string|number|boolean|any|unknown|void|never|object)\b"
        Replacement = '$1: $2'
        FilePattern = "*.ts"
        Priority = 1
    },
    @{
        Name = "Interface Property Corruption"
        Description = "Fix 'prop, Type' -> 'prop: Type' inside interfaces"
        Regex = "^\s*([a-z]\w*)\s*,\s*([A-Za-z]\w*(\[\])?)"
        Replacement = '$1: $2'
        FilePattern = "*.ts"
        Priority = 1
    },
    @{
        Name = "Destructuring Comma Corruption"
        Description = "Fix '({ request: url })' -> '({ request, url })' in RequestHandlers"
        Regex = "async\s*\(\s*\{\s*request\s*:\s*url\s*\}\s*\)"
        Replacement = 'async ({ request, url })'
        FilePattern = "+server.ts"
        Priority = 1
    },
    @{
        Name = "Ternary Comma to Colon"
        Description = "Fix ternary operators using ',' instead of ':'"
        Regex = "(\?\s*'[^']*')\s*,\s*('[^']*')"
        Replacement = '$1 : $2'
        FilePattern = "*.svelte"
        Priority = 1
    },
    @{
        Name = "CSS Pseudo-class Comma"
        Description = "Fix ':hover, not(disabled)' → ':hover:not(:disabled)'"
        Regex = ":hover,\s*not\(disabled\)"
        Replacement = ":hover:not(:disabled)"
        FilePattern = "*.svelte"
        Priority = 1
    },
    @{
        Name = "CSS Pseudo-class Comma Alt"
        Description = "Fix ':hover, not(:disabled)' → ':hover:not(:disabled)'"
        Regex = ":hover,\s*not\(:disabled\)"
        Replacement = ":hover:not(:disabled)"
        FilePattern = "*.svelte"
        Priority = 1
    },
    # @{
    #     Name = "Object Literal Colon in Function Call"
    #     Description = "Fix 'sendProgress(name: value)' -> 'sendProgress(name, value)'"
    #     Regex = "(\w+)\((\w+):\s*([^)]+)\)"
    #     Replacement = '$1($2, $3)'
    #     FilePattern = "*.ts"
    #     Priority = 2
    # },
    @{
        Name = "Nullish Coalescing Mixed with OR"
        Description = "Add parentheses: 'a ?? b || c' → '(a ?? b) || c'"
        Regex = "(\w+\.\w+)\s*\?\?\s*(\w+\.\w+)\s*\|\|\s*('[^']*')"
        Replacement = '($1 ?? $2) || $3'
        FilePattern = "*.ts"
        Priority = 2
    }
)

# Scan for files needing fixes
$results = @()
$scannedCount = 0
$matchCount = 0

Write-Host "📂 Scanning for fixable issues..." -ForegroundColor Yellow
Write-Host ""

foreach ($pattern in $fixPatterns) {
    Write-Host "  Checking: $($pattern.Name)" -ForegroundColor Cyan

    $files = Get-ChildItem -Path src -Recurse -Filter $pattern.FilePattern -ErrorAction SilentlyContinue

    foreach ($file in $files) {
        if ($matchCount -ge $Limit) { break }

        $content = Get-Content $file.FullName -Raw -ErrorAction SilentlyContinue
        if (-not $content) { continue }

        $scannedCount++

        if ($content -match $pattern.Regex) {
            $matches = [regex]::Matches($content, $pattern.Regex)

            foreach ($match in $matches) {
                if ($matchCount -ge $Limit) { break }

                # Get context (3 lines before/after)
                $lines = $content -split "`n"
                $lineNum = ($content.Substring(0, $match.Index) -split "`n").Count
                $startLine = [Math]::Max(0, $lineNum - 3)
                $endLine = [Math]::Min($lines.Count - 1, $lineNum + 3)

                $contextBefore = $lines[$startLine..($lineNum-1)] -join "`n"
                $contextAfter = $lines[($lineNum+1)..$endLine] -join "`n"

                $fixed = $match.Value -replace $pattern.Regex, $pattern.Replacement

                $results += [PSCustomObject]@{
                    File = $file.FullName.Replace("$PWD\", "")
                    Pattern = $pattern.Name
                    Line = $lineNum
                    Original = $match.Value
                    Fixed = $fixed
                    ContextBefore = $contextBefore
                    ContextAfter = $contextAfter
                }

                $matchCount++
            }
        }
    }
}

Write-Host ""
Write-Host "=" * 70
Write-Host "📊 Scan Results:" -ForegroundColor Cyan
Write-Host "   Files scanned: $scannedCount" -ForegroundColor White
Write-Host "   Issues found: $matchCount (limited to $Limit)" -ForegroundColor White
Write-Host ""

if ($results.Count -eq 0) {
    Write-Host "✅ No fixable issues found in sampled files!" -ForegroundColor Green
    exit 0
}

# Display preview
Write-Host "🔍 Preview of Changes:" -ForegroundColor Yellow
Write-Host ""

$fileNum = 1
foreach ($result in $results) {
    Write-Host "[$fileNum/$($results.Count)] " -NoNewline -ForegroundColor Cyan
    Write-Host "$($result.File):$($result.Line)" -ForegroundColor White
    Write-Host "    Pattern: $($result.Pattern)" -ForegroundColor Gray
    Write-Host ""

    # Show context
    if ($result.ContextBefore) {
        Write-Host "    $($result.ContextBefore)" -ForegroundColor DarkGray
    }

    Write-Host "  - $($result.Original)" -ForegroundColor Red
    Write-Host "  + $($result.Fixed)" -ForegroundColor Green

    if ($result.ContextAfter) {
        Write-Host "    $($result.ContextAfter)" -ForegroundColor DarkGray
    }

    Write-Host ""
    $fileNum++
}

Write-Host "=" * 70

# Apply fixes if requested
if ($Apply -and -not $DryRun) {
    Write-Host ""
    Write-Host "⚠️  Applying fixes to $($results.Count) locations..." -ForegroundColor Yellow

    $fixedFiles = @{}

    foreach ($result in $results) {
        $fullPath = Join-Path $PWD $result.File

        if (-not $fixedFiles.ContainsKey($fullPath)) {
            $fixedFiles[$fullPath] = Get-Content $fullPath -Raw
        }

        $pattern = ($fixPatterns | Where-Object { $_.Name -eq $result.Pattern })[0]
        $fixedFiles[$fullPath] = $fixedFiles[$fullPath] -replace $pattern.Regex, $pattern.Replacement
    }

    # Write files
    foreach ($file in $fixedFiles.Keys) {
        Set-Content $file -Value $fixedFiles[$file] -NoNewline
        $relPath = $file -replace [regex]::Escape($PWD), ""
        Write-Host "  ✅ Fixed: $relPath" -ForegroundColor Green
    }

    Write-Host ""
    Write-Host "✅ Applied $($results.Count) fixes to $($fixedFiles.Count) files" -ForegroundColor Green

} elseif ($Apply -and $DryRun) {
    Write-Host ""
    Write-Host "ℹ️  To apply these fixes, run:" -ForegroundColor Cyan
    Write-Host "   .\scripts\phase97-dry-run-fixer.ps1 -Apply -DryRun:`$false -Limit $Limit" -ForegroundColor White
} else {
    Write-Host ""
    Write-Host "ℹ️  This was a DRY-RUN. No files were modified." -ForegroundColor Cyan
    Write-Host "   To apply fixes, run:" -ForegroundColor Cyan
    Write-Host "   .\scripts\phase97-dry-run-fixer.ps1 -Apply -DryRun:`$false -Limit $Limit" -ForegroundColor White
}

Write-Host ""
Write-Host "💡 Recommendations:" -ForegroundColor Yellow
Write-Host "   1. Review the preview above carefully" -ForegroundColor White
Write-Host "   2. Test on a small sample first (-Limit 5)" -ForegroundColor White
Write-Host "   3. Run svelte-check before and after" -ForegroundColor White
Write-Host "   4. Commit changes to git for easy rollback" -ForegroundColor White
Write-Host ""

# Export results for comparison
$results | Export-Csv -Path "reports/phase97-dry-run-results.csv" -NoTypeInformation -Force
Write-Host "📝 Results exported to: reports/phase97-dry-run-results.csv" -ForegroundColor Gray
Write-Host ""
