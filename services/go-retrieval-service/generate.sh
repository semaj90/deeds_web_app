#!/usr/bin/env bash
# Regenerate Go protobuf + gRPC stubs from retrieval.proto
#
# Prerequisites:
#   go install google.golang.org/protobuf/cmd/protoc-gen-go@latest
#   go install google.golang.org/grpc/cmd/protoc-gen-go-grpc@latest
#
# Usage: ./generate.sh

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"
PROTO_SRC="$REPO_ROOT/proto/active/retrieval.proto"
OUT_DIR="$SCRIPT_DIR/proto/retrieval"

export PATH="$PATH:$(go env GOPATH)/bin"

mkdir -p "$OUT_DIR"

echo "Generating Go stubs from $PROTO_SRC → $OUT_DIR"

protoc \
  --proto_path="$REPO_ROOT" \
  --go_out="$OUT_DIR" \
  --go_opt=paths=source_relative \
  --go_opt=Mproto/active/retrieval.proto=github.com/deeds-web-app/services/go-retrieval-service/proto/retrieval \
  --go-grpc_out="$OUT_DIR" \
  --go-grpc_opt=paths=source_relative \
  --go-grpc_opt=Mproto/active/retrieval.proto=github.com/deeds-web-app/services/go-retrieval-service/proto/retrieval \
  "$PROTO_SRC"

# protoc places files in proto/active/ subdir due to source_relative — flatten
if [ -d "$OUT_DIR/proto/active" ]; then
  mv "$OUT_DIR/proto/active/"*.go "$OUT_DIR/"
  rm -rf "$OUT_DIR/proto"
fi

echo "✅ Generated $(ls "$OUT_DIR"/*.go 2>/dev/null | wc -l) files in $OUT_DIR"
