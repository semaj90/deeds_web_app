@echo off
setlocal
pushd "%~dp0\..\.."
node scripts\atlas\backfill-feature-metadata.mjs %*
set "EXIT_CODE=%ERRORLEVEL%"
popd
exit /b %EXIT_CODE%
