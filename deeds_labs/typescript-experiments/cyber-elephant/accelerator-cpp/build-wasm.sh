#!/bin/bash
# Build script for Cyber Elephant WebAssembly accelerator
# Requires Emscripten SDK to be installed and activated

set -e

echo "🐘 Building Cyber Elephant WebAssembly Accelerator..."

# Check if emcc is available
if ! command -v emcc &> /dev/null; then
    echo "❌ Emscripten not found. Please install and activate the Emscripten SDK:"
    echo "   1. Download from: https://emscripten.org/docs/getting_started/downloads.html"
    echo "   2. Run: ./emsdk install latest && ./emsdk activate latest"
    echo "   3. Source the environment: source ./emsdk_env.sh"
    exit 1
fi

# Create output directory in the SvelteKit static folder
OUTPUT_DIR="../../../sveltekit-frontend/static/wasm"
mkdir -p "$OUTPUT_DIR"

# Build the WebAssembly module
echo "🔨 Compiling C++ to WebAssembly..."

emcc main.cpp bvh.cpp \
  -std=c++17 \
  -O3 \
  -s WASM=1 \
  -s MODULARIZE=1 \
  -s EXPORT_ES6=1 \
  -s "EXPORT_NAME='createCyberElephantAccelerator'" \
  -s "EXTRA_EXPORTED_RUNTIME_METHODS=['cwrap']" \
  -s ALLOW_MEMORY_GROWTH=1 \
  -s INITIAL_MEMORY=16777216 \
  -s MAXIMUM_MEMORY=268435456 \
  -lembind \
  --no-entry \
  -o "$OUTPUT_DIR/cyber-elephant-accelerator.js"

if [ $? -eq 0 ]; then
    echo "✅ WebAssembly build successful!"
    echo "📦 Output files:"
    echo "   - $OUTPUT_DIR/cyber-elephant-accelerator.js"
    echo "   - $OUTPUT_DIR/cyber-elephant-accelerator.wasm"
    
    # Show file sizes
    ls -lh "$OUTPUT_DIR"/cyber-elephant-accelerator.*
    
    echo ""
    echo "🚀 Ready to integrate with Svelte frontend!"
    echo "   Import with: import createAccelerator from '/wasm/cyber-elephant-accelerator.js'"
else
    echo "❌ Build failed!"
    exit 1
fi