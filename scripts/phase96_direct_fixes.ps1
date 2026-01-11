# Phase 96: Direct CSS Fixes
# Apply known fixes for specific CSS parsing errors

$ErrorActionPreference = 'Stop'
$workspaceRoot = "C:\Users\james\Videos\deeds-web-app\sveltekit-frontend"
Set-Location $workspaceRoot

Write-Host "🚀 Phase 96: Direct CSS Fixes" -ForegroundColor Cyan
Write-Host "=" * 70

# Get baseline
Write-Host "`n📊 Getting baseline..." -ForegroundColor Yellow
$baseline = (npx svelte-check --threshold error 2>&1 | Select-String "found (\d+) errors" | ForEach-Object { $_.Matches.Groups[1].Value })
Write-Host "📊 Baseline: $baseline errors"

# Fix 1: Keyframe selector spacing (from" / "transform → from { transform)
Write-Host "`n🔧 Fix 1: Keyframe selector spacing..." -ForegroundColor Yellow
$files1 = rg '"from"\s*/\s*"transform:' src/ -g '*.svelte' -g '*.css' -l 2>$null
if ($files1) {
    foreach ($file in $files1) {
        $content = Get-Content $file -Raw
        $content = $content -replace '"from"\s*/\s*"transform:', 'from { transform:'
        $content = $content -replace ',\s*to"\s*with\s*message:', '} to { } }'
        Set-Content $file $content -NoNewline
    }
    Write-Host "✓ Fixed $($files1.Count) files"
} else {
    Write-Host "✓ No matches found"
}

# Fix 2: Global pseudo-class spacing (: global( → :global()
Write-Host "`n🔧 Fix 2: Global pseudo-class spacing..." -ForegroundColor Yellow
$files2 = rg ': global\(' src/ -g '*.svelte' -l 2>$null
if ($files2) {
    foreach ($file in $files2) {
        $content = Get-Content $file -Raw
        $content = $content -replace ': global\(', ':global('
        Set-Content $file $content -NoNewline
    }
    Write-Host "✓ Fixed $($files2.Count) files"
} else {
    Write-Host "✓ No matches found"
}

# Fix 3: Help toggle quote issue (.help-toggle" → .help-toggle)
Write-Host "`n🔧 Fix 3: Help toggle quotes..." -ForegroundColor Yellow
$files3 = rg '\.help-toggle"' src/ -g '*.svelte' -l 2>$null
if ($files3) {
    foreach ($file in $files3) {
        $content = Get-Content $file -Raw
        $content = $content -replace '\.help-toggle"', '.help-toggle'
        Set-Content $file $content -NoNewline
    }
    Write-Host "✓ Fixed $($files3.Count) files"
} else {
    Write-Host "✓ No matches found"
}

# Verify
Write-Host "`n✅ Verifying fixes..." -ForegroundColor Green
$final = (npx svelte-check --threshold error 2>&1 | Select-String "found (\d+) errors" | ForEach-Object { $_.Matches.Groups[1].Value })
$improvement = [int]$baseline - [int]$final

Write-Host "`n📊 Results:" -ForegroundColor Cyan
Write-Host "   Baseline: $baseline errors"
Write-Host "   Final: $final errors"
Write-Host "   Fixed: $improvement errors" -ForegroundColor $(if ($improvement -gt 0) { 'Green' } else { 'Yellow' })
