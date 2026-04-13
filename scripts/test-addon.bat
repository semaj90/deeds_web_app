@echo off
REM ═══════════════════════════════════════════════════════════════════════
REM Test simdjson addon with LibTorch PATH
REM ═══════════════════════════════════════════════════════════════════════

call scripts\set-libtorch-path.bat

echo.
echo Testing addon load...
node -e "try { const addon = require('./simd-bridge/cpp/build/Release/tensorrt_bridge.node'); console.log('✅ Addon loaded successfully'); console.log('   CUDA available:', addon.isCudaAvailable()); console.log('   simdjson available:', typeof addon.simdJsonParse === 'function'); } catch (err) { console.log('❌ Addon load failed:', err.message); process.exit(1); }"

if %ERRORLEVEL% EQU 0 (
    echo.
    echo ✅ All checks passed - addon is working!
    exit /b 0
) else (
    echo.
    echo ❌ Addon test failed
    exit /b 1
)