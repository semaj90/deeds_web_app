# FastMCP C++ Ranker Build Script
# Builds CUDA-accelerated code quality ranker using libtorch

Write-Host "🔨 Building FastMCP C++ Code Quality Ranker" -ForegroundColor Cyan
Write-Host "=" * 70

# Check if CMake is available
if (-not (Get-Command cmake -ErrorAction SilentlyContinue)) {
    Write-Host "❌ CMake not found. Install with: choco install cmake" -ForegroundColor Red
    exit 1
}

# Create build directory
$buildDir = "backend\ml\build"
if (-not (Test-Path $buildDir)) {
    Write-Host "📁 Creating build directory: $buildDir" -ForegroundColor Yellow
    New-Item -ItemType Directory -Path $buildDir | Out-Null
}

Set-Location $buildDir

# Configure with CMake
Write-Host "`n🔧 Configuring CMake..." -ForegroundColor Yellow
Write-Host "   PyTorch path: C:\Users\james\AppData\Roaming\Python\Python313\site-packages\torch"
Write-Host "   CUDA enabled: Yes (RTX 3060 Ti)"

cmake .. -G "Visual Studio 17 2022" -A x64 `
    -DCMAKE_PREFIX_PATH="C:/Users/james/AppData/Roaming/Python/Python313/site-packages/torch" `
    -DCMAKE_BUILD_TYPE=Release

if ($LASTEXITCODE -ne 0) {
    Write-Host "❌ CMake configuration failed" -ForegroundColor Red
    Set-Location ..\..\..
    exit 1
}

# Build
Write-Host "`n🔨 Building (Release mode)..." -ForegroundColor Yellow
cmake --build . --config Release --parallel

if ($LASTEXITCODE -ne 0) {
    Write-Host "❌ Build failed" -ForegroundColor Red
    Set-Location ..\..\..
    exit 1
}

# Check output
if (Test-Path "Release\code_quality_ranker.exe") {
    Write-Host "`n✅ Build successful!" -ForegroundColor Green
    Write-Host "`n📦 Output:" -ForegroundColor Cyan
    Write-Host "   Executable: $buildDir\Release\code_quality_ranker.exe"

    $exeInfo = Get-Item "Release\code_quality_ranker.exe"
    Write-Host "   Size: $([math]::Round($exeInfo.Length / 1MB, 2)) MB"
    Write-Host "   Modified: $($exeInfo.LastWriteTime)"

    Write-Host "`n🚀 To run the server:" -ForegroundColor Yellow
    Write-Host "   cd backend\ml\build\Release"
    Write-Host "   .\code_quality_ranker.exe --port 9092"

    Write-Host "`n🧪 To test:" -ForegroundColor Yellow
    Write-Host "   python backend\scripts\test_ranker_integration.py"
} else {
    Write-Host "❌ Executable not found" -ForegroundColor Red
    Set-Location ..\..\..
    exit 1
}

Set-Location ..\..\..
Write-Host "`n" + ("=" * 70)
Write-Host "✅ Build complete!" -ForegroundColor Green
