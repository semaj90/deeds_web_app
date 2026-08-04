#requires -Version 7.0
<#
.SYNOPSIS
  Session 187 bounded Vite/SvelteKit root-cause investigation.

.DESCRIPTION
  Captures environment and repository state, clears only disposable caches,
  starts Vite with debug logging, probes routes, extracts likely first-failure
  evidence, and emits JSON + Markdown audit reports.

  This script intentionally:
  - does not modify reranking source files
  - does not refresh codebase-graph.json
  - does not delete node_modules or package-lock.json
  - does not apply broad dependency upgrades
  - does not auto-edit Vite/Svelte configuration

.EXAMPLE
  pwsh -ExecutionPolicy Bypass -File .\scripts\atlas\session-187-vite-root-cause.ps1

.EXAMPLE
  pwsh -ExecutionPolicy Bypass -File .\scripts\atlas\session-187-vite-root-cause.ps1 `
    -AppRoot "C:\Users\james\Videos\deeds-web-app\sveltekit-frontend" `
    -DevUrl "http://127.0.0.1:5173" `
    -Routes "/", "/api/graphify/status"
#>

[CmdletBinding()]
param(
    [Parameter()]
    [ValidateNotNullOrEmpty()]
    [string]$RepoRoot = "C:\Users\james\Videos\deeds-web-app",

    [Parameter()]
    [ValidateNotNullOrEmpty()]
    [string]$AppRoot = "C:\Users\james\Videos\deeds-web-app\sveltekit-frontend",

    [Parameter()]
    [ValidateNotNullOrEmpty()]
    [string]$DevUrl = "http://127.0.0.1:5173",

    [Parameter()]
    [ValidateRange(10, 180)]
    [int]$StartupTimeoutSeconds = 45,

    [Parameter()]
    [ValidateRange(1, 60)]
    [int]$ProbeTimeoutSeconds = 15,

    [Parameter()]
    [string[]]$Routes = @(
        "/",
        "/api/graphify/status"
    ),

    [Parameter()]
    [switch]$SkipRouteProbe,

    [Parameter()]
    [switch]$KeepDevServerRunning
)

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"
$ProgressPreference = "SilentlyContinue"

$SessionId = "187"
$ReportDate = "2026-08-04"
$ReportDir = Join-Path $AppRoot "docs\reports"
$DebugLog = Join-Path $ReportDir "vite-debug-session-$SessionId.log"
$NormalLog = Join-Path $ReportDir "sveltekit-debug-session-$SessionId.log"
$EnvironmentLog = Join-Path $ReportDir "vite-environment-session-$SessionId.txt"
$JsonReport = Join-Path $ReportDir "vite-impossible-situation-audit-$ReportDate.json"
$MarkdownReport = Join-Path $ReportDir "vite-impossible-situation-audit-$ReportDate.md"

$ProtectedFiles = @(
    "src\lib\server\retrieval\canonical-rerank-executor.ts",
    "src\lib\server\retrieval\runtime-reranker.ts",
    "src\lib\server\retrieval\feature-envelope.ts"
)

$Audit = [ordered]@{
    schemaVersion = "atlas.vite.audit.v1"
    session = $SessionId
    generatedAt = (Get-Date).ToString("o")
    repoRoot = $RepoRoot
    appRoot = $AppRoot
    devUrl = $DevUrl

    VITE_ERROR_REPRODUCED = "NOT_PROVEN"
    FIRST_FAILING_MODULE = $null
    IMPORTER_CHAIN = @()
    FAILING_VITE_PLUGIN = $null
    FAILURE_PHASE = $null
    ROOT_CAUSE = "NOT_PROVEN"

    SESSION_184_RERANKING_CAUSALITY = "NOT_PROVEN"
    CONFIGURATION_CAUSALITY = "NOT_PROVEN"
    DEPENDENCY_CAUSALITY = "NOT_PROVEN"
    CACHE_CAUSALITY = "NOT_PROVEN"

    FIX_APPLIED = "none"
    NORMAL_DEV_START = "NOT_PROVEN"
    TRIGGER_ROUTE_PROOF = @()
    RERANKING_DIAGNOSIS_UNBLOCKED = "FAIL"
    GRAPH_REFRESH_REQUIRED = "DEFERRED"

    environment = [ordered]@{}
    repository = [ordered]@{}
    ports = @()
    cacheActions = @()
    routeProbes = @()
    evidence = @()
    warnings = @()
    logs = [ordered]@{
        environment = $EnvironmentLog
        viteDebug = $DebugLog
        normalDev = $NormalLog
    }
}

function Write-Phase {
    param([string]$Message)
    $stamp = Get-Date -Format "HH:mm:ss"
    Write-Host "[$stamp] $Message" -ForegroundColor Cyan
}

function Add-Evidence {
    param(
        [string]$Kind,
        [string]$Value,
        [string]$Source
    )
    $Audit.evidence += [ordered]@{
        kind = $Kind
        value = $Value
        source = $Source
    }
}

function Invoke-CapturedCommand {
    param(
        [Parameter(Mandatory)]
        [string]$Label,

        [Parameter(Mandatory)]
        [scriptblock]$Command,

        [switch]$AllowFailure
    )

    try {
        $output = & $Command 2>&1 | Out-String
        return [ordered]@{
            label = $Label
            ok = $true
            output = $output.TrimEnd()
        }
    }
    catch {
        $result = [ordered]@{
            label = $Label
            ok = $false
            output = ($_ | Out-String).TrimEnd()
        }
        if (-not $AllowFailure) {
            throw
        }
        return $result
    }
}

function Get-CommandText {
    param([string]$Name)
    try {
        return (& $Name --version 2>&1 | Out-String).Trim()
    }
    catch {
        return "UNAVAILABLE: $($_.Exception.Message)"
    }
}

function Get-ListeningPorts {
    param([int[]]$Ports)

    $results = @()
    foreach ($port in $Ports) {
        try {
            $listeners = Get-NetTCPConnection -State Listen -LocalPort $port -ErrorAction Stop
            foreach ($listener in $listeners) {
                $process = $null
                try {
                    $process = Get-Process -Id $listener.OwningProcess -ErrorAction Stop
                }
                catch {
                    # Preserve listener evidence even if process exits during capture.
                }

                $results += [ordered]@{
                    port = $port
                    address = $listener.LocalAddress
                    pid = $listener.OwningProcess
                    process = if ($process) { $process.ProcessName } else { $null }
                    path = if ($process) {
                        try { $process.Path } catch { $null }
                    } else { $null }
                }
            }
        }
        catch {
            # No listener is normal.
        }
    }
    return $results
}

function Remove-DisposableCache {
    param([string]$Path)

    if (Test-Path -LiteralPath $Path) {
        Remove-Item -LiteralPath $Path -Recurse -Force
        $Audit.cacheActions += [ordered]@{
            path = $Path
            action = "removed"
            status = "PASS"
        }
    }
    else {
        $Audit.cacheActions += [ordered]@{
            path = $Path
            action = "not_present"
            status = "PASS"
        }
    }
}

function Start-LoggedProcess {
    param(
        [Parameter(Mandatory)]
        [string]$FilePath,

        [Parameter(Mandatory)]
        [string[]]$ArgumentList,

        [Parameter(Mandatory)]
        [string]$WorkingDirectory,

        [Parameter(Mandatory)]
        [string]$LogPath,

        [hashtable]$Environment = @{}
    )

    $stdout = "$LogPath.stdout.tmp"
    $stderr = "$LogPath.stderr.tmp"

    Remove-Item $stdout, $stderr, $LogPath -Force -ErrorAction SilentlyContinue

    $savedEnvironment = @{}
    foreach ($entry in $Environment.GetEnumerator()) {
        $savedEnvironment[$entry.Key] = [Environment]::GetEnvironmentVariable(
            $entry.Key,
            [EnvironmentVariableTarget]::Process
        )
        [Environment]::SetEnvironmentVariable(
            $entry.Key,
            [string]$entry.Value,
            [EnvironmentVariableTarget]::Process
        )
    }

    try {
        $process = Start-Process `
            -FilePath $FilePath `
            -ArgumentList $ArgumentList `
            -WorkingDirectory $WorkingDirectory `
            -RedirectStandardOutput $stdout `
            -RedirectStandardError $stderr `
            -NoNewWindow `
            -PassThru
    }
    finally {
        foreach ($entry in $savedEnvironment.GetEnumerator()) {
            [Environment]::SetEnvironmentVariable(
                $entry.Key,
                $entry.Value,
                [EnvironmentVariableTarget]::Process
            )
        }
    }

    return [ordered]@{
        process = $process
        stdout = $stdout
        stderr = $stderr
        log = $LogPath
    }
}

function Update-CombinedLog {
    param(
        [Parameter(Mandatory)]
        [hashtable]$ProcessInfo
    )

    $parts = @()

    if (Test-Path $ProcessInfo.stdout) {
        $parts += Get-Content $ProcessInfo.stdout -Raw -ErrorAction SilentlyContinue
    }

    if (Test-Path $ProcessInfo.stderr) {
        $parts += Get-Content $ProcessInfo.stderr -Raw -ErrorAction SilentlyContinue
    }

    $parts -join [Environment]::NewLine | Set-Content -LiteralPath $ProcessInfo.log -Encoding utf8
}

function Wait-ForStartupSignal {
    param(
        [Parameter(Mandatory)]
        [hashtable]$ProcessInfo,

        [Parameter(Mandatory)]
        [int]$TimeoutSeconds
    )

    $deadline = (Get-Date).AddSeconds($TimeoutSeconds)
    $readyPatterns = @(
        "Local:\s+http",
        "ready in \d+",
        "server running",
        "listening on"
    )
    $failurePatterns = @(
        "An impossible situation occurred",
        "\[vite\].*error",
        "Pre-transform error",
        "Internal server error",
        "failed to load config"
    )

    while ((Get-Date) -lt $deadline) {
        Update-CombinedLog -ProcessInfo $ProcessInfo
        $logText = if (Test-Path $ProcessInfo.log) {
            Get-Content $ProcessInfo.log -Raw -ErrorAction SilentlyContinue
        } else {
            ""
        }

        foreach ($pattern in $failurePatterns) {
            if ($logText -match $pattern) {
                return "failure"
            }
        }

        foreach ($pattern in $readyPatterns) {
            if ($logText -match $pattern) {
                return "ready"
            }
        }

        if ($ProcessInfo.process.HasExited) {
            return "exited"
        }

        Start-Sleep -Milliseconds 500
    }

    Update-CombinedLog -ProcessInfo $ProcessInfo
    return "timeout"
}

function Stop-ProcessTreeSafely {
    param([System.Diagnostics.Process]$Process)

    if (-not $Process -or $Process.HasExited) {
        return
    }

    try {
        & taskkill.exe /PID $Process.Id /T /F 2>&1 | Out-Null
    }
    catch {
        try {
            Stop-Process -Id $Process.Id -Force -ErrorAction Stop
        }
        catch {
            $Audit.warnings += "Unable to stop PID $($Process.Id): $($_.Exception.Message)"
        }
    }
}

function Probe-Route {
    param(
        [string]$BaseUrl,
        [string]$Route,
        [int]$TimeoutSeconds
    )

    $url = $BaseUrl.TrimEnd("/") + "/" + $Route.TrimStart("/")
    if ($Route -eq "/") {
        $url = $BaseUrl.TrimEnd("/") + "/"
    }

    $started = Get-Date
    try {
        $response = Invoke-WebRequest `
            -Uri $url `
            -Method Get `
            -TimeoutSec $TimeoutSeconds `
            -MaximumRedirection 0 `
            -SkipHttpErrorCheck

        return [ordered]@{
            url = $url
            status = "PASS"
            statusCode = [int]$response.StatusCode
            durationMs = [int]((Get-Date) - $started).TotalMilliseconds
            contentType = [string]$response.Headers["Content-Type"]
            error = $null
        }
    }
    catch {
        return [ordered]@{
            url = $url
            status = "FAIL"
            statusCode = $null
            durationMs = [int]((Get-Date) - $started).TotalMilliseconds
            contentType = $null
            error = $_.Exception.Message
        }
    }
}

function Find-FirstMatch {
    param(
        [string[]]$Lines,
        [string[]]$Patterns
    )

    for ($index = 0; $index -lt $Lines.Count; $index++) {
        foreach ($pattern in $Patterns) {
            if ($Lines[$index] -match $pattern) {
                return [ordered]@{
                    index = $index
                    line = $Lines[$index]
                    pattern = $pattern
                }
            }
        }
    }

    return $null
}

function Extract-QuotedModuleId {
    param([string[]]$ContextLines)

    $patterns = @(
        '(?i)(?:id|module|file|url|importer)\s*[:=]\s*["'']?([^"'']+\.(?:svelte|ts|js|mjs|cjs|css)(?:\?[^"'']*)?)',
        '(?i)([A-Za-z]:[\\/][^:\r\n]+\.(?:svelte|ts|js|mjs|cjs|css)(?:\?[^\s]*)?)',
        '(?i)(/[^:\r\n]+\.(?:svelte|ts|js|mjs|cjs|css)(?:\?[^\s]*)?)',
        '(?i)(virtual:[^\s"'']+)',
        '(?i)(\0[^\s"'']+)'
    )

    foreach ($line in $ContextLines) {
        foreach ($pattern in $patterns) {
            $match = [regex]::Match($line, $pattern)
            if ($match.Success) {
                return $match.Groups[1].Value.Trim()
            }
        }
    }

    return $null
}

function Extract-Plugin {
    param([string[]]$ContextLines)

    $patterns = @(
        '(?i)plugin\s*[:=]\s*["'']?([^"'',\]\s]+)',
        '(?i)\[plugin:([^\]]+)\]',
        '(?i)at\s+Object\.(?:transform|resolveId|load).+\(([^)]+)\)'
    )

    foreach ($line in $ContextLines) {
        foreach ($pattern in $patterns) {
            $match = [regex]::Match($line, $pattern)
            if ($match.Success) {
                return $match.Groups[1].Value.Trim()
            }
        }
    }

    return $null
}

function Extract-FailurePhase {
    param([string[]]$ContextLines)

    $joined = $ContextLines -join "`n"
    if ($joined -match '(?i)pre-transform') { return "pre-transform" }
    if ($joined -match '(?i)resolveId|failed to resolve|vite:resolve') { return "resolve" }
    if ($joined -match '(?i)\bload\b|vite:load') { return "load" }
    if ($joined -match '(?i)\btransform\b|vite:transform') { return "transform" }
    if ($joined -match '(?i)import-analysis') { return "import-analysis" }
    if ($joined -match '(?i)\bssr\b') { return "ssr" }
    if ($joined -match '(?i)\bhmr\b') { return "hmr" }
    return $null
}

function Extract-ImporterChain {
    param([string[]]$Lines)

    $chain = New-Object System.Collections.Generic.List[string]
    $patterns = @(
        '(?i)imported by\s+(.+)$',
        '(?i)importer\s*[:=]\s*(.+)$',
        '(?i)at\s+(.+\.(?:svelte|ts|js|mjs|cjs)(?:\?[^:\s]+)?)'
    )

    foreach ($line in $Lines) {
        foreach ($pattern in $patterns) {
            $match = [regex]::Match($line, $pattern)
            if ($match.Success) {
                $value = $match.Groups[1].Value.Trim().Trim('"', "'")
                if ($value -and -not $chain.Contains($value)) {
                    $chain.Add($value)
                }
            }
        }
    }

    return @($chain | Select-Object -First 20)
}

function Analyze-ViteLog {
    param([string]$Path)

    if (-not (Test-Path $Path)) {
        $Audit.warnings += "Missing Vite debug log: $Path"
        return
    }

    $lines = @(Get-Content -LiteralPath $Path -ErrorAction SilentlyContinue)
    if ($lines.Count -eq 0) {
        $Audit.warnings += "Vite debug log was empty: $Path"
        return
    }

    $firstFailure = Find-FirstMatch -Lines $lines -Patterns @(
        "An impossible situation occurred",
        "Pre-transform error",
        "Internal server error",
        "failed to load config",
        "\berror\b"
    )

    if ($null -eq $firstFailure) {
        return
    }

    $Audit.VITE_ERROR_REPRODUCED = if (
        $lines -match "An impossible situation occurred"
    ) { "PASS" } else { "PARTIAL_PROVEN" }

    $start = [Math]::Max(0, $firstFailure.index - 30)
    $end = [Math]::Min($lines.Count - 1, $firstFailure.index + 80)
    $context = @($lines[$start..$end])

    $Audit.FIRST_FAILING_MODULE = Extract-QuotedModuleId -ContextLines $context
    $Audit.FAILING_VITE_PLUGIN = Extract-Plugin -ContextLines $context
    $Audit.FAILURE_PHASE = Extract-FailurePhase -ContextLines $context
    $Audit.IMPORTER_CHAIN = Extract-ImporterChain -Lines $context

    Add-Evidence `
        -Kind "first_failure_line" `
        -Value $firstFailure.line `
        -Source $Path

    Add-Evidence `
        -Kind "first_failure_context" `
        -Value ($context -join "`n") `
        -Source $Path
}

function Infer-Causality {
    $module = [string]$Audit.FIRST_FAILING_MODULE
    $plugin = [string]$Audit.FAILING_VITE_PLUGIN
    $phase = [string]$Audit.FAILURE_PHASE
    $evidenceText = ($Audit.evidence | ForEach-Object { $_.value }) -join "`n"

    if ($module -match 'canonical-rerank-executor|runtime-reranker|feature-envelope') {
        $Audit.SESSION_184_RERANKING_CAUSALITY = "PARTIAL_PROVEN"
    }
    else {
        $Audit.SESSION_184_RERANKING_CAUSALITY = "NOT_PROVEN"
    }

    if ($plugin -match 'config|unocss|svelte|vite' -or $evidenceText -match 'vite\.config|svelte\.config|tsconfig') {
        $Audit.CONFIGURATION_CAUSALITY = "PARTIAL_PROVEN"
    }

    if ($evidenceText -match 'node_modules|package|version|ERR_MODULE_NOT_FOUND|Cannot find package') {
        $Audit.DEPENDENCY_CAUSALITY = "PARTIAL_PROVEN"
    }

    if ($phase -and $Audit.VITE_ERROR_REPRODUCED -eq "PASS") {
        $Audit.ROOT_CAUSE = "Localized but not fully proven; inspect first-failure evidence."
    }

    if ($Audit.FIRST_FAILING_MODULE -and $Audit.FAILURE_PHASE) {
        $Audit.RERANKING_DIAGNOSIS_UNBLOCKED = "PARTIAL_PROVEN"
    }
}

function Write-AuditReports {
    $Audit.generatedAt = (Get-Date).ToString("o")

    $Audit | ConvertTo-Json -Depth 12 |
        Set-Content -LiteralPath $JsonReport -Encoding utf8

    $importerChain = if ($Audit.IMPORTER_CHAIN.Count -gt 0) {
        ($Audit.IMPORTER_CHAIN | ForEach-Object { "- `$_`" }) -join "`n"
    }
    else {
        "- Not established"
    }

    $routeTable = if ($Audit.routeProbes.Count -gt 0) {
        $rows = @(
            "| URL | Status | HTTP | Duration ms | Error |",
            "|---|---:|---:|---:|---|"
        )
        foreach ($probe in $Audit.routeProbes) {
            $errorText = ([string]$probe.error).Replace("|", "\|")
            $rows += "| $($probe.url) | $($probe.status) | $($probe.statusCode) | $($probe.durationMs) | $errorText |"
        }
        $rows -join "`n"
    }
    else {
        "No route probes were executed."
    }

    $warningSection = if ($Audit.warnings.Count -gt 0) {
        ($Audit.warnings | ForEach-Object { "- $_" }) -join "`n"
    }
    else {
        "- None"
    }

    $markdown = @"
# Vite “An impossible situation occurred” audit

**Session:** $SessionId  
**Generated:** $($Audit.generatedAt)  
**Application:** ``$AppRoot``  
**Dev URL:** ``$DevUrl``

## Final status

| Field | Result |
|---|---|
| VITE_ERROR_REPRODUCED | **$($Audit.VITE_ERROR_REPRODUCED)** |
| FIRST_FAILING_MODULE | ``$($Audit.FIRST_FAILING_MODULE)`` |
| FAILING_VITE_PLUGIN | ``$($Audit.FAILING_VITE_PLUGIN)`` |
| FAILURE_PHASE | ``$($Audit.FAILURE_PHASE)`` |
| ROOT_CAUSE | $($Audit.ROOT_CAUSE) |
| SESSION_184_RERANKING_CAUSALITY | **$($Audit.SESSION_184_RERANKING_CAUSALITY)** |
| CONFIGURATION_CAUSALITY | **$($Audit.CONFIGURATION_CAUSALITY)** |
| DEPENDENCY_CAUSALITY | **$($Audit.DEPENDENCY_CAUSALITY)** |
| CACHE_CAUSALITY | **$($Audit.CACHE_CAUSALITY)** |
| FIX_APPLIED | $($Audit.FIX_APPLIED) |
| NORMAL_DEV_START | **$($Audit.NORMAL_DEV_START)** |
| RERANKING_DIAGNOSIS_UNBLOCKED | **$($Audit.RERANKING_DIAGNOSIS_UNBLOCKED)** |
| GRAPH_REFRESH_REQUIRED | **$($Audit.GRAPH_REFRESH_REQUIRED)** |

## Importer chain

$importerChain

## Route probes

$routeTable

## Evidence interpretation

- Reverting one line does not prove zero Session 184 causality.
- The first failing module, importer chain, plugin, and phase are the deciding evidence.
- The stale graph was intentionally not refreshed or used as causal evidence.
- No reranking source file was intentionally modified by this script.
- No broad dependency upgrade or lockfile regeneration was performed.

## Logs

- Environment: ``$EnvironmentLog``
- Vite debug: ``$DebugLog``
- Normal dev: ``$NormalLog``
- JSON audit: ``$JsonReport``

## Warnings

$warningSection
"@

    $markdown | Set-Content -LiteralPath $MarkdownReport -Encoding utf8
}

$debugProcessInfo = $null
$normalProcessInfo = $null

try {
    Write-Phase "Validating repository paths"

    if (-not (Test-Path -LiteralPath $RepoRoot -PathType Container)) {
        throw "Repository root does not exist: $RepoRoot"
    }

    if (-not (Test-Path -LiteralPath $AppRoot -PathType Container)) {
        throw "Application root does not exist: $AppRoot"
    }

    New-Item -ItemType Directory -Path $ReportDir -Force | Out-Null

    foreach ($protectedFile in $ProtectedFiles) {
        $fullPath = Join-Path $AppRoot $protectedFile
        if (-not (Test-Path -LiteralPath $fullPath)) {
            $Audit.warnings += "Protected file was not found at expected path: $fullPath"
        }
    }

    Write-Phase "Phase 1: capturing environment and repository state"

    $Audit.environment.node = Get-CommandText -Name "node"
    $Audit.environment.npm = Get-CommandText -Name "npm"
    $Audit.environment.pwsh = $PSVersionTable.PSVersion.ToString()
    $Audit.environment.os = [System.Environment]::OSVersion.VersionString

    Push-Location $AppRoot
    try {
        $packageVersions = Invoke-CapturedCommand `
            -Label "npm ls core versions" `
            -AllowFailure `
            -Command {
                npm ls vite @sveltejs/kit @sveltejs/vite-plugin-svelte svelte --depth=0
            }

        $Audit.environment.packageVersions = $packageVersions

        $gitStatus = Invoke-CapturedCommand `
            -Label "git status --short" `
            -AllowFailure `
            -Command { git status --short }

        $gitDiffStat = Invoke-CapturedCommand `
            -Label "git diff --stat HEAD" `
            -AllowFailure `
            -Command { git diff --stat HEAD }

        $configDiff = Invoke-CapturedCommand `
            -Label "config diff" `
            -AllowFailure `
            -Command {
                git diff -- package.json package-lock.json vite.config.* svelte.config.* tsconfig.json
            }

        $Audit.repository.gitStatus = $gitStatus
        $Audit.repository.gitDiffStat = $gitDiffStat
        $Audit.repository.configDiff = $configDiff

        $environmentText = @(
            "Session: $SessionId",
            "Generated: $((Get-Date).ToString('o'))",
            "RepoRoot: $RepoRoot",
            "AppRoot: $AppRoot",
            "",
            "Node: $($Audit.environment.node)",
            "npm: $($Audit.environment.npm)",
            "PowerShell: $($Audit.environment.pwsh)",
            "OS: $($Audit.environment.os)",
            "",
            "=== npm ls ===",
            $packageVersions.output,
            "",
            "=== git status --short ===",
            $gitStatus.output,
            "",
            "=== git diff --stat HEAD ===",
            $gitDiffStat.output,
            "",
            "=== configuration diff ===",
            $configDiff.output
        ) -join "`n"

        $environmentText | Set-Content -LiteralPath $EnvironmentLog -Encoding utf8
    }
    finally {
        Pop-Location
    }

    Write-Phase "Capturing active listeners without terminating unrelated services"
    $Audit.ports = @(Get-ListeningPorts -Ports @(4173, 5173, 5174, 3000))

    Write-Phase "Clearing disposable Vite and SvelteKit caches"
    Remove-DisposableCache -Path (Join-Path $AppRoot "node_modules\.vite")
    Remove-DisposableCache -Path (Join-Path $AppRoot ".svelte-kit")

    Write-Phase "Phase 2: starting Vite with debug logging"

    $npxCommand = (Get-Command npx.cmd -ErrorAction SilentlyContinue)
    if (-not $npxCommand) {
        $npxCommand = Get-Command npx -ErrorAction Stop
    }

    $debugProcessInfo = Start-LoggedProcess `
        -FilePath $npxCommand.Source `
        -ArgumentList @("vite", "dev", "--debug") `
        -WorkingDirectory $AppRoot `
        -LogPath $DebugLog `
        -Environment @{
            DEBUG = "vite:*,svelte:*"
            NO_COLOR = "1"
        }

    $debugState = Wait-ForStartupSignal `
        -ProcessInfo $debugProcessInfo `
        -TimeoutSeconds $StartupTimeoutSeconds

    Add-Evidence `
        -Kind "debug_startup_state" `
        -Value $debugState `
        -Source $DebugLog

    if ($debugState -eq "ready") {
        $Audit.NORMAL_DEV_START = "PARTIAL_PROVEN"

        if (-not $SkipRouteProbe) {
            Write-Phase "Phase 3: probing bounded routes"
            foreach ($route in $Routes) {
                $probe = Probe-Route `
                    -BaseUrl $DevUrl `
                    -Route $route `
                    -TimeoutSeconds $ProbeTimeoutSeconds

                $Audit.routeProbes += $probe

                Start-Sleep -Milliseconds 750
                Update-CombinedLog -ProcessInfo $debugProcessInfo

                if (
                    (Test-Path $DebugLog) -and
                    ((Get-Content $DebugLog -Raw) -match "An impossible situation occurred")
                ) {
                    $Audit.TRIGGER_ROUTE_PROOF += [ordered]@{
                        url = $probe.url
                        requestStatus = $probe.status
                        viteErrorObservedAfterProbe = $true
                    }
                    break
                }
            }
        }
    }
    elseif ($debugState -in @("failure", "exited")) {
        $Audit.NORMAL_DEV_START = "FAIL"
    }
    else {
        $Audit.NORMAL_DEV_START = "NOT_PROVEN"
        $Audit.warnings += "Debug startup state was '$debugState' after $StartupTimeoutSeconds seconds."
    }

    Update-CombinedLog -ProcessInfo $debugProcessInfo
    Analyze-ViteLog -Path $DebugLog
    Infer-Causality

    if (-not $KeepDevServerRunning) {
        Stop-ProcessTreeSafely -Process $debugProcessInfo.process
        Update-CombinedLog -ProcessInfo $debugProcessInfo
    }

    Write-Phase "Running normal npm dev command for comparison"

    $npmCommand = (Get-Command npm.cmd -ErrorAction SilentlyContinue)
    if (-not $npmCommand) {
        $npmCommand = Get-Command npm -ErrorAction Stop
    }

    $normalProcessInfo = Start-LoggedProcess `
        -FilePath $npmCommand.Source `
        -ArgumentList @("run", "dev", "--", "--debug") `
        -WorkingDirectory $AppRoot `
        -LogPath $NormalLog `
        -Environment @{
            NO_COLOR = "1"
        }

    $normalState = Wait-ForStartupSignal `
        -ProcessInfo $normalProcessInfo `
        -TimeoutSeconds $StartupTimeoutSeconds

    Add-Evidence `
        -Kind "normal_startup_state" `
        -Value $normalState `
        -Source $NormalLog

    if ($normalState -eq "ready" -and $Audit.VITE_ERROR_REPRODUCED -ne "PASS") {
        $Audit.NORMAL_DEV_START = "PASS"
        $Audit.RERANKING_DIAGNOSIS_UNBLOCKED = "PASS"
    }
    elseif ($normalState -in @("failure", "exited")) {
        $Audit.NORMAL_DEV_START = "FAIL"
    }

    Update-CombinedLog -ProcessInfo $normalProcessInfo

    if ($Audit.VITE_ERROR_REPRODUCED -ne "PASS") {
        Analyze-ViteLog -Path $NormalLog
        Infer-Causality
    }

    if (-not $KeepDevServerRunning) {
        Stop-ProcessTreeSafely -Process $normalProcessInfo.process
        Update-CombinedLog -ProcessInfo $normalProcessInfo
    }

    Write-Phase "Writing JSON and Markdown audit reports"
    Write-AuditReports

    Write-Host ""
    Write-Host "Session 187 audit complete." -ForegroundColor Green
    Write-Host "JSON: $JsonReport"
    Write-Host "Markdown: $MarkdownReport"
    Write-Host "Vite log: $DebugLog"
    Write-Host ""
    Write-Host "First failing module: $($Audit.FIRST_FAILING_MODULE)"
    Write-Host "Plugin: $($Audit.FAILING_VITE_PLUGIN)"
    Write-Host "Phase: $($Audit.FAILURE_PHASE)"
    Write-Host "Vite error reproduced: $($Audit.VITE_ERROR_REPRODUCED)"
}
catch {
    $Audit.warnings += "Fatal script error: $($_.Exception.Message)"
    $Audit.ROOT_CAUSE = "SCRIPT_ABORTED_BEFORE_CAUSAL_PROOF"

    try {
        Write-AuditReports
    }
    catch {
        Write-Error "Unable to write audit reports after failure: $($_.Exception.Message)"
    }

    throw
}
finally {
    if (-not $KeepDevServerRunning) {
        if ($debugProcessInfo -and $debugProcessInfo.process) {
            Stop-ProcessTreeSafely -Process $debugProcessInfo.process
        }

        if ($normalProcessInfo -and $normalProcessInfo.process) {
            Stop-ProcessTreeSafely -Process $normalProcessInfo.process
        }
    }

    foreach ($processInfo in @($debugProcessInfo, $normalProcessInfo)) {
        if ($processInfo) {
            Remove-Item `
                $processInfo.stdout, `
                $processInfo.stderr `
                -Force `
                -ErrorAction SilentlyContinue
        }
    }
}
