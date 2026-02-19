@echo off
echo.
echo 🚀 VS Code Memory Optimization Starting...
echo.

set PROJECT_ROOT=%~dp0..
set FRONTEND_PATH=%PROJECT_ROOT%\sveltekit-frontend
set VSCODE_PATH=%FRONTEND_PATH%\.vscode

echo 📁 Project Root: %PROJECT_ROOT%
echo 📁 Frontend Path: %FRONTEND_PATH%
echo.

echo 🔧 Applying VS Code optimizations...

REM Backup current settings if they exist
if exist "%VSCODE_PATH%\settings.json" (
    echo 📦 Backing up current VS Code settings...
    copy "%VSCODE_PATH%\settings.json" "%VSCODE_PATH%\settings.json.backup-%date:~10,4%%date:~4,2%%date:~7,2%"
)

REM Apply optimized settings
if exist "%VSCODE_PATH%\settings-optimized.json" (
    echo ✅ Applying optimized VS Code settings...
    copy "%VSCODE_PATH%\settings-optimized.json" "%VSCODE_PATH%\settings.json"
) else (
    echo ❌ Optimized settings file not found
)

echo.
echo ⚡ Applying MCP server optimizations...

REM Backup current MCP config if it exists
if exist "%PROJECT_ROOT%\.vscode\mcp.json" (
    echo 📦 Backing up current MCP config...
    copy "%PROJECT_ROOT%\.vscode\mcp.json" "%PROJECT_ROOT%\.vscode\mcp.json.backup-%date:~10,4%%date:~4,2%%date:~7,2%"
)

REM Apply optimized MCP config
if exist "%PROJECT_ROOT%\.vscode\mcp-optimized.json" (
    echo ✅ Applying optimized MCP config...
    copy "%PROJECT_ROOT%\.vscode\mcp-optimized.json" "%PROJECT_ROOT%\.vscode\mcp.json"
) else (
    echo ❌ Optimized MCP config file not found
)

echo.
echo 🎨 Applying Prettier optimizations...

REM Backup current Prettier config if it exists
if exist "%FRONTEND_PATH%\.prettierrc.json" (
    echo 📦 Backing up current Prettier config...
    copy "%FRONTEND_PATH%\.prettierrc.json" "%FRONTEND_PATH%\.prettierrc.json.backup-%date:~10,4%%date:~4,2%%date:~7,2%"
)

REM Apply optimized Prettier config
if exist "%FRONTEND_PATH%\.prettierrc-optimized.json" (
    echo ✅ Applying optimized Prettier config...
    copy "%FRONTEND_PATH%\.prettierrc-optimized.json" "%FRONTEND_PATH%\.prettierrc.json"
) else (
    echo ❌ Optimized Prettier config file not found
)

echo.
echo 🔄 Stopping language servers...

REM Try to kill TypeScript and Svelte language servers
taskkill /f /im "tsserver.exe" 2>nul
taskkill /f /im "svelte-language-server.exe" 2>nul
taskkill /f /im "node.exe" /fi "WINDOWTITLE eq TypeScript*" 2>nul

echo.
echo 💡 Memory Optimization Applied:
echo    • TypeScript memory limit: 2048MB
echo    • MCP workers: 4 → 1
echo    • Disabled Prettier formatting on save
echo    • Disabled ESLint for performance
echo    • Reduced VS Code suggestions and IntelliSense
echo    • Optimized file watchers and exclusions
echo    • Enabled aggressive garbage collection

echo.
echo 🎯 Next Steps:
echo    1. Restart VS Code to apply all changes
echo    2. Monitor memory usage in Task Manager
echo    3. TypeScript errors should stabilize around 700-800
echo    4. If needed, use Ctrl+Shift+P → 'TypeScript: Restart TS Server'

echo.
echo ✅ VS Code optimization completed!
echo Memory usage should be significantly reduced.
echo.
pause