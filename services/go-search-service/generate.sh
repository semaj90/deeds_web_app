#!/usr/bin/env bash
# Regenerate Go protobuf + gRPC stubs from library_search.proto
#
# Prerequisites:
#   go install google.golang.org/protobuf/cmd/protoc-gen-go@latest
#   go install google.golang.org/grpc/cmd/protoc-gen-go-grpc@latest
#
# Usage: ./generate.sh

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"
PROTO_SRC="$REPO_ROOT/proto/active/library_search.proto"
OUT_DIR="$SCRIPT_DIR/proto/libsearch"

export PATH="$PATH:$(go env GOPATH)/bin"

mkdir -p "$OUT_DIR"

echo "Generating Go stubs from $PROTO_SRC → $OUT_DIR"

protoc \
  --proto_path="$REPO_ROOT" \
  --go_out="$OUT_DIR" \
  --go_opt=paths=source_relative \
  --go_opt=Mproto/active/library_search.proto=github.com/deeds-web-app/services/go-search-service/proto/libsearch \
  --go-grpc_out="$OUT_DIR" \
  --go-grpc_opt=paths=source_relative \
  --go-grpc_opt=Mproto/active/library_search.proto=github.com/deeds-web-app/services/go-search-service/proto/libsearch \
  "$PROTO_SRC"

# protoc puts files in proto/active/ subdir due to source_relative — move to flat
if [ -d "$OUT_DIR/proto/active" ]; then
  mv "$OUT_DIR/proto/active/"*.go "$OUT_DIR/"
  rm -rf "$OUT_DIR/proto"
fi

echo "✅ Generated $(ls "$OUT_DIR"/*.go | wc -l) files in $OUT_DIR"
