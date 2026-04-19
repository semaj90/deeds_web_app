$apiDir = Join-Path $PSScriptRoot '..\src\routes\api'
$serverFiles = Get-ChildItem -Path $apiDir -Recurse -Filter '+server.ts' | Where-Object { $_.FullName -notmatch 'phase104-backups|__tests__' }
$violations = @()

foreach ($file in $serverFiles) {
    $content = [System.IO.File]::ReadAllText($file.FullName)
    # Has POST/PATCH/PUT handler
    $hasHandler = $content -match 'export\s+(async\s+function|const)\s+(POST|PATCH|PUT)'
    # Uses request.json()
    $usesJson = $content -match 'request\.json\(\)'
    # Has safeParse or schema parse
    $hasSafeParse = $content -match '\.safeParse\('
    $hasZodParse = $content -match 'Schema\.parse\(' -or $content -match 'schema\.parse\('

    if ($hasHandler -and $usesJson -and -not $hasSafeParse -and -not $hasZodParse) {
        $relPath = $file.FullName.Replace($apiDir, 'src/routes/api').Replace('\', '/')
        $violations += $relPath
    }
}

foreach ($v in $violations) {
    Write-Host $v
}
Write-Host "---TOTAL: $($violations.Count) ---"
