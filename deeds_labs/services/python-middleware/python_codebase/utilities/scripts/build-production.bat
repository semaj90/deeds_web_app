@echo off
REM =============================================================================
REM PRODUCTION BUILD SCRIPT - LEGAL AI PLATFORM (WINDOWS)
REM =============================================================================
REM This script builds all components for production deployment on Windows including:
REM - Go microservices
REM - SvelteKit frontend
REM - Static assets
REM =============================================================================

setlocal EnableDelayedExpansion

REM Configuration
set "PROJECT_ROOT=%~dp0.."
set "BUILD_DIR=%PROJECT_ROOT%\dist"
set "GO_BUILD_DIR=%BUILD_DIR%\go-services"
set "FRONTEND_BUILD_DIR=%BUILD_DIR%\frontend"
set "TIMESTAMP=%date:~-4,4%%date:~-10,2%%date:~-7,2%_%time:~0,2%%time:~3,2%%time:~6,2%"
set "TIMESTAMP=%TIMESTAMP: =0%"
if "%BUILD_VERSION%"=="" set "BUILD_VERSION=1.0.0-%TIMESTAMP%"

echo ================================================================================
echo LEGAL AI PLATFORM - PRODUCTION BUILD (WINDOWS)
echo Build Version: %BUILD_VERSION%
echo Build Directory: %BUILD_DIR%
echo ================================================================================

REM Function to check prerequisites
call :check_prerequisites
if errorlevel 1 goto :error

REM Function to clean previous builds
call :clean_build
if errorlevel 1 goto :error

REM Function to build Go microservices
call :build_go_services
if errorlevel 1 goto :error

REM Function to build SvelteKit frontend
call :build_frontend
if errorlevel 1 goto :error

REM Function to optimize build
call :optimize_build
if errorlevel 1 goto :error

REM Function to create deployment package
call :create_deployment_package
if errorlevel 1 goto :error

REM Show build summary
call :show_build_summary

echo [BUILD] Production build process completed successfully!
goto :end

:check_prerequisites
echo [BUILD] Checking build prerequisites...

REM Check if Go is installed
go version >nul 2>&1
if errorlevel 1 (
    echo [ERROR] Go is not installed. Please install Go 1.21 or later.
    exit /b 1
)

for /f "tokens=3" %%i in ('go version') do (
    echo [BUILD] Found Go version: %%i
    goto :go_check_done
)
:go_check_done

REM Check if Node.js is installed
node --version >nul 2>&1
if errorlevel 1 (
    echo [ERROR] Node.js is not installed. Please install Node.js 18 or later.
    exit /b 1
)

for /f %%i in ('node --version') do (
    echo [BUILD] Found Node.js version: %%i
)

REM Check if npm is installed
npm --version >nul 2>&1
if errorlevel 1 (
    echo [ERROR] npm is not installed. Please install npm.
    exit /b 1
)

REM Check if pnpm is available (preferred)
pnpm --version >nul 2>&1
if errorlevel 1 (
    set "PACKAGE_MANAGER=npm"
    echo [BUILD] Using npm as package manager
) else (
    set "PACKAGE_MANAGER=pnpm"
    echo [BUILD] Using pnpm as package manager
)

exit /b 0

:clean_build
echo [BUILD] Cleaning previous build artifacts...
if exist "%BUILD_DIR%" rmdir /s /q "%BUILD_DIR%"
mkdir "%BUILD_DIR%"
mkdir "%GO_BUILD_DIR%"
mkdir "%FRONTEND_BUILD_DIR%"
echo [BUILD] Build directories created
exit /b 0

:build_go_services
echo [BUILD] Building Go microservices...

cd /d "%PROJECT_ROOT%"

REM Set build environment
set CGO_ENABLED=0
set GOOS=windows
set GOARCH=amd64

REM Build enhanced RAG service
if exist "go-microservice\main.go" (
    echo [BUILD] Building enhanced-rag-service from go-microservice\main.go...
    go build -ldflags="-w -s -X main.version=%BUILD_VERSION% -X main.buildTime=%TIMESTAMP%" -trimpath -o "%GO_BUILD_DIR%\enhanced-rag-service.exe" "go-microservice\main.go"
    if errorlevel 1 (
        echo [ERROR] Failed to build enhanced-rag-service
        exit /b 1
    )
    echo [BUILD] ✓ Successfully built enhanced-rag-service
)

REM Build upload service
if exist "go-microservice\gin-upload.go" (
    echo [BUILD] Building upload-service from go-microservice\gin-upload.go...
    go build -ldflags="-w -s -X main.version=%BUILD_VERSION% -X main.buildTime=%TIMESTAMP%" -trimpath -o "%GO_BUILD_DIR%\upload-service.exe" "go-microservice\gin-upload.go"
    if errorlevel 1 (
        echo [ERROR] Failed to build upload-service
        exit /b 1
    )
    echo [BUILD] ✓ Successfully built upload-service
)

REM Build GPU legal AI server
if exist "go-microservice\gpu-legal-ai-server.go" (
    echo [BUILD] Building gpu-legal-ai-server from go-microservice\gpu-legal-ai-server.go...
    go build -ldflags="-w -s -X main.version=%BUILD_VERSION% -X main.buildTime=%TIMESTAMP%" -trimpath -o "%GO_BUILD_DIR%\gpu-legal-ai-server.exe" "go-microservice\gpu-legal-ai-server.go"
    if errorlevel 1 (
        echo [ERROR] Failed to build gpu-legal-ai-server
        exit /b 1
    )
    echo [BUILD] ✓ Successfully built gpu-legal-ai-server
)

REM Build enhanced legal AI GPU
if exist "go-microservice\enhanced-legal-ai-gpu.go" (
    echo [BUILD] Building enhanced-legal-ai-gpu from go-microservice\enhanced-legal-ai-gpu.go...
    go build -ldflags="-w -s -X main.version=%BUILD_VERSION% -X main.buildTime=%TIMESTAMP%" -trimpath -o "%GO_BUILD_DIR%\enhanced-legal-ai-gpu.exe" "go-microservice\enhanced-legal-ai-gpu.go"
    if errorlevel 1 (
        echo [ERROR] Failed to build enhanced-legal-ai-gpu
        exit /b 1
    )
    echo [BUILD] ✓ Successfully built enhanced-legal-ai-gpu
)

REM Build enhanced RAG v2
if exist "go-microservice\cmd\enhanced-rag\main.go" (
    echo [BUILD] Building enhanced-rag-v2 from go-microservice\cmd\enhanced-rag\main.go...
    go build -ldflags="-w -s -X main.version=%BUILD_VERSION% -X main.buildTime=%TIMESTAMP%" -trimpath -o "%GO_BUILD_DIR%\enhanced-rag-v2.exe" "go-microservice\cmd\enhanced-rag\main.go"
    if errorlevel 1 (
        echo [ERROR] Failed to build enhanced-rag-v2
        exit /b 1
    )
    echo [BUILD] ✓ Successfully built enhanced-rag-v2
)

REM Build cluster service
if exist "go-microservice\cmd\cluster-service\main.go" (
    echo [BUILD] Building cluster-service from go-microservice\cmd\cluster-service\main.go...
    go build -ldflags="-w -s -X main.version=%BUILD_VERSION% -X main.buildTime=%TIMESTAMP%" -trimpath -o "%GO_BUILD_DIR%\cluster-service.exe" "go-microservice\cmd\cluster-service\main.go"
    if errorlevel 1 (
        echo [ERROR] Failed to build cluster-service
        exit /b 1
    )
    echo [BUILD] ✓ Successfully built cluster-service
)

REM Build additional Go services from go-services directory
if exist "go-services" (
    echo [BUILD] Building additional Go services from go-services directory...
    if exist "go-services\cmd\enhanced-rag\main.go" (
        cd /d "%PROJECT_ROOT%\go-services"
        echo [BUILD] Building enhanced-rag service v2...
        go build -ldflags="-w -s" -trimpath -o "%GO_BUILD_DIR%\enhanced-rag-service-v2.exe" ".\cmd\enhanced-rag"
        if errorlevel 1 (
            echo [ERROR] Failed to build enhanced-rag-service-v2
            exit /b 1
        )
        echo [BUILD] ✓ Enhanced RAG service v2 built
        cd /d "%PROJECT_ROOT%"
    )
)

echo [BUILD] Go microservices build completed
exit /b 0

:build_frontend
echo [BUILD] Building SvelteKit frontend...

cd /d "%PROJECT_ROOT%\sveltekit-frontend"

REM Install dependencies
echo [BUILD] Installing frontend dependencies...
%PACKAGE_MANAGER% install --frozen-lockfile
if errorlevel 1 (
    echo [ERROR] Failed to install frontend dependencies
    exit /b 1
)

REM Run type checking
echo [BUILD] Running TypeScript type checking...
%PACKAGE_MANAGER% run check
if errorlevel 1 (
    echo [WARN] Type checking completed with warnings
)

REM Build for production
echo [BUILD] Building SvelteKit application for production...
set NODE_ENV=production
set VITE_BUILD_VERSION=%BUILD_VERSION%
set VITE_BUILD_TIMESTAMP=%TIMESTAMP%

%PACKAGE_MANAGER% run build
if errorlevel 1 (
    echo [ERROR] SvelteKit build failed
    exit /b 1
)

echo [BUILD] ✓ SvelteKit build completed successfully

REM Copy build output to distribution directory
if exist "build" (
    xcopy /E /I /Y "build\*" "%FRONTEND_BUILD_DIR%\"
    echo [BUILD] ✓ Frontend assets copied to distribution directory
)

cd /d "%PROJECT_ROOT%"
exit /b 0

:optimize_build
echo [BUILD] Optimizing build output...
echo [BUILD] Go binaries already optimized during build

REM Create checksums for integrity verification
echo [BUILD] Creating checksums...
cd /d "%BUILD_DIR%"
for /r %%f in (*) do (
    if not "%%~nxf"=="checksums.txt" (
        certutil -hashfile "%%f" SHA256 >> checksums.txt
    )
)
echo [BUILD] ✓ Checksums created: checksums.txt

cd /d "%PROJECT_ROOT%"
exit /b 0

:create_deployment_package
echo [BUILD] Creating deployment package...

REM Create deployment structure
set "DEPLOY_DIR=%BUILD_DIR%\deployment"
mkdir "%DEPLOY_DIR%"
mkdir "%DEPLOY_DIR%\scripts"

REM Copy configuration files
if exist ".env.production" copy ".env.production" "%DEPLOY_DIR%\env.production"

REM Copy deployment scripts
if exist "scripts\deploy-production.bat" copy "scripts\deploy-production.bat" "%DEPLOY_DIR%\scripts\"
if exist "scripts\setup-ssl.bat" copy "scripts\setup-ssl.bat" "%DEPLOY_DIR%\scripts\"

REM Copy database migrations if they exist
if exist "migrations" xcopy /E /I /Y "migrations\*" "%DEPLOY_DIR%\migrations\"

REM Create deployment README
(
echo # Legal AI Platform - Production Deployment
echo.
echo ## Build Information
echo - Version: %BUILD_VERSION%
echo - Build Date: %date% %time%
echo - Build Environment: Windows
echo.
echo ## Contents
echo - `go-services\`: Compiled Go microservices
echo - `frontend\`: SvelteKit build output
echo - `scripts\`: Deployment scripts
echo - `env.production`: Production environment configuration
echo - `migrations\`: Database migrations ^(if available^)
echo.
echo ## Deployment Steps
echo 1. Configure environment variables in `env.production`
echo 2. Run database migrations
echo 3. Deploy Go services
echo 4. Deploy frontend assets
echo 5. Configure reverse proxy ^(nginx/IIS^)
echo 6. Start services
echo.
echo See deployment documentation for detailed instructions.
) > "%DEPLOY_DIR%\README.md"

REM Create archive (using tar if available, otherwise skip)
tar --version >nul 2>&1
if not errorlevel 1 (
    set "ARCHIVE_NAME=legal-ai-platform-%BUILD_VERSION%.tar.gz"
    cd /d "%BUILD_DIR%"
    tar -czf "%PROJECT_ROOT%\!ARCHIVE_NAME!" .
    echo [BUILD] ✓ Deployment package created: !ARCHIVE_NAME!
    cd /d "%PROJECT_ROOT%"
) else (
    echo [BUILD] ✓ Deployment directory created: %DEPLOY_DIR%
    echo [WARN] tar not available - archive not created
)

exit /b 0

:show_build_summary
echo [BUILD] Build completed successfully!
echo.
echo ================================================================================
echo BUILD SUMMARY
echo ================================================================================
echo Build Version: %BUILD_VERSION%
echo Build Time: %date% %time%
echo Build Directory: %BUILD_DIR%
echo.
echo Go Services Built:
if exist "%GO_BUILD_DIR%" (
    for %%f in ("%GO_BUILD_DIR%\*.exe") do (
        echo   - %%~nf
    )
)
echo.
echo Frontend Build:
if exist "%FRONTEND_BUILD_DIR%" (
    echo   - SvelteKit build completed
)
echo.
echo Next Steps:
echo 1. Review build output in: %BUILD_DIR%
echo 2. Test deployment package
echo 3. Deploy to staging environment
echo 4. Deploy to production
echo ================================================================================
exit /b 0

:error
echo [ERROR] Build process failed!
exit /b 1

:end
pause