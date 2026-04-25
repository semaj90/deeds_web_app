# Fix stray colon syntax errors in TypeScript and Svelte files
# Optimized version with parallel processing and proper regex patterns

param(
    [switch]$DryRun,
    [switch]$Verbose
)

Write-Host "╔═══════════════════════════════════════════════════════╗" -ForegroundColor Cyan
Write-Host "║    Colon Syntax Fixer - Optimized Edition           ║" -ForegroundColor Cyan
Write-Host "╚═══════════════════════════════════════════════════════╝" -ForegroundColor Cyan
Write-Host ""

$ErrorActionPreference = 'SilentlyContinue'
$count = 0
$errors = 0
$startTime = Get-Date

# Get all files, excluding problem areas
$files = Get-ChildItem -Path src -Recurse -Include *.svelte,*.ts,*.js -File | 
    Where-Object { 
        $_.FullName -notmatch '[\\/]node_modules[\\/]' -and
        $_.FullName -notmatch '[\\/]\.svelte-kit[\\/]' -and
        $_.FullName -notmatch '[\\/]build[\\/]' -and
        $_.FullName -notmatch '[\\/]dist[\\/]'
    }

Write-Host "Found $($files.Count) files to scan..." -ForegroundColor Yellow
Write-Host ""

# Process files in batches for better performance
$batchSize = 50
for ($i = 0; $i -lt $files.Count; $i += $batchSize) {
    $batch = $files[$i..[Math]::Min($i + $batchSize - 1, $files.Count - 1)]
    
    $batch | ForEach-Object -Parallel {
        $file = $_
        $VerbosePreference = $using:Verbose ? 'Continue' : 'SilentlyContinue'
        
        try {
            $content = Get-Content $file.FullName -Raw -ErrorAction Stop
            if (-not $content) { return }
            
            $original = $content
            
            # More precise regex patterns to avoid false positives
            # Fix return: statements (but not in object literals)
            $content = $content -replace '(?<![:\w])\breturn:\s+(?=[''"`])', 'return '
            
            # Fix case: in switch statements
            $content = $content -replace '(?<=^\s*)case:\s+(?=[''"`])', 'case ' -replace '(?<=\s)case:\s+(?=[''"`])', 'case '
            
            # Fix import: statements
            $content = $content -replace '^\s*import:\s+', 'import '
            
            # Fix export: statements  
            $content = $content -replace '^\s*export:\s+', 'export '
            
            if ($content -ne $original) {
                if (-not $using:DryRun) {
                    Set-Content -Path $file.FullName -Value $content -NoNewline -Force
                }
                return @{
                    Success = $true
                    File = $file.FullName
                    Changed = $true
                }
            }
            return @{ Success = $true; Changed = $false }
        }
        catch {
            return @{
                Success = $false
                File = $file.FullName
                Error = $_.Exception.Message
            }
        }
    } -ThrottleLimit 10 | ForEach-Object {
        if ($_.Success -and $_.Changed) {
            $count++
            if ($DryRun) {
                Write-Host "[DRY RUN] Would fix: $($_.File)" -ForegroundColor Yellow
            } else {
                Write-Host "✓ Fixed: $($_.File)" -ForegroundColor Green
            }
        }
        elseif (-not $_.Success) {
            $errors++
            Write-Host "✗ Error: $($_.File) - $($_.Error)" -ForegroundColor Red
        }
    }
    
    # Progress indicator
    $progress = [Math]::Min(100, [int](($i + $batchSize) / $files.Count * 100))
    Write-Progress -Activity "Processing files" -Status "$progress% Complete" -PercentComplete $progress
}

Write-Progress -Activity "Processing files" -Completed

$elapsed = ((Get-Date) - $startTime).TotalSeconds

Write-Host ""
Write-Host "╔═══════════════════════════════════════════════════════╗" -ForegroundColor Cyan
Write-Host "║                    SUMMARY                            ║" -ForegroundColor Cyan
Write-Host "╠═══════════════════════════════════════════════════════╣" -ForegroundColor Cyan
Write-Host "  Total files scanned: $($files.Count)" -ForegroundColor White
Write-Host "  Files fixed: $count" -ForegroundColor Green
Write-Host "  Errors: $errors" -ForegroundColor $(if ($errors -gt 0) { 'Red' } else { 'Green' })
Write-Host "  Time elapsed: $([Math]::Round($elapsed, 2))s" -ForegroundColor White
if ($DryRun) {
    Write-Host "  Mode: DRY RUN (no changes made)" -ForegroundColor Yellow
}
Write-Host "╚═══════════════════════════════════════════════════════╝" -ForegroundColor Cyan
Write-Host ""

if (-not $DryRun -and $count -gt 0) {
    Write-Host "✓ Changes saved! Clear cache and restart dev server." -ForegroundColor Green
    Write-Host "  Run: npm run dev" -ForegroundColor Cyan
}
