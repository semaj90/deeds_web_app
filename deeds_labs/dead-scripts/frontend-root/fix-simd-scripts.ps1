# Fix SIMD scripts in package.json
$packageJson = Get-Content "package.json" -Raw
$packageJson = $packageJson -replace 'ultra-json-simd', 'simd-json-accelerator'
Set-Content "package.json" -Value $packageJson
Write-Host "✅ Fixed SIMD scripts in package.json"
