[CmdletBinding()]
param(
    [switch]$ScanNodeModules,
    [switch]$ScanGitIgnored,
    [string]$NodeModulesRoot,
    [string]$OutputDirectory,
    [ValidateRange(30, 3600)]
    [int]$MaxNodeModulesScanSeconds = 300,
    [string]$PostgresContainer = 'legal-ai-postgres',
    [string]$PostgresDatabase = 'legal_ai_db',
    [string]$PostgresUser = 'legal_admin'
)

$ErrorActionPreference = 'Continue'
$repoRoot = (Resolve-Path (Join-Path $PSScriptRoot '..\..')).Path
if (-not $NodeModulesRoot) { $NodeModulesRoot = $repoRoot }
$NodeModulesRoot = (Resolve-Path -LiteralPath $NodeModulesRoot -ErrorAction Stop).Path
if (-not $OutputDirectory) { $OutputDirectory = Join-Path $env:LOCALAPPDATA 'DeedsWebApp\inventory' }
New-Item -ItemType Directory -Path $OutputDirectory -Force | Out-Null
$timestamp = [DateTime]::UtcNow.ToString('yyyyMMddTHHmmssZ')
$logPath = Join-Path $OutputDirectory 'inventory.jsonl'
$snapshotPath = Join-Path $OutputDirectory "inventory-$timestamp.json"

function Get-FileFact([string]$Path) {
    if (-not (Test-Path -LiteralPath $Path -PathType Leaf)) { return $null }
    $item = Get-Item -LiteralPath $Path -ErrorAction SilentlyContinue
    if (-not $item) { return $null }
    $hash = Get-FileHash -LiteralPath $Path -Algorithm SHA256 -ErrorAction SilentlyContinue
    [pscustomobject]@{
        path = $item.FullName
        bytes = [long]$item.Length
        sizeSemantics = 'Logical file length; may differ from allocated NTFS space.'
        sha256 = if ($hash) { $hash.Hash.ToLowerInvariant() } else { $null }
    }
}

function Get-NodeModulesInventory([string]$Root, [int]$MaxSeconds) {
    $watch = [System.Diagnostics.Stopwatch]::StartNew()
    $directories = New-Object 'System.Collections.Generic.List[string]'
    $errors = New-Object 'System.Collections.Generic.List[string]'
    $stack = New-Object 'System.Collections.Generic.Stack[string]'
    $stack.Push($Root)
    $timedOut = $false

    while ($stack.Count -gt 0) {
        if ($watch.Elapsed.TotalSeconds -ge $MaxSeconds) { $timedOut = $true; break }
        $current = $stack.Pop()
        try {
            foreach ($child in [System.IO.Directory]::EnumerateDirectories($current)) {
                $leaf = [System.IO.Path]::GetFileName($child)
                if ($leaf -ieq 'node_modules') {
                    $directories.Add($child)
                    continue
                }
                if ($leaf -in @('.git', '.tmp')) { continue }
                try {
                    $attributes = [System.IO.File]::GetAttributes($child)
                    if (($attributes -band [System.IO.FileAttributes]::ReparsePoint) -eq 0) { $stack.Push($child) }
                } catch { $errors.Add("directory:$child") }
            }
        } catch { $errors.Add("directory:$current") }
    }

    $results = New-Object 'System.Collections.Generic.List[object]'
    foreach ($directory in $directories) {
        if ($watch.Elapsed.TotalSeconds -ge $MaxSeconds) { $timedOut = $true; break }
        $fileCount = [long]0
        $bytes = [long]0
        $fileErrors = [long]0
        $fileStack = New-Object 'System.Collections.Generic.Stack[string]'
        $fileStack.Push($directory)
        while ($fileStack.Count -gt 0) {
            if ($watch.Elapsed.TotalSeconds -ge $MaxSeconds) { $timedOut = $true; break }
            $current = $fileStack.Pop()
            try {
                foreach ($file in [System.IO.Directory]::EnumerateFiles($current)) {
                    try {
                        $bytes += (New-Object System.IO.FileInfo($file)).Length
                        $fileCount++
                    } catch { $fileErrors++ }
                }
                foreach ($child in [System.IO.Directory]::EnumerateDirectories($current)) {
                    try {
                        $attributes = [System.IO.File]::GetAttributes($child)
                        if (($attributes -band [System.IO.FileAttributes]::ReparsePoint) -eq 0) { $fileStack.Push($child) }
                    } catch { $fileErrors++ }
                }
            } catch { $fileErrors++ }
        }
        $results.Add([pscustomobject]@{
            path = $directory
            files = $fileCount
            bytes = $bytes
            scan = if ($timedOut) { 'partial' } elseif ($fileErrors -gt 0) { 'complete_with_errors' } else { 'complete' }
            errors = $fileErrors
        })
        if ($timedOut) { break }
    }

    [pscustomobject]@{
        enabled = $true
        root = $Root
        maxSeconds = $MaxSeconds
        elapsedSeconds = [math]::Round($watch.Elapsed.TotalSeconds, 1)
        status = if ($timedOut) { 'partial_timeout' } elseif ($errors.Count -gt 0 -or @($results | Where-Object scan -eq 'complete_with_errors').Count -gt 0) { 'complete_with_errors' } else { 'complete' }
        directoryCount = $directories.Count
        fileCount = [long](($results | Measure-Object -Property files -Sum).Sum)
        byteCount = [long](($results | Measure-Object -Property bytes -Sum).Sum)
        sizeSemantics = 'Sum of file logical lengths; hard links, sparse files, and filesystem compression can make allocated space differ.'
        directories = @($results | Sort-Object bytes -Descending)
        scanErrors = @($errors | Select-Object -First 100)
    }
}

function Get-GitIgnoredInventory([string]$Root, [int]$MaxSeconds) {
    $watch = [System.Diagnostics.Stopwatch]::StartNew()
    $git = New-Object System.Diagnostics.Process
    $git.StartInfo = New-Object System.Diagnostics.ProcessStartInfo
    $git.StartInfo.FileName = 'git.exe'
    $git.StartInfo.Arguments = 'ls-files --others --ignored --exclude-standard --directory -z'
    $git.StartInfo.WorkingDirectory = $Root
    $git.StartInfo.UseShellExecute = $false
    $git.StartInfo.CreateNoWindow = $true
    $git.StartInfo.RedirectStandardOutput = $true
    $git.StartInfo.RedirectStandardError = $true
    try {
        [void]$git.Start()
        $stdoutTask = $git.StandardOutput.ReadToEndAsync()
        $stderrTask = $git.StandardError.ReadToEndAsync()
        if (-not $git.WaitForExit($MaxSeconds * 1000)) {
            $git.Kill()
            $git.WaitForExit()
            return [pscustomobject]@{ enabled = $true; status = 'timed_out'; fileCount = 0; bytes = 0L; elapsedSeconds = [math]::Round($watch.Elapsed.TotalSeconds, 2); errors = @('git ls-files exceeded the scan time limit') }
        }
        $git.WaitForExit()
        $gitOutput = $stdoutTask.Result
        if ($git.ExitCode -ne 0) { throw $stderrTask.Result }
    } catch {
        return [pscustomobject]@{ enabled = $true; status = 'unavailable'; fileCount = 0; bytes = 0L; errors = @($_.Exception.Message) }
    } finally {
        $git.Dispose()
    }

    if ($null -eq $gitOutput) {
        return [pscustomobject]@{ enabled = $true; status = 'unavailable'; fileCount = 0; bytes = 0L; errors = @('git ls-files failed') }
    }

    $fileCount = [long]0
    $bytes = [long]0
    $errors = New-Object 'System.Collections.Generic.List[string]'
    $groups = @{}
    $pathGroups = @{}
    $largeFiles = New-Object 'System.Collections.Generic.List[object]'
    $timedOut = $false
    $seen = New-Object 'System.Collections.Generic.HashSet[string]' ([System.StringComparer]::OrdinalIgnoreCase)
    foreach ($path in $gitOutput.Split([char]0, [System.StringSplitOptions]::RemoveEmptyEntries)) {
        if ($watch.Elapsed.TotalSeconds -ge $MaxSeconds) { $timedOut = $true; break }
        if ([string]::IsNullOrWhiteSpace($path)) { continue }
        $fullPath = Join-Path $Root $path.TrimEnd('/')
        if ([System.IO.Path]::GetFileName($fullPath) -ieq '.git') { continue }
        try {
            if (Test-Path -LiteralPath $fullPath -PathType Leaf) {
                if ($seen.Add($fullPath)) {
                    $fileBytes = (New-Object System.IO.FileInfo($fullPath)).Length
                    $bytes += $fileBytes
                    $fileCount++
                    $relativePath = $fullPath.Substring($Root.Length).TrimStart([char[]]@('\', '/'))
                    $pathParts = $relativePath -split '[\\/]'
                    $topLevelPath = if ($pathParts.Count -gt 1) { $pathParts[0] } else { '<root-files>' }
                    if (-not $groups.ContainsKey($topLevelPath)) { $groups[$topLevelPath] = @{ path = $topLevelPath; fileCount = [long]0; bytes = [long]0 } }
                    $groups[$topLevelPath].fileCount++
                    $groups[$topLevelPath].bytes += $fileBytes
                    $pathGroup = if ($pathParts.Count -gt 2) { "$($pathParts[0])/$($pathParts[1])" } else { $relativePath }
                    if (-not $pathGroups.ContainsKey($pathGroup)) { $pathGroups[$pathGroup] = @{ path = $pathGroup; fileCount = [long]0; bytes = [long]0 } }
                    $pathGroups[$pathGroup].fileCount++
                    $pathGroups[$pathGroup].bytes += $fileBytes
                    if ($fileBytes -ge 256MB) { $largeFiles.Add([pscustomobject]@{ path = $relativePath; bytes = $fileBytes }) }
                }
            } elseif (Test-Path -LiteralPath $fullPath -PathType Container) {
                $stack = New-Object 'System.Collections.Generic.Stack[string]'
                $stack.Push($fullPath)
                while ($stack.Count -gt 0) {
                    if ($watch.Elapsed.TotalSeconds -ge $MaxSeconds) { $timedOut = $true; break }
                    $current = $stack.Pop()
                    foreach ($file in [System.IO.Directory]::EnumerateFiles($current)) {
                        if ($seen.Add($file)) {
                            $fileBytes = (New-Object System.IO.FileInfo($file)).Length
                            $bytes += $fileBytes
                            $fileCount++
                            $relativePath = $file.Substring($Root.Length).TrimStart([char[]]@('\', '/'))
                            $pathParts = $relativePath -split '[\\/]'
                            $topLevelPath = if ($pathParts.Count -gt 1) { $pathParts[0] } else { '<root-files>' }
                            if (-not $groups.ContainsKey($topLevelPath)) { $groups[$topLevelPath] = @{ path = $topLevelPath; fileCount = [long]0; bytes = [long]0 } }
                            $groups[$topLevelPath].fileCount++
                            $groups[$topLevelPath].bytes += $fileBytes
                            $pathGroup = if ($pathParts.Count -gt 2) { "$($pathParts[0])/$($pathParts[1])" } else { $relativePath }
                            if (-not $pathGroups.ContainsKey($pathGroup)) { $pathGroups[$pathGroup] = @{ path = $pathGroup; fileCount = [long]0; bytes = [long]0 } }
                            $pathGroups[$pathGroup].fileCount++
                            $pathGroups[$pathGroup].bytes += $fileBytes
                            if ($fileBytes -ge 256MB) { $largeFiles.Add([pscustomobject]@{ path = $relativePath; bytes = $fileBytes }) }
                        }
                    }
                    foreach ($child in [System.IO.Directory]::EnumerateDirectories($current)) {
                        if ([System.IO.Path]::GetFileName($child) -ieq '.git') { continue }
                        $attributes = [System.IO.File]::GetAttributes($child)
                        if (($attributes -band [System.IO.FileAttributes]::ReparsePoint) -eq 0) { $stack.Push($child) }
                    }
                }
            }
        } catch { $errors.Add($path) }
        if ($timedOut) { break }
    }

    [pscustomobject]@{
        enabled = $true
        status = if ($timedOut) { 'timed_out' } elseif ($errors.Count -gt 0) { 'partial' } else { 'complete' }
        root = $Root
        fileCount = $fileCount
        bytes = $bytes
        sizeSemantics = 'Logical file length; overlaps node_modules inventory and may differ from allocated NTFS space.'
        elapsedSeconds = [math]::Round($watch.Elapsed.TotalSeconds, 2)
        topLevel = @($groups.Values | ForEach-Object { [pscustomobject]@{ path = $_.path; fileCount = $_.fileCount; bytes = $_.bytes } } | Sort-Object { [long]$_.bytes } -Descending | Select-Object -First 30)
        topPaths = @($pathGroups.Values | ForEach-Object { [pscustomobject]@{ path = $_.path; fileCount = $_.fileCount; bytes = $_.bytes } } | Sort-Object { [long]$_.bytes } -Descending | Select-Object -First 60)
        largestFiles = @($largeFiles | Sort-Object bytes -Descending | Select-Object -First 60)
        errors = @($errors | Select-Object -First 20)
    }
}

$drive = Get-PSDrive -Name ([System.IO.Path]::GetPathRoot($repoRoot).TrimEnd('\').TrimEnd(':')) -ErrorAction SilentlyContinue
if (-not $drive) { $drive = Get-PSDrive -Name C -ErrorAction SilentlyContinue }
$volume = if ($drive) {
    [pscustomobject]@{ name = $drive.Name; freeBytes = [long]$drive.Free; usedBytes = [long]$drive.Used }
} else { $null }

$vhdxPaths = @(
    (Join-Path $env:LOCALAPPDATA 'Docker\wsl\disk\docker_data.vhdx'),
    (Join-Path $env:LOCALAPPDATA 'Docker\wsl\data\docker_data.vhdx')
)
$vhdx = @($vhdxPaths | Select-Object -Unique | ForEach-Object { Get-FileFact $_ } | Where-Object { $_ })

$docker = [ordered]@{ available = $false; context = $null; systemDf = @(); systemDfVerbose = @(); containers = @(); error = $null }
try {
    $null = Get-Command docker -ErrorAction Stop
    $docker.context = (& docker context show 2>&1 | Out-String).Trim()
    $docker.systemDf = @(& docker system df 2>&1 | ForEach-Object { "$_" })
    $dfExit = $LASTEXITCODE
    $docker.systemDfVerbose = @(& docker system df --verbose 2>&1 | ForEach-Object { "$_" })
    $verboseExit = $LASTEXITCODE
    $docker.containers = @(& docker ps -a --format '{{.Names}}|{{.Image}}|{{.Status}}' 2>&1 | ForEach-Object { "$_" })
    $docker.available = ($dfExit -eq 0 -and $verboseExit -eq 0)
    if (-not $docker.available) { $docker.error = "docker command exit codes: df=$dfExit verbose=$verboseExit" }
} catch { $docker.error = $_.Exception.Message }

$drizzleDirectory = Join-Path $repoRoot 'sveltekit-frontend\drizzle'
$journalPath = Join-Path $drizzleDirectory 'meta\_journal.json'
$sidecarPath = Join-Path $drizzleDirectory 'sidecar-migrations.json'
$packagePath = Join-Path $repoRoot 'sveltekit-frontend\package.json'
$package = Get-Content -LiteralPath $packagePath -Raw | ConvertFrom-Json
$journal = Get-Content -LiteralPath $journalPath -Raw | ConvertFrom-Json
$sidecars = Get-Content -LiteralPath $sidecarPath -Raw | ConvertFrom-Json
$sidecarRows = @($sidecars.sidecars)
$statusCounts = @{}
foreach ($group in ($sidecarRows | Group-Object status)) { $statusCounts[$group.Name] = $group.Count }
$drizzle = [pscustomobject]@{
    configuredSchema = 'sveltekit-frontend/src/lib/server/db/schema.ts'
    runtimeAnalysisJobsSchema = 'sveltekit-frontend/src/lib/server/db/schema-postgres.ts'
    migrationOutput = 'sveltekit-frontend/drizzle'
    drizzleOrmVersion = $package.dependencies.'drizzle-orm'
    drizzleKitVersion = $package.devDependencies.'drizzle-kit'
    journalEntryCount = @($journal.entries).Count
    latestJournalTag = @($journal.entries | Sort-Object idx | Select-Object -Last 1).tag
    sidecarCount = $sidecarRows.Count
    sidecarStatuses = $statusCounts
    config = Get-FileFact (Join-Path $repoRoot 'sveltekit-frontend\drizzle.config.ts')
    schemaEntry = Get-FileFact (Join-Path $repoRoot 'sveltekit-frontend\src\lib\server\db\schema.ts')
    runtimeSchema = Get-FileFact (Join-Path $repoRoot 'sveltekit-frontend\src\lib\server\db\schema-postgres.ts')
    migrationJournal = Get-FileFact $journalPath
    sidecarRegistry = Get-FileFact $sidecarPath
}

$pg = [ordered]@{ available = $false; container = $PostgresContainer; database = $PostgresDatabase; catalog = $null; migrationLedger = $null; error = $null }
$pgSql = @"
BEGIN READ ONLY;
SET LOCAL statement_timeout = '5s';
SELECT json_build_object(
  'serverVersion', current_setting('server_version'),
  'database', current_database(),
  'vectorExtension', (SELECT extversion FROM pg_extension WHERE extname = 'vector'),
  'analysisJobsColumns', COALESCE((SELECT json_agg(json_build_object('name', column_name, 'type', data_type, 'nullable', is_nullable) ORDER BY ordinal_position) FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'analysis_jobs'), '[]'::json),
  'evidenceEmbeddingType', (SELECT format_type(a.atttypid, a.atttypmod) FROM pg_attribute a WHERE a.attrelid = to_regclass('public.evidence_vectors') AND a.attname = 'embedding' AND NOT a.attisdropped),
  'evidenceOutboxPresent', to_regclass('public.evidence_vector_projection_outbox') IS NOT NULL,
  'evidenceHnswValid', (SELECT i.indisvalid AND i.indisready FROM pg_index i WHERE i.indexrelid = to_regclass('public.evidence_vectors_hnsw_idx')),
  'drizzleMigrationLedgerPresent', to_regclass('drizzle.__drizzle_migrations') IS NOT NULL
);
ROLLBACK;
"@
try {
    $pgOutput = & docker exec $PostgresContainer psql -X -qAt -U $PostgresUser -d $PostgresDatabase -v ON_ERROR_STOP=1 -c $pgSql 2>&1
    $pgExit = $LASTEXITCODE
    if ($pgExit -ne 0) { throw "psql exit ${pgExit}: $($pgOutput -join ' ')" }
    $pg.catalog = (($pgOutput -join "`n") | ConvertFrom-Json)
    $pg.available = $true
    if ($pg.catalog.drizzleMigrationLedgerPresent) {
        $ledgerSql = "BEGIN READ ONLY; SET LOCAL statement_timeout = '5s'; SELECT json_build_object('rowCount', count(*), 'latestCreatedAtEpochMs', max(created_at)) FROM drizzle.__drizzle_migrations; ROLLBACK;"
        $ledgerOutput = & docker exec $PostgresContainer psql -X -qAt -U $PostgresUser -d $PostgresDatabase -v ON_ERROR_STOP=1 -c $ledgerSql 2>&1
        $ledgerExit = $LASTEXITCODE
        if ($ledgerExit -ne 0) { throw "Drizzle ledger read exit ${ledgerExit}: $($ledgerOutput -join ' ')" }
        $pg.migrationLedger = (($ledgerOutput -join "`n") | ConvertFrom-Json)
    }
} catch { $pg.error = $_.Exception.Message }

$nodeModules = if ($ScanNodeModules) {
    Get-NodeModulesInventory $NodeModulesRoot $MaxNodeModulesScanSeconds
} else {
    [pscustomobject]@{ enabled = $false; root = $NodeModulesRoot; status = 'not_scanned'; note = 'Use -ScanNodeModules for a bounded recursive count and byte measurement.' }
}
$gitIgnored = if ($ScanGitIgnored) {
    Get-GitIgnoredInventory $NodeModulesRoot $MaxNodeModulesScanSeconds
} else {
    [pscustomobject]@{ enabled = $false; root = $NodeModulesRoot; status = 'not_scanned'; note = 'Use -ScanGitIgnored for a bounded Git ignored-file inventory.' }
}

$record = [pscustomobject]@{
    schema = 'workstation-storage-db-inventory-v1'
    capturedAtUtc = [DateTime]::UtcNow.ToString('o')
    machine = $env:COMPUTERNAME
    windowsVersion = [System.Environment]::OSVersion.Version.ToString()
    repoRoot = $repoRoot
    volume = $volume
    dockerVhdx = $vhdx
    docker = [pscustomobject]$docker
    nodeModules = $nodeModules
    gitIgnored = $gitIgnored
    drizzle = $drizzle
    postgres = [pscustomobject]$pg
}

$json = $record | ConvertTo-Json -Depth 12
$json | Set-Content -LiteralPath $snapshotPath -Encoding UTF8
($record | ConvertTo-Json -Depth 12 -Compress) | Add-Content -LiteralPath $logPath -Encoding UTF8
Write-Output "Snapshot: $snapshotPath"
Write-Output "Append-only log: $logPath"
Write-Output "Node modules scan: $($nodeModules.status)"
Write-Output "PostgreSQL catalog: $(if ($pg.available) { 'read-only verified' } else { 'unavailable: ' + $pg.error })"
