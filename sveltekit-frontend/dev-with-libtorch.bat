@echo off
REM ═══════════════════════════════════════════════════════════════════════
REM SvelteKit Dev Server with LibTorch PATH
REM Usage: cd sveltekit-frontend && dev-with-libtorch.bat
REM ═══════════════════════════════════════════════════════════════════════

echo.
echo ═══════════════════════════════════════════════════════════════════════
echo   SvelteKit Dev Server with LibTorch + CUDA PATH
echo ═══════════════════════════════════════════════════════════════════════
echo.

REM Add LibTorch and CUDA to PATH for this session
set "LIBTORCH_PATH=C:\libtorch-win-shared-with-deps-2.9.0+cu130\libtorch\lib"
set "CUDA_PATH=C:\Program Files\NVIDIA GPU Computing Toolkit\CUDA\v13.0\bin"
set "PATH=%LIBTORCH_PATH%;%CUDA_PATH%;%PATH%"

echo ✅ LibTorch PATH: %LIBTORCH_PATH%
echo ✅ CUDA PATH: %CUDA_PATH%
echo.

REM Verify addon loads
echo Testing simdjson addon...
node -e "try { const addon = require('../simd-bridge/cpp/build/Release/tensorrt_bridge.node'); console.log('✅ Addon loaded: ' + Object.keys(addon).length + ' functions'); } catch (err) { console.log('❌ Addon failed:', err.message); }" 2>nul
if %ERRORLEVEL% NEQ 0 (
    echo ⚠️  Warning: Addon not available, will use V8 JSON.parse fallback
)
echo.

echo Starting dev server...
echo.

REM Run npm dev (inherits PATH from this script)
npm run dev
