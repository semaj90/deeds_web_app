@echo off
REM TensorRT Inference Pipeline Build Script for Windows
REM Builds C++ wrapper and Go bindings

echo 🚀 Building TensorRT Inference Pipeline...
echo.

REM Check prerequisites
where cmake >nul 2>nul
if %errorlevel% neq 0 (
    echo ❌ CMake not found. Please install CMake.
    pause
    exit /b 1
)

where go >nul 2>nul
if %errorlevel% neq 0 (
    echo ❌ Go not found. Please install Go.
    pause
    exit /b 1
)

echo ✅ Prerequisites check passed
echo.

REM Build C++ TensorRT wrapper
echo 🔧 Building C++ TensorRT wrapper...
if not exist build mkdir build
cd build

cmake -G "Visual Studio 17 2022" -A x64 ..
if %errorlevel% neq 0 (
    echo ❌ CMake configuration failed
    cd ..
    pause
    exit /b 1
)

cmake --build . --config Release
if %errorlevel% neq 0 (
    echo ❌ C++ build failed
    cd ..
    pause
    exit /b 1
)

cd ..
echo ✅ C++ wrapper built successfully
echo.

REM Copy DLL to Go directory
echo 📋 Copying DLL to Go directory...
copy build\cpp\Release\trt_wrapper.dll go\
if %errorlevel% neq 0 (
    echo ❌ DLL copy failed
    pause
    exit /b 1
)

echo ✅ DLL copied successfully
echo.

REM Build Go bindings
echo 🔵 Building Go bindings...
cd go

go mod tidy
go build -buildmode=c-shared -o trt.dll .
if %errorlevel% neq 0 (
    echo ❌ Go build failed
    cd ..
    pause
    exit /b 1
)

cd ..
echo ✅ Go bindings built successfully
echo.

echo 🎉 TensorRT Inference Pipeline built successfully!
echo.
echo Build artifacts:
echo   - C++ DLL: build\cpp\Release\trt_wrapper.dll
echo   - Go DLL: go\trt.dll
echo.
echo Usage example in go\engine.go
echo.
pause