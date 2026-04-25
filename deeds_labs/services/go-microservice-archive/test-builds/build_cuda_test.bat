@echo off
echo Building CUDA Tensor Core Test...

call "C:\Program Files\Microsoft Visual Studio\2022\Community\VC\Auxiliary\Build\vcvars64.bat"

cd /d "%~dp0"

nvcc -O3 -arch=sm_86 simple_tensor_test.cu -o simple_tensor_test.exe

if errorlevel 1 (
    echo Build failed!
    pause
    exit /b 1
) else (
    echo Build successful!
    echo Running test...
    simple_tensor_test.exe
    pause
)