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

to_unix_path() {
  local input="$1"
  if command -v cygpath >/dev/null 2>&1; then
    cygpath -u "$input"
  elif command -v wslpath >/dev/null 2>&1; then
    wslpath "$input"
  else
    printf '%s\n' "$input"
  fi
}

to_native_tool_path() {
  local input="$1"
  if command -v cygpath >/dev/null 2>&1; then
    cygpath -w "$input"
  elif command -v wslpath >/dev/null 2>&1; then
    wslpath -w "$input"
  else
    printf '%s\n' "$input"
  fi
}

resolve_windows_fallback() {
  local git_bash_candidate="$1"
  local wsl_candidate="$2"

  if [ -x "$git_bash_candidate" ]; then
    printf '%s\n' "$git_bash_candidate"
    return 0
  fi

  if [ -x "$wsl_candidate" ]; then
    printf '%s\n' "$wsl_candidate"
    return 0
  fi

  return 1
}

GO_BIN="${GO_BIN:-go}"
if ! command -v "$GO_BIN" >/dev/null 2>&1; then
  GO_BIN="$(resolve_windows_fallback "/c/Program Files/Go/bin/go.exe" "/mnt/c/Program Files/Go/bin/go.exe")"
fi

PROTOC_BIN="${PROTOC_BIN:-protoc}"
if ! command -v "$PROTOC_BIN" >/dev/null 2>&1; then
  PROTOC_BIN="$(resolve_windows_fallback "/c/tools/protoc/bin/protoc.exe" "/mnt/c/tools/protoc/bin/protoc.exe")"
fi

if ! command -v "$GO_BIN" >/dev/null 2>&1 && [ ! -x "$GO_BIN" ]; then
  echo "go toolchain not found. Install Go or set GO_BIN." >&2
  exit 1
fi

if ! command -v "$PROTOC_BIN" >/dev/null 2>&1 && [ ! -x "$PROTOC_BIN" ]; then
  echo "protoc not found. Install protoc or set PROTOC_BIN." >&2
  exit 1
fi

GOPATH_RAW="$("$GO_BIN" env GOPATH)"
GOPATH_UNIX="$(to_unix_path "$GOPATH_RAW")"
GOPATH_NATIVE="$GOPATH_RAW"
export PATH="$PATH:$GOPATH_UNIX/bin"

PROTO_ROOT_ARG="$REPO_ROOT"
PROTO_SRC_ARG="$PROTO_SRC"
OUT_DIR_ARG="$OUT_DIR"
PROTOC_GEN_GO_BIN="$GOPATH_UNIX/bin/protoc-gen-go"
PROTOC_GEN_GO_GRPC_BIN="$GOPATH_UNIX/bin/protoc-gen-go-grpc"

if [[ "$PROTOC_BIN" == *.exe ]]; then
  PROTO_ROOT_ARG="$(to_native_tool_path "$REPO_ROOT")"
  PROTO_SRC_ARG="$(to_native_tool_path "$PROTO_SRC")"
  OUT_DIR_ARG="$(to_native_tool_path "$OUT_DIR")"

  if [[ ! "$GOPATH_NATIVE" =~ ^[A-Za-z]:\\ && ! "$GOPATH_NATIVE" =~ ^\\\\ ]]; then
    GOPATH_NATIVE="$(to_native_tool_path "$GOPATH_RAW")"
  fi

  PROTOC_GEN_GO_BIN="$GOPATH_NATIVE\\bin\\protoc-gen-go.exe"
  PROTOC_GEN_GO_GRPC_BIN="$GOPATH_NATIVE\\bin\\protoc-gen-go-grpc.exe"
fi

mkdir -p "$OUT_DIR"

echo "Generating Go stubs from $PROTO_SRC → $OUT_DIR"

"$PROTOC_BIN" \
  "--plugin=protoc-gen-go=$PROTOC_GEN_GO_BIN" \
  "--plugin=protoc-gen-go-grpc=$PROTOC_GEN_GO_GRPC_BIN" \
  --proto_path="$PROTO_ROOT_ARG" \
  --go_out="$OUT_DIR_ARG" \
  --go_opt=paths=source_relative \
  --go_opt=Mproto/active/retrieval.proto=github.com/deeds-web-app/services/go-retrieval-service/proto/retrieval \
  --go-grpc_out="$OUT_DIR_ARG" \
  --go-grpc_opt=paths=source_relative \
  --go-grpc_opt=Mproto/active/retrieval.proto=github.com/deeds-web-app/services/go-retrieval-service/proto/retrieval \
  "$PROTO_SRC_ARG"

# protoc places files in proto/active/ subdir due to source_relative — flatten
if [ -d "$OUT_DIR/proto/active" ]; then
  mv "$OUT_DIR/proto/active/"*.go "$OUT_DIR/"
  rm -rf "$OUT_DIR/proto"
fi

echo "✅ Generated $(ls "$OUT_DIR"/*.go 2>/dev/null | wc -l) files in $OUT_DIR"
