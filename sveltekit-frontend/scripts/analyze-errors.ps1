$ErrorActionPreference = "Continue"

Write-Host "📊 Analyzing TypeScript/Svelte errors..." -ForegroundColor Cyan

# Read error file
$errors = Get-Content "temp_errors.txt" -ErrorAction SilentlyContinue

# Extract file paths
$filePaths = $errors | Where-Object { $_ -match "^c:\\.*\.(?:svelte|ts|tsx):\d+:\d+" } | ForEach-Object {
    if ($_ -match "^(c:\\.*\.(?:svelte|ts|tsx)):(\d+):(\d+)") {
        [PSCustomObject]@{
            FilePath = $matches[1]
            Line = $matches[2]
            Col = $matches[3]
        }
    }
}

# Group by file and count errors
$grouped = $filePaths | Group-Object FilePath | Sort-Object Count -Descending

Write-Host "`n🔝 Top 30 Files with Most Errors:" -ForegroundColor Yellow
$grouped | Select-Object -First 30 | ForEach-Object {
    $fileName = Split-Path $_.Name -Leaf
    $relativePath = $_.Name -replace [regex]::Escape("c:\Users\james\Videos\deeds-web-app\sveltekit-frontend\"), ""
    [PSCustomObject]@{
        Errors = $_.Count
        File = $fileName
        Path = $relativePath
    }
} | Format-Table -AutoSize

Write-Host "`n📈 Total files with errors: $($grouped.Count)" -ForegroundColor Green
