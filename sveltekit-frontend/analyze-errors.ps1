$ErrorActionPreference = 'Continue'
Write-Host "Running svelte-check..." -ForegroundColor Cyan

$output = npx svelte-check --tsconfig ./tsconfig.json 2>&1 | Out-String
$lines = $output -split "`n"

$errorFiles = @{}

foreach ($line in $lines) {
    if ($line -match '^> (.+\.(?:ts|svelte|js)):(\d+):(\d+)') {
        $file = $matches[1]
        if (-not $errorFiles.ContainsKey($file)) {
            $errorFiles[$file] = 0
        }
        $errorFiles[$file]++
    }
}

Write-Host "`n📊 TOP 100 FILES BY ERROR COUNT" -ForegroundColor Green
Write-Host "=" * 80

$errorFiles.GetEnumerator() | 
    Sort-Object -Property Value -Descending | 
    Select-Object -First 100 | 
    ForEach-Object -Begin { $rank = 1 } -Process {
        $fileName = Split-Path $_.Key -Leaf
        Write-Host ("{0,3}. {1,-50} {2,5} errors" -f $rank, $fileName, $_.Value)
        $rank++
    }

Write-Host "`n✅ Analysis complete!" -ForegroundColor Green
