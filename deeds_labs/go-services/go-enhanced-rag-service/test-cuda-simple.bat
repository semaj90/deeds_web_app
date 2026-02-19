@echo off
echo Testing CUDA compilation...
echo.

echo Step 1: Setting up MSVC environment...
call "C:\Program Files\Microsoft Visual Studio\2022\Community\VC\Auxiliary\Build\vcvarsall.bat" x64
echo MSVC setup complete, error level: %errorlevel%

echo.
echo Step 2: Testing cl.exe...
where cl
echo cl.exe found, error level: %errorlevel%

echo.
echo Step 3: Testing nvcc...
where nvcc
echo nvcc found, error level: %errorlevel%

echo.
echo Step 4: NVCC version...
nvcc --version

echo.
echo Step 5: Testing simple compilation...
echo Creating test.cu...
echo __global__ void test() {} > test.cu
echo.

echo Compiling test.cu...
nvcc -c test.cu -o test.o
echo Compilation complete, error level: %errorlevel%

if exist test.o (
    echo SUCCESS: test.o created
    del test.o
    del test.cu
) else (
    echo FAILED: test.o not created
)

pause