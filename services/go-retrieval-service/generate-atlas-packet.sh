#!/usr/bin/env bash
# Regenerate Go protobuf + gRPC stubs for canonical Parent Atlas packet refs.
#
# This is intentionally separate from retrieval.proto generation so packet
# transport can be proven without changing RetrievalService generated code.
# Once PT-4 parity is green, retrieval.proto may import PacketRef additively.

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"
PROTO_SRC="$REPO_ROOT/proto/active/atlas_packet_transport.proto"
OUT_DIR="$SCRIPT_DIR/proto/atlaspacket"

GO_BIN="${GO_BIN:-go}"
PROTOC_BIN="${PROTOC_BIN:-protoc}"

if ! command -v "$GO_BIN" >/dev/null 2>&1; then
  echo "go toolchain not found; set GO_BIN" >&2
  exit 1
fi
if ! command -v "$PROTOC_BIN" >/dev/null 2>&1; then
  echo "protoc not found; set PROTOC_BIN" >&2
  exit 1
fi

GOPATH_RAW="$("$GO_BIN" env GOPATH)"
export PATH="$PATH:$GOPATH_RAW/bin"

PROTOC_GEN_GO_BIN="${PROTOC_GEN_GO_BIN:-$GOPATH_RAW/bin/protoc-gen-go}"
PROTOC_GEN_GO_GRPC_BIN="${PROTOC_GEN_GO_GRPC_BIN:-$GOPATH_RAW/bin/protoc-gen-go-grpc}"

if [ ! -x "$PROTOC_GEN_GO_BIN" ]; then
  echo "protoc-gen-go not found at $PROTOC_GEN_GO_BIN" >&2
  exit 1
fi
if [ ! -x "$PROTOC_GEN_GO_GRPC_BIN" ]; then
  echo "protoc-gen-go-grpc not found at $PROTOC_GEN_GO_GRPC_BIN" >&2
  exit 1
fi

mkdir -p "$OUT_DIR"

echo "Generating Parent Atlas packet transport Go stubs"
"$PROTOC_BIN" \
  --plugin="protoc-gen-go=$PROTOC_GEN_GO_BIN" \
  --plugin="protoc-gen-go-grpc=$PROTOC_GEN_GO_GRPC_BIN" \
  --proto_path="$REPO_ROOT" \
  --go_out="$OUT_DIR" \
  --go_opt=paths=source_relative \
  --go_opt=Mproto/active/atlas_packet_transport.proto=github.com/deeds-web-app/services/go-retrieval-service/proto/atlaspacket \
  --go-grpc_out="$OUT_DIR" \
  --go-grpc_opt=paths=source_relative \
  --go-grpc_opt=Mproto/active/atlas_packet_transport.proto=github.com/deeds-web-app/services/go-retrieval-service/proto/atlaspacket \
  "$PROTO_SRC"

if [ -d "$OUT_DIR/proto/active" ]; then
  mv "$OUT_DIR/proto/active/"*.go "$OUT_DIR/"
  rm -rf "$OUT_DIR/proto"
fi

echo "Generated $(find "$OUT_DIR" -maxdepth 1 -name '*.go' | wc -l) Go files in $OUT_DIR"
