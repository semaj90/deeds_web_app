$ErrorActionPreference = "Stop"

# --- Paths -----------------------------------------------------
$projectRoot = "C:\Users\james\Videos\deeds-web-app\cpp-ast-exporter"
$buildDir    = Join-Path $projectRoot "build"
$logPath     = Join-Path $buildDir "build_log.json"
$gpuJson     = Join-Path $buildDir "gpu_detect.json"
$cmakePath   = Join-Path $projectRoot "CMakeLists.txt"
$backupPath  = Join-Path $projectRoot "CMakeLists.backup.txt"
$vsEnvBat    = "C:\Program Files\Microsoft Visual Studio\2022\Community\VC\Auxiliary\Build\vcvars64.bat"

# --- Prepare clean environment --------------------------------
if (Test-Path $buildDir) { Remove-Item -Recurse -Force $buildDir }
New-Item -ItemType Directory -Force -Path $buildDir | Out-Null
Set-Location $buildDir

# --- Load GPU info --------------------------------------------
if (Test-Path $gpuJson) {
    $gpuInfo = Get-Content $gpuJson | ConvertFrom-Json
    $highestArch = ($gpuInfo | ForEach-Object { [int]$_.capability } | Measure-Object -Maximum).Maximum
} else {
    $highestArch = 86
}
if (-not $highestArch) { $highestArch = 86 }
Write-Host "🧠 Using GPU architecture sm_$highestArch"

# --- Initialize MSVC env --------------------------------------
Write-Host "🧩 Loading Visual Studio environment..."
cmd /c "`"$vsEnvBat`" && set" | ForEach-Object {
    if ($_ -match "^(.*?)=(.*)$") {
        [System.Environment]::SetEnvironmentVariable($matches[1], $matches[2])
    }
}

function Invoke-BuildProcess {
    param (
        [int]$highestArch,
        [string]$logPath
    )

    $fullLogLines = @() # Accumulate full log lines here

    Write-Host "⚙️  Configuring with CMake..."
    $cmakeConfigOutput = & cmake ".." -G "Ninja" -DCMAKE_BUILD_TYPE=Release `
        -DCMAKE_CUDA_ARCHITECTURES="$($highestArch)" `
        | Tee-Object -FilePath $logPath 2>&1 # Capture all output
    $fullLogLines += $cmakeConfigOutput

    if ($LASTEXITCODE -ne 0 -or $cmakeConfigOutput -match "error" -or $cmakeConfigOutput -match "failed") {
        Write-Warning "❌ CMake configuration failed (code $LASTEXITCODE)"
        return @{ Success = $false; Log = ($fullLogLines -join "`n") } # Return joined log on failure
    }

    Write-Host "🏗️  Building..."
    $cmakeBuildOutput = & cmake --build . --parallel 8 | Tee-Object -Append -FilePath $logPath 2>&1 # Capture all output
    $fullLogLines += $cmakeBuildOutput

    if ($LASTEXITCODE -ne 0 -or $cmakeBuildOutput -match "error" -or $cmakeBuildOutput -match "failed") {
        Write-Warning "❌ Build failed (code $LASTEXITCODE)"
        return @{ Success = $false; Log = ($fullLogLines -join "`n") } # Return joined log on failure
    }

    Write-Host "✅ Build succeeded — log saved to $logPath"
    return @{ Success = $true; Log = ($fullLogLines -join "`n") } # Return joined log on success
}

$buildResult = Invoke-BuildProcess -highestArch $highestArch -logPath $logPath

if ($buildResult.Success) {
    exit 0
} else {
    # ===============================================================
    # 🧠  DIAGNOSE AND AUTO-REPAIR SECTION
    # ===============================================================
    Write-Host "🔍  Analyzing build log with gemma3-legal:latest via Ollama..."

    # Use the log returned by the function
    $log = $buildResult.Log
    if (-not $log) { $log = "Build log unavailable." }

    # --- Run Ollama for diagnosis ---------------------------------
    $prompt = @"
You are a CUDA/MSVC CMake build specialist.
The user attempted to build a C++/CUDA project with Ninja and nvcc 13.0 on Windows.
Analyze the following build log, identify likely causes (e.g. nvcc fatal, LNK1104, missing includes, wrong arch).
Output a JSON array of patch objects. Each object should have:
- "file": The target file (e.g., "CMakeLists.txt")
- "action": "replace" or "add"
- "old": (for "replace") The exact string to replace.
- "new": (for "replace") The exact string to replace with.
- "content": (for "add") The exact string to add.

Example JSON output:
[
  {
    "file": "CMakeLists.txt",
    "action": "replace",
    "old": "set(CMAKE_CUDA_ARCHITECTURES 75)",
    "new": "set(CMAKE_CUDA_ARCHITECTURES 86)"
  },
  {
    "file": "CMakeLists.txt",
    "action": "add",
    "content": "include_directories(\"C:/Program Files/NVIDIA GPU Computing Toolkit/CUDA/v13.0/include\")"
  }
]

Build log:
$log
"@
    # Ensure no leading whitespace before the here-string terminator
    $prompt = $prompt -replace "`n\\s*`"@$", "`n`"@"

    try {
        $ollamaOutput = & ollama run gemma3-legal:latest $prompt 2>&1 # Capture both stdout and stderr
        $analysis = $ollamaOutput | Out-String # Convert to a single string
        Write-Host "`n🧩 --- AI Diagnostic Output ---`n"
        Write-Host $analysis # Output directly to console
        $analysis | Out-File -FilePath (Join-Path $buildDir "ai_diagnostic.txt") -Encoding utf8 # Re-enable file saving
    }
    catch {
        Write-Warning "⚠️ Failed to invoke Ollama. Ensure gemma3-legal:latest is running."
        exit 1
    }

    # --- Optional: apply known quick-fix patches -------------------
    if ($log -match "CMAKE_CUDA_ARCHITECTURES.*not one of the following") {
        Write-Host "🛠️  Auto-fixing invalid CUDA_ARCHITECTURES format..."
        (Get-Content $cmakePath) -replace "CMAKE_CUDA_ARCHITECTURES.*", "set(CMAKE_CUDA_ARCHITECTURES 86)" | Set-Content $cmakePath
    }
    elseif ($log -match "LNK1104") {
        Write-Host "🛠️  Auto-fixing link library path issue..."
        Add-Content $cmakePath "`nlink_directories(`\"$env:VCToolsInstallDir`lib\x64`\")"
    }

    Write-Host "🧠 AI recommendations saved to ai_diagnostic.txt"
    # Do not re-run the script here; phase64_self_heal_loop.ps1 handles retries.
    exit 1 # Indicate that a repair was attempted, but a full build success is not guaranteed by this script.
}
