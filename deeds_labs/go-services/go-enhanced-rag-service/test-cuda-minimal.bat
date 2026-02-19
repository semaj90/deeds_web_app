@echo off
setlocal

echo ==========================================
echo CUDA Minimal Test - Isolating the Issue
echo ==========================================

echo Setting up Visual Studio environment...
call "C:\Program Files\Microsoft Visual Studio\2022\Community\VC\Auxiliary\Build\vcvarsall.bat" x64
echo VS Environment setup complete.

echo.
echo Testing minimal CUDA compilation (no architecture flags)...
echo Command: nvcc -c -o test_cuda.o cuda_kernels.cu --verbose
echo.

nvcc -c -o test_cuda.o cuda_kernels.cu --verbose

echo.
echo Exit code: %errorlevel%

if %errorlevel% equ 0 (
    echo ✅ SUCCESS: Minimal CUDA compilation works!
    echo.
    if exist test_cuda.o (
        echo Object file created:
        dir test_cuda.o
        del test_cuda.o
        echo.
        echo Now testing with architecture flags...
        echo Command: nvcc -c -o test_arch.o cuda_kernels.cu -gencode arch=compute_86,code=sm_86 --verbose
        echo.
        
        nvcc -c -o test_arch.o cuda_kernels.cu -gencode arch=compute_86,code=sm_86 --verbose
        
        echo.
        echo Architecture test exit code: %errorlevel%
        
        if %errorlevel% equ 0 (
            echo ✅ SUCCESS: Architecture-specific compilation also works!
            if exist test_arch.o (
                dir test_arch.o
                del test_arch.o
                echo.
                echo 🎉 CUDA compilation is fully functional!
            )
        ) else (
            echo ❌ FAILED: Architecture-specific flags cause the issue
            echo This suggests a driver/toolkit version mismatch
        )
    )
) else (
    echo ❌ FAILED: Basic CUDA compilation failed
    echo This indicates a fundamental CUDA setup issue
)

echo.
echo ==========================================
echo Test Summary
echo ==========================================
pause