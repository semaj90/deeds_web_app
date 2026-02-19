$ErrorActionPreference = "Stop"
$projectRoot = "C:\Users\james\Videos\deeds-web-app\cpp-ast-exporter"
$phase63    = Join-Path $projectRoot "phase63_self_repair_build.ps1"
$logFile    = Join-Path $projectRoot "build\build_log.json"
$analysis   = Join-Path $projectRoot "build\ai_diagnostic.txt"

# --- Safety check -------------------------------------------------------------
if (-not (Test-Path $phase63)) {
    Write-Error "Missing Phase 63 script at $phase63"
    exit 1
}

# --- Self-healing loop --------------------------------------------------------
for ($i = 1; $i -le 3; $i++) {

    Write-Host "`n🌀  Phase 64 Run #$i — Invoking AI-Assisted Build..." -ForegroundColor Cyan
    & pwsh -ExecutionPolicy Bypass -File $phase63 *>&1 | Write-Host

    if ($LASTEXITCODE -eq 0) {
        Write-Host "✅  Build succeeded on attempt #$i — self-healing complete!" -ForegroundColor Green
        exit 0
    }

    Write-Warning "❌ Build failed on attempt #$i (code $LASTEXITCODE)"
    if (Test-Path $analysis) {
        Write-Host "🧠 Last AI analysis summary:"
        Get-Content $analysis | Select-Object -First 20
    }

    # --- Conditional auto-patches --------------------------------------------
    if (Test-Path $logFile) {
        $log = Get-Content $logFile -Raw -ErrorAction SilentlyContinue

        if ($log -match "CMAKE_CUDA_ARCHITECTURES.*invalid") {
            Write-Host "🛠 Fixing invalid CUDA arch format → sm_86"
            (Get-Content "$projectRoot\CMakeLists.txt") -replace "CMAKE_CUDA_ARCHITECTURES.*",
                "set(CMAKE_CUDA_ARCHITECTURES 86)" | Set-Content "$projectRoot\CMakeLists.txt"
        }
        elseif ($log -match "LNK1104") {
            Write-Host "🛠 Patching linker library path (MSVC)"
            Add-Content "$projectRoot\CMakeLists.txt" "`nlink_directories(`"$env:VCToolsInstallDir`lib\x64`")"
        }
        elseif ($log -match "cannot find compiler") {
            Write-Host "🛠 Resetting compiler to explicit MSVC cl.exe"
            (Get-Content "$projectRoot\phase62_auto_gpu_build.ps1") -replace '-DCMAKE_C_COMPILER="\$env:CL"',
                '-DCMAKE_C_COMPILER="C:/Program Files/Microsoft Visual Studio/2022/Community/VC/Tools/MSVC/14.42.34433/bin/Hostx64/x64/cl.exe"' |
                Set-Content "$projectRoot\phase62_auto_gpu_build.ps1"
        }
    }

    Write-Host "🔁 Preparing next retry..." -ForegroundColor Yellow
}

Write-Error "💀 All 3 self-heal attempts failed. Check ai_diagnostic.txt and CMakeLists.txt manually."
exit 1