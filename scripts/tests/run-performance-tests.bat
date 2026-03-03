@echo off
REM Performance Testing Runner for Windows
REM Executes all 6 cache performance tests via Playwright

echo ======================================
echo Performance Cache Testing Suite
echo ======================================
echo.

REM Check if dev server is running
echo Checking if dev server is running on port 5173...
curl -s http://localhost:5173 >nul 2>&1
if %errorlevel% neq 0 (
    echo X Dev server is not running!
    echo.
    echo Please start the dev server first:
    echo   cd sveltekit-frontend ^&^& npm run dev
    echo.
    exit /b 1
)

echo OK Dev server is running
echo.

REM Check Docker services
echo Checking Docker services...
docker ps | findstr "phase66-postgres" >nul 2>&1
if %errorlevel% neq 0 (
    echo WARNING: phase66-postgres not running
)

docker ps | findstr "phase66-redis" >nul 2>&1
if %errorlevel% neq 0 (
    echo WARNING: phase66-redis not running
)

echo.
echo Starting performance tests...
echo.

REM Run Playwright tests
npx playwright test scripts\tests\performance-cache.spec.ts --reporter=list --timeout=60000

echo.
echo ======================================
echo Performance Testing Complete!
echo ======================================
echo.
echo Results saved to:
echo   - scripts\tests\performance-results\performance-results-*.json
echo   - PERFORMANCE_TEST_RESULTS.md (updated)
echo.
