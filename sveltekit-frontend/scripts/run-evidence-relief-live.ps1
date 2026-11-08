$ErrorActionPreference = 'Stop'

$requiredVariables = @(
	'RELIEF_LIVE_STORAGE_STATE',
	'RELIEF_LIVE_CASE_ID',
	'RELIEF_LIVE_EVIDENCE_ID',
	'RELIEF_LIVE_FORBIDDEN_CASE_ID',
	'RELIEF_LIVE_FORBIDDEN_EVIDENCE_ID',
	'RELIEF_LIVE_PDF_EVIDENCE_ID'
)
$missingVariables = @($requiredVariables | Where-Object {
	[string]::IsNullOrWhiteSpace([Environment]::GetEnvironmentVariable($_))
})
if ($missingVariables.Count -gt 0) {
	throw "Live relief test refused; set required variables: $($missingVariables -join ', ')"
}

$idVariables = @(
	'RELIEF_LIVE_CASE_ID',
	'RELIEF_LIVE_EVIDENCE_ID',
	'RELIEF_LIVE_FORBIDDEN_CASE_ID',
	'RELIEF_LIVE_FORBIDDEN_EVIDENCE_ID',
	'RELIEF_LIVE_PDF_EVIDENCE_ID'
)
foreach ($name in $idVariables) {
	$value = [Environment]::GetEnvironmentVariable($name)
	if ($value -notmatch '^[0-9a-fA-F]{8}-(?:[0-9a-fA-F]{4}-){3}[0-9a-fA-F]{12}$') {
		throw "Live relief test refused; $name must be a UUID"
	}
}

$frontendRoot = (Resolve-Path (Join-Path $PSScriptRoot '..')).Path
$repositoryRoot = (& git -C $frontendRoot rev-parse --show-toplevel).Trim()
if ($LASTEXITCODE -ne 0 -or [string]::IsNullOrWhiteSpace($repositoryRoot)) {
	throw 'Live relief test refused; cannot determine repository root'
}

$storageValue = $env:RELIEF_LIVE_STORAGE_STATE
$storageCandidate = if ([IO.Path]::IsPathRooted($storageValue)) {
	$storageValue
} else {
	Join-Path $frontendRoot $storageValue
}
$storagePath = (Resolve-Path -LiteralPath $storageCandidate -ErrorAction Stop).Path
if (-not (Test-Path -LiteralPath $storagePath -PathType Leaf)) {
	throw 'Live relief test refused; storage state must be an existing file'
}
$relativeStoragePath = [IO.Path]::GetRelativePath($repositoryRoot, $storagePath).Replace('\', '/')
& git -C $repositoryRoot check-ignore --quiet -- $relativeStoragePath
if ($LASTEXITCODE -ne 0) {
	throw 'Live relief test refused; storage state must be gitignored'
}

$baseUrl = if ([string]::IsNullOrWhiteSpace($env:RELIEF_LIVE_BASE_URL)) {
	'http://127.0.0.1:5173'
} else {
	$env:RELIEF_LIVE_BASE_URL
}
$baseUri = $null
if (-not [Uri]::TryCreate($baseUrl, [UriKind]::Absolute, [ref]$baseUri) -or $baseUri.Host -notin @('127.0.0.1', 'localhost', '::1')) {
	throw 'Live relief test refused; base URL must target a local loopback host'
}

try {
	$health = Invoke-WebRequest -Uri "$($baseUrl.TrimEnd('/'))/api/health" -TimeoutSec 5 -UseBasicParsing
	if ($health.StatusCode -lt 200 -or $health.StatusCode -ge 300) {
		throw "App health returned HTTP $($health.StatusCode)"
	}
} catch {
	throw "Live relief test refused; existing app is not healthy: $($_.Exception.Message)"
}

Set-Location $frontendRoot
& npx playwright test --config=playwright.evidence-live.config.ts
if ($LASTEXITCODE -ne 0) {
	exit $LASTEXITCODE
}
