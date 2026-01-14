# Phase 97: Automated Svelte Syntax Fixes
# Fixes: bind, → bind:, use, → use:, transition, → transition:

$ErrorActionPreference = 'Continue'
$fixedCount = 0
$fileCount = 0

Write-Host "🔧 Phase 97: Automated Svelte Syntax Fixes" -ForegroundColor Cyan
Write-Host "=" * 60

# Get all Svelte files
$svelteFiles = Get-ChildItem -Path src -Recurse -Filter "*.svelte" -ErrorAction SilentlyContinue

Write-Host "`nFound $($svelteFiles.Count) Svelte files to check..." -ForegroundColor Yellow
Write-Host ""

foreach ($file in $svelteFiles) {
    $relativePath = $file.FullName.Replace("$PWD\", "")
    $content = Get-Content $file.FullName -Raw -ErrorAction SilentlyContinue

    if (-not $content) { continue }

    $originalContent = $content
    $fileFixes = 0

    # Fix 1: bind, → bind:
    if ($content -match '\sbind,\s+') {
        $content = $content -replace '\sbind,\s+value=', ' bind:value='
        $content = $content -replace '\sbind,\s+checked=', ' bind:checked='
        $content = $content -replace '\sbind,\s+this=', ' bind:this='
        $content = $content -replace '\sbind,\s+group=', ' bind:group='
        $fileFixes++
    }

    # Fix 2: use, → use:
    if ($content -match '\suse,\s+') {
        $content = $content -replace '\suse,\s+enhance=', ' use:enhance='
        $content = $content -replace '\suse,\s+action=', ' use:action='
        $fileFixes++
    }

    # Fix 3: transition, → transition:
    if ($content -match '\stransition,\s+') {
        $content = $content -replace '\stransition,\s+fade', ' transition:fade'
        $content = $content -replace '\stransition,\s+slide', ' transition:slide'
        $content = $content -replace '\stransition,\s+fly', ' transition:fly'
        $content = $content -replace '\stransition,\s+scale', ' transition:scale'
        $fileFixes++
    }

    # Fix 4: in, → in: (animation directives)
    if ($content -match '\sin,\s+') {
        $content = $content -replace '\sin,\s+fade', ' in:fade'
        $content = $content -replace '\sin,\s+fly', ' in:fly'
        $fileFixes++
    }

    # Fix 5: out, → out: (animation directives)
    if ($content -match '\sout,\s+') {
        $content = $content -replace '\sout,\s+fade', ' out:fade'
        $content = $content -replace '\sout,\s+fly', ' out:fly'
        $fileFixes++
    }

    # Save if changed
    if ($content -ne $originalContent) {
        Set-Content $file.FullName -Value $content -NoNewline
        Write-Host "✅ Fixed $fileFixes issue(s) in: $relativePath" -ForegroundColor Green
        $fixedCount += $fileFixes
        $fileCount++
    }
}

Write-Host ""
Write-Host "=" * 60
Write-Host "✅ Complete! Fixed $fixedCount syntax issues in $fileCount files" -ForegroundColor Green
Write-Host ""
Write-Host "Next steps:" -ForegroundColor Yellow
Write-Host "1. Run: npx svelte-check --threshold error" -ForegroundColor White
Write-Host "2. Verify error count dropped significantly" -ForegroundColor White
Write-Host ""
