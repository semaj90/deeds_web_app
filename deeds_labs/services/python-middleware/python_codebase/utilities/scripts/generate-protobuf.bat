@echo off
REM Generate Protocol Buffers and gRPC code for Legal AI Platform
REM Requires: protoc, protoc-gen-go, protoc-gen-go-grpc

echo "🔧 Generating Protocol Buffers for Legal AI Platform..."

REM Create output directory
if not exist "pkg\grpc" mkdir pkg\grpc
if not exist "pkg\proto" mkdir pkg\proto

REM Legal AI Core Service
protoc --go_out=pkg\proto --go_opt=paths=source_relative ^
       --go-grpc_out=pkg\grpc --go-grpc_opt=paths=source_relative ^
       proto\legal_ai.proto

REM Authentication Service
protoc --go_out=pkg\proto --go_opt=paths=source_relative ^
       --go-grpc_out=pkg\grpc --go-grpc_opt=paths=source_relative ^
       proto\auth.proto

REM Case Scoring Service
protoc --go_out=pkg\proto --go_opt=paths=source_relative ^
       --go-grpc_out=pkg\grpc --go-grpc_opt=paths=source_relative ^
       proto\case_scoring.proto

REM Tensor Cache Service
protoc --go_out=pkg\proto --go_opt=paths=source_relative ^
       --go-grpc_out=pkg\grpc --go-grpc_opt=paths=source_relative ^
       proto\tensor_cache.proto

REM Tasks/Job Queue Service
protoc --go_out=pkg\proto --go_opt=paths=source_relative ^
       --go-grpc_out=pkg\grpc --go-grpc_opt=paths=source_relative ^
       proto\tasks.proto

REM QUIC Streaming Service
protoc --go_out=pkg\proto --go_opt=paths=source_relative ^
       --go-grpc_out=pkg\grpc --go-grpc_opt=paths=source_relative ^
       proto\quic_streaming.proto

REM Metrics Service
protoc --go_out=pkg\proto --go_opt=paths=source_relative ^
       --go-grpc_out=pkg\grpc --go-grpc_opt=paths=source_relative ^
       proto\metrics.proto

REM Tensor Operations
protoc --go_out=pkg\proto --go_opt=paths=source_relative ^
       --go-grpc_out=pkg\grpc --go-grpc_opt=paths=source_relative ^
       protos\tensor.proto

REM CUDA Service with Streaming Tensors
protoc --go_out=pkg\proto --go_opt=paths=source_relative ^
       --go-grpc_out=pkg\grpc --go-grpc_opt=paths=source_relative ^
       proto\cuda.proto

echo "✅ Protocol Buffers generated successfully!"
echo "Generated files in pkg/proto/ and pkg/grpc/"

REM Generate TypeScript definitions for frontend
echo "🔧 Generating TypeScript definitions..."
if not exist "sveltekit-frontend\src\lib\proto\generated" mkdir sveltekit-frontend\src\lib\proto\generated

REM Install protobufjs if not present
cd sveltekit-frontend
npm install --save-dev protobufjs
cd ..

REM Generate TypeScript interfaces
npx pbjs -t static-module -w es6 -o sveltekit-frontend\src\lib\proto\generated\legal_ai.js proto\legal_ai.proto
npx pbts -o sveltekit-frontend\src\lib\proto\generated\legal_ai.d.ts sveltekit-frontend\src\lib\proto\generated\legal_ai.js

echo "✅ TypeScript definitions generated!"
echo "Ready for gRPC integration across 37 microservices"