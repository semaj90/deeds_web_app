<#
.SYNOPSIS
    Phase 66 Environment Discovery + Unifier Script
.DESCRIPTION
    Finds all .env files in the repo, extracts variables, merges, and generates `.env.phase66.generated`.
#>

param(
    [string]$RootPath = "C:\Users\james\Videos\deeds-web-app",
    [switch]$WriteMerged
)

Write-Host "🔍 Searching for .env files under $RootPath..." -ForegroundColor Cyan
$envFiles = Get-ChildItem -Path $RootPath -Recurse -Force -Include ".env*" |
    Where-Object { -not $_.FullName.Contains("node_modules") -and -not $_.FullName.Contains(".venv") -and -not $_.FullName.Contains("__pycache__") }

if (-not $envFiles) {
    Write-Host "⚠️  No .env files found."
    exit
}

$allVars = @{}
$duplicates = @{}

foreach ($file in $envFiles) {
    Write-Host "📄 Reading $($file.FullName)" -ForegroundColor Yellow
    $lines = Get-Content $file.FullName | Where-Object { $_ -match '^[A-Za-z_]+=' }

    foreach ($line in $lines) {
        $parts = $line -split '=', 2
        $key = $parts[0].Trim()
        $val = $parts[1].Trim()

        if ($allVars.ContainsKey($key)) {
            if ($allVars[$key] -ne $val) {
                if (-not $duplicates.ContainsKey($key)) {
                    $duplicates[$key] = @()
                }
                $duplicates[$key] += @($allVars[$key], $val)
            }
        } else {
            $allVars[$key] = $val
        }
    }
}

Write-Host "`n✅ Found $($allVars.Count) unique environment variables." -ForegroundColor Green
if ($duplicates.Count -gt 0) {
    Write-Host "`n⚠️ Conflicting variable definitions:" -ForegroundColor Red
    foreach ($key in $duplicates.Keys) {
        Write-Host "  ${key}:"
        $duplicates[$key] | ForEach-Object { Write-Host "    -> $_" }
    }
}

if ($WriteMerged) {
    $mergedPath = Join-Path $RootPath ".env.phase66.generated"
    Write-Host "`n🧩 Writing merged environment file to $mergedPath..." -ForegroundColor Cyan

    "# Phase 66 Unified Environment - Auto Generated" | Out-File $mergedPath -Encoding utf8
    "# Generated on: $(Get-Date -Format 'yyyy-MM-dd HH:mm:ss')" | Out-File $mergedPath -Encoding utf8 -Append
    "" | Out-File $mergedPath -Encoding utf8 -Append

    foreach ($key in $allVars.Keys) {
        "$key=$($allVars[$key])" | Out-File $mergedPath -Encoding utf8 -Append
    }
    Write-Host "✅ Merged .env.phase66.generated created."
}

Write-Host "`n🏁 Complete." -ForegroundColor Green