# Multi-stage build for Go Enhanced RAG Service
FROM golang:1.21-alpine AS builder

# Install build dependencies
RUN apk add --no-cache \
    gcc \
    musl-dev \
    git \
    make

# Set working directory
WORKDIR /app

# Copy go mod files
COPY go.mod go.sum ./

# Download dependencies
RUN go mod download

# Copy source code
COPY . .

# Build the application with optimizations
RUN CGO_ENABLED=1 GOOS=linux GOARCH=amd64 \
    go build -ldflags="-w -s" -o rag-service .

# Final stage
FROM alpine:latest

# Install runtime dependencies
RUN apk add --no-cache \
    ca-certificates \
    curl \
    redis \
    postgresql-client

# Create non-root user
RUN adduser -D -s /bin/sh raguser

# Copy binary from builder stage
COPY --from=builder /app/rag-service /usr/local/bin/rag-service

# Set permissions
RUN chmod +x /usr/local/bin/rag-service

# Switch to non-root user
USER raguser

# Expose port
EXPOSE 8094

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=5s --retries=3 \
    CMD curl -f http://localhost:8094/health || exit 1

# Run the service
CMD ["rag-service"]