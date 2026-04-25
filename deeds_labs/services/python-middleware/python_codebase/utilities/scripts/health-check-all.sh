#!/bin/bash
# Comprehensive Health Check Script for Legal AI Platform
# Validates all services in the production deployment stack

set -e

echo "🔍 Legal AI Platform - Comprehensive Health Check"
echo "=================================================="

# Color codes for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Track overall health
OVERALL_HEALTH=0

# Function to check service health
check_service() {
    local service_name=$1
    local url=$2
    local expected_status=$3
    local timeout=${4:-5}

    echo -n "  Checking $service_name... "

    if curl -f -s --max-time $timeout "$url" > /dev/null 2>&1; then
        echo -e "${GREEN}✅ HEALTHY${NC}"
        return 0
    else
        echo -e "${RED}❌ UNHEALTHY${NC}"
        OVERALL_HEALTH=$((OVERALL_HEALTH + 1))
        return 1
    fi
}

# Function to check service with JSON response
check_service_json() {
    local service_name=$1
    local url=$2
    local timeout=${3:-5}

    echo -n "  Checking $service_name... "

    response=$(curl -f -s --max-time $timeout "$url" 2>/dev/null)
    if [ $? -eq 0 ] && echo "$response" | jq -e '.status == "healthy" or .status == "ok" or .health == "ok"' > /dev/null 2>&1; then
        echo -e "${GREEN}✅ HEALTHY${NC}"
        # Show additional info if available
        if echo "$response" | jq -e '.version' > /dev/null 2>&1; then
            version=$(echo "$response" | jq -r '.version')
            echo -e "    ${BLUE}Version: $version${NC}"
        fi
        if echo "$response" | jq -e '.tensorrt_available' > /dev/null 2>&1; then
            tensorrt=$(echo "$response" | jq -r '.tensorrt_available')
            echo -e "    ${YELLOW}TensorRT: $tensorrt${NC}"
        fi
        return 0
    else
        echo -e "${RED}❌ UNHEALTHY${NC}"
        if [ ! -z "$response" ]; then
            echo -e "    ${RED}Response: $response${NC}"
        fi
        OVERALL_HEALTH=$((OVERALL_HEALTH + 1))
        return 1
    fi
}

# Docker Infrastructure Services
echo -e "\n${BLUE}📦 Docker Infrastructure Services${NC}"
echo "=================================="

# PostgreSQL
if docker ps --format "table {{.Names}}" | grep -q "postgres"; then
    check_service "PostgreSQL" "http://localhost:5432" 200 10
else
    echo -e "  PostgreSQL: ${RED}❌ CONTAINER NOT RUNNING${NC}"
    OVERALL_HEALTH=$((OVERALL_HEALTH + 1))
fi

# Redis
if docker ps --format "table {{.Names}}" | grep -q "redis"; then
    # Redis doesn't have HTTP endpoint, check with redis-cli
    echo -n "  Checking Redis... "
    if redis-cli -h localhost -p 6379 ping > /dev/null 2>&1; then
        echo -e "${GREEN}✅ HEALTHY${NC}"
    else
        echo -e "${RED}❌ UNHEALTHY${NC}"
        OVERALL_HEALTH=$((OVERALL_HEALTH + 1))
    fi
else
    echo -e "  Redis: ${RED}❌ CONTAINER NOT RUNNING${NC}"
    OVERALL_HEALTH=$((OVERALL_HEALTH + 1))
fi

# MinIO
if docker ps --format "table {{.Names}}" | grep -q "minio"; then
    check_service "MinIO" "http://localhost:9000/minio/health/live" 200 10
else
    echo -e "  MinIO: ${RED}❌ CONTAINER NOT RUNNING${NC}"
    OVERALL_HEALTH=$((OVERALL_HEALTH + 1))
fi

# RabbitMQ
if docker ps --format "table {{.Names}}" | grep -q "rabbitmq"; then
    check_service "RabbitMQ" "http://localhost:15672/api/health/checks/alarms" 200 10
else
    echo -e "  RabbitMQ: ${RED}❌ CONTAINER NOT RUNNING${NC}"
    OVERALL_HEALTH=$((OVERALL_HEALTH + 1))
fi

# Core Application Services
echo -e "\n${BLUE}🚀 Core Application Services${NC}"
echo "============================="

# SvelteKit Frontend
check_service_json "SvelteKit Frontend" "http://localhost:5173/health"

# TensorRT Production Service
check_service_json "TensorRT Service" "http://localhost:8100/health"

# CUDA Service Worker
check_service_json "CUDA Service" "http://localhost:8097/api/v1/health"

# WebAssembly Service
check_service_json "WebAssembly Service" "http://localhost:8102/health"

# PostgreSQL Vector Service (pgvector)
check_service_json "PostgreSQL Vector Service" "http://localhost:8103/health"

# GPU and AI Services
echo -e "\n${BLUE}⚡ GPU and AI Services${NC}"
echo "======================"

# CUDA Memory Manager
check_service_json "CUDA Memory Manager" "http://localhost:8107/health"

# Legal AI Microservice
check_service_json "Legal AI Service" "http://localhost:8108/health"

# Vector Search Service
check_service_json "Vector Search Service" "http://localhost:8109/health"

# Ollama Service
echo -n "  Checking Ollama Service... "
if curl -f -s --max-time 10 "http://localhost:11434/api/version" > /dev/null 2>&1; then
    echo -e "${GREEN}✅ HEALTHY${NC}"
    # Check available models
    models_response=$(curl -s "http://localhost:11434/api/tags" 2>/dev/null)
    if [ $? -eq 0 ]; then
        model_count=$(echo "$models_response" | jq -r '.models | length' 2>/dev/null || echo "unknown")
        echo -e "    ${BLUE}Models available: $model_count${NC}"
    fi
else
    echo -e "${RED}❌ UNHEALTHY${NC}"
    OVERALL_HEALTH=$((OVERALL_HEALTH + 1))
fi

# Advanced Features
echo -e "\n${BLUE}🔬 Advanced Features${NC}"
echo "==================="

# Universal GPU Runtime Test
echo -n "  Testing Universal GPU Runtime... "
if curl -f -s --max-time 5 "http://localhost:5173/demo/gpu-runtime" > /dev/null 2>&1; then
    echo -e "${GREEN}✅ ACCESSIBLE${NC}"
else
    echo -e "${RED}❌ INACCESSIBLE${NC}"
    OVERALL_HEALTH=$((OVERALL_HEALTH + 1))
fi

# Legal AI Chat Interface
echo -n "  Testing Legal AI Chat... "
if curl -f -s --max-time 5 "http://localhost:5173/legal-ai" > /dev/null 2>&1; then
    echo -e "${GREEN}✅ ACCESSIBLE${NC}"
else
    echo -e "${RED}❌ INACCESSIBLE${NC}"
    OVERALL_HEALTH=$((OVERALL_HEALTH + 1))
fi

# Document Upload Service
echo -n "  Testing Document Upload... "
if curl -f -s --max-time 5 "http://localhost:5173/demo/cuda-minio-upload" > /dev/null 2>&1; then
    echo -e "${GREEN}✅ ACCESSIBLE${NC}"
else
    echo -e "${RED}❌ INACCESSIBLE${NC}"
    OVERALL_HEALTH=$((OVERALL_HEALTH + 1))
fi

# System Resources
echo -e "\n${BLUE}💻 System Resources${NC}"
echo "=================="

# GPU Status
echo -n "  Checking GPU Status... "
if command -v nvidia-smi &> /dev/null; then
    gpu_info=$(nvidia-smi --query-gpu=name,utilization.gpu,memory.used,memory.total --format=csv,noheader,nounits | head -1)
    if [ $? -eq 0 ]; then
        echo -e "${GREEN}✅ GPU DETECTED${NC}"
        echo -e "    ${BLUE}$gpu_info${NC}"
    else
        echo -e "${YELLOW}⚠️ GPU COMMAND FAILED${NC}"
    fi
else
    echo -e "${RED}❌ NVIDIA-SMI NOT FOUND${NC}"
    OVERALL_HEALTH=$((OVERALL_HEALTH + 1))
fi

# Memory Usage
echo -n "  Checking Memory Usage... "
if command -v free &> /dev/null; then
    mem_info=$(free -h | grep "Mem:" | awk '{print "Used: "$3"/"$2" ("$3/$2*100"%)"}')
    echo -e "${GREEN}✅ MEMORY OK${NC}"
    echo -e "    ${BLUE}$mem_info${NC}"
elif command -v vm_stat &> /dev/null; then
    # macOS
    echo -e "${GREEN}✅ MEMORY OK${NC}"
else
    echo -e "${YELLOW}⚠️ MEMORY CHECK UNAVAILABLE${NC}"
fi

# Disk Usage
echo -n "  Checking Disk Usage... "
disk_usage=$(df -h . | tail -1 | awk '{print "Used: "$3"/"$2" ("$5")"}')
echo -e "${GREEN}✅ DISK OK${NC}"
echo -e "    ${BLUE}$disk_usage${NC}"

# Final Summary
echo -e "\n${BLUE}📊 Health Check Summary${NC}"
echo "======================"

if [ $OVERALL_HEALTH -eq 0 ]; then
    echo -e "${GREEN}🎉 ALL SYSTEMS HEALTHY${NC}"
    echo -e "   Platform is ready for production use!"
    exit 0
else
    echo -e "${RED}⚠️ $OVERALL_HEALTH ISSUES DETECTED${NC}"
    echo -e "   Please resolve the above issues before proceeding."
    exit 1
fi