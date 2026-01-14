$path = "c:\Users\james\Videos\deeds-web-app\sveltekit-frontend\src\routes\api\codebase\apply-patch\+server.ts"
$content = Get-Content $path -Raw
Write-Host "Original Length: $($content.Length)"

# Interface Fix (Literal replace for test)
$content = $content -replace "after, string;", "after: string;"

# Destructuring Fix (Regex)
$content = $content -replace "async \(\{\s*request\s*:\s*fetch\s*\}\)", "async ({ request, fetch })"

Set-Content $path -Value $content -NoNewline
Write-Host "Patched $path"
Write-Host "New Length: $($content.Length)"
