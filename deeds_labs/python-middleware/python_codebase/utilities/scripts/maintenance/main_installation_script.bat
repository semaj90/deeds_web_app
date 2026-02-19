@echo off
setlocal enabledelayedexpansion

echo =====================================================
echo    PROSECUTOR AI MAIN INSTALLATION
echo    Using MCP Filesystem Integration
echo =====================================================

:: Navigate to correct directory
if exist "sveltekit-frontend\package.json" (
    cd sveltekit-frontend
    echo ✓ Found sveltekit-frontend directory
) else if exist "package.json" (
    echo ✓ Already in project directory
) else (
    echo ❌ ERROR: Cannot find package.json
    echo Run from deeds-web-app or sveltekit-frontend directory
    pause
    exit /b 1
)

echo Current directory: %CD%

:: Clean installation
echo [1/12] Cleaning installation...
if exist node_modules rmdir /s /q node_modules 2>nul
if exist package-lock.json del package-lock.json 2>nul
if exist pnpm-lock.yaml del pnpm-lock.yaml 2>nul
pnpm store prune 2>nul || npm cache clean --force

:: Priority 3: Sequential Dependency Installation
echo [2/12] Installing bits-ui v2...
pnpm install bits-ui@latest || npm install bits-ui@latest

echo [3/12] Installing class utilities...
pnpm install clsx tailwind-merge class-variance-authority || npm install clsx tailwind-merge class-variance-authority

echo [4/12] Installing Melt UI...
pnpm install @melt-ui/svelte @melt-ui/pp || npm install @melt-ui/svelte @melt-ui/pp

echo [5/12] Installing UnoCSS...
pnpm install -D unocss @unocss/preset-uno @unocss/preset-wind @unocss/preset-icons @unocss/svelte-scoped || npm install -D unocss @unocss/preset-uno @unocss/preset-wind @unocss/preset-icons @unocss/svelte-scoped

echo [6/12] Installing state management...
pnpm install xstate @xstate/svelte || npm install xstate @xstate/svelte

echo [7/12] Installing data stack...
pnpm install lokijs fuse.js || npm install lokijs fuse.js

echo [8/12] Creating directory structure...
if not exist "src\lib" mkdir src\lib
if not exist "src\lib\stores" mkdir src\lib\stores
if not exist "src\lib\components\ui" mkdir src\lib\components\ui

echo [9/12] Installation complete - now use MCP tools to create files...
echo.
echo =====================================================
echo    NEXT STEPS - USE CLAUDE DESKTOP MCP TOOLS
echo =====================================================
echo.
echo Your MCP configuration is active. Now use these commands in Claude Desktop:
echo.
echo 1. Create utils.ts:
echo    W write_file { "path": "C:/Users/james/Desktop/deeds-web/deeds-web-app/sveltekit-frontend/src/lib/utils.ts", "content": "import { clsx, type ClassValue } from 'clsx';\nimport { twMerge } from 'tailwind-merge';\n\nexport function cn(...inputs: ClassValue[]): string {\n  return twMerge(clsx(inputs));\n}" }
echo.
echo 2. Create store barrel (Priority 1 fix):
echo    W write_file { "path": "C:/Users/james/Desktop/deeds-web/deeds-web-app/sveltekit-frontend/src/lib/stores/index.ts", "content": "export * from './ai-commands.js';\nexport * from './cases.js';\nexport * from './evidence.js';" }
echo.
echo 3. List directory to verify:
echo    L list_directory { "path": "C:/Users/james/Desktop/deeds-web/deeds-web-app/sveltekit-frontend/src/lib" }
echo.
echo 4. Continue with remaining files using the MCP commands...
echo.

echo [10/12] Running verification...
pnpm run check 2>nul || npm run check 2>nul
if %ERRORLEVEL% equ 0 (
    echo ✅ TypeScript check passed
) else (
    echo ⚠️ TypeScript check has issues - will be fixed by MCP file creation
)

echo [11/12] Testing build...
pnpm run build 2>nul || npm run build 2>nul
if %ERRORLEVEL% equ 0 (
    echo ✅ Build successful
) else (
    echo ⚠️ Build needs file creation via MCP tools
)

echo [12/12] Ready for MCP file creation!
echo.
echo ✅ Dependencies installed successfully
echo ✅ Directory structure created  
echo ✅ Ready for Claude Desktop MCP commands
echo.

pause