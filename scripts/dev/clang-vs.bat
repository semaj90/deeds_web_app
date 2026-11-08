@echo off
rem Build one C++ file with clang++ inside the VS 2022 environment.
rem usage: clang-vs.bat <source.cpp> <output.exe> [extra clang flags]
if "%~2"=="" ( echo usage: clang-vs.bat source.cpp output.exe [flags] & exit /b 2 )
set "VCVARS=C:\Program Files\Microsoft Visual Studio\2022\Community\VC\Auxiliary\Build\vcvars64.bat"
if not exist "%VCVARS%" ( echo vcvars64.bat not found: %VCVARS% & exit /b 3 )
call "%VCVARS%" >nul 2>&1
set "HERE=%~dp0"
set "SRC=%~1"
set "OUT=%~2"
shift
shift
"C:\Program Files\LLVM\bin\clang++.exe" -std=c++17 -O1 -Wall -I "%HERE%..\..\simd-bridge\cpp" "%SRC%" -o "%OUT%" %1 %2 %3 %4 %5 %6 %7 %8 %9
exit /b %ERRORLEVEL%

