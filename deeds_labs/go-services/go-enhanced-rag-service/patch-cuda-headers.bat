@echo off
setlocal

echo ==========================================
echo CUDA 13.0 Header Patch Script
echo ==========================================
echo.
echo This script will backup and patch CUDA headers to fix
echo inline assembly errors in cuda_fp16.hpp and cuda_bf16.hpp
echo.

set CUDA_INCLUDE_PATH=C:\Program Files\NVIDIA GPU Computing Toolkit\CUDA\v13.0\include

REM Check if headers exist
if not exist "%CUDA_INCLUDE_PATH%\cuda_fp16.hpp" (
    echo ❌ cuda_fp16.hpp not found at %CUDA_INCLUDE_PATH%
    pause
    exit /b 1
)

if not exist "%CUDA_INCLUDE_PATH%\cuda_bf16.hpp" (
    echo ❌ cuda_bf16.hpp not found at %CUDA_INCLUDE_PATH%
    pause
    exit /b 1
)

echo ✅ CUDA headers found
echo.

REM Create backup directory
set BACKUP_DIR=%CUDA_INCLUDE_PATH%\backup_original
if not exist "%BACKUP_DIR%" (
    echo Creating backup directory...
    mkdir "%BACKUP_DIR%"
)

REM Backup original headers
echo Backing up original headers...
copy "%CUDA_INCLUDE_PATH%\cuda_fp16.hpp" "%BACKUP_DIR%\cuda_fp16.hpp.backup" >nul
copy "%CUDA_INCLUDE_PATH%\cuda_bf16.hpp" "%BACKUP_DIR%\cuda_bf16.hpp.backup" >nul
echo ✅ Backups created

echo.
echo Patching cuda_fp16.hpp...

REM Force 64-bit pointer constraints in cuda_fp16.hpp
powershell -Command "& {$content = Get-Content '%CUDA_INCLUDE_PATH%\cuda_fp16.hpp'; $content = $content -replace '#define __LDG_PTR   \"r\"', '#define __LDG_PTR   \"l\"'; Set-Content '%CUDA_INCLUDE_PATH%\cuda_fp16.hpp' $content}"

if %errorlevel% equ 0 (
    echo ✅ cuda_fp16.hpp patched
) else (
    echo ❌ Failed to patch cuda_fp16.hpp
)

echo.
echo Patching cuda_bf16.hpp...

REM Apply similar patch to cuda_bf16.hpp
powershell -Command "& {$content = Get-Content '%CUDA_INCLUDE_PATH%\cuda_bf16.hpp'; $content = $content -replace '#define __LDG_PTR   \"r\"', '#define __LDG_PTR   \"l\"'; Set-Content '%CUDA_INCLUDE_PATH%\cuda_bf16.hpp' $content}"

if %errorlevel% equ 0 (
    echo ✅ cuda_bf16.hpp patched
) else (
    echo ❌ Failed to patch cuda_bf16.hpp
)

echo.
echo ==========================================
echo Patch Applied Successfully!
echo ==========================================
echo.
echo To restore original headers:
echo   copy "%BACKUP_DIR%\*.backup" "%CUDA_INCLUDE_PATH%\"
echo.
echo Now test CUDA compilation:
echo   nvcc -c -o test.o cuda_kernels.cu -gencode arch=compute_86,code=sm_86
echo.
pause