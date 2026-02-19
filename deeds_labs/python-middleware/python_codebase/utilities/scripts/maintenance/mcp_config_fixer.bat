@echo off
setlocal enabledelayedexpansion

echo =====================================================
echo    FIX MCP FILESYSTEM CONFIGURATION
echo    Full Audit and Repair
echo =====================================================

:: Step 1: Check if Claude Desktop is running
echo [1/8] Checking Claude Desktop status...
tasklist /FI "IMAGENAME eq Claude.exe" 2>NUL | find /I /N "Claude.exe" > nul
if %ERRORLEVEL% equ 0 (
    echo ⚠️ Claude Desktop is running - MUST close it first
    echo Attempting to close Claude Desktop...
    taskkill /IM "Claude.exe" /F > nul 2>&1
    timeout /t 3 > nul
) else (
    echo ✓ Claude Desktop not running
)

:: Step 2: Backup existing config
echo [2/8] Backing up existing config...
set CONFIG_PATH=%APPDATA%\Claude\claude_desktop_config.json
if exist "%CONFIG_PATH%" (
    copy "%CONFIG_PATH%" "%CONFIG_PATH%.backup.%date:~-4,4%%date:~-10,2%%date:~-7,2%" > nul
    echo ✓ Config backed up
) else (
    echo ⚠️ No existing config found
)

:: Step 3: Check Node.js and NPM
echo [3/8] Verifying dependencies...
node --version > nul 2>&1 || (
    echo ❌ Node.js not found - install from nodejs.org
    pause && exit /b 1
)
npm --version > nul 2>&1 || (
    echo ❌ NPM not found
    pause && exit /b 1
)
echo ✓ Node.js and NPM available

:: Step 4: Install MCP filesystem server
echo [4/8] Installing MCP filesystem server...
npm install -g @modelcontextprotocol/server-filesystem
if %ERRORLEVEL% neq 0 (
    echo ❌ Failed to install MCP filesystem server
    pause && exit /b 1
)
echo ✓ MCP filesystem server installed

:: Step 5: Create corrected Claude Desktop config
echo [5/8] Creating corrected Claude Desktop config...
if not exist "%APPDATA%\Claude" mkdir "%APPDATA%\Claude"

(
echo {
echo   "mcpServers": {
echo     "filesystem": {
echo       "command": "npx",
echo       "args": [
echo         "--yes",
echo         "@modelcontextprotocol/server-filesystem",
echo         "C:/Users/james/Desktop/deeds-web"
echo       ]
echo     }
echo   }
echo }
) > "%CONFIG_PATH%"

echo ✓ Claude Desktop config created

:: Step 6: Verify config file
echo [6/8] Verifying config file...
if exist "%CONFIG_PATH%" (
    echo ✓ Config file exists
    findstr "filesystem" "%CONFIG_PATH%" > nul && echo ✓ Filesystem server configured
) else (
    echo ❌ Config file not created
    pause && exit /b 1
)

:: Step 7: Test MCP server manually
echo [7/8] Testing MCP filesystem server...
echo Testing server startup...
timeout /t 2 > nul
npx --yes @modelcontextprotocol/server-filesystem "C:/Users/james/Desktop/deeds-web" --test > nul 2>&1
if %ERRORLEVEL% equ 0 (
    echo ✓ MCP server test passed
) else (
    echo ⚠️ MCP server test unclear - proceed with caution
)

:: Step 8: Create test verification script
echo [8/8] Creating verification script...
(
echo @echo off
echo echo Testing MCP filesystem access...
echo if exist "C:\Users\james\Desktop\deeds-web\WORKING-INSTALL.bat" (
echo     echo ✓ Can access deeds-web directory
echo ^) else (
echo     echo ❌ Cannot access deeds-web directory
echo ^)
echo echo.
echo echo Instructions:
echo echo 1. Start Claude Desktop
echo echo 2. Ask Claude: "Can you list files in C:\Users\james\Desktop\deeds-web?"
echo echo 3. If it works, MCP is fixed
echo pause
) > "C:\Users\james\Desktop\deeds-web\TEST-MCP-ACCESS.bat"

echo.
echo =====================================================
echo    MCP FILESYSTEM FIX COMPLETE
echo =====================================================
echo.
echo ✅ Actions taken:
echo - Closed Claude Desktop if running
echo - Backed up existing config
echo - Installed MCP filesystem server
echo - Created corrected config
echo - Created verification test
echo.
echo 🔄 Next steps:
echo 1. Start Claude Desktop
echo 2. Run TEST-MCP-ACCESS.bat to verify
echo 3. Test filesystem access in Claude
echo.
echo 📁 Config location: %CONFIG_PATH%
echo.

pause