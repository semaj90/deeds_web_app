@echo off
echo Building CUDA worker with direct environment setup...

REM Set up Visual Studio 2022 Community environment
call "C:\Program Files\Microsoft Visual Studio\2022\Community\VC\Auxiliary\Build\vcvarsall.bat" x64

REM Build with nvcc
echo Compiling cuda-worker.cu...
nvcc -std=c++14 -arch=sm_75 cuda-worker.cu -o cuda-worker.exe

if exist cuda-worker.exe (
    echo SUCCESS: cuda-worker.exe created
    echo Testing with sample data...
    echo {"jobId":"test","type":"embedding","data":[1.0,2.0,3.0]} | cuda-worker.exe
) else (
    echo FAILED: cuda-worker.exe not created
)

pause