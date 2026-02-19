# Aggressive Line Break Restoration
# Fixes files where entire script blocks are collapsed to one line
$srcPath = "C:\Users\james\Videos\deeds-web-app\sveltekit-frontend\src"
$count = 0

$files = Get-ChildItem -Path $srcPath -Recurse -Filter "*.svelte" -ErrorAction SilentlyContinue

foreach ($file in $files) {
  try {
    $content = Get-Content $file.FullName -Raw -ErrorAction SilentlyContinue
    $modified = $false

    # Pattern 1: Add newlines after closing braces of blocks
    if ($content -match '}\s*async function') {
      $content = $content -replace '}\s*async function', "}`n  async function"
      $modified = $true
    }

    # Pattern 2: Add newlines after function definitions
    if ($content -match '}\s*function') {
      $content = $content -replace '}\s*function', "}`n  function"
      $modified = $true
    }

    # Pattern 3: Add newlines before comments at statement level
    if ($content -match '}(\s*\/\/)') {
      $content = $content -replace '}(\s*\/\/)', "}`n  `$1"
      $modified = $true
    }

    # Pattern 4: Add newlines after closing markup tags before text/elements
    if ($content -match '}\);\s+let ') {
      $content = $content -replace '}\);\s+let ', "});`n  let "
      $modified = $true
    }

    # Pattern 5: Add newlines before let/const declarations
    if ($content -match '};\s+let ') {
      $content = $content -replace '};\s+let ', "};`n  let "
      $modified = $true
    }

    # Pattern 6: Add newlines after closing bracket of effect
    if ($content -match '\}\);\s+async') {
      $content = $content -replace '\}\);\s+async', "});`n  async"
      $modified = $true
    }

    # Pattern 7: Fix inline if statements
    if ($content -match 'if \([^)]+\)\s*{[^}]+}\s*return') {
      $content = $content -replace 'if \(([^)]+)\)\s*{\s*([^}]+)\s*}\s*return', "if (`$1) {`n    `$2`n  }`n  return"
      $modified = $true
    }

    # Pattern 8: Clean excessive spaces
    $content = $content -replace '\n\s+\n', "`n`n"
    $content = $content -replace '\n{3,}', "`n`n"

    if ($modified) {
      Set-Content -Path $file.FullName -Value $content -Encoding UTF8 -ErrorAction SilentlyContinue
      $count++
      Write-Host "✅ Restored line breaks: $($file.Name)"
    }
  } catch {
    Write-Host "⚠️  Error processing $($file.Name): $_"
  }
}

Write-Host "`n✅ Restored line breaks in $count files"
