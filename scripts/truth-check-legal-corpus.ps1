param(
	[ValidateSet('repo', 'db', 'vector', 'storage', 'api', 'runtime', 'all')]
	[string]$Mode = 'all',
	[string]$DatabaseUrl = 'postgresql://legal_admin:123456@localhost:5432/legal_ai_db',
	[string]$AppBase = 'http://localhost:5173',
	[string]$QdrantBase = 'http://localhost:6333',
	[string]$OllamaBase = 'http://localhost:11434',
	[string]$MinioHealthUrl = 'http://localhost:9000/minio/health/live'
)

$ErrorActionPreference = 'Stop'

$repoRoot = Resolve-Path (Join-Path $PSScriptRoot '..')

function Test-Tool {
	param([string]$Name)
	return $null -ne (Get-Command $Name -ErrorAction SilentlyContinue)
}

function Write-Section {
	param([string]$Title)
	Write-Host "`n=== $Title ===" -ForegroundColor Cyan
}

function Invoke-Step {
	param(
		[string]$Label,
		[scriptblock]$Action
	)

	Write-Host "• $Label" -ForegroundColor Yellow
	try {
		& $Action
	} catch {
		Write-Host "  ERROR: $($_.Exception.Message)" -ForegroundColor Red
	}
}

function Invoke-Psql {
	param([string]$Sql)

	if (-not (Test-Tool 'psql')) {
		throw 'psql is not installed or not on PATH.'
	}

	& psql $DatabaseUrl -X -v ON_ERROR_STOP=1 -P pager=off -c $Sql
}

function Invoke-PsqlScalar {
	param([string]$Sql)

	if (-not (Test-Tool 'psql')) {
		throw 'psql is not installed or not on PATH.'
	}

	$result = & psql $DatabaseUrl -X -A -t -v ON_ERROR_STOP=1 -c $Sql
	return ($result | Select-Object -First 1).Trim()
}

function Invoke-CurlJson {
	param(
		[string]$Url,
		[string]$Method = 'GET',
		[string]$Body = ''
	)

	if (-not (Test-Tool 'curl.exe')) {
		throw 'curl.exe is not installed or not on PATH.'
	}

	$arguments = @('-s', '-X', $Method, $Url)
	if ($Body) {
		$arguments += @('-H', 'Content-Type: application/json', '-d', $Body)
	}

	$raw = & curl.exe @arguments
	if (-not $raw) {
		return $null
	}

	try {
		return $raw | ConvertFrom-Json -Depth 100
	} catch {
		return $raw
	}
}

function Write-Skip {
	param([string]$Message)
	Write-Host "  SKIP: $Message" -ForegroundColor DarkYellow
}

function Test-QdrantCollectionExists {
	param([string]$CollectionName)

	$collections = Invoke-CurlJson "$QdrantBase/collections"
	if ($null -eq $collections) {
		return $false
	}

	$items = @($collections.result.collections)
	foreach ($item in $items) {
		if ($item.name -eq $CollectionName) {
			return $true
		}
	}

	return $false
}

function Get-ConfiguredFrontendEnvValue {
	param([string]$Name)

	$processValue = [Environment]::GetEnvironmentVariable($Name)
	if (-not [string]::IsNullOrWhiteSpace($processValue)) {
		return $processValue.Trim()
	}

	$envFiles = @(
		(Join-Path $repoRoot 'sveltekit-frontend/.env.local'),
		(Join-Path $repoRoot 'sveltekit-frontend/.env.development.local'),
		(Join-Path $repoRoot 'sveltekit-frontend/.env'),
		(Join-Path $repoRoot 'sveltekit-frontend/.env.example')
	)

	$pattern = "^\s*$([regex]::Escape($Name))\s*=\s*(.+?)\s*$"
	foreach ($envFile in $envFiles) {
		if (-not (Test-Path $envFile)) {
			continue
		}

		$match = Select-String -Path $envFile -Pattern $pattern | Select-Object -First 1
		if ($null -eq $match) {
			continue
		}

		$value = $match.Matches[0].Groups[1].Value.Trim()
		$value = $value.Trim('"')
		$value = $value.Trim("'")
		if (-not [string]::IsNullOrWhiteSpace($value)) {
			return $value
		}
	}

	return $null
}

function Resolve-LibraryCorpusQdrantCollection {
	$configured = Get-ConfiguredFrontendEnvValue 'QDRANT_COLLECTION'
	$candidates = @()
	foreach ($candidate in @($configured, 'legal_documents')) {
		if ([string]::IsNullOrWhiteSpace($candidate)) {
			continue
		}
		if ($candidates -notcontains $candidate) {
			$candidates += $candidate
		}
	}

	foreach ($candidate in $candidates) {
		if (Test-QdrantCollectionExists $candidate) {
			$source = 'live-fallback'
			if ($candidate -eq $configured) {
				$source = 'configured'
			}

			return [pscustomobject]@{
				Name = $candidate
				Configured = $configured
				Source = $source
			}
		}
	}

	if (-not [string]::IsNullOrWhiteSpace($configured)) {
		return [pscustomobject]@{
			Name = $configured
			Configured = $configured
			Source = 'configured-missing'
		}
	}

	return $null
}

function Resolve-CanonCorpusQdrantCollection {
	$collectionName = 'legal_canon_chunks'
	if (Test-QdrantCollectionExists $collectionName) {
		return [pscustomobject]@{
			Name = $collectionName
			Configured = $null
			Source = 'canon-route'
		}
	}

	return [pscustomobject]@{
		Name = $collectionName
		Configured = $null
		Source = 'canon-route-missing'
	}
}

function Get-ConstitutionDocumentId {
	if (-not (Test-Tool 'psql')) {
		return $null
	}

	$docId = & psql $DatabaseUrl -X -A -t -v ON_ERROR_STOP=1 -c "SELECT id FROM library_documents WHERE title ILIKE '%California Constitution 2023-24%' ORDER BY page_count DESC NULLS LAST LIMIT 1;"
	return ($docId | Select-Object -First 1).Trim()
}

function Invoke-RgSafe {
	param(
		[Parameter(Mandatory = $true)]
		[string[]]$Arguments
	)

	if (-not (Test-Tool 'rg')) {
		throw 'rg is not installed or not on PATH.'
	}

	$nulExcludes = @(
		'--glob', '!NUL',
		'--glob', '!nul',
		'--glob', '!**/NUL',
		'--glob', '!**/nul'
	)

	& rg @nulExcludes @Arguments
}

function Run-RepoTruth {
	Write-Section 'Repo Truth'

	Invoke-Step 'Tool inventory' {
		$tools = 'rg', 'fd', 'jq', 'yq', 'bat', 'delta', 'psql', 'pg_isready', 'curl.exe', 'mc', 'docker', 'tsx'
		foreach ($tool in $tools) {
			$status = if (Test-Tool $tool) { 'yes' } else { 'no' }
			Write-Host ("  {0,-12} {1}" -f $tool, $status)
		}
	}

	Invoke-Step 'Search core legal-corpus tables and routes' {
		Push-Location $repoRoot
		try {
			Invoke-RgSafe @('-n', '--glob', '!**/node_modules/**', 'library_documents|legal_nodes|legal_chunks', 'sveltekit-frontend', 'scripts') | Select-Object -First 12
			Invoke-RgSafe @('-n', '--glob', '!**/node_modules/**', '/library/glossary|api/glossary|api/library/documents/.*/chunks', 'sveltekit-frontend/src') | Select-Object -First 12
		} finally {
			Pop-Location
		}
	}

	Invoke-Step 'Trace ingestion and retrieval hooks' {
		Push-Location $repoRoot
		try {
			Invoke-RgSafe @('-n', '--glob', '!**/node_modules/**', 'qdrant|ollamaFetch|runIngestionPipeline|runConstitutionPipeline', 'sveltekit-frontend/src', 'sveltekit-frontend/scripts', 'scripts') | Select-Object -First 16
		} finally {
			Pop-Location
		}
	}
}

function Run-RuntimeTruth {
	Write-Section 'Runtime Truth'

	Invoke-Step 'Postgres readiness' {
		if (Test-Tool 'pg_isready') {
			& pg_isready -d $DatabaseUrl
		} else {
			Invoke-Psql 'SELECT 1 AS postgres_ok;'
		}
	}

	Invoke-Step 'Qdrant health' {
		Invoke-CurlJson "$QdrantBase/health" | ConvertTo-Json -Depth 10
	}

	Invoke-Step 'Ollama tags' {
		$tags = Invoke-CurlJson "$OllamaBase/api/tags"
		$tags | ConvertTo-Json -Depth 10
	}

	Invoke-Step 'MinIO live health' {
		& curl.exe -s $MinioHealthUrl
	}

	Invoke-Step 'Docker services snapshot' {
		if (-not (Test-Tool 'docker')) {
			throw 'docker is not installed or not on PATH.'
		}

		& docker ps --format 'table {{.Names}}`t{{.Status}}`t{{.Ports}}' | Select-Object -First 12
	}
}

function Run-DbTruth {
	Write-Section 'Database Truth'

	Invoke-Step 'Core row counts' {
		$sql = @"
SELECT 'library_documents' AS metric, COUNT(*)::text AS value FROM library_documents
UNION ALL
SELECT 'legal_nodes', COUNT(*)::text FROM legal_nodes
UNION ALL
SELECT 'legal_chunks', COUNT(*)::text FROM legal_chunks
UNION ALL
SELECT 'legal_definitions', COUNT(*)::text FROM legal_definitions
UNION ALL
SELECT 'embedded_chunks', COUNT(*)::text FROM legal_chunks WHERE embedding IS NOT NULL;
"@
		Invoke-Psql $sql
	}

	Invoke-Step 'California Constitution proof query' {
		$sql = @"
SELECT
  (SELECT COUNT(*) FROM library_documents WHERE title ILIKE '%California Constitution 2023-24%') AS docs,
  (SELECT COUNT(*) FROM legal_nodes n JOIN library_documents d ON d.id = n.document_id WHERE d.title ILIKE '%California Constitution 2023-24%') AS nodes,
  (SELECT COUNT(*) FROM legal_chunks c JOIN legal_nodes n ON n.id = c.legal_node_id JOIN library_documents d ON d.id = n.document_id WHERE d.title ILIKE '%California Constitution 2023-24%') AS chunks;
"@
		Invoke-Psql $sql
	}

	Invoke-Step 'Top ingested documents by page count' {
		Invoke-Psql "SELECT title, page_count, processing_status FROM library_documents ORDER BY page_count DESC NULLS LAST LIMIT 10;"
	}
}

function Run-VectorTruth {
	Write-Section 'Vector Truth'
	$libraryCollection = Resolve-LibraryCorpusQdrantCollection
	$canonCollection = Resolve-CanonCorpusQdrantCollection

	Invoke-Step 'Postgres embedding counts' {
		$sql = @"
SELECT 'legal_chunks' AS metric, COUNT(*)::text AS value FROM legal_chunks WHERE embedding IS NOT NULL
UNION ALL
SELECT 'canonical_chunks', COUNT(*)::text FROM canonical_chunks WHERE embedding IS NOT NULL;
"@
		Invoke-Psql $sql
	}

	Invoke-Step 'Qdrant collections' {
		$collections = Invoke-CurlJson "$QdrantBase/collections"
		$collections | ConvertTo-Json -Depth 10
	}

	Invoke-Step 'Configured legal collection target' {
		if ($null -eq $libraryCollection) {
			Write-Skip 'No configured or known legal Qdrant collection could be resolved.'
			return
		}

		Write-Host "  collection: $($libraryCollection.Name)"
		if (-not [string]::IsNullOrWhiteSpace($libraryCollection.Configured)) {
			Write-Host "  configured: $($libraryCollection.Configured)"
		}
		Write-Host "  source: $($libraryCollection.Source)"
	}

	Invoke-Step 'Configured legal collection info' {
		if ($null -eq $libraryCollection) {
			Write-Skip 'No configured or known legal Qdrant collection is present in Qdrant.'
			return
		}
		if ($libraryCollection.Source -eq 'configured-missing') {
			Write-Skip "Configured collection $($libraryCollection.Name) is not present in Qdrant."
			return
		}

		$collection = Invoke-CurlJson "$QdrantBase/collections/$($libraryCollection.Name)"
		$collection | ConvertTo-Json -Depth 10
	}

	Invoke-Step 'Configured legal collection parity note' {
		if ($null -eq $libraryCollection) {
			Write-Skip 'No configured or known legal Qdrant collection is present in Qdrant.'
			return
		}
		if ($libraryCollection.Source -eq 'configured-missing') {
			Write-Skip "Configured collection $($libraryCollection.Name) is not present in Qdrant."
			return
		}

		Write-Host '  NOTE: current /api/library/search fallback uses PostgreSQL + pgvector over legal_chunks.' -ForegroundColor Yellow
		Write-Host "  NOTE: $($libraryCollection.Name) is reported for visibility only; no direct legal_chunks parity check is enforced here." -ForegroundColor Yellow
	}

	Invoke-Step 'Sample configured legal collection payload' {
		if ($null -eq $libraryCollection) {
			Write-Skip 'No configured or known legal Qdrant collection is present in Qdrant.'
			return
		}
		if ($libraryCollection.Source -eq 'configured-missing') {
			Write-Skip "Configured collection $($libraryCollection.Name) is not present in Qdrant."
			return
		}

		$sample = Invoke-CurlJson "$QdrantBase/collections/$($libraryCollection.Name)/points/scroll" 'POST' '{"limit":1,"with_payload":true,"with_vector":false}'
		$sample | ConvertTo-Json -Depth 10
	}

	Invoke-Step 'Canon corpus Qdrant target' {
		Write-Host "  collection: $($canonCollection.Name)"
		Write-Host "  source: $($canonCollection.Source)"
	}

	Invoke-Step 'Canon corpus collection info' {
		if ($canonCollection.Source -like '*missing') {
			Write-Skip "Canon collection $($canonCollection.Name) is not present in Qdrant."
			return
		}

		$collection = Invoke-CurlJson "$QdrantBase/collections/$($canonCollection.Name)"
		$collection | ConvertTo-Json -Depth 10
	}

	Invoke-Step 'Canon corpus vector parity' {
		if ($canonCollection.Source -like '*missing') {
			Write-Skip "Canon collection $($canonCollection.Name) is not present in Qdrant."
			return
		}

		$embeddedCount = [int](Invoke-PsqlScalar 'SELECT COUNT(*) FROM canonical_chunks WHERE embedding IS NOT NULL;')
		$collectionInfo = Invoke-CurlJson "$QdrantBase/collections/$($canonCollection.Name)"
		$pointsCount = [int]($collectionInfo.result.points_count ?? 0)

		if ($pointsCount -eq $embeddedCount) {
			Write-Host "  OK: canonical_chunks=$embeddedCount matches $($canonCollection.Name).points_count=$pointsCount" -ForegroundColor Green
			return
		}

		Write-Host "  WARN: canonical_chunks=$embeddedCount but $($canonCollection.Name).points_count=$pointsCount" -ForegroundColor Yellow
	}

	Invoke-Step 'Sample canon corpus Qdrant payload' {
		if ($canonCollection.Source -like '*missing') {
			Write-Skip "Canon collection $($canonCollection.Name) is not present in Qdrant."
			return
		}

		$sample = Invoke-CurlJson "$QdrantBase/collections/$($canonCollection.Name)/points/scroll" 'POST' '{"limit":1,"with_payload":true,"with_vector":false}'
		$sample | ConvertTo-Json -Depth 10
	}
}

function Run-StorageTruth {
	Write-Section 'Storage Truth'

	Invoke-Step 'MinIO client scan for California Constitution artifacts' {
		if (-not (Test-Tool 'mc')) {
			Write-Skip 'mc is not installed or not on PATH.'
			return
		}

		& mc find local/legal-library --name '*California_Constitution_2023-24*'
	}

	Invoke-Step 'MinIO raw upload listing' {
		if (-not (Test-Tool 'mc')) {
			Write-Skip 'mc is not installed or not on PATH.'
			return
		}

		& mc ls local/legal-library/lawpdfs/raw/
	}
}

function Run-ApiTruth {
	Write-Section 'API Truth'

	Invoke-Step 'Glossary terms API' {
		$terms = Invoke-CurlJson "$AppBase/api/glossary/terms?limit=2"
		$terms | ConvertTo-Json -Depth 10
	}

	Invoke-Step 'Constitutions corpus API' {
		$corpus = Invoke-CurlJson "$AppBase/api/library/corpus/constitutions"
		$corpus | ConvertTo-Json -Depth 8
	}

	Invoke-Step 'California Constitution chunk API' {
		$docId = Get-ConstitutionDocumentId
		if (-not $docId) {
			throw 'Could not resolve a constitution document ID from library_documents.'
		}

		$chunks = Invoke-CurlJson "$AppBase/api/library/documents/$docId/chunks?limit=1"
		$chunks | ConvertTo-Json -Depth 8
	}

	Invoke-Step 'Onboarding API fallback check' {
		$onboarding = Invoke-CurlJson "$AppBase/api/onboarding"
		$onboarding | ConvertTo-Json -Depth 6
	}
}

Push-Location $repoRoot
try {
	switch ($Mode) {
		'repo' { Run-RepoTruth }
		'runtime' { Run-RuntimeTruth }
		'db' { Run-DbTruth }
		'vector' { Run-VectorTruth }
		'storage' { Run-StorageTruth }
		'api' { Run-ApiTruth }
		'all' {
			Run-RuntimeTruth
			Run-RepoTruth
			Run-DbTruth
			Run-VectorTruth
			Run-StorageTruth
			Run-ApiTruth
		}
	}
} finally {
	Pop-Location
}