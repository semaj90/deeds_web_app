#!/bin/bash
# Enhanced RAG Protobuf Build Script
# Generates Go and TypeScript bindings from .proto files

set -e

echo "🚀 Building Enhanced RAG Protobuf Bindings..."
echo "════════════════════════════════════════════"

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Directories
PROTO_DIR="proto"
GO_OUT_DIR="go-microservice/pkg/proto"
TS_OUT_DIR="sveltekit-frontend/src/lib/proto/generated"

echo -e "${BLUE}📁 Proto directory: ${PROTO_DIR}${NC}"
echo -e "${BLUE}📁 Go output: ${GO_OUT_DIR}${NC}"
echo -e "${BLUE}📁 TypeScript output: ${TS_OUT_DIR}${NC}"
echo ""

# Check if protoc is installed
if ! command -v protoc &> /dev/null; then
    echo -e "${RED}❌ protoc not found. Please install Protocol Buffers compiler.${NC}"
    echo ""
    echo "Windows: Download from https://github.com/protocolbuffers/protobuf/releases"
    echo "macOS: brew install protobuf"
    echo "Ubuntu: sudo apt install protobuf-compiler"
    exit 1
fi

echo -e "${GREEN}✅ protoc found: $(protoc --version)${NC}"

# Create output directories
mkdir -p "${GO_OUT_DIR}"
mkdir -p "${TS_OUT_DIR}"

echo -e "${BLUE}📦 Creating Go module if not exists...${NC}"
cd go-microservice
if [ ! -f go.mod ]; then
    go mod init github.com/legal-ai/enhanced-rag
    echo -e "${GREEN}✅ Go module initialized${NC}"
fi

# Install Go protobuf dependencies
echo -e "${BLUE}📦 Installing Go protobuf dependencies...${NC}"
go get google.golang.org/protobuf/cmd/protoc-gen-go@latest
go get google.golang.org/grpc/cmd/protoc-gen-go-grpc@latest
go get github.com/grpc-ecosystem/grpc-gateway/v2/protoc-gen-grpc-gateway@latest
go get github.com/gin-gonic/gin@latest
go get github.com/grpc-ecosystem/grpc-gateway/v2/runtime@latest
go get google.golang.org/grpc@latest

cd ..

# Generate Go bindings
echo -e "${BLUE}🔧 Generating Go protobuf bindings...${NC}"
protoc \
    --proto_path=${PROTO_DIR} \
    --go_out=${GO_OUT_DIR} \
    --go_opt=paths=source_relative \
    --go-grpc_out=${GO_OUT_DIR} \
    --go-grpc_opt=paths=source_relative \
    --grpc-gateway_out=${GO_OUT_DIR} \
    --grpc-gateway_opt=paths=source_relative \
    ${PROTO_DIR}/enhanced-rag.proto

if [ $? -eq 0 ]; then
    echo -e "${GREEN}✅ Go protobuf bindings generated successfully${NC}"
else
    echo -e "${RED}❌ Failed to generate Go protobuf bindings${NC}"
    exit 1
fi

# Generate TypeScript bindings (using ts-proto if available)
if command -v npm &> /dev/null; then
    echo -e "${BLUE}📦 Installing TypeScript protobuf dependencies...${NC}"

    cd sveltekit-frontend

    # Install ts-proto if not already installed
    if ! npm list ts-proto &> /dev/null; then
        npm install --save-dev ts-proto
    fi

    cd ..

    echo -e "${BLUE}🔧 Generating TypeScript protobuf bindings...${NC}"

    # Use ts-proto to generate TypeScript
    npx protoc \
        --plugin=./sveltekit-frontend/node_modules/.bin/protoc-gen-ts_proto \
        --ts_proto_out=${TS_OUT_DIR} \
        --ts_proto_opt=esModuleInterop=true \
        --ts_proto_opt=forceLong=string \
        --ts_proto_opt=useOptionals=messages \
        --proto_path=${PROTO_DIR} \
        ${PROTO_DIR}/enhanced-rag.proto

    if [ $? -eq 0 ]; then
        echo -e "${GREEN}✅ TypeScript protobuf bindings generated successfully${NC}"
    else
        echo -e "${YELLOW}⚠️ TypeScript generation failed, using manual bindings${NC}"
    fi
else
    echo -e "${YELLOW}⚠️ npm not found, skipping TypeScript generation${NC}"
fi

# Build Go gRPC server
echo -e "${BLUE}🔧 Building Go gRPC server...${NC}"
cd go-microservice

go build -o bin/enhanced-rag-grpc.exe ./cmd/enhanced-rag-grpc/

if [ $? -eq 0 ]; then
    echo -e "${GREEN}✅ Go gRPC server built: bin/enhanced-rag-grpc.exe${NC}"
else
    echo -e "${RED}❌ Failed to build Go gRPC server${NC}"
    exit 1
fi

cd ..

echo ""
echo -e "${GREEN}🎉 Enhanced RAG Protobuf Build Complete!${NC}"
echo "════════════════════════════════════════════"
echo -e "${BLUE}🔧 Generated files:${NC}"
echo "   • Go bindings: ${GO_OUT_DIR}/"
echo "   • TypeScript bindings: ${TS_OUT_DIR}/"
echo "   • gRPC server: go-microservice/bin/enhanced-rag-grpc.exe"
echo ""
echo -e "${BLUE}🚀 To run the gRPC server:${NC}"
echo "   cd go-microservice && ./bin/enhanced-rag-grpc.exe"
echo ""
echo -e "${BLUE}🔗 Endpoints:${NC}"
echo "   • gRPC: localhost:8095"
echo "   • HTTP Gateway: localhost:8096"
echo "   • Health: curl http://localhost:8096/health"
echo ""