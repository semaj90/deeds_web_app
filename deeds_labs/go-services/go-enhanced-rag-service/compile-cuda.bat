@echo off
setlocal

echo ==========================================
echo      CUDA Build with MSVC Environment
echo ==========================================

REM Step 1: Initialize the Visual Studio 2022 environment for 64-bit.
echo Setting up MSVC environment...
call "C:\Program Files\Microsoft Visual Studio\2022\Community\VC\Auxiliary\Build\vcvarsall.bat" x64

REM Check if the environment was set up successfully.
if %errorlevel% neq 0 (
    echo ERROR: Failed to set up MSVC environment. Aborting.
    goto :eof
)

echo MSVC environment is ready.

REM Step 2: Now, run the CUDA compiler. This was the missing step.
echo Compiling CUDA kernel...
nvcc -c -o test_cuda.o cuda_kernels.cu -gencode arch=compute_86,code=sm_86

if %errorlevel% neq 0 (
    echo ERROR: nvcc compilation failed.
) else (
    echo.
    echo SUCCESS! 'test_cuda.o' has been created.
)

endlocal