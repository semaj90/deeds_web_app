#!/usr/bin/env bash
set -euo pipefail
echo "Starting deeds services using docker-compose.deeds.yml"
docker compose -f "$(dirname "$0")/../docker-compose.deeds.yml" up -d --remove-orphans
