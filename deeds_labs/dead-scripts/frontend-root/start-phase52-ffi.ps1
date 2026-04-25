# start-phase52-ffi.ps1

# 1. Build the DLL if missing
$dllPath = "C:\Users\james\Videos\deeds-web-app\go-microservice\simd_ffi.dll"
if (!(Test-Path $dllPath)) {
    Write-Host "DLL missing: building..."
    Push-Location "C:\Users\james\Videos\deeds-web-app\go-microservice"
    .\BUILD-FFI-BRIDGE.bat
    Pop-Location
    if (!(Test-Path $dllPath)) {
        Write-Error "Build failed: DLL still missing. Exiting."
        exit 1
    }
}

# 2. Check Visual C++ redistributable (basic check)
$vcRedist = Get-WmiObject -Class Win32_Product | Where-Object { $_.Name -like "Microsoft Visual C++*2015-2022*Redistributable*" }
if ($vcRedist -eq $null) {
    Write-Warning "Visual C++ Redistributable not found — you may need to install it."
}

# 3. Check CUDA PATH
if (-not ($Env:PATH -split ";" | Where-Object { $_ -match "CUDA" })) {
    Write-Warning "CUDA bin directory not found in PATH environment variable."
}

# 4. Run the test script
Write-Host "Running test-ffi-bridge..."
cd "C:\Users\james\Videos\deeds-web-app\sveltekit-frontend"
node scripts/test-ffi-bridge.mjs
if ($LASTEXITCODE -ne 0) {
    Write-Error "FFI Bridge test failed. Exiting."
    exit 1
}

# 5. Launch repair pipeline
Write-Host "Starting Phase52 repair pipeline..."
node scripts/phase52-ast-repair.mjs
