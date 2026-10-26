#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PKG_ROOT="$(cd "${SCRIPT_DIR}/.." && pwd)"
SRC_DIR="${PKG_ROOT}/../../.tmp/atlas/svelte-grammar-challenger/fork/src"
OUT_DIR="${PKG_ROOT}/dist/linux-x64"

mkdir -p "${OUT_DIR}"
gcc -O2 -fPIC -shared \
    -I "${SRC_DIR}" \
    "${SRC_DIR}/parser.c" \
    "${SRC_DIR}/scanner.c" \
    -o "${OUT_DIR}/tree-sitter-svelte.so"

nm -D "${OUT_DIR}/tree-sitter-svelte.so" | grep -q ' tree_sitter_svelte$'
sha256sum "${OUT_DIR}/tree-sitter-svelte.so"
echo "Build Linux Svelte Tree-sitter successful."
