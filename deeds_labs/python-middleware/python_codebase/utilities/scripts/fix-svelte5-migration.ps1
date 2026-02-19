# ======================================================================
# fix-svelte5-migration.ps1  –  Unified Svelte 5 + TypeScript auto-fixer
# ======================================================================
param(
  [string]$SrcPath = "src",
  [string]$ReportFile = "svelte5-diagnostics.json"
)

Write-Host "🧠 Starting Svelte 5 auto-fix pipeline..." -ForegroundColor Cyan

npm install svelte@latest @sveltejs/kit@latest --save-dev
npm install svelte-check ts-morph simdjson --save-dev

# --- quick text patches ------------------------------------------------
Get-ChildItem -Path $SrcPath -Recurse -Include *.svelte,*.ts | ForEach-Object {
  if (Test-Path $_.FullName) {
    (Get-Content $_.FullName) `
      -replace 'on:click={', 'on:click={($event: any) => ' `
      -replace '\.push\(', '.push(<any>' |
      Set-Content $_.FullName
  }
}

# --- ensure lang="ts" + close <script> ---------------------------------
Get-ChildItem -Path $SrcPath -Recurse -Include *.svelte | ForEach-Object {
  if (Test-Path $_.FullName) {
    $c = Get-Content $_.FullName -Raw
    if ($c -match '<script(?![^>]*lang="ts")') { $c = $c -replace '<script>', '<script lang="ts">' }
    if ($c -match '<script[^>]*>(.|\n)*$' -and $c -notmatch '</script>') { $c += "`n</script>" }
    Set-Content $_.FullName $c
  }
}

# --- run type check ----------------------------------------------------
Write-Host "🔍 Running svelte-check..." -ForegroundColor Yellow
$npx = (Get-Command npx).Source
& $npx svelte-check --tsconfig ./tsconfig.json --output json | Out-File $ReportFile

# --- invoke Node worker ------------------------------------------------
Write-Host "🧩 Launching Node enum/export fixer..." -ForegroundColor Cyan
node ./scripts/auto-fix-enums.mjs $ReportFile

Write-Host "✅ All done. Review updated files and rerun: npx svelte-check" -ForegroundColor Green