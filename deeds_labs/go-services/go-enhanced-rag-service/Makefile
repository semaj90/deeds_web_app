# Enhanced RAG Service with CUDA - Build and Deployment
.PHONY: help build run test clean docker-build docker-run cuda-check

# Default target
help:
	@echo "Enhanced RAG Go Microservice with CUDA"
	@echo "======================================="
	@echo ""
	@echo "Available commands:"
	@echo "  build        - Build the Go service"
	@echo "  build-cuda   - Build with CUDA support"
	@echo "  run          - Run the service locally"
	@echo "  test         - Run tests"
	@echo "  clean        - Clean build artifacts"
	@echo "  docker-build - Build Docker image"
	@echo "  docker-run   - Run Docker container"
	@echo "  cuda-check   - Check CUDA installation"
	@echo "  benchmark    - Run CUDA performance benchmarks"
	@echo "  deploy       - Deploy to production"

# Go build variables
BINARY_NAME=enhanced-rag-service
GOFLAGS=-ldflags="-s -w"
CGO_ENABLED=1

# CUDA variables
CUDA_PATH=/usr/local/cuda
NVCC_FLAGS=-gencode arch=compute_75,code=sm_75 -gencode arch=compute_80,code=sm_80 -gencode arch=compute_86,code=sm_86
CUDA_LIBS=-L$(CUDA_PATH)/lib64 -lcuda -lcudart -lcublas

# Build the service
build:
	@echo "Building Enhanced RAG Service..."
	CGO_ENABLED=$(CGO_ENABLED) go build $(GOFLAGS) -o $(BINARY_NAME) .

# Build with CUDA support
build-cuda: cuda-kernels
	@echo "Building with CUDA support..."
	CGO_ENABLED=1 \
	CGO_CFLAGS="-I$(CUDA_PATH)/include" \
	CGO_LDFLAGS="$(CUDA_LIBS)" \
	go build $(GOFLAGS) -o $(BINARY_NAME) .

# Compile CUDA kernels
cuda-kernels:
	@echo "Compiling CUDA kernels..."
	nvcc -c -o cuda_kernels.o cuda_kernels.cu $(NVCC_FLAGS) --compiler-options '-fPIC'

# Run the service
run: build
	@echo "Starting Enhanced RAG Service..."
	./$(BINARY_NAME)

# Run with environment variables
run-dev: build
	@echo "Starting service in development mode..."
	DATABASE_URL="postgres://legal_admin:123456@localhost:5433/legal_ai_db?sslmode=disable" \
	REDIS_URL="redis://localhost:6379/0" \
	RABBITMQ_URL="amqp://localhost" \
	OLLAMA_URL="http://localhost:11434" \
	CUDA_ENABLED="true" \
	PORT="8080" \
	./$(BINARY_NAME)

# Run tests
test:
	@echo "Running tests..."
	go test -v ./...

# Run CUDA-specific tests
test-cuda:
	@echo "Running CUDA tests..."
	go test -v -tags=cuda ./...

# Clean build artifacts
clean:
	@echo "Cleaning build artifacts..."
	rm -f $(BINARY_NAME)
	rm -f cuda_kernels.o
	go clean

# Check CUDA installation
cuda-check:
	@echo "Checking CUDA installation..."
	@if command -v nvcc >/dev/null 2>&1; then \
		echo "✅ NVCC found: $$(nvcc --version | grep release)"; \
	else \
		echo "❌ NVCC not found"; \
	fi
	@if [ -d "$(CUDA_PATH)" ]; then \
		echo "✅ CUDA path exists: $(CUDA_PATH)"; \
	else \
		echo "❌ CUDA path not found: $(CUDA_PATH)"; \
	fi
	@if command -v nvidia-smi >/dev/null 2>&1; then \
		echo "✅ NVIDIA driver:"; \
		nvidia-smi --query-gpu=name,memory.total,compute_cap --format=csv,noheader; \
	else \
		echo "❌ NVIDIA driver not found"; \
	fi

# Docker operations
docker-build:
	@echo "Building Docker image..."
	docker build -t enhanced-rag-service:latest .

docker-run:
	@echo "Running Docker container..."
	docker run --gpus all \
		-p 8080:8080 \
		-e DATABASE_URL="postgres://legal_admin:123456@host.docker.internal:5433/legal_ai_db?sslmode=disable" \
		-e REDIS_URL="redis://host.docker.internal:6379/0" \
		-e RABBITMQ_URL="amqp://host.docker.internal" \
		-e OLLAMA_URL="http://host.docker.internal:11434" \
		-e CUDA_ENABLED="true" \
		enhanced-rag-service:latest

# Docker Compose
docker-compose-up:
	@echo "Starting services with Docker Compose..."
	docker-compose up -d

docker-compose-down:
	@echo "Stopping Docker Compose services..."
	docker-compose down

# Performance benchmarking
benchmark: build-cuda
	@echo "Running CUDA performance benchmarks..."
	./$(BINARY_NAME) -benchmark=true

# Production deployment
deploy: docker-build
	@echo "Deploying to production..."
	@echo "⚠️  Make sure to set production environment variables"
	docker tag enhanced-rag-service:latest your-registry/enhanced-rag-service:$(shell git rev-parse --short HEAD)
	docker push your-registry/enhanced-rag-service:$(shell git rev-parse --short HEAD)

# Development setup
setup-dev:
	@echo "Setting up development environment..."
	@echo "Installing Go dependencies..."
	go mod download
	@echo "Checking CUDA..."
	$(MAKE) cuda-check
	@echo "Building service..."
	$(MAKE) build-cuda
	@echo "✅ Development environment ready!"

# Code formatting and linting
fmt:
	@echo "Formatting Go code..."
	go fmt ./...
	gofmt -s -w .

lint:
	@echo "Running linters..."
	@if command -v golangci-lint >/dev/null 2>&1; then \
		golangci-lint run; \
	else \
		echo "golangci-lint not installed, using go vet"; \
		go vet ./...; \
	fi

# Generate Go bindings for CUDA (if needed)
generate:
	@echo "Generating Go bindings..."
	go generate ./...

# Watch for changes and rebuild
watch:
	@echo "Watching for changes..."
	@if command -v air >/dev/null 2>&1; then \
		air; \
	else \
		echo "Install 'air' for hot reloading: go install github.com/cosmtrek/air@latest"; \
		echo "Using basic watch instead..."; \
		while true; do \
			$(MAKE) build-cuda && ./$(BINARY_NAME) & \
			PID=$$!; \
			inotifywait -e modify -r .; \
			kill $$PID; \
		done \
	fi

# Database migrations (if using)
migrate-up:
	@echo "Running database migrations..."
	# Add your migration commands here

migrate-down:
	@echo "Rolling back database migrations..."
	# Add your rollback commands here

# Show service information
info:
	@echo "Enhanced RAG Service Information"
	@echo "==============================="
	@echo "Binary: $(BINARY_NAME)"
	@echo "Go version: $$(go version)"
	@echo "CUDA support: $$(if [ -f cuda_kernels.o ]; then echo 'Yes'; else echo 'No'; fi)"
	@echo "Build flags: $(GOFLAGS)"
	@echo "Git commit: $$(git rev-parse --short HEAD 2>/dev/null || echo 'unknown')"

# Quick start for new developers
quickstart: setup-dev
	@echo "🚀 Quick Start Complete!"
	@echo ""
	@echo "To start the service:"
	@echo "  make run-dev"
	@echo ""
	@echo "To run with Docker:"
	@echo "  make docker-build"
	@echo "  make docker-run"
	@echo ""
	@echo "For development with hot reload:"
	@echo "  make watch"