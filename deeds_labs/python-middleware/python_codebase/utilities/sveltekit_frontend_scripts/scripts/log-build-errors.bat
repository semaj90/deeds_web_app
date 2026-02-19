@echo off cd %~dp0\.. npm-run-all check:svelte auto:solve 2>> logs/build-errors.txt
