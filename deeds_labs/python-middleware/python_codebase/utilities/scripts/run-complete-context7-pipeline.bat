@echo off
setlocal EnableDelayedExpansion

echo ==========================================
echo 🚀 Context7 Complete RAG Pipeline Setup
echo ==========================================
echo.

REM Colors for output
for /f %%a in ('echo prompt $E ^| cmd') do set "ESC=%%a"
set "GREEN=%ESC%[32m"
set "RED=%ESC%[31m"
set "YELLOW=%ESC%[33m"
set "BLUE=%ESC%[34m"
set "RESET=%ESC%[0m"

REM Step 1: Check prerequisites
echo %BLUE%Step 1: Checking prerequisites...%RESET%
echo.

where go >nul 2>nul
if %errorlevel% neq 0 (
    echo %RED%❌ Go is not installed or not in PATH%RESET%
    exit /b 1
)
echo %GREEN%✅ Go found%RESET%

where node >nul 2>nul
if %errorlevel% neq 0 (
    echo %RED%❌ Node.js is not installed or not in PATH%RESET%
    exit /b 1
)
echo %GREEN%✅ Node.js found%RESET%

REM Step 2: Check services
echo.
echo %BLUE%Step 2: Checking required services...%RESET%
echo.

echo Checking Context7 MCP Server (port 4000)...
curl -s http://localhost:4000/health >nul 2>nul
if %errorlevel% equ 0 (
    echo %GREEN%✅ Context7 MCP Server is running%RESET%
) else (
    echo %YELLOW%⚠️  Context7 MCP Server not running on port 4000%RESET%
    echo Please start with: npm run start:mcp-context7
)

echo Checking Ollama (port 11434)...
curl -s http://localhost:11434/api/tags >nul 2>nul
if %errorlevel% equ 0 (
    echo %GREEN%✅ Ollama is running%RESET%
) else (
    echo %YELLOW%⚠️  Ollama not running on port 11434%RESET%
    echo Please start Ollama service
)

echo Checking PostgreSQL (port 5433)...
PGPASSWORD=123456 psql -h localhost -p 5433 -U legal_admin -d legal_ai_db -c "\q" >nul 2>nul
if %errorlevel% equ 0 (
    echo %GREEN%✅ PostgreSQL is running%RESET%
) else (
    echo %YELLOW%⚠️  PostgreSQL not accessible on port 5433%RESET%
    echo Please start with: npm run postgres:start
)

REM Step 3: Build Go components
echo.
echo %BLUE%Step 3: Building Go components...%RESET%
echo.

cd /d "%~dp0"

echo Building Context7 RAG Pipeline...
go mod download
go build -o context7-rag-pipeline.exe context7-rag-pipeline.go
if %errorlevel% neq 0 (
    echo %RED%❌ Failed to build RAG pipeline%RESET%
    exit /b 1
)
echo %GREEN%✅ Context7 RAG Pipeline built%RESET%

echo Building RAG Query Server...
go build -o context7-rag-query-server.exe context7-rag-query-server.go
if %errorlevel% neq 0 (
    echo %RED%❌ Failed to build RAG query server%RESET%
    exit /b 1
)
echo %GREEN%✅ RAG Query Server built%RESET%

REM Step 4: Check Gemma embedding model
echo.
echo %BLUE%Step 4: Checking Gemma embedding model...%RESET%
echo.

curl -s http://localhost:11434/api/tags | findstr "embeddinggemma" >nul 2>nul
if %errorlevel% equ 0 (
    echo %GREEN%✅ Gemma embedding model found%RESET%
) else (
    echo %YELLOW%⚠️  Gemma embedding model not found%RESET%
    echo Installing embeddinggemma model...
    ollama pull embeddinggemma:latest
    if %errorlevel% equ 0 (
        echo %GREEN%✅ Gemma embedding model installed%RESET%
    ) else (
        echo %RED%❌ Failed to install Gemma embedding model%RESET%
        exit /b 1
    )
)

REM Step 5: Initialize database schema
echo.
echo %BLUE%Step 5: Initializing database schema...%RESET%
echo.

PGPASSWORD=123456 psql -h localhost -p 5433 -U legal_admin -d legal_ai_db -c "
CREATE EXTENSION IF NOT EXISTS vector;
CREATE TABLE IF NOT EXISTS context7_documentation (
    id SERIAL PRIMARY KEY,
    doc_id TEXT UNIQUE NOT NULL,
    library_id TEXT NOT NULL,
    library_name TEXT NOT NULL,
    topic TEXT,
    content TEXT NOT NULL,
    chunk_index INTEGER DEFAULT 0,
    embedding vector(768),
    metadata JSONB,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_context7_docs_library ON context7_documentation(library_id);
CREATE INDEX IF NOT EXISTS idx_context7_docs_topic ON context7_documentation(topic);
CREATE INDEX IF NOT EXISTS idx_context7_docs_embedding ON context7_documentation 
    USING hnsw (embedding vector_cosine_ops);
" >nul 2>nul

if %errorlevel% equ 0 (
    echo %GREEN%✅ Database schema initialized%RESET%
) else (
    echo %RED%❌ Failed to initialize database schema%RESET%
    exit /b 1
)

REM Step 6: Run the pipeline
echo.
echo %BLUE%Step 6: Running Context7 RAG Pipeline...%RESET%
echo ================================================
echo.

echo %YELLOW%Fetching documentation and generating embeddings...%RESET%
.\context7-rag-pipeline.exe
if %errorlevel% neq 0 (
    echo %RED%❌ Pipeline execution failed%RESET%
    exit /b 1
)

echo.
echo %GREEN%✅ Pipeline execution completed successfully!%RESET%

REM Step 7: Start RAG Query Server
echo.
echo %BLUE%Step 7: Starting RAG Query Server...%RESET%
echo.

echo %YELLOW%Starting Context7 RAG Query Server on port 8090...%RESET%
echo %YELLOW%Press Ctrl+C to stop the server%RESET%
echo.

start /b .\context7-rag-query-server.exe

REM Wait a moment for server to start
timeout /t 3 >nul

REM Test the server
curl -s http://localhost:8090/health >nul 2>nul
if %errorlevel% equ 0 (
    echo %GREEN%✅ RAG Query Server is running on http://localhost:8090%RESET%
) else (
    echo %RED%❌ RAG Query Server failed to start%RESET%
    exit /b 1
)

echo.
echo %GREEN%==========================================
echo ✨ Context7 RAG Pipeline Setup Complete!
echo ==========================================%RESET%
echo.
echo %BLUE%Available endpoints:%RESET%
echo • RAG Query Server: http://localhost:8090
echo • Health Check: http://localhost:8090/health
echo • SvelteKit API: http://localhost:5173/api/context7/docs
echo.
echo %BLUE%Test commands:%RESET%
echo • curl http://localhost:8090/api/rag/libraries
echo • curl http://localhost:8090/api/rag/topics
echo • curl -X POST http://localhost:8090/api/rag/search -H "Content-Type: application/json" -d "{\"query\":\"TypeScript interfaces\"}"
echo.
echo %BLUE%Integration with SvelteKit:%RESET%
echo The API endpoint /api/context7/docs is ready for use in your application.
echo.
echo %YELLOW%Press any key to keep the server running...%RESET%
pause >nul