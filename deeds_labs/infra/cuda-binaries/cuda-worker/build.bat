@echo off
REM Comprehensive build script for CUDA worker
REM Tries multiple compilation methods

echo Building CUDA worker...

REM Check for Visual Studio Build Tools
if exist "C:\Program Files (x86)\Microsoft Visual Studio\2022\BuildTools\VC\Auxiliary\Build\vcvarsall.bat" (
    echo Setting up Visual Studio 2022 Build Tools environment...
    call "C:\Program Files (x86)\Microsoft Visual Studio\2022\BuildTools\VC\Auxiliary\Build\vcvarsall.bat" x64
    goto :try_nvcc
)

if exist "C:\Program Files\Microsoft Visual Studio\2022\Community\VC\Auxiliary\Build\vcvarsall.bat" (
    echo Setting up Visual Studio 2022 Community environment...
    call "C:\Program Files\Microsoft Visual Studio\2022\Community\VC\Auxiliary\Build\vcvarsall.bat" x64
    goto :try_nvcc
)

if exist "C:\Program Files\Microsoft Visual Studio\2022\Professional\VC\Auxiliary\Build\vcvarsall.bat" (
    echo Setting up Visual Studio 2022 Professional environment...
    call "C:\Program Files\Microsoft Visual Studio\2022\Professional\VC\Auxiliary\Build\vcvarsall.bat" x64
    goto :try_nvcc
)

echo No Visual Studio environment found, trying direct compilation...

:try_nvcc
echo Trying NVCC compilation...
nvcc -std=c++14 cuda-worker.cu -o cuda-worker.exe 2>nul
if %errorlevel% equ 0 (
    echo SUCCESS: Built with NVCC
    goto :done
)

:try_clang
echo NVCC failed, trying Clang with proper paths...
set CUDA_PATH=C:\Program Files\NVIDIA GPU Computing Toolkit\CUDA\v12.8
if not exist "%CUDA_PATH%" (
    set CUDA_PATH=C:\Program Files\NVIDIA GPU Computing Toolkit\CUDA\v13.0
)

echo Using CUDA path: %CUDA_PATH%
clang++ -std=c++14 ^
    --cuda-gpu-arch=sm_75 ^
    --cuda-path="%CUDA_PATH%" ^
    -I"%CUDA_PATH%\include" ^
    -L"%CUDA_PATH%\lib\x64" ^
    -lcudart ^
    cuda-worker.cu ^
    -o cuda-worker-clang.exe

if %errorlevel% equ 0 (
    echo SUCCESS: Built with Clang
    goto :done
)

:fallback
echo All compilation methods failed. 
echo Please ensure you have:
echo 1. CUDA Toolkit installed (v12.8 or v13.0)
echo 2. Visual Studio Build Tools or Community Edition
echo 3. Proper environment variables set
echo 4. RTX GPU with compute capability 7.5+

:done
echo Build process complete.
if exist cuda-worker.exe echo - cuda-worker.exe created (NVCC)
if exist cuda-worker-clang.exe echo - cuda-worker-clang.exe created (Clang)
pause