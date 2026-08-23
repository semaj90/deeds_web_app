#!/bin/bash

# Start all services individually (no docker-compose)
# Usage: ./scripts/start_services.sh

set -e

echo "🚀 Starting Legal AI GPU RAG Services"
echo "====================================="
echo ""

# Colors
GREEN='\033[0;32m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# 1. Postgres 17 + pgvector
echo -e "${BLUE}1. Starting Postgres 17 + pgvector...${NC}"
docker run -d \
  --name postgres-pgvector \
  -e POSTGRES_PASSWORD=password \
  -e POSTGRES_DB=legal_db \
  -p 5432:5432 \
  -v postgres_data:/var/lib/postgresql/data \
  pgvector/pgvector:pg17

echo -e "${GREEN}✅ Postgres running on localhost:5432${NC}"
sleep 2

# 2. Valkey (Redis-compatible cache)
echo -e "${BLUE}2. Starting Valkey...${NC}"
docker run -d \
  --name legal-ai-valkey \
  -p 6379:6379 \
  -v valkey_data:/data \
  valkey/valkey:8-alpine

echo -e "${GREEN}✅ Valkey running on localhost:6379${NC}"
sleep 2

# 3. RabbitMQ
echo -e "${BLUE}3. Starting RabbitMQ...${NC}"
docker run -d \
  --name rabbitmq-legal \
  -p 5672:5672 \
  -p 15672:15672 \
  -v rabbitmq_data:/var/lib/rabbitmq \
  rabbitmq:3-management

echo -e "${GREEN}✅ RabbitMQ running on localhost:5672${NC}"
echo -e "${GREEN}   Management UI: http://localhost:15672${NC}"
sleep 3

# 4. Qdrant GPU
echo -e "${BLUE}4. Starting Qdrant GPU...${NC}"
docker run -d \
  --name qdrant-gpu \
  --gpus all \
  -p 6333:6333 \
  -p 6334:6334 \
  -v qdrant_storage:/qdrant/storage \
  -v qdrant_snapshots:/qdrant/snapshots \
  qdrant/qdrant:latest-gpu

echo -e "${GREEN}✅ Qdrant GPU running on localhost:6333${NC}"
sleep 2

# 5. Native Windows Ollama (managed outside Docker)
echo -e "${BLUE}5. Using native Windows Ollama at http://127.0.0.1:11434...${NC}"
echo -e "${GREEN}✅ Ollama is not started as a container${NC}"
sleep 1

# 6. Bootstrap RabbitMQ
echo -e "${BLUE}6. Bootstrapping RabbitMQ...${NC}"
sleep 5  # Wait for RabbitMQ to be ready
chmod +x scripts/bootstrap_rabbitmq.sh
./scripts/bootstrap_rabbitmq.sh

echo -e "${GREEN}✅ RabbitMQ bootstrapped${NC}"
echo ""

# 7. Summary
echo -e "${GREEN}🎉 All services started!${NC}"
echo ""
echo "Service Status:"
echo "  Postgres:  localhost:5432 (user: postgres, password: password)"
echo "  Redis:     localhost:6379"
echo "  RabbitMQ:  localhost:5672 (Management: http://localhost:15672)"
echo "  Qdrant:    localhost:6333"
echo "  Ollama:    localhost:11434"
echo ""
echo "Next steps:"
echo "  1. Start MLP workers: supervisord -c backend/supervisord.conf"
echo "  2. Check status: supervisorctl -c backend/supervisord.conf status all"
echo "  3. View logs: tail -f /var/log/supervisor/*.log"
echo ""