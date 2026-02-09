@echo off
echo ========================================
echo CMake Reconfiguration (OOM Fix)
echo ========================================
echo.

echo Step 1: Setting up MSVC environment...
call "C:\Program Files\Microsoft Visual Studio\2022\Community\VC\Auxiliary\Build\vcvarsall.bat" x64
if errorlevel 1 (
    echo ERROR: Failed to setup MSVC environment
    pause
    exit /b 1
)

echo.
echo Step 2: Deleting CMake cache...
rmdir /s /q "sveltekit-frontend\build\CMakeFiles" 2>nul
del /f /q "sveltekit-frontend\build\CMakeCache.txt" 2>nul
rmdir /s /q "sveltekit-frontend\build\.cmake" 2>nul
echo Done!

echo.
echo Step 3: Reconfiguring with Ninja (single-config)...
cmake --preset vs2022-cuda64
if errorlevel 1 (
    echo ERROR: CMake configuration failed
    pause
    exit /b 1
)

echo.
echo ========================================
echo SUCCESS! CMake reconfigured successfully
echo ========================================
echo.
echo Now reload VS Code:
echo   1. Press Ctrl+Shift+P
echo   2. Type "Developer: Reload Window"
echo   3. Press Enter
echo.
pause