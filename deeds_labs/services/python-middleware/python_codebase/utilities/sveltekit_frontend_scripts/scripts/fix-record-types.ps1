# Mass fix Record<string X> to Record<string, X>
$srcPath = "C:\Users\james\Videos\deeds-web-app\sveltekit-frontend\src"
$count = 0
$failed = 0

$files = Get-ChildItem -Path $srcPath -Recurse -Filter "*.svelte" -ErrorAction SilentlyContinue

foreach ($file in $files) {
  try {
    $content = Get-Content $file.FullName -Raw -ErrorAction SilentlyContinue
    if ($content -match 'Record<string [a-zA-Z]') {
      $updated = $content -replace 'Record<string ([a-zA-Z])', 'Record<string, $1'
      Set-Content -Path $file.FullName -Value $updated -Encoding UTF8 -ErrorAction SilentlyContinue
      $count++
      Write-Host "✅ Fixed: $($file.Name)"
    }
  } catch {
    $failed++
  }
}

Write-Host "`n✅ Fixed $count files"
Write-Host "❌ Failed: $failed files"
