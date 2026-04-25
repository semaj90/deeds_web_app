# SIMD JSON Accelerator Service

High-performance JSON parsing and tokenization service using AVX2 SIMD instructions for maximum throughput in legal document processing.

## Features

- 🚀 AVX2 SIMD-accelerated JSON parsing
- ⚡ High-throughput tokenization for legal documents
- 🔧 RESTful API with health checks
- 📊 Performance monitoring and metadata
- 🏗️ Built with Go and C interop for optimal performance

## API Endpoints

### POST /parse
Parses JSON using SIMD acceleration and returns tokenized results.

**Request:**
```json
{
  "json": "{\"key\": \"value\", \"array\": [1, 2, 3]}"
}
```

**Response:**
```json
{
  "tokens": ["{", "\"key\"", ":", "\"value\"", ",", "\"array\"", ":", "[", "1", ",", "2", ",", "3", "]", "}"],
  "metadata": {
    "simd_accelerated": true,
    "avx2_enabled": true,
    "processed_at": 1638360000,
    "go_version": "go1.21.0"
  }
}
```

### GET /health
Returns service health status.

**Response:**
```json
{
  "status": "healthy",
  "service": "simd-json-accelerator",
  "port": 8095,
  "simd_enabled": true,
  "avx2_supported": true,
  "timestamp": 1638360000,
  "goroutines": 8,
  "go_version": "go1.21.0"
}
```

## Building

```bash
cd go-services/simd-json-accelerator
go mod tidy
go build -o ../../bin/simd-json-accelerator.exe -tags avx2 ./main.go
```

## Running

```bash
# Default port 8095
./bin/simd-json-accelerator.exe

# Custom port
SIMD_JSON_PORT=8096 ./bin/simd-json-accelerator.exe
```

## Performance

- AVX2 SIMD instructions for parallel processing
- Optimized for legal document JSON structures
- Low-latency tokenization for real-time processing
- Memory-efficient streaming parsing

## Dependencies

- Go 1.21+
- AVX2 CPU support required
- gorilla/mux for HTTP routing

## Integration

Used by the Phase 52 TypeScript repair pipeline for:
- Fast JSON AST parsing
- Token-level syntax analysis
- Automated error pattern detection
- SIMD-accelerated code transformations