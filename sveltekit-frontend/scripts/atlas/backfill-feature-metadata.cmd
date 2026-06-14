@echo off
setlocal
pushd "%~dp0\..\.."
set "FORWARDED_ARGS=%*"
echo %npm_config_argv% | findstr /c:"--apply" >nul && (
  echo %FORWARDED_ARGS% | findstr /c:"--apply" >nul || set "FORWARDED_ARGS=%FORWARDED_ARGS% --apply"
)
echo %npm_config_argv% | findstr /c:"--verify" >nul && (
  echo %FORWARDED_ARGS% | findstr /c:"--verify" >nul || set "FORWARDED_ARGS=%FORWARDED_ARGS% --verify"
)
node scripts\atlas\backfill-feature-metadata.mjs %FORWARDED_ARGS%
set "EXIT_CODE=%ERRORLEVEL%"
popd
exit /b %EXIT_CODE%
