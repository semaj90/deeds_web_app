Set-Location "$PSScriptRoot\.."
$files = Get-ChildItem "src\lib\components\ui" -File -Filter *.svelte -Recurse -ErrorAction SilentlyContinue
$orphans = @()
foreach ($f in $files) {
    $n = $f.BaseName
    $static = @(rg "from.*$n" src/ --type ts --type-add "svelte:*.svelte" --type svelte -l 2>$null | Where-Object { $_ -notmatch "components[\\/]ui[\\/]" })
    $dynamic = @(rg "import\(.*$n" src/ --type ts --type-add "svelte:*.svelte" --type svelte -l 2>$null)
    if ($static.Count -eq 0 -and $dynamic.Count -eq 0) {
        $lines = (Get-Content $f.FullName).Count
        $rel = $f.FullName -replace [regex]::Escape("$PWD\"), ''
        $orphans += "$rel ($lines lines)"
        Write-Host "ORPHAN: $rel ($lines lines)"
    }
}
Write-Host "`nTotal ui/ orphans: $($orphans.Count) / $($files.Count)"
Write-Host "--- SCAN COMPLETE ---"
