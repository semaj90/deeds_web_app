param(
    [string]$EnvPath = ".env",
    [string]$ExamplePath = ".env.example",
    [switch]$CheckOnly
)

$ErrorActionPreference = "Stop"

function Mask-EnvValue {
    param([string]$Key, [string]$Value)

    if ([string]::IsNullOrWhiteSpace($Value)) { return "" }

    $quoted = $Value.Trim()
    if ($quoted.StartsWith('"') -and $quoted.EndsWith('"')) {
        $quoted = $quoted.Substring(1, $quoted.Length - 2)
    }

    if ($Key -match '(SECRET|TOKEN|KEY|PASSWORD|PASS|PRIVATE|AUTH|COOKIE|SESSION|DATABASE_URL|REDIS_URL|URL)$') {
        return '"REPLACE_ME"'
    }

    if ($quoted -match '^(true|false)$') { return $quoted.ToLowerInvariant() }
    if ($quoted -match '^\d+$') { return $quoted }
    if ($quoted -eq "localhost" -or $quoted -match '^127\.0\.0\.1') { return '"' + $quoted + '"' }
    if ($quoted -match '^https?://(localhost|127\.0\.0\.1)') { return '"' + $quoted + '"' }

    return '"REPLACE_ME"'
}

if (-not (Test-Path -LiteralPath $EnvPath)) {
    throw "Environment file not found: $EnvPath"
}

$entries = New-Object System.Collections.Generic.List[string]
$sourceKeys = New-Object System.Collections.Generic.HashSet[string]

Get-Content -LiteralPath $EnvPath | ForEach-Object {
    $line = $_
    if ($line -match '^\s*$') {
        $entries.Add("")
        return
    }
    if ($line -match '^\s*#') {
        $entries.Add($line)
        return
    }
    if ($line -notmatch '^\s*([^=\s]+)\s*=(.*)$') {
        $entries.Add("# Unsupported env line preserved for review: $line")
        return
    }

    $key = $Matches[1].Trim()
    $value = $Matches[2].Trim()
    [void]$sourceKeys.Add($key)
    $entries.Add("$key=$(Mask-EnvValue -Key $key -Value $value)")
}

$existingKeys = New-Object System.Collections.Generic.HashSet[string]
if (Test-Path -LiteralPath $ExamplePath) {
    Get-Content -LiteralPath $ExamplePath | ForEach-Object {
        if ($_ -match '^\s*([^#=\s]+)\s*=') {
            [void]$existingKeys.Add($Matches[1].Trim())
        }
    }
}

$missingInExample = @($sourceKeys | Where-Object { -not $existingKeys.Contains($_) })
$staleInExample = @($existingKeys | Where-Object { -not $sourceKeys.Contains($_) })

if ($CheckOnly) {
    [pscustomobject]@{
        ok = ($missingInExample.Count -eq 0)
        sourceKeyCount = $sourceKeys.Count
        exampleKeyCount = $existingKeys.Count
        missingInExample = $missingInExample
        staleInExample = $staleInExample
    } | ConvertTo-Json -Depth 4
    if ($missingInExample.Count -gt 0) { exit 1 }
    exit 0
}

Set-Content -LiteralPath $ExamplePath -Value $entries -Encoding UTF8

[pscustomobject]@{
    ok = $true
    wrote = (Resolve-Path -LiteralPath $ExamplePath).Path
    sourceKeyCount = $sourceKeys.Count
    previousExampleKeyCount = $existingKeys.Count
    missingBeforeWrite = $missingInExample
    staleBeforeWrite = $staleInExample
} | ConvertTo-Json -Depth 4
