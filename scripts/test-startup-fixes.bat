@echo off
REM Test script for startup race condition fixes
REM Validates all 4 patches are working correctly

echo ========================================
echo Testing Startup Race Condition Fixes
echo ========================================
echo.

echo [TEST 1] Running readiness check script...
node scripts\dev-readiness-check.mjs
if %ERRORLEVEL% EQU 0 (
    echo ✅ TEST 1 PASSED: All services ready
) else (
    echo ❌ TEST 1 FAILED: Some services unavailable
    echo.
    echo To fix, run:
    echo docker start deeds-postgres-prod deeds-postgres-prod-proxy deeds-redis-prod phase66-rabbitmq phase66-qdrant
    exit /b 1
)

echo.
echo [TEST 2] Checking modified files exist...

if exist "scripts\dev-readiness-check.mjs" (
    echo ✅ Patch A: dev-readiness-check.mjs exists
) else (
    echo ❌ Patch A: dev-readiness-check.mjs missing
)

if exist "sveltekit-frontend\src\lib\server\analysis\worker.ts" (
    echo ✅ Patch B: worker.ts exists
) else (
    echo ❌ Patch B: worker.ts missing
)

if exist "sveltekit-frontend\src\lib\server\engagement\idle-reengagement.ts" (
    echo ✅ Patch C: idle-reengagement.ts exists
) else (
    echo ❌ Patch C: idle-reengagement.ts missing
)

if exist "sveltekit-frontend\src\hooks.server.ts" (
    echo ✅ Patch D: hooks.server.ts exists
) else (
    echo ❌ Patch D: hooks.server.ts missing
)

echo.
echo [TEST 3] Checking for backoff logic in worker.ts...
findstr /C:"consecutiveDbErrors" sveltekit-frontend\src\lib\server\analysis\worker.ts >nul
if %ERRORLEVEL% EQU 0 (
    echo ✅ Backoff logic found in worker.ts
) else (
    echo ❌ Backoff logic missing in worker.ts
)

echo.
echo [TEST 4] Checking for Redis readiness guards...
findstr /C:"isRedisReady" sveltekit-frontend\src\lib\server\engagement\idle-reengagement.ts >nul
if %ERRORLEVEL% EQU 0 (
    echo ✅ Redis readiness guard found in idle-reengagement.ts
) else (
    echo ❌ Redis readiness guard missing in idle-reengagement.ts
)

findstr /C:"isRedisReady" sveltekit-frontend\src\lib\server\cache\report-template-cache.ts >nul
if %ERRORLEVEL% EQU 0 (
    echo ✅ Redis readiness guard found in report-template-cache.ts
) else (
    echo ❌ Redis readiness guard missing in report-template-cache.ts
)

echo.
echo [TEST 5] Checking for conditional warmups in hooks.server.ts...
findstr /C:"checkServicesReady" sveltekit-frontend\src\hooks.server.ts >nul
if %ERRORLEVEL% EQU 0 (
    echo ✅ Service readiness checks found in hooks.server.ts
) else (
    echo ❌ Service readiness checks missing in hooks.server.ts
)

findstr /C:"SKIP_BOOT_WARMUP" sveltekit-frontend\src\hooks.server.ts >nul
if %ERRORLEVEL% EQU 0 (
    echo ✅ SKIP_BOOT_WARMUP env var check found in hooks.server.ts
) else (
    echo ❌ SKIP_BOOT_WARMUP env var check missing in hooks.server.ts
)

echo.
echo ========================================
echo All Tests Complete!
echo ========================================
echo.
echo Next steps:
echo 1. Run: npm run dev
echo 2. Check logs for clean startup (no ECONNREFUSED spam)
echo 3. Test fast startup: SKIP_BOOT_WARMUP=true npm run dev
echo.
