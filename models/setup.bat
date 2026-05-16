@echo off
REM Gemma 4 Legal E4B Model Setup - Batch Launcher
REM Simple double-click launcher for PowerShell script

echo.
echo ========================================================
echo   Gemma 4 Legal E4B Model Setup
echo   Batch Launcher v1.0.0
echo ========================================================
echo.

REM Change to script directory
cd /d "%~dp0"

REM Check if PowerShell is available
where powershell >nul 2>&1
if %ERRORLEVEL% NEQ 0 (
    echo [ERROR] PowerShell not found
    echo.
    echo PowerShell is required to run this setup.
    echo It should be pre-installed on Windows 7 and later.
    echo.
    pause
    exit /b 1
)

REM Check execution policy
echo Checking PowerShell execution policy...
powershell -Command "if ((Get-ExecutionPolicy) -eq 'Restricted') { exit 1 } else { exit 0 }"

if %ERRORLEVEL% EQU 1 (
    echo.
    echo [WARNING] PowerShell execution policy is Restricted
    echo.
    echo This script needs to run PowerShell scripts.
    echo.
    echo Option 1: Run as Administrator and bypass policy (recommended)
    echo Option 2: Change execution policy permanently
    echo.
    choice /C 12 /M "Choose option"

    if ERRORLEVEL 2 (
        echo.
        echo Run this command in PowerShell as Administrator:
        echo   Set-ExecutionPolicy RemoteSigned -Scope CurrentUser
        echo.
        echo Then re-run this script.
        pause
        exit /b 1
    )

    REM Option 1: Bypass for this session
    echo.
    echo Requesting Administrator privileges...
    powershell -Command "Start-Process powershell -ArgumentList '-ExecutionPolicy Bypass -File \"%~dp0setup.ps1\"' -Verb RunAs"
) else (
    REM Normal run
    powershell -ExecutionPolicy Bypass -File "%~dp0setup.ps1"
)

REM Exit with same code as PowerShell script
exit /b %ERRORLEVEL%