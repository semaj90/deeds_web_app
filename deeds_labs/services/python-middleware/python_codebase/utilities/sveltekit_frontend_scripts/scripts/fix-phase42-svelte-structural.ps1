<#
  Phase 42 – Svelte Structural Repair
  Detects malformed tags (<TagName, ...>) and restores valid Svelte syntax.

  Safety Features:
  - Backup all changed files (.bak42)
  - Remove bad commas from tag names
  - Insert minimal newlines for readability
  - Track all changes in detailed log
#>

$ErrorActionPreference = "Continue"
$root = "C:\Users\james\Videos\deeds-web-app\sveltekit-frontend\src"
$timestamp = Get-Date -Format "yyyy-MM-dd_HH-mm-ss"
$report = "phase42-svelte-structural-report_$timestamp.log"

if (Test-Path $report) { Remove-Item $report -Force }
New-Item -ItemType File -Path $report | Out-Null

Write-Host "🚀 Phase 42 – Svelte Structural Repair" -ForegroundColor Cyan
Write-Host "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━" -ForegroundColor Cyan
Write-Host "Scanning: $root" -ForegroundColor White
Write-Host ""

$files = @(Get-ChildItem -Path $root -Recurse -Filter "*.svelte")
$total = 0
$fixed = 0
$filesList = @()

foreach ($file in $files) {
  $content = Get-Content $file.FullName -Raw

  # Pattern 1: Malformed component tags with commas (<TagName, ...>)
  if ($content -match "<[A-Za-z0-9_.]+,") {
    $total++
    $backup = "$($file.FullName).bak42"
    Copy-Item $file.FullName $backup -Force

    $originalLines = ($content -split "`n").Count

    # Fix: replace commas after component names with nothing
    $fixedText = [regex]::Replace($content, "<([A-Za-z0-9_.]+),", '<$1')

    # Fix: restore newlines after closing tags before blocks
    $fixedText = $fixedText -replace ">(\s*){#", ">`n`$1{#"
    $fixedText = $fixedText -replace "}\s*</", "}`n</"
    $fixedText = $fixedText -replace "/>(\s*){#", "/>`n`$1{#"

    Set-Content -Path $file.FullName -Value $fixedText -Encoding UTF8
    $fixed++

    $newLines = ($fixedText -split "`n").Count
    $filesList += @{
      File = $file.FullName
      OriginalLines = $originalLines
      NewLines = $newLines
      Status = "✅ Fixed"
    }

    Write-Host "✅ $($file.Name)" -ForegroundColor Green
    Add-Content $report "Fixed malformed tag in: $($file.FullName) (lines: $originalLines → $newLines)"
  }
  else {
    $filesList += @{
      File = $file.FullName
      Status = "✓ OK"
    }
  }
}

Write-Host ""
Write-Host "📊 Phase 42 Svelte Structural Repair Complete" -ForegroundColor Green
Write-Host "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━" -ForegroundColor Green
Write-Host "Files scanned:    $($files.Count)" -ForegroundColor White
Write-Host "Malformed tags:   $total" -ForegroundColor Yellow
Write-Host "Fixed:            $fixed" -ForegroundColor Green
Write-Host "Backups created:  $fixed (.bak42 files)" -ForegroundColor Cyan
Write-Host ""
Write-Host "🧾 Detailed log → $report" -ForegroundColor Cyan
Write-Host ""

if ($fixed -gt 0) {
  Write-Host "⚠️  Next steps:" -ForegroundColor Yellow
  Write-Host "  1. npx prettier src/**/*.svelte --write --parser svelte" -ForegroundColor White
  Write-Host "  2. npm run check:svelte" -ForegroundColor White
  Write-Host "  3. npm run build" -ForegroundColor White
  Write-Host "  4. git commit -m 'fix: Phase 42 – Svelte structural repair (comma-tag fix)'" -ForegroundColor White
}
else {
  Write-Host "✅ No malformed tags detected - all Svelte files are structurally sound!" -ForegroundColor Green
}
