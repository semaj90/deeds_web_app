#!/bin/bash
# Production Deployment Test Script
# Tests Docker build and deployment with memory monitoring

set -e  # Exit on error

echo "========================================="
echo "Production Deployment Test"
echo "========================================="
echo ""

# Colors
GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Configuration
IMAGE_NAME="deeds-sveltekit:test"
CONTAINER_NAME="sveltekit-prod-test"
TEST_PORT=3001  # Use 3001 to avoid conflicts with dev server

# Step 1: Build Docker image
echo -e "${YELLOW}Step 1: Building Docker image...${NC}"
cd "$(dirname "$0")/../../sveltekit-frontend"

if docker build -f Dockerfile.production.test -t $IMAGE_NAME . ; then
    echo -e "${GREEN}✓ Docker image built successfully${NC}"
else
    echo -e "${RED}✗ Docker build failed${NC}"
    exit 1
fi

# Step 2: Check image size
echo ""
echo -e "${YELLOW}Step 2: Checking image size...${NC}"
IMAGE_SIZE=$(docker images $IMAGE_NAME --format "{{.Size}}")
echo -e "Image size: ${GREEN}$IMAGE_SIZE${NC}"

# Step 3: Run container
echo ""
echo -e "${YELLOW}Step 3: Starting container...${NC}"

# Stop and remove if already running
docker stop $CONTAINER_NAME 2>/dev/null || true
docker rm $CONTAINER_NAME 2>/dev/null || true

# Get database connection from existing containers or use defaults
POSTGRES_HOST=$(docker inspect phase66-postgres --format='{{range .NetworkSettings.Networks}}{{.IPAddress}}{{end}}' 2>/dev/null || echo "host.docker.internal")
REDIS_HOST=$(docker inspect phase66-redis --format='{{range .NetworkSettings.Networks}}{{.IPAddress}}{{end}}' 2>/dev/null || echo "host.docker.internal")
QDRANT_HOST=$(docker inspect phase66-qdrant --format='{{range .NetworkSettings.Networks}}{{.IPAddress}}{{end}}' 2>/dev/null || echo "host.docker.internal")

docker run -d \
  --name $CONTAINER_NAME \
  -p $TEST_PORT:3000 \
  -e NODE_ENV=production \
  -e DATABASE_URL="postgresql://legal_admin:123456@${POSTGRES_HOST:-host.docker.internal}:5432/legal_ai_db" \
  -e REDIS_URL="redis://${REDIS_HOST:-host.docker.internal}:6379" \
  -e QDRANT_URL="http://${QDRANT_HOST:-host.docker.internal}:6333" \
  -e MINIO_ENDPOINT="${MINIO_HOST:-host.docker.internal}" \
  -e MINIO_PORT=9000 \
  -e MINIO_ACCESS_KEY=admin \
  -e MINIO_SECRET_KEY=password \
  -e ORIGIN="http://localhost:$TEST_PORT" \
  $IMAGE_NAME

if [ $? -eq 0 ]; then
    echo -e "${GREEN}✓ Container started successfully${NC}"
else
    echo -e "${RED}✗ Container failed to start${NC}"
    exit 1
fi

# Step 4: Wait for health check
echo ""
echo -e "${YELLOW}Step 4: Waiting for service to be healthy...${NC}"
sleep 5

MAX_RETRIES=30
RETRY_COUNT=0

while [ $RETRY_COUNT -lt $MAX_RETRIES ]; do
    if curl -sf "http://localhost:$TEST_PORT/api/health" > /dev/null 2>&1; then
        echo -e "${GREEN}✓ Service is healthy!${NC}"
        break
    fi

    RETRY_COUNT=$((RETRY_COUNT + 1))
    echo "Waiting... ($RETRY_COUNT/$MAX_RETRIES)"
    sleep 2
done

if [ $RETRY_COUNT -eq $MAX_RETRIES ]; then
    echo -e "${RED}✗ Service failed to become healthy${NC}"
    echo "Container logs:"
    docker logs $CONTAINER_NAME --tail 50
    docker stop $CONTAINER_NAME
    docker rm $CONTAINER_NAME
    exit 1
fi

# Step 5: Check memory usage
echo ""
echo -e "${YELLOW}Step 5: Memory usage analysis...${NC}"
sleep 3  # Let it settle

MEMORY_STATS=$(docker stats $CONTAINER_NAME --no-stream --format "table {{.MemUsage}}\t{{.MemPerc}}\t{{.CPUPerc}}")
echo "$MEMORY_STATS"

MEMORY_MB=$(docker stats $CONTAINER_NAME --no-stream --format "{{.MemUsage}}" | cut -d'/' -f1 | sed 's/MiB//' | sed 's/ //g')
echo ""
echo -e "Current memory usage: ${GREEN}${MEMORY_MB}MB${NC}"

if [ $(echo "$MEMORY_MB < 1000" | bc) -eq 1 ]; then
    echo -e "${GREEN}✓ Memory usage is good (< 1GB)${NC}"
elif [ $(echo "$MEMORY_MB < 2000" | bc) -eq 1 ]; then
    echo -e "${YELLOW}⚠ Memory usage is moderate (1-2GB)${NC}"
else
    echo -e "${RED}⚠ Memory usage is high (> 2GB)${NC}"
fi

# Step 6: Test API endpoint
echo ""
echo -e "${YELLOW}Step 6: Testing API endpoint...${NC}"
HEALTH_RESPONSE=$(curl -s "http://localhost:$TEST_PORT/api/health")
echo "Health response:"
echo "$HEALTH_RESPONSE" | python3 -m json.tool 2>/dev/null || echo "$HEALTH_RESPONSE"

if echo "$HEALTH_RESPONSE" | grep -q "ok\|success\|healthy"; then
    echo -e "${GREEN}✓ API responding correctly${NC}"
else
    echo -e "${RED}✗ API response unexpected${NC}"
fi

# Step 7: Performance test (simple)
echo ""
echo -e "${YELLOW}Step 7: Quick performance test...${NC}"
echo "Sending 10 requests..."

START_TIME=$(date +%s%N)
for i in {1..10}; do
    curl -sf "http://localhost:$TEST_PORT/api/health" > /dev/null
done
END_TIME=$(date +%s%N)

DURATION=$((($END_TIME - $START_TIME) / 1000000))  # Convert to milliseconds
AVG_LATENCY=$(($DURATION / 10))

echo -e "Average latency: ${GREEN}${AVG_LATENCY}ms${NC}"

# Step 8: Cleanup
echo ""
echo -e "${YELLOW}Step 8: Cleanup${NC}"
read -p "Keep container running for manual testing? (y/N): " -n 1 -r
echo

if [[ ! $REPLY =~ ^[Yy]$ ]]; then
    docker stop $CONTAINER_NAME
    docker rm $CONTAINER_NAME
    echo -e "${GREEN}✓ Container stopped and removed${NC}"
else
    echo -e "${GREEN}Container still running on http://localhost:$TEST_PORT${NC}"
    echo "To stop: docker stop $CONTAINER_NAME && docker rm $CONTAINER_NAME"
fi

# Summary
echo ""
echo "========================================="
echo -e "${GREEN}Production Deployment Test Complete!${NC}"
echo "========================================="
echo ""
echo "Summary:"
echo "  - Image size: $IMAGE_SIZE"
echo "  - Memory usage: ${MEMORY_MB}MB"
echo "  - Average latency: ${AVG_LATENCY}ms"
echo "  - Test port: $TEST_PORT"
echo ""
echo "For pointer compression (50% memory savings):"
echo "  1. Authenticate: echo \$GITHUB_TOKEN | docker login ghcr.io -u USERNAME --password-stdin"
echo "  2. Build: docker build -f Dockerfile.production -t deeds-sveltekit:prod ."
echo "  3. Expected memory: ~${MEMORY_MB/2}MB"
echo ""