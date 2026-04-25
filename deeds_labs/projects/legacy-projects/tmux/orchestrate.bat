@echo off
REM Legal AI Platform - GPU Clustering Orchestration (Windows)
REM Phase 74-80 Complete Build Package

setlocal enabledelayedexpansion

REM Colors for output (Windows CMD)
set "RED=[91m"
set "GREEN=[92m"
set "YELLOW=[93m"
set "BLUE=[94m"
set "MAGENTA=[95m"
set "CYAN=[96m"
set "NC=[0m"

REM Configuration
set "SESSION_NAME=legal-ai-platform"
set "LOG_DIR=%~dp0logs"
set "METRICS_DIR=%~dp0metrics"

REM Create directories
if not exist "%LOG_DIR%" mkdir "%LOG_DIR%"
if not exist "%METRICS_DIR%" mkdir "%METRICS_DIR%"

REM Function to log messages
:log
echo %GREEN%[%DATE% %TIME%] %~1%NC%
echo [%DATE% %TIME%] %~1 >> "%LOG_DIR%\orchestration.log"
goto :eof

:error
echo %RED%[ERROR] %~1%NC% 1>&2
echo [ERROR] %~1 >> "%LOG_DIR%\orchestration.log"
goto :eof

:warning
echo %YELLOW%[WARNING] %~1%NC%
echo [WARNING] %~1 >> "%LOG_DIR%\orchestration.log"
goto :eof

:info
echo %BLUE%[INFO] %~1%NC%
echo [INFO] %~1 >> "%LOG_DIR%\orchestration.log"
goto :eof

REM Function to check if tmux session exists (using PowerShell)
:session_exists
powershell -Command "try { $session = tmux has-session -t '%SESSION_NAME%' 2>$null; if ($LASTEXITCODE -eq 0) { exit 0 } else { exit 1 } } catch { exit 1 }" >nul 2>&1
goto :eof

REM Function to kill existing session
:kill_session
call :session_exists
if %errorlevel% equ 0 (
    call :log "Killing existing tmux session: %SESSION_NAME%"
    tmux kill-session -t "%SESSION_NAME%" 2>nul
    timeout /t 2 /nobreak >nul
)
goto :eof

REM Function to start Docker services
:start_docker_services
call :log "Starting Docker services..."
docker-compose up -d

call :log "Waiting for services to be healthy..."
timeout /t 30 /nobreak >nul

REM Check service health
set "services=triton-server quic-gateway gemma-reranker graph-authority ocr-pipeline postgres neo4j redis qdrant minio rabbitmq frontend"

for %%s in (%services%) do (
    call :info "Checking health of %%s..."
    docker-compose ps "%%s" | findstr /C:"Up" >nul
    if !errorlevel! equ 0 (
        call :log "✓ %%s is running"
    ) else (
        call :error "✗ %%s failed to start"
        exit /b 1
    )
)

call :log "All Docker services started successfully"
goto :eof

REM Function to create tmux windows and panes
:create_tmux_layout
call :log "Creating tmux session: %SESSION_NAME%"

REM Create new session with first window
tmux new-session -d -s "%SESSION_NAME%" -n "core-services"

REM Window 1: Core Services (split vertically)
tmux split-window -h
tmux split-window -v
tmux select-pane -t 0
tmux send-keys "docker-compose logs -f triton-server redis postgres neo4j" C-m
tmux select-pane -t 1
tmux send-keys "docker-compose logs -f quic-gateway gemma-reranker graph-authority" C-m
tmux select-pane -t 2
tmux send-keys "docker-compose logs -f ocr-pipeline qdrant minio rabbitmq" C-m

REM Window 2: GPU Services
tmux new-window -n "gpu-services"
tmux split-window -h
tmux split-window -v
tmux select-pane -t 0
tmux send-keys "watch -n 5 nvidia-smi" C-m
tmux select-pane -t 1
tmux send-keys "docker-compose logs -f triton-server" C-m
tmux select-pane -t 2
tmux send-keys "docker-compose logs -f gemma-reranker ocr-pipeline" C-m

REM Window 3: App Services
tmux new-window -n "app-services"
tmux split-window -h
tmux split-window -v
tmux select-pane -t 0
tmux send-keys "docker-compose logs -f frontend" C-m
tmux select-pane -t 1
tmux send-keys "docker-compose logs -f quic-gateway graph-authority" C-m
tmux select-pane -t 2
tmux send-keys "tail -f %LOG_DIR%/orchestration.log" C-m

REM Window 4: Monitoring
tmux new-window -n "monitoring"
tmux split-window -h
tmux split-window -v
tmux select-pane -t 0
tmux send-keys "powershell -Command \"while(1){nvidia-smi; Start-Sleep 5}\"" C-m
tmux select-pane -t 1
tmux send-keys "docker stats" C-m
tmux select-pane -t 2
tmux send-keys "watch -n 10 'curl -s http://localhost:8000/v2/health/ready && echo \"Triton: OK\" || echo \"Triton: FAIL\"'" C-m

REM Window 5: Ingestion Pipeline
tmux new-window -n "ingestion"
tmux split-window -h
tmux split-window -v
tmux select-pane -t 0
tmux send-keys "docker-compose logs -f rabbitmq" C-m
tmux select-pane -t 1
tmux send-keys "watch -n 5 'curl -s http://localhost:15672/api/queues 2>/dev/null | findstr messages'" C-m
tmux select-pane -t 2
tmux send-keys "tail -f /dev/null" C-m

REM Window 6: Development
tmux new-window -n "development"
tmux split-window -h
tmux select-pane -t 0
tmux send-keys "cd svelte_ui && npm run dev" C-m
tmux select-pane -t 1
tmux send-keys "tail -f %LOG_DIR%/orchestration.log" C-m

REM Set default window
tmux select-window -t 0

call :log "Tmux session created successfully"
goto :eof

REM Function to collect GPU metrics
:collect_gpu_metrics
call :log "Starting GPU metrics collection..."

REM Create metrics collection script
(
echo @echo off
echo setlocal enabledelayedexpansion
echo set "METRICS_FILE=%METRICS_DIR%\gpu_metrics_!DATE:~10,4!!DATE:~4,2!!DATE:~7,2!_!TIME:~0,2!!TIME:~3,2!!TIME:~6,2!.csv"
echo echo timestamp,gpu_util,memory_used,memory_total,temperature,power_draw ^> "%%METRICS_FILE%%"
echo :loop
echo for /f "tokens=*" %%i in ^('powershell -Command "Get-Date -UFormat '%%s'"'^) do set TIMESTAMP=%%i
echo for /f "tokens=*" %%i in ^('nvidia-smi --query-gpu=utilization.gpu,memory.used,memory.total,temperature.gpu,power.draw --format=csv,noheader,nounits'^) do set GPU_INFO=%%i
echo echo !TIMESTAMP!,!GPU_INFO! ^>^> "%%METRICS_FILE%%"
echo timeout /t 5 /nobreak ^>nul
echo goto loop
) > "%METRICS_DIR%\collect_metrics.bat"

REM Start metrics collection in background
start /B cmd /C "%METRICS_DIR%\collect_metrics.bat" > "%LOG_DIR%\metrics.log" 2>&1
echo %errorlevel% > "%METRICS_DIR%\collector.pid"

call :log "GPU metrics collection started (PID: %errorlevel%)"
goto :eof

REM Function to start all services
:start_all
call :log "🚀 Starting Legal AI Platform - Phase 74-80"

REM Kill existing session if it exists
call :kill_session

REM Start Docker services
call :start_docker_services
if %errorlevel% neq 0 (
    call :error "Failed to start Docker services"
    exit /b 1
)

REM Create tmux layout
call :create_tmux_layout

REM Start GPU metrics collection
call :collect_gpu_metrics

call :log "✅ Legal AI Platform started successfully!"
call :log "📊 Access monitoring dashboard: tmux attach -t %SESSION_NAME%"
call :log "🌐 Frontend: http://localhost:3000"
call :log "🔍 Triton Models: http://localhost:8000"
call :log "⚡ QUIC Gateway: localhost:4242/udp"
call :log "📈 MinIO Console: http://localhost:9001"
call :log "🐰 RabbitMQ: http://localhost:15672"
goto :eof

REM Function to stop all services
:stop_all
call :log "🛑 Stopping Legal AI Platform"

REM Stop metrics collection
if exist "%METRICS_DIR%\collector.pid" (
    for /f "tokens=*" %%i in (%METRICS_DIR%\collector.pid) do (
        taskkill /PID %%i /F 2>nul
    )
    del "%METRICS_DIR%\collector.pid" 2>nul
    call :log "Stopped GPU metrics collection"
)

REM Kill tmux session
call :kill_session

REM Stop Docker services
call :log "Stopping Docker services..."
docker-compose down

call :log "✅ Legal AI Platform stopped successfully"
goto :eof

REM Function to show status
:show_status
echo %CYAN%=== Legal AI Platform Status ===%NC%
echo.

REM Check tmux session
call :session_exists
if %errorlevel% equ 0 (
    echo %GREEN%✓ Tmux session: %SESSION_NAME% (running)%NC%
    tmux list-windows -t "%SESSION_NAME%" 2>nul
) else (
    echo %RED%✗ Tmux session: %SESSION_NAME% (not running)%NC%
)
echo.

REM Check Docker services
echo %CYAN%Docker Services:%NC%
docker-compose ps --format "table {{.Name}}\t{{.Status}}\t{{.Ports}}"
echo.

REM Check GPU metrics
if exist "%METRICS_DIR%\collector.pid" (
    for /f "tokens=*" %%i in (%METRICS_DIR%\collector.pid) do (
        tasklist /FI "PID eq %%i" 2>nul | findstr /C:"%%i" >nul
        if !errorlevel! equ 0 (
            echo %GREEN%✓ GPU metrics collection: running%NC%
        ) else (
            echo %RED%✗ GPU metrics collection: not running%NC%
        )
    )
) else (
    echo %RED%✗ GPU metrics collection: not running%NC%
)
echo.

REM Show recent logs
echo %CYAN%Recent Logs:%NC%
if exist "%LOG_DIR%\orchestration.log" (
    powershell -Command "Get-Content '%LOG_DIR%\orchestration.log' | Select-Object -Last 5"
) else (
    echo No logs available
)
goto :eof

REM Function to show help
:show_help
echo Legal AI Platform - GPU Clustering Orchestration
echo Phase 74-80 Complete Build Package
echo.
echo Usage: %0 [command]
echo.
echo Commands:
echo   start     Start all services and create tmux session
echo   stop      Stop all services and cleanup
echo   status    Show current status of all components
echo   restart   Restart all services
echo   logs      Show orchestration logs
echo   attach    Attach to tmux session
echo   help      Show this help message
echo.
echo Examples:
echo   %0 start          # Start the platform
echo   %0 attach         # Monitor services in tmux
echo   %0 status         # Check platform status
echo   %0 stop           # Stop everything
goto :eof

REM Main script logic
if "%1"=="" goto start_all
if "%1"=="start" goto start_all
if "%1"=="stop" goto stop_all
if "%1"=="status" goto show_status
if "%1"=="restart" (
    call :stop_all
    timeout /t 5 /nobreak >nul
    goto start_all
)
if "%1"=="logs" (
    if exist "%LOG_DIR%\orchestration.log" (
        type "%LOG_DIR%\orchestration.log"
    ) else (
        echo No orchestration logs found
    )
    goto :eof
)
if "%1"=="attach" (
    call :session_exists
    if %errorlevel% equ 0 (
        tmux attach -t "%SESSION_NAME%"
    ) else (
        call :error "Tmux session '%SESSION_NAME%' does not exist. Run '%0 start' first."
        exit /b 1
    )
    goto :eof
)
if "%1"=="help" goto show_help
if "%1"=="--help" goto show_help
if "%1"=="-h" goto show_help

call :error "Unknown command: %1"
echo.
goto show_help