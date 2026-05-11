#Requires -Version 5.1
<#
Downloads Hermes Desktop for Windows, installs/checks native Ollama, enables
Flash Attention + quantized KV cache, starts Ollama, and asks you to select
chat/vision and embedding models from models already installed in Ollama.

Notes:
- Standard Ollama does not support TurboQuant/RotorQuant-specific KV cache
  types. This script uses Ollama's supported KV cache quantization:
  f16, q8_0, or q4_0.
- If the model you want is not installed yet, the script can pull recommended
  chat/VLM or embedding models as a fallback.
#>

[CmdletBinding()]
param(
    [string]$Model,
    [string]$EmbeddingModel,
    [int]$ContextLength = 65536,
    [ValidateSet("f16", "q8_0", "q4_0")]
    [string]$KvCacheType = "q8_0",
    [string]$DownloadDir = "$env:USERPROFILE\Downloads\Hermes-Ollama",
    [switch]$SkipHermesDesktop,
    [switch]$SkipOllamaInstall,
    [switch]$SkipModelPull,
    [switch]$SkipEmbeddingPull,
    [switch]$LaunchHermesDesktop,
    [switch]$ForceHermesDesktopInstaller,
    [switch]$CreateDesktopShortcuts,
    [switch]$ShortcutsOnly,
    [switch]$AutoSelectModels,
    [switch]$SkipContextAlias,
    [switch]$CleanupNestedAliases,
    [switch]$IncludeLocalDeepResearch,
    [switch]$ForceDockerRecreate,
    [switch]$IncludeHermesWorkspace,
    [switch]$IncludeRedis,
    [switch]$AllowUnencryptedLdr,
    [string]$BrowserUrl = "http://localhost:5000",
    [switch]$RunBrowserSmokeTest,
    [switch]$RunHttpSmokeTest,
    [switch]$LaunchBrowser,

    # ── Enhancements (2026-05-11) ────────────────────────────────────────
    # SafeMode bundles no-pull / no-context-alias-rewrite for a first run
    # on a fresh box (avoids GB of registry traffic). Equivalent to:
    #   -AutoSelectModels -SkipModelPull -SkipEmbeddingPull -SkipContextAlias
    [switch]$SafeMode,

    # Writes ~/.hermes/mcp.json so Hermes Agent's MCP client connects to
    # the local TRACE server (read-only allowlist per
    # docs/architecture/hermes-agent-windows-gemma4-guide.md §"Wiring Hermes
    # to TRACE MCP"). No-op if Hermes isn't installed yet — the file is
    # picked up on first Hermes run.
    [switch]$ConfigureMcp,
    [string]$TraceMcpUrl = "http://127.0.0.1:8788/mcp",

    # Pre-flight floor of free space on the system drive (GB) the script
    # demands before touching anything that downloads.
    [int]$MinDiskGB = 20,
    [switch]$SkipPreflight,

    # Writes the final JSON summary line to this path (in addition to
    # stdout). Mirrors the agents:smoke:all operator contract. Default:
    # $DownloadDir/setup-hermes-summary.json so re-runs overwrite.
    [string]$SummaryJsonPath
)

$ErrorActionPreference = "Stop"

# SafeMode unrolls to the underlying flags so existing code paths see
# them as if the operator had passed them by hand.
if ($SafeMode) {
    if (-not $AutoSelectModels)  { $AutoSelectModels  = $true }
    if (-not $SkipModelPull)     { $SkipModelPull     = $true }
    if (-not $SkipEmbeddingPull) { $SkipEmbeddingPull = $true }
    if (-not $SkipContextAlias)  { $SkipContextAlias  = $true }
}

# Mutable accumulators for the final JSON summary line.
$script:SetupHermesSummary = [ordered]@{
    safeMode             = [bool]$SafeMode
    configureMcp         = [bool]$ConfigureMcp
    skippedPreflight     = [bool]$SkipPreflight
    hermesDesktopAction  = "none"
    ollamaAction         = "none"
    chatModel            = $null
    embeddingModel       = $null
    contextAlias         = $null
    mcpConfigPath        = $null
    mcpConfigured        = $false
    includeLDR           = [bool]$IncludeLocalDeepResearch
    includeWorkspace     = [bool]$IncludeHermesWorkspace
    includeRedis         = [bool]$IncludeRedis
    healthChecksUp       = @()
    healthChecksDown     = @()
    startedAt            = (Get-Date).ToString("o")
    durationMs           = 0
    preflightWarnings    = @()
}
$script:SetupHermesStart = Get-Date

function Write-Step {
    param([string]$Message)
    Write-Host ""
    Write-Host "==> $Message" -ForegroundColor Cyan
}

function Invoke-Preflight {
    if ($SkipPreflight) {
        Write-Step "Pre-flight skipped (-SkipPreflight)"
        return
    }
    Write-Step "Pre-flight checks"

    # Windows version — Hermes Desktop needs Win 10 1909+ (build 18363).
    try {
        $os = [Environment]::OSVersion.Version
        $minBuild = 18363
        if ($os.Major -lt 10 -or ($os.Major -eq 10 -and $os.Build -lt $minBuild)) {
            $msg = "Windows build $($os.Build) is below the minimum ($minBuild) for Hermes Desktop"
            Write-Host "  WARN: $msg" -ForegroundColor Yellow
            $script:SetupHermesSummary.preflightWarnings += $msg
        } else {
            Write-Host "  OK   Windows build $($os.Build)"
        }
    } catch {
        Write-Host "  WARN: could not detect Windows version: $($_.Exception.Message)" -ForegroundColor Yellow
    }

    # Free disk space on system drive.
    try {
        $sysDrive = (Get-Item $env:SystemDrive)
        $free = (Get-PSDrive -Name $sysDrive.Name.TrimEnd(':')).Free
        $freeGB = [int]($free / 1GB)
        if ($freeGB -lt $MinDiskGB) {
            $msg = "Only $freeGB GB free on $($sysDrive.Name); need >= $MinDiskGB GB for full install (Hermes Desktop + Ollama + models + Docker volumes)"
            Write-Host "  WARN: $msg" -ForegroundColor Yellow
            $script:SetupHermesSummary.preflightWarnings += $msg
        } else {
            Write-Host "  OK   $freeGB GB free on $($sysDrive.Name) (>= $MinDiskGB GB)"
        }
    } catch {
        Write-Host "  WARN: could not check free disk space: $($_.Exception.Message)" -ForegroundColor Yellow
    }

    # Docker only matters when an -Include* switch needs containers.
    $needsDocker = $IncludeLocalDeepResearch -or $IncludeRedis
    if ($needsDocker) {
        if (Test-Command "docker") {
            Write-Host "  OK   docker on PATH"
        } else {
            $msg = "Docker not on PATH but -IncludeLocalDeepResearch or -IncludeRedis was set; LDR/Redis stages will fail"
            Write-Host "  WARN: $msg" -ForegroundColor Yellow
            $script:SetupHermesSummary.preflightWarnings += $msg
        }
    }

    # Note when Hermes Agent CLI is absent — only matters if user wants the
    # MCP config + dashboard/gateway features. Hermes Desktop GUI is a
    # separate thing and installs via the .exe step below.
    if ($IncludeHermesWorkspace -and -not (Test-Command "hermes")) {
        $msg = "hermes CLI not on PATH; Workspace will run in fallback mode (no gateway/dashboard)"
        Write-Host "  WARN: $msg" -ForegroundColor Yellow
        $script:SetupHermesSummary.preflightWarnings += $msg
    }
}

function Write-HermesMcpConfig {
    if (-not $ConfigureMcp) {
        return
    }
    Write-Step "Writing Hermes MCP config (TRACE read-only allowlist)"

    $hermesDir = Join-Path $env:USERPROFILE ".hermes"
    New-Item -ItemType Directory -Force -Path $hermesDir | Out-Null
    $cfgPath = Join-Path $hermesDir "mcp.json"

    # Allowlist mirrors docs/architecture/hermes-agent-windows-gemma4-guide.md
    # §"Wiring Hermes to TRACE MCP" — strictly read-only.
    $allowedPatterns = @(
        "trace.kag_search",
        "trace.explain_retrieval",
        "kb.hybrid_search",
        "kb.trace_search",
        "kb.search_pathways",
        "kb.wiki_note_lookup",
        "kb.search_summary_tree",
        "db.schema_overview",
        "db.table_inspect",
        "topology.search_4d",
        "topology.search_som_neighborhood",
        "graph.expand_neighborhood",
        "graph.pagerank_top",
        "graph.shortest_path",
        "context.build_kv_packet",
        "context.get_compressed_card",
        "context.prefetch_feature_context"
    )
    $blockedPatterns = @(
        "shell.*", "bash.*", "exec.*",
        "db.execute_write", "db.run_migration", "db.*write*",
        "cache.delete_*", "redis.flush*",
        "rabbitmq.publish_*", "queue.publish_*",
        "graph.materialize_pathway", "topology.recompute*",
        "kag.ingest_*"
    )

    $cfg = [ordered]@{
        '$schema'    = "https://schemas.hermes.dev/mcp-config/v1.json"
        generatedBy  = "setup-hermes-desktop-ollama.ps1 (2026-05-11 enhancements)"
        generatedAt  = (Get-Date).ToString("o")
        mcpServers   = [ordered]@{
            'trace-readonly' = [ordered]@{
                url       = $TraceMcpUrl
                transport = "http"
                description = "TRACE read-only MCP — regen pipeline + KAG/graph/topology reads only"
                allow     = $allowedPatterns
                block     = $blockedPatterns
            }
        }
    }

    $json = $cfg | ConvertTo-Json -Depth 10
    Set-Content -Path $cfgPath -Value $json -Encoding UTF8

    Write-Host "  wrote $cfgPath"
    Write-Host "  trace url: $TraceMcpUrl"
    Write-Host "  allowed patterns: $($allowedPatterns.Count)"
    Write-Host "  blocked patterns: $($blockedPatterns.Count)"
    $script:SetupHermesSummary.mcpConfigPath = $cfgPath
    $script:SetupHermesSummary.mcpConfigured = $true
}

function Test-TraceMcp {
    # Cheap reachability probe — Test-Port on whatever port TraceMcpUrl uses.
    $port = Get-PortFromUrl -Url $TraceMcpUrl
    if (-not $port) { return $false }
    return (Test-Port -Port $port)
}

function Test-Command {
    param([string]$Name)
    return [bool](Get-Command $Name -ErrorAction SilentlyContinue)
}

function Test-Port {
    param([int]$Port)

    try {
        $client = New-Object System.Net.Sockets.TcpClient
        $async = $client.BeginConnect("127.0.0.1", $Port, $null, $null)
        $success = $async.AsyncWaitHandle.WaitOne(500, $false)
        if ($success) {
            $client.EndConnect($async)
        }
        $client.Close()
        return $success
    }
    catch {
        return $false
    }
}

function Get-PortFromUrl {
    param([Parameter(Mandatory = $true)][string]$Url)

    try {
        $uri = [Uri]$Url
        if ($uri.Port -gt 0) {
            return $uri.Port
        }
    }
    catch {
        return $null
    }

    return $null
}

function Wait-ForUrlPort {
    param(
        [Parameter(Mandatory = $true)][string]$Url,
        [int]$TimeoutSeconds = 45
    )

    $port = Get-PortFromUrl -Url $Url
    if (-not $port) {
        return $false
    }

    for ($i = 0; $i -lt $TimeoutSeconds; $i++) {
        if (Test-Port -Port $port) {
            return $true
        }
        Start-Sleep -Seconds 1
    }

    return $false
}

function Download-File {
    param(
        [Parameter(Mandatory = $true)][string]$Url,
        [Parameter(Mandatory = $true)][string]$OutFile
    )

    New-Item -ItemType Directory -Force -Path (Split-Path -Parent $OutFile) | Out-Null
    Write-Host "Downloading $Url"
    Invoke-WebRequest -Uri $Url -OutFile $OutFile -UseBasicParsing
    return $OutFile
}

function Get-LatestHermesDesktopAsset {
    Write-Step "Finding latest Hermes Desktop Windows installer"

    $release = Invoke-RestMethod `
        -Uri "https://api.github.com/repos/fathah/hermes-desktop/releases/latest" `
        -Headers @{ "User-Agent" = "HermesDesktopOllamaSetup" }

    $asset = $release.assets |
        Where-Object { $_.name -match "setup\.exe$" -and $_.name -notmatch "blockmap" } |
        Select-Object -First 1

    if (-not $asset) {
        throw "Could not find a Windows setup.exe asset in the latest Hermes Desktop release."
    }

    [pscustomobject]@{
        Version = $release.tag_name
        Name = $asset.name
        Url = $asset.browser_download_url
    }
}

function Find-HermesDesktopApp {
    $candidates = @()

    $roots = @(
        (Join-Path $env:LOCALAPPDATA "Programs"),
        $env:ProgramFiles,
        ${env:ProgramFiles(x86)}
    ) | Where-Object { $_ -and (Test-Path $_) }

    foreach ($root in $roots) {
        $matches = Get-ChildItem -Path $root -Directory -Force -ErrorAction SilentlyContinue |
            Where-Object { $_.Name -match "Hermes" }

        foreach ($match in $matches) {
            $exe = Get-ChildItem -Path $match.FullName -Recurse -Force -ErrorAction SilentlyContinue -Filter "*.exe" |
                Where-Object { $_.Name -match "Hermes|hermes" } |
                Select-Object -First 1
            if ($exe) {
                $candidates += $exe.FullName
            }
        }
    }

    $startRoots = @(
        (Join-Path $env:APPDATA "Microsoft\Windows\Start Menu\Programs"),
        (Join-Path $env:ProgramData "Microsoft\Windows\Start Menu\Programs")
    ) | Where-Object { $_ -and (Test-Path $_) }

    foreach ($root in $startRoots) {
        $lnk = Get-ChildItem -Path $root -Recurse -Force -ErrorAction SilentlyContinue -Filter "*.lnk" |
            Where-Object { $_.Name -match "Hermes" } |
            Select-Object -First 1
        if ($lnk) {
            return $lnk.FullName
        }
    }

    return ($candidates | Select-Object -First 1)
}

function Ensure-HermesDesktop {
    if ($SkipHermesDesktop) {
        return
    }

    $installed = Find-HermesDesktopApp
    if ($installed) {
        Write-Host "Hermes Desktop appears installed: $installed"
        if ($LaunchHermesDesktop) {
            Write-Step "Launching Hermes Desktop"
            Start-Process -FilePath $installed
        }
        return
    }

    $desktop = Get-LatestHermesDesktopAsset
    $desktopInstaller = Join-Path $DownloadDir $desktop.Name

    if (-not (Test-Path $desktopInstaller)) {
        Download-File -Url $desktop.Url -OutFile $desktopInstaller | Out-Null
    }
    else {
        Write-Host "Hermes Desktop installer already downloaded: $desktopInstaller"
    }

    Write-Host "Hermes Desktop $($desktop.Version): $desktopInstaller"

    if ($LaunchHermesDesktop -and $ForceHermesDesktopInstaller) {
        Write-Step "Launching Hermes Desktop installer"
        Start-Process -FilePath $desktopInstaller
    }
    elseif ($LaunchHermesDesktop) {
        Write-Host "Hermes Desktop is not detected as installed. Installer is available at: $desktopInstaller" -ForegroundColor Yellow
        Write-Host "Run with -ForceHermesDesktopInstaller to launch the installer again."
    }
}

function Install-OllamaIfNeeded {
    if (Test-Command "ollama") {
        Write-Host "Ollama is already available."
        return
    }

    if ($SkipOllamaInstall) {
        throw "Ollama is not available, and -SkipOllamaInstall was provided."
    }

    Write-Step "Installing Ollama for Windows"

    if (Test-Command "winget") {
        winget install --id Ollama.Ollama --source winget --accept-package-agreements --accept-source-agreements
    }
    else {
        $installer = Join-Path $DownloadDir "OllamaSetup.exe"
        Download-File -Url "https://ollama.com/download/OllamaSetup.exe" -OutFile $installer | Out-Null
        Start-Process -FilePath $installer -Wait
    }

    $env:Path = [Environment]::GetEnvironmentVariable("Path", "Machine") + ";" +
        [Environment]::GetEnvironmentVariable("Path", "User")

    if (-not (Test-Command "ollama")) {
        throw "Ollama installed, but ollama.exe is not on PATH yet. Open a new PowerShell window and re-run this script."
    }
}

function Configure-OllamaRuntime {
    Write-Step "Configuring native Ollama GPU/KV cache settings"

    $ollamaWasRunning = Test-Port -Port 11434

    try {
        [Environment]::SetEnvironmentVariable("OLLAMA_FLASH_ATTENTION", "1", "User")
        [Environment]::SetEnvironmentVariable("OLLAMA_KV_CACHE_TYPE", $KvCacheType, "User")
        [Environment]::SetEnvironmentVariable("OLLAMA_CONTEXT_LENGTH", "$ContextLength", "User")
        [Environment]::SetEnvironmentVariable("OLLAMA_NUM_PARALLEL", "1", "User")
        [Environment]::SetEnvironmentVariable("OLLAMA_KEEP_ALIVE", "30m", "User")
    }
    catch {
        Write-Host "Could not persist Ollama environment variables to the Windows user profile. Applying them to this launcher process only." -ForegroundColor Yellow
    }

    $env:OLLAMA_FLASH_ATTENTION = "1"
    $env:OLLAMA_KV_CACHE_TYPE = $KvCacheType
    $env:OLLAMA_CONTEXT_LENGTH = "$ContextLength"
    $env:OLLAMA_NUM_PARALLEL = "1"
    $env:OLLAMA_KEEP_ALIVE = "30m"

    Write-Host "OLLAMA_FLASH_ATTENTION=1"
    Write-Host "OLLAMA_KV_CACHE_TYPE=$KvCacheType"
    Write-Host "OLLAMA_CONTEXT_LENGTH=$ContextLength"
    Write-Host "OLLAMA_NUM_PARALLEL=1"
    Write-Host "OLLAMA_KEEP_ALIVE=30m"

    if ($ollamaWasRunning) {
        Write-Host "Ollama is already running. Restart Ollama manually later if you need changed environment variables to apply to the existing process." -ForegroundColor Yellow
    }
}

function Start-OllamaServer {
    Write-Step "Starting Ollama"

    if (Test-Port -Port 11434) {
        Write-Host "Ollama already appears to be listening on port 11434."
        return
    }

    Get-Process -Name "ollama" -ErrorAction SilentlyContinue | Stop-Process -Force -ErrorAction SilentlyContinue
    Start-Sleep -Seconds 2

    $ollamaExe = (Get-Command "ollama").Source
    Start-Process -FilePath $ollamaExe -ArgumentList "serve" -WindowStyle Minimized

    $ready = $false
    for ($i = 0; $i -lt 30; $i++) {
        Start-Sleep -Seconds 1
        try {
            Invoke-RestMethod -Uri "http://127.0.0.1:11434/api/version" -TimeoutSec 2 | Out-Null
            $ready = $true
            break
        }
        catch {
            # Keep waiting.
        }
    }

    if (-not $ready) {
        throw "Ollama did not respond on http://127.0.0.1:11434 within 30 seconds."
    }
}

function Select-MenuItem {
    param(
        [Parameter(Mandatory = $true)][string]$Title,
        [Parameter(Mandatory = $true)][object[]]$Items
    )

    Write-Step $Title

    for ($i = 0; $i -lt $Items.Count; $i++) {
        $item = $Items[$i]
        Write-Host ("[{0}] {1} - {2}" -f ($i + 1), $item.Value, $item.Note)
    }

    Write-Host "[C] Custom model tag"
    Write-Host "[S] Skip"

    while ($true) {
        $choice = Read-Host "Pick one"

        if ($choice -match "^[sS]$") {
            return $null
        }

        if ($choice -match "^[cC]$") {
            return (Read-Host "Enter Ollama model tag")
        }

        $index = 0
        if ([int]::TryParse($choice, [ref]$index)) {
            if ($index -ge 1 -and $index -le $Items.Count) {
                return $Items[$index - 1].Value
            }
        }

        Write-Host "Choose a number, C, or S." -ForegroundColor Yellow
    }
}

function Get-InstalledOllamaModels {
    $oldErrorActionPreference = $ErrorActionPreference
    $ErrorActionPreference = "Continue"
    try {
        $lines = @(& ollama list 2>$null)
        $exitCode = $LASTEXITCODE
    }
    catch {
        return @()
    }
    finally {
        $ErrorActionPreference = $oldErrorActionPreference
    }

    if ($exitCode -ne 0 -or $lines.Count -le 1) {
        return @()
    }

    $models = @()
    foreach ($line in $lines | Select-Object -Skip 1) {
        if ([string]::IsNullOrWhiteSpace($line)) {
            continue
        }

        $name = ($line -split "\s+")[0]
        if ($name -and $name -ne "NAME") {
            $models += $name
        }
    }

    return @($models | Sort-Object -Unique)
}

function Test-OllamaModelInstalled {
    param([string]$Name)

    if (-not $Name) {
        return $false
    }

    return @(Get-InstalledOllamaModels) -contains $Name
}

function Select-PreferredInstalledModel {
    param(
        [Parameter(Mandatory = $true)][ValidateSet("chat", "embedding")][string]$Kind
    )

    $installed = @(Get-InstalledOllamaModels)
    if ($installed.Count -eq 0) {
        return $null
    }

    if ($Kind -eq "chat") {
        $patterns = @(
            "^gemma4-hermes-64k(:latest)?$",
            "64k",
            "gemma4.*vlm",
            "^gemma4:",
            "ssfdre38/gemma4-turbo",
            "^gemma3:12b",
            "^gemma3:"
        )
    }
    else {
        $patterns = @(
            "^embeddinggemma(:latest)?$",
            "^nomic-embed-text(:latest)?$",
            "^mxbai-embed-large(:latest)?$",
            "^snowflake-arctic-embed2(:latest)?$",
            "^bge-m3(:latest)?$",
            "embed"
        )
    }

    foreach ($pattern in $patterns) {
        $match = $installed | Where-Object { $_ -match $pattern } | Select-Object -First 1
        if ($match) {
            return $match
        }
    }

    return $installed[0]
}

function Select-InstalledOrPullModel {
    param(
        [Parameter(Mandatory = $true)][string]$Title,
        [Parameter(Mandatory = $true)][object[]]$RecommendedItems
    )

    $installed = @(Get-InstalledOllamaModels)

    Write-Step $Title

    if ($installed.Count -gt 0) {
        Write-Host "Installed Ollama models:"
        for ($i = 0; $i -lt $installed.Count; $i++) {
            Write-Host ("[{0}] {1}" -f ($i + 1), $installed[$i])
        }
    }
    else {
        Write-Host "No installed Ollama models were found."
    }

    Write-Host "[R] Recommended models to pull"
    Write-Host "[C] Custom model tag"
    Write-Host "[S] Skip"

    while ($true) {
        $choice = Read-Host "Pick one"

        if ($choice -match "^[sS]$") {
            return [pscustomobject]@{ Name = $null; Installed = $false }
        }

        if ($choice -match "^[cC]$") {
            $custom = Read-Host "Enter Ollama model tag"
            return [pscustomobject]@{
                Name = $custom
                Installed = (Test-OllamaModelInstalled -Name $custom)
            }
        }

        if ($choice -match "^[rR]$") {
            $selected = Select-MenuItem -Title "Choose a model to pull" -Items $RecommendedItems
            return [pscustomobject]@{
                Name = $selected
                Installed = (Test-OllamaModelInstalled -Name $selected)
            }
        }

        $index = 0
        if ([int]::TryParse($choice, [ref]$index)) {
            if ($index -ge 1 -and $index -le $installed.Count) {
                return [pscustomobject]@{ Name = $installed[$index - 1]; Installed = $true }
            }
        }

        Write-Host "Choose an installed model number, R, C, or S." -ForegroundColor Yellow
    }
}

function Get-RecommendedChatModels {
    return @(
        [pscustomobject]@{ Value = "gemma3:4b"; Note = "Official Ollama Gemma vision model, low VRAM." },
        [pscustomobject]@{ Value = "gemma3:12b"; Note = "Official Ollama Gemma vision model, better quality." },
        [pscustomobject]@{ Value = "gemma3:27b"; Note = "Official Ollama Gemma vision model, high RAM/VRAM." },
        [pscustomobject]@{ Value = "ssfdre38/gemma4-turbo:e2b"; Note = "Community Gemma 4 Turbo VLM, smaller." },
        [pscustomobject]@{ Value = "ssfdre38/gemma4-turbo:e4b"; Note = "Community Gemma 4 Turbo VLM, recommended default." },
        [pscustomobject]@{ Value = "ssfdre38/gemma4-turbo:26b"; Note = "Community Gemma 4 Turbo VLM, high quality." },
        [pscustomobject]@{ Value = "ssfdre38/gemma4-turbo:31b"; Note = "Community Gemma 4 Turbo VLM, max quality/high memory." }
    )
}

function Get-RecommendedEmbeddingModels {
    return @(
        [pscustomobject]@{ Value = "nomic-embed-text"; Note = "Good general local embedding model." },
        [pscustomobject]@{ Value = "mxbai-embed-large"; Note = "Stronger retrieval quality, larger." },
        [pscustomobject]@{ Value = "snowflake-arctic-embed2"; Note = "Good retrieval model, larger." },
        [pscustomobject]@{ Value = "bge-m3"; Note = "Multilingual/general retrieval if available in your Ollama registry." }
    )
}

function Resolve-ChatModel {
    if ($Model) {
        if (-not (Test-OllamaModelInstalled -Name $Model) -and -not $SkipModelPull) {
            Write-Step "Pulling chat / vision model: $Model"
            ollama pull $Model
        }
        return
    }

    if ($AutoSelectModels) {
        $script:Model = Select-PreferredInstalledModel -Kind "chat"
        if ($Model) {
            Write-Host "Auto-selected chat / vision model: $Model"
            return
        }
    }

    $selection = Select-InstalledOrPullModel `
        -Title "Choose the chat / vision model from ollama list" `
        -RecommendedItems (Get-RecommendedChatModels)

    $script:Model = $selection.Name

    if ($Model -and -not $selection.Installed -and -not $SkipModelPull) {
        Write-Step "Pulling chat / vision model: $Model"
        ollama pull $Model
    }
}

function Resolve-EmbeddingModel {
    if ($EmbeddingModel) {
        if (-not (Test-OllamaModelInstalled -Name $EmbeddingModel) -and -not $SkipEmbeddingPull) {
            Write-Step "Pulling embedding model: $EmbeddingModel"
            ollama pull $EmbeddingModel
        }
        return
    }

    if ($AutoSelectModels) {
        $script:EmbeddingModel = Select-PreferredInstalledModel -Kind "embedding"
        if ($EmbeddingModel) {
            Write-Host "Auto-selected embedding model: $EmbeddingModel"
            return
        }
    }

    $selection = Select-InstalledOrPullModel `
        -Title "Choose the embedding model from ollama list" `
        -RecommendedItems (Get-RecommendedEmbeddingModels)

    $script:EmbeddingModel = $selection.Name

    if ($EmbeddingModel -and -not $selection.Installed -and -not $SkipEmbeddingPull) {
        Write-Step "Pulling embedding model: $EmbeddingModel"
        ollama pull $EmbeddingModel
    }
}

function Get-SafeModelAlias {
    param(
        [Parameter(Mandatory = $true)][string]$SourceModel,
        [Parameter(Mandatory = $true)][int]$NumCtx
    )

    $safe = $SourceModel.ToLowerInvariant()
    $safe = $safe -replace "[^a-z0-9]+", "-"
    $safe = $safe.Trim("-")
    return "$safe-$([int]($NumCtx / 1024))k"
}

function Test-ContextAliasName {
    param(
        [Parameter(Mandatory = $true)][string]$Name,
        [Parameter(Mandatory = $true)][int]$NumCtx
    )

    $baseName = ($Name -split ":", 2)[0]
    $ctx = [int]($NumCtx / 1024)
    return ($baseName -match "(^|-)${ctx}k($|-)")
}

function Remove-NestedContextAliases {
    param([int]$NumCtx)

    $ctx = [int]($NumCtx / 1024)
    $installed = @(Get-InstalledOllamaModels)
    $nested = $installed | Where-Object {
        $baseName = ($_ -split ":", 2)[0]
        ([regex]::Matches($baseName, "${ctx}k").Count -gt 1)
    }

    foreach ($name in $nested) {
        Write-Step "Removing nested context alias: $name"
        ollama rm $name
    }
}

function Ensure-ContextAlias {
    if ($CleanupNestedAliases) {
        Remove-NestedContextAliases -NumCtx $ContextLength
    }

    if ($SkipContextAlias -or -not $Model) {
        return
    }

    if (Test-ContextAliasName -Name $Model -NumCtx $ContextLength) {
        Write-Host "Selected model already appears to be a $ContextLength-token alias: $Model"
        return
    }

    Write-Step "Creating Ollama $ContextLength-token context alias"

    $alias = Get-SafeModelAlias -SourceModel $Model -NumCtx $ContextLength
    $installed = @(Get-InstalledOllamaModels)

    $aliasLatest = "$alias`:latest"
    if ($installed -contains $alias -or $installed -contains $aliasLatest) {
        Write-Host "Context alias already exists: $alias"
        if ($installed -contains $aliasLatest) {
            $script:Model = $aliasLatest
        }
        else {
            $script:Model = $alias
        }
        return
    }

    $modelfileDir = Join-Path $DownloadDir "ollama-modelfiles"
    New-Item -ItemType Directory -Force -Path $modelfileDir | Out-Null
    $modelfilePath = Join-Path $modelfileDir "$alias.Modelfile"

    $content = @"
FROM $Model
PARAMETER num_ctx $ContextLength
"@
    Set-Content -Path $modelfilePath -Value $content -Encoding UTF8

    ollama create $alias -f $modelfilePath
    if ($LASTEXITCODE -ne 0) {
        throw "Could not create Ollama context alias $alias."
    }

    $script:Model = $alias
    Write-Host "Using context alias model: $Model"
}

function Assert-DockerAvailable {
    if (-not (Test-Command "docker")) {
        throw "Docker was not found. Start Docker Desktop and make sure docker.exe is on PATH."
    }

    docker info *> $null
    if ($LASTEXITCODE -ne 0) {
        throw "Docker Desktop is not responding. Start Docker Desktop, then re-run this script."
    }
}

function Write-LocalDeepResearchCompose {
    param([Parameter(Mandatory = $true)][string]$ComposeDir)

    New-Item -ItemType Directory -Force -Path $ComposeDir | Out-Null
    $composePath = Join-Path $ComposeDir "docker-compose.yml"

    $redisService = ""
    $redisVolume = ""
    if ($IncludeRedis) {
        $redisService = @"
  redis-stack:
    image: redis/redis-stack:latest
    container_name: bifrost-redis
    ports:
      - "6379:6379"
      - "8001:8001"
    volumes:
      - bifrost_redis_data:/data
    restart: unless-stopped
    networks:
      - ldr-network

"@
        $redisVolume = "  bifrost_redis_data:`n"
    }

    $modelLine = ""
    if ($Model) {
        $modelLine = "      - LDR_LLM_MODEL=$Model`n"
    }

    $embeddingLine = ""
    if ($EmbeddingModel) {
        $embeddingLine = "      - BIFROST_EMBEDDING_MODEL=$EmbeddingModel`n"
    }

    $unencryptedLine = ""
    if ($AllowUnencryptedLdr) {
        $unencryptedLine = "      - LDR_BOOTSTRAP_ALLOW_UNENCRYPTED=true`n"
    }

    $redisEnvLine = ""
    if ($IncludeRedis) {
        $redisEnvLine = "      - BIFROST_REDIS_URL=redis://redis-stack:6379`n"
    }

    $content = @"
services:
  local-deep-research:
    image: localdeepresearch/local-deep-research:latest
    container_name: local-deep-research
    ports:
      - "5000:5000"
    environment:
      - LDR_WEB_HOST=0.0.0.0
      - LDR_WEB_PORT=5000
      - LDR_DATA_DIR=/data
      - LDR_LLM_PROVIDER=ollama
      - LDR_LLM_OLLAMA_URL=http://host.docker.internal:11434
$modelLine$embeddingLine$unencryptedLine$redisEnvLine      - LDR_SEARCH_ENGINE_WEB_SEARXNG_DEFAULT_PARAMS_INSTANCE_URL=http://searxng:8080
    volumes:
      - ldr_data:/data
      - ldr_scripts:/scripts
    depends_on:
      - searxng
    extra_hosts:
      - "host.docker.internal:host-gateway"
    restart: unless-stopped
    networks:
      - ldr-network

  searxng:
    image: searxng/searxng:latest
    container_name: searxng
    ports:
      - "8080:8080"
    volumes:
      - searxng_data:/etc/searxng
    restart: unless-stopped
    networks:
      - ldr-network

$redisService
volumes:
  ldr_data:
  ldr_scripts:
  searxng_data:
$redisVolume
networks:
  ldr-network:
"@

    if (Test-Path $composePath) {
        $existing = Get-Content -Path $composePath -Raw
        if ($existing -eq $content) {
            Write-Host "Local Deep Research compose file is unchanged."
            return $composePath
        }

        Write-Host "Local Deep Research compose file changed; updating it." -ForegroundColor Yellow
    }

    Set-Content -Path $composePath -Value $content -Encoding UTF8
    return $composePath
}

function Get-DockerContainerState {
    param([Parameter(Mandatory = $true)][string]$Name)

    $state = docker inspect -f "{{.State.Status}}" $Name 2>$null
    if ($LASTEXITCODE -ne 0) {
        return $null
    }

    return "$state".Trim()
}

function Test-DockerContainersRunning {
    param([string[]]$Names)

    foreach ($name in $Names) {
        $state = Get-DockerContainerState -Name $name
        if ($state -ne "running") {
            return $false
        }
    }

    return $true
}

function Start-LocalDeepResearch {
    Write-Step "Starting Local Deep Research with Docker Desktop"
    Assert-DockerAvailable

    $composeDir = Join-Path $DownloadDir "local-deep-research-docker-desktop"
    $composePath = Write-LocalDeepResearchCompose -ComposeDir $composeDir
    $containerNames = @("local-deep-research", "searxng")
    if ($IncludeRedis) {
        $containerNames += "bifrost-redis"
    }

    if (-not $ForceDockerRecreate -and (Test-DockerContainersRunning -Names $containerNames)) {
        Write-Host "Local Deep Research containers are already running. Skipping docker compose up."
        Write-Host "Local Deep Research compose: $composePath"
        return
    }

    Push-Location $composeDir
    try {
        $args = @("compose", "-f", $composePath, "up", "-d", "--no-recreate")
        if ($ForceDockerRecreate) {
            $args = @("compose", "-f", $composePath, "up", "-d", "--force-recreate")
        }

        docker @args
        if ($LASTEXITCODE -ne 0) {
            throw "docker compose up failed for Local Deep Research."
        }
    }
    finally {
        Pop-Location
    }

    Write-Host "Local Deep Research compose: $composePath"
}

function Ensure-GitAvailable {
    if (-not (Test-Command "git")) {
        throw "Git was not found. Install Git for Windows or run Hermes Workspace setup from WSL2."
    }
}

function Ensure-PnpmAvailable {
    if (Test-Command "pnpm") {
        return
    }

    if (-not (Test-Command "corepack")) {
        throw "pnpm/corepack was not found. Install Node.js 22+ first for Hermes Workspace."
    }

    corepack enable
    corepack prepare pnpm@latest --activate
}

function Start-HermesWorkspace {
    Write-Step "Preparing Hermes Workspace"
    Ensure-GitAvailable
    Ensure-PnpmAvailable
    Start-HermesAgentServices

    $workspaceDir = Join-Path $DownloadDir "hermes-workspace"

    if (-not (Test-Path $workspaceDir)) {
        git clone https://github.com/outsourc-e/hermes-workspace.git $workspaceDir
        if ($LASTEXITCODE -ne 0) {
            throw "Could not clone Hermes Workspace."
        }
    }
    else {
        Write-Host "Hermes Workspace already exists: $workspaceDir"
    }

    Push-Location $workspaceDir
    try {
        $envPath = Join-Path $workspaceDir ".env"
        if (-not (Test-Path $envPath) -and (Test-Path (Join-Path $workspaceDir ".env.example"))) {
            Copy-Item (Join-Path $workspaceDir ".env.example") $envPath
        }

        $existingEnv = ""
        if (Test-Path $envPath) {
            $existingEnv = Get-Content $envPath -Raw
        }

        $envContent = @"

HERMES_API_URL=http://127.0.0.1:8642
HERMES_DASHBOARD_URL=http://127.0.0.1:9119
OLLAMA_BASE_URL=http://127.0.0.1:11434
OLLAMA_OPENAI_BASE_URL=http://127.0.0.1:11434/v1
LOCAL_DEEP_RESEARCH_URL=http://localhost:5000
REDIS_URL=redis://localhost:6379
# Portable Ollama fallback, useful if Hermes Agent gateway is not running:
# HERMES_API_URL=http://127.0.0.1:11434
"@
        if ($existingEnv -notmatch "HERMES_API_URL=http://127\.0\.0\.1:8642") {
            Add-Content -Path $envPath -Value $envContent
        }
        else {
            Write-Host "Hermes Workspace .env already contains local service settings."
        }

        if (-not (Test-Path (Join-Path $workspaceDir "node_modules"))) {
            pnpm install
            if ($LASTEXITCODE -ne 0) {
                throw "pnpm install failed for Hermes Workspace."
            }
        }
        else {
            Write-Host "Hermes Workspace dependencies already installed."
        }

        if (-not (Test-Port -Port 3000)) {
            Start-Process -FilePath "powershell.exe" `
                -ArgumentList "-NoExit", "-Command", "cd '$workspaceDir'; pnpm dev" `
                -WindowStyle Minimized
        }
        else {
            Write-Host "Hermes Workspace already appears to be listening on port 3000."
        }
    }
    finally {
        Pop-Location
    }
}

function Start-HermesAgentServices {
    if (-not (Test-Command "hermes")) {
        Write-Host "Hermes Agent CLI was not found. Workspace will still run, but enhanced sessions/memory/skills need Hermes gateway + dashboard." -ForegroundColor Yellow
        return
    }

    Write-Step "Starting Hermes Agent gateway and dashboard for enhanced Workspace mode"

    $hermesDir = Join-Path $env:USERPROFILE ".hermes"
    $hermesEnv = Join-Path $hermesDir ".env"
    New-Item -ItemType Directory -Force -Path $hermesDir | Out-Null

    $existing = ""
    if (Test-Path $hermesEnv) {
        $existing = Get-Content $hermesEnv -Raw
    }

    if ($existing -notmatch "(?m)^API_SERVER_ENABLED=") {
        Add-Content -Path $hermesEnv -Value "API_SERVER_ENABLED=true"
    }

    if (-not (Test-Port -Port 8642)) {
        Start-Process -FilePath "powershell.exe" `
            -ArgumentList "-NoExit", "-Command", "hermes gateway run" `
            -WindowStyle Minimized
    }
    else {
        Write-Host "Hermes gateway already appears to be listening on port 8642."
    }

    if (-not (Test-Port -Port 9119)) {
        Start-Process -FilePath "powershell.exe" `
            -ArgumentList "-NoExit", "-Command", "hermes dashboard" `
            -WindowStyle Minimized
    }
    else {
        Write-Host "Hermes dashboard already appears to be listening on port 9119."
    }
}

function New-Shortcut {
    param(
        [Parameter(Mandatory = $true)][string]$ShortcutPath,
        [Parameter(Mandatory = $true)][string]$TargetPath,
        [string]$Arguments = "",
        [string]$WorkingDirectory = "",
        [string]$Description = "",
        [string]$IconLocation = ""
    )

    $ws = New-Object -ComObject WScript.Shell
    $shortcut = $ws.CreateShortcut($ShortcutPath)
    $shortcut.TargetPath = $TargetPath
    $shortcut.Arguments = $Arguments
    if ($WorkingDirectory) {
        $shortcut.WorkingDirectory = $WorkingDirectory
    }
    if ($Description) {
        $shortcut.Description = $Description
    }
    if ($IconLocation) {
        $shortcut.IconLocation = $IconLocation
    }
    $shortcut.Save()
}

function Ensure-DesktopShortcuts {
    if (-not $CreateDesktopShortcuts) {
        return
    }

    Write-Step "Creating desktop launch shortcuts"

    $desktop = [Environment]::GetFolderPath("Desktop")
    $scriptPath = $PSCommandPath
    $repoDir = Split-Path -Parent $scriptPath
    $psExe = (Get-Command "powershell.exe").Source

    $stackArgs = "-ExecutionPolicy Bypass -NoProfile -File `"$scriptPath`" -LaunchHermesDesktop -AutoSelectModels -IncludeLocalDeepResearch -IncludeHermesWorkspace -IncludeRedis -AllowUnencryptedLdr -BrowserUrl `"http://localhost:5000`" -LaunchBrowser -RunBrowserSmokeTest -RunHttpSmokeTest -CleanupNestedAliases"
    New-Shortcut `
        -ShortcutPath (Join-Path $desktop "Launch Hermes Research Stack.lnk") `
        -TargetPath $psExe `
        -Arguments $stackArgs `
        -WorkingDirectory $repoDir `
        -Description "Launch Hermes Desktop, Hermes Workspace, Local Deep Research, Redis, and Ollama" `
        -IconLocation "$env:SystemRoot\System32\shell32.dll,220"

    $hermesDesktop = Find-HermesDesktopApp
    if ($hermesDesktop) {
        New-Shortcut `
            -ShortcutPath (Join-Path $desktop "Hermes Desktop.lnk") `
            -TargetPath $hermesDesktop `
            -WorkingDirectory (Split-Path -Parent $hermesDesktop) `
            -Description "Open Hermes Desktop" `
            -IconLocation $hermesDesktop
    }

    $urls = @{
        "Hermes Workspace.url" = "http://localhost:3000"
        "Local Deep Research.url" = "http://localhost:5000"
        "Redis Stack UI.url" = "http://localhost:8001"
        "Ollama API.url" = "http://localhost:11434"
    }

    foreach ($name in $urls.Keys) {
        $path = Join-Path $desktop $name
        $content = "[InternetShortcut]`r`nURL=$($urls[$name])`r`n"
        Set-Content -Path $path -Value $content -Encoding ASCII
    }
}

function Open-StackBrowser {
    Write-Step "Opening local UI"

    if (Wait-ForUrlPort -Url $BrowserUrl -TimeoutSeconds 45) {
        Start-Process $BrowserUrl
        Write-Host "Opened primary UI: $BrowserUrl"
    }
    else {
        Write-Host "Primary UI did not become ready in time: $BrowserUrl" -ForegroundColor Yellow
        Start-Process $BrowserUrl
    }

    $secondaryUrls = @()
    if ($BrowserUrl -ne "http://localhost:3000") {
        $secondaryUrls += "http://localhost:3000"
    }
    if ($IncludeRedis -and $BrowserUrl -ne "http://localhost:8001") {
        $secondaryUrls += "http://localhost:8001"
    }

    foreach ($url in $secondaryUrls) {
        $port = Get-PortFromUrl -Url $url
        if ($port -and (Test-Port -Port $port)) {
            Start-Process $url
        }
    }
}

function Invoke-BrowserSmokeTest {
    if (-not $RunBrowserSmokeTest) {
        return
    }

    Write-Step "Running Playwright browser smoke test"

    if (-not (Test-Command "node")) {
        Write-Host "Node.js was not found; skipping Playwright smoke test." -ForegroundColor Yellow
        Invoke-HttpSmokeTest
        return
    }

    node -e "require.resolve('playwright')" *> $null
    if ($LASTEXITCODE -ne 0) {
        Write-Host "Playwright is not installed for this Node.js environment; skipping browser smoke test." -ForegroundColor Yellow
        Write-Host "Install it later with: npm install -D playwright" -ForegroundColor Yellow
        Invoke-HttpSmokeTest
        return
    }

    $testScript = Join-Path (Split-Path -Parent $PSCommandPath) "test-local-stack-playwright.mjs"
    if (-not (Test-Path $testScript)) {
        Write-Host "Playwright test script not found: $testScript" -ForegroundColor Yellow
        return
    }

    $urls = @($BrowserUrl)
    foreach ($url in @("http://localhost:3000", "http://localhost:5000", "http://localhost:8001")) {
        if ($urls -notcontains $url) {
            $urls += $url
        }
    }

    $env:STACK_TEST_URLS = ($urls -join ",")
    node $testScript
    if ($LASTEXITCODE -ne 0) {
        Write-Host "Playwright smoke test reported one or more failures." -ForegroundColor Yellow
    }
}

function Invoke-HttpSmokeTest {
    if (-not $RunHttpSmokeTest -and -not $RunBrowserSmokeTest) {
        return
    }

    Write-Step "Running HTTP smoke test"

    $urls = @($BrowserUrl)
    foreach ($url in @("http://localhost:3000", "http://localhost:5000", "http://localhost:8001", "http://localhost:8080", "http://localhost:11434")) {
        if ($urls -notcontains $url) {
            $urls += $url
        }
    }

    foreach ($url in $urls) {
        try {
            $response = Invoke-WebRequest -Uri $url -UseBasicParsing -TimeoutSec 8
            $length = if ($response.Content) { $response.Content.Length } else { 0 }
            Write-Host ("PASS {0} HTTP {1} bytes={2}" -f $url, [int]$response.StatusCode, $length)
        }
        catch {
            Write-Host ("FAIL {0} {1}" -f $url, $_.Exception.Message) -ForegroundColor Yellow
        }
    }
}

function Write-HealthSummary {
    Write-Step "Health check"

    # TRACE MCP port derived from the configured URL (default :8788).
    $tracePort = Get-PortFromUrl -Url $TraceMcpUrl
    if (-not $tracePort) { $tracePort = 8788 }

    $checks = @(
        [pscustomobject]@{ Name = "Ollama"; Url = "http://localhost:11434"; Port = 11434 },
        [pscustomobject]@{ Name = "Hermes Workspace"; Url = "http://localhost:3000"; Port = 3000 },
        [pscustomobject]@{ Name = "Local Deep Research"; Url = "http://localhost:5000"; Port = 5000 },
        [pscustomobject]@{ Name = "Redis Stack UI"; Url = "http://localhost:8001"; Port = 8001 },
        [pscustomobject]@{ Name = "SearXNG"; Url = "http://localhost:8080"; Port = 8080 },
        [pscustomobject]@{ Name = "Hermes Gateway"; Url = "http://localhost:8642"; Port = 8642 },
        [pscustomobject]@{ Name = "Hermes Dashboard"; Url = "http://localhost:9119"; Port = 9119 },
        [pscustomobject]@{ Name = "TRACE MCP (regen)"; Url = $TraceMcpUrl;             Port = $tracePort }
    )

    foreach ($check in $checks) {
        $status = if (Test-Port -Port $check.Port) { "up" } else { "down" }
        Write-Host ("{0,-22} {1,-4} {2}" -f $check.Name, $status, $check.Url)
        if ($status -eq "up") {
            $script:SetupHermesSummary.healthChecksUp   += $check.Name
        } else {
            $script:SetupHermesSummary.healthChecksDown += $check.Name
        }
    }
}

function Write-JsonSummary {
    # Mirrors the agents:smoke:all operator contract — single
    # `[setup-hermes] summary={...}` line + optional file copy.
    $script:SetupHermesSummary.chatModel      = $Model
    $script:SetupHermesSummary.embeddingModel = $EmbeddingModel
    $script:SetupHermesSummary.contextAlias   = $Model   # final resolved name after Ensure-ContextAlias
    $script:SetupHermesSummary.durationMs     = [int]((Get-Date) - $script:SetupHermesStart).TotalMilliseconds

    $json = $script:SetupHermesSummary | ConvertTo-Json -Depth 6 -Compress
    Write-Host ""
    Write-Host "[setup-hermes] summary=$json"

    $path = if ($SummaryJsonPath) { $SummaryJsonPath } else { Join-Path $DownloadDir "setup-hermes-summary.json" }
    try {
        New-Item -ItemType Directory -Force -Path (Split-Path -Parent $path) | Out-Null
        Set-Content -Path $path -Value $json -Encoding UTF8
        Write-Host "[setup-hermes] summary-file=$path"
    } catch {
        Write-Host "WARN: could not write summary file ($($_.Exception.Message))" -ForegroundColor Yellow
    }
}

New-Item -ItemType Directory -Force -Path $DownloadDir | Out-Null

Invoke-Preflight

Ensure-DesktopShortcuts
if ($ShortcutsOnly) {
    Write-Step "Done"
    Write-Host "Desktop shortcuts updated."
    $script:SetupHermesSummary.hermesDesktopAction = "shortcuts-only"
    Write-JsonSummary
    return
}
Ensure-HermesDesktop
$script:SetupHermesSummary.hermesDesktopAction = if (Find-HermesDesktopApp) { "present" } else { "skipped" }

Install-OllamaIfNeeded
$script:SetupHermesSummary.ollamaAction = if (Test-Command "ollama") { "present" } else { "missing" }

Configure-OllamaRuntime
Start-OllamaServer
Resolve-ChatModel
Ensure-ContextAlias
Resolve-EmbeddingModel

# Phase A handoff lane — writes ~/.hermes/mcp.json so Hermes' MCP client
# connects to the local TRACE server with a read-only allowlist.
Write-HermesMcpConfig

if ($IncludeLocalDeepResearch) {
    Start-LocalDeepResearch
}

if ($IncludeHermesWorkspace) {
    Start-HermesWorkspace
}

if ($LaunchBrowser) {
    Open-StackBrowser
}

Write-HealthSummary
Invoke-BrowserSmokeTest
Invoke-HttpSmokeTest

Write-Step "Done"
Write-Host "Ollama API:              http://127.0.0.1:11434"
Write-Host "OpenAI-compatible URL:  http://127.0.0.1:11434/v1"
Write-Host "Model:                  $Model"
Write-Host "Context length:         $ContextLength"
Write-Host "Embedding model:        $EmbeddingModel"
Write-Host "Local Deep Research:    http://localhost:5000"
Write-Host "Hermes Workspace:       http://localhost:3000"
Write-Host "Redis Stack UI:         http://localhost:8001"
if ($ConfigureMcp) {
    Write-Host "Hermes MCP config:       $(Join-Path $env:USERPROFILE '.hermes\mcp.json')"
    Write-Host "TRACE MCP target:       $TraceMcpUrl"
}
Write-Host ""
Write-Host "Use this local endpoint in Hermes Desktop when choosing a local/custom OpenAI-compatible model."
Write-Host "For Hermes Agent itself on Windows, WSL2 is still the better backend path."

Write-JsonSummary
