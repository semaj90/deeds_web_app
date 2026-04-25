@echo off
setlocal
echo Starting deeds services using docker-compose.deeds.yml
docker compose -f "%~dp0\..\docker-compose.deeds.yml" up -d --remove-orphans
endlocal
