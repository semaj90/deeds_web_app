Set-Location $PSScriptRoot\..
$dirs = @('cases','codebase','poi','legal-corpus','editor','forms','detective','canvas','citations','legal','legal-ai')
foreach ($d in $dirs) {
    $files = Get-ChildItem "src\lib\components\$d" -File -Filter *.svelte -Recurse -ErrorAction SilentlyContinue
    foreach ($f in $files) {
        $n = $f.BaseName
        $static = @(rg "from.*$n" src/ --type ts --type-add "svelte:*.svelte" --type svelte -l 2>$null | Where-Object { $_ -notmatch "components[\\/]$d" })
        $dynamic = @(rg "import\(.*$n" src/ --type ts --type-add "svelte:*.svelte" --type svelte -l 2>$null)
        if ($static.Count -eq 0 -and $dynamic.Count -eq 0) {
            $lines = (Get-Content $f.FullName).Count
            Write-Host "ORPHAN: components/$d/$n.svelte ($lines lines)"
        }
    }
}
Write-Host "`n--- SCAN COMPLETE ---"
