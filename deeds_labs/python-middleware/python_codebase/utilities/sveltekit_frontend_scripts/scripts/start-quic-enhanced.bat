@echo off setlocal enabledelayedexpansion echo 🚀 Starting Enhanced QUIC Development Environment echo
════════════════════════════════════════════════ echo 📡 QUIC/HTTP3: 127.0.0.1:5174 echo 🐳 Docker: Infrastructure
services echo ⚡ GPU: RTX optimized echo. REM Check Docker docker info >nul 2>&1 if errorlevel 1 ( echo ❌ Docker
Desktop is not running. Please start Docker Desktop. exit /b 1 ) echo ✅ Docker Desktop is running REM Create Docker
network docker network create legal-ai-network 2>nul if errorlevel 1 ( echo 🔗 Docker network already exists:
legal-ai-network ) else ( echo 🔗 Created Docker network: legal-ai-network ) REM Start Docker infrastructure echo 🐳
Starting Docker infrastructure services... cd .. docker-compose -f docker-compose.yml up -d postgres redis minio cd
sveltekit-frontend REM Wait for PostgreSQL echo ⏳ Waiting for infrastructure services... set /a attempts=0
:wait_postgres set /a attempts+=1 docker exec legal-ai-postgres pg_isready -U legal_admin -d legal_ai_db >nul 2>&1 if
errorlevel 1 ( if !attempts! geq 30 ( echo ❌ PostgreSQL failed to start after 30 attempts exit /b 1 ) echo Waiting for
PostgreSQL... (!attempts!/30) timeout /t 2 >nul goto wait_postgres ) echo ✅ PostgreSQL ready on port 5434 REM Wait for
Redis set /a attempts=0 :wait_redis set /a attempts+=1 docker exec legal-ai-redis redis-cli ping | findstr PONG >nul if
errorlevel 1 ( if !attempts! geq 30 ( echo ❌ Redis failed to start after 30 attempts exit /b 1 ) echo Waiting for
Redis... (!attempts!/30) timeout /t 2 >nul goto wait_redis ) echo ✅ Redis ready on port 6379 echo. echo 🎯
Infrastructure Ready! echo PostgreSQL: localhost:5434 echo Redis: localhost:6379 echo MinIO: localhost:9000 echo. REM
Set environment variables for enhanced performance set NODE_OPTIONS=--max-old-space-size=3072 set ENABLE_GPU=true set
RTX_3060_OPTIMIZATION=true set CONTEXT7_MULTICORE=true set OLLAMA_GPU_LAYERS=30 set QUIC_ENABLED=true set
DATABASE_URL=postgresql://legal_admin:123456@localhost:5434/legal_ai_db set REDIS_URL=redis://localhost:6379 echo 🚀
Starting SvelteKit with QUIC optimization... echo Frontend: http://127.0.0.1:5174 echo Protected Route:
http://127.0.0.1:5174/protected echo Authentication: Full Lucia v3 support echo. echo ⚡ Features enabled: echo -
QUIC/HTTP3 protocol support echo - RTX 3060 GPU optimizations echo - Docker infrastructure echo - Authentication system
echo - Dynamic port management echo. echo 💡 Press Ctrl+C to stop (Docker services will keep running) echo 💡 Run
'docker-compose -f ../docker-compose.yml down' to stop Docker services echo. REM Start Vite with QUIC configuration vite
dev --port 5174 --strictPort --host 127.0.0.1
