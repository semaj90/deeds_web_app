@echo off
setlocal

if "%~1"=="" (
  echo Usage: run-ntfs-usn-reader-v1.cmd ^<volume-letter^> [start-usn-decimal] [max-records]
  exit /b 2
)

for /f "usebackq tokens=*" %%I in (`"%ProgramFiles(x86)%\Microsoft Visual Studio\Installer\vswhere.exe" -latest -products * -requires Microsoft.VisualStudio.Component.VC.Tools.x86.x64 -property installationPath`) do set "VSROOT=%%I"
if not defined VSROOT (
  echo MSVC_BUILD_TOOLS_NOT_FOUND 1>&2
  exit /b 3
)

for %%I in ("%~dp0..\..\..") do set "REPOROOT=%%~fI"
set "OUTDIR=%REPOROOT%\.tmp\atlas\native"
if not exist "%OUTDIR%" mkdir "%OUTDIR%"

call "%VSROOT%\VC\Auxiliary\Build\vcvars64.bat" >nul
if errorlevel 1 exit /b %errorlevel%

cl /nologo /std:c++17 /EHsc /W4 /WX "%~dp0ntfs-usn-reader-v1.cpp" /Fo"%OUTDIR%\ntfs-usn-reader-v1.obj" /Fe"%OUTDIR%\ntfs-usn-reader-v1.exe"
if errorlevel 1 exit /b %errorlevel%

"%OUTDIR%\ntfs-usn-reader-v1.exe" %*
exit /b %errorlevel%
