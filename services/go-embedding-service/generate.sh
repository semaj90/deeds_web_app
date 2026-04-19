#!/bin/bash
# Generate Go protobuf + gRPC stubs from embedding.proto
# Requires: protoc, protoc-gen-go, protoc-gen-go-grpc
#   go install google.golang.org/protobuf/cmd/protoc-gen-go@latest
#   go install google.golang.org/grpc/cmd/protoc-gen-go-grpc@latest

PROTO_SRC="../../proto/active/embedding.proto"
OUT_DIR="./proto/embedding"

mkdir -p "$OUT_DIR"

protoc \
  --go_out="$OUT_DIR" --go_opt=paths=source_relative \
  --go-grpc_out="$OUT_DIR" --go-grpc_opt=paths=source_relative \
  -I ../../proto/active \
  "$PROTO_SRC"

echo "Generated Go stubs in $OUT_DIR"