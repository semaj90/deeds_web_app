# Fix all stray commas after 'from' in import statements
# Run from workspace root

$pattern = "from,\s"
$replacement = "from "

$files = Get-ChildItem -Path "sveltekit-frontend/src" -Recurse -Include "*.ts", "*.js", "*.svelte" | Select-Object -ExpandProperty FullName

$fixedCount = 0

foreach ($file in $files) {
    $content = Get-Content -Path $file -Raw -ErrorAction SilentlyContinue
    if ($null -eq $content) { continue }

    if ($content -match $pattern) {
        $newContent = $content -replace $pattern, $replacement
        Set-Content -Path $file -Value $newContent -NoNewline
        $fixedCount++
        Write-Host "✅ Fixed: $file"
    }
}

Write-Host ""
Write-Host "Total files fixed: $fixedCount" -ForegroundColor Green
