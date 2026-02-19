#!/usr/bin/env pwsh
# Fix TypeScript .d.ts module declaration syntax errors
# Fixes: declare module 'package': { ... } → declare module 'package' { ... }

param(
    [switch]$DryRun,
    [switch]$Verbose
)

Write-Host "╔═══════════════════════════════════════════════════════╗" -ForegroundColor Cyan
Write-Host "║    TypeScript Declaration Fixer (.d.ts)             ║" -ForegroundColor Cyan
Write-Host "╚═══════════════════════════════════════════════════════╝" -ForegroundColor Cyan
Write-Host ""

$count = 0
$errors = 0

# Get all .d.ts files
$files = Get-ChildItem -Path src -Recurse -Include *.d.ts -File | 
    Where-Object { 
        $_.FullName -notmatch '[\\/]node_modules[\\/]' -and
        $_.FullName -notmatch '[\\/]\.svelte-kit[\\/]'
    }

Write-Host "Found $($files.Count) TypeScript declaration files..." -ForegroundColor Yellow
Write-Host ""

foreach ($file in $files) {
    try {
        $content = Get-Content $file.FullName -Raw -ErrorAction Stop
        if (-not $content) { continue }
        
        $original = $content
        
        # Fix 1: declare module 'name': { ... } → declare module 'name' { ... }
        # Match: declare module 'anything' or "anything" followed by : {
        $content = $content -replace "declare\s+module\s+(['\`"][^'\`"]+['\`"]):\s*\{", 'declare module $1 {'
        
        # Fix 2: declare module 'name': any → declare module 'name'
        $content = $content -replace "declare\s+module\s+(['\`"][^'\`"]+['\`"]):\s*any", 'declare module $1'
        
        # Fix 3: interface declarations with trailing colons
        # export interface Name: { ... } → export interface Name { ... }
        $content = $content -replace "(export\s+)?interface\s+(\w+):\s*\{", '$1interface $2 {'
        
        # Fix 4: type declarations with trailing colons
        # export type Name: = ... → export type Name = ...
        $content = $content -replace "(export\s+)?type\s+(\w+):\s*=", '$1type $2 ='
        
        # Fix 5: namespace declarations with trailing colons
        $content = $content -replace "namespace\s+(\w+):\s*\{", 'namespace $1 {'
        
        if ($content -ne $original) {
            if (-not $DryRun) {
                Set-Content -Path $file.FullName -Value $content -NoNewline -Force
                Write-Host "✓ Fixed: $($file.Name)" -ForegroundColor Green
            } else {
                Write-Host "[DRY RUN] Would fix: $($file.Name)" -ForegroundColor Yellow
            }
            $count++
            
            if ($Verbose) {
                # Show what changed
                $diff = Compare-Object ($original -split "`n") ($content -split "`n") | Select-Object -First 5
                foreach ($d in $diff) {
                    if ($d.SideIndicator -eq '=>') {
                        Write-Host "    + $($d.InputObject)" -ForegroundColor Green
                    } else {
                        Write-Host "    - $($d.InputObject)" -ForegroundColor Red
                    }
                }
            }
        }
    }
    catch {
        $errors++
        Write-Host "✗ Error processing $($file.Name): $($_.Exception.Message)" -ForegroundColor Red
    }
}

Write-Host ""
Write-Host "╔═══════════════════════════════════════════════════════╗" -ForegroundColor Cyan
Write-Host "║                    SUMMARY                            ║" -ForegroundColor Cyan
Write-Host "╠═══════════════════════════════════════════════════════╣" -ForegroundColor Cyan
Write-Host "  Total files scanned: $($files.Count)" -ForegroundColor White
Write-Host "  Files fixed: $count" -ForegroundColor Green
Write-Host "  Errors: $errors" -ForegroundColor $(if ($errors -gt 0) { 'Red' } else { 'Green' })
if ($DryRun) {
    Write-Host "  Mode: DRY RUN (no changes made)" -ForegroundColor Yellow
}
Write-Host "╚═══════════════════════════════════════════════════════╝" -ForegroundColor Cyan
Write-Host ""

if (-not $DryRun -and $count -gt 0) {
    Write-Host "✓ Fixed module declarations! Run TypeScript check to verify." -ForegroundColor Green
    Write-Host "  npx tsc --noEmit --skipLibCheck" -ForegroundColor Cyan
}
