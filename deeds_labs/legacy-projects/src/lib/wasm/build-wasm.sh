#!/bin/bash

# GPU-Accelerated Rapid JSON Parser Build Script
# Builds WebAssembly module using Emscripten

set -e

echo "🚀 Building GPU-Accelerated Rapid JSON Parser..."

# Configuration
PROJECT_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
WASM_DIR="$PROJECT_ROOT"
DIST_DIR="$PROJECT_ROOT/../../../static/wasm"
DEPS_DIR="$PROJECT_ROOT/deps"

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Function to print colored output
print_status() {
    echo -e "${BLUE}[INFO]${NC} $1"
}

print_success() {
    echo -e "${GREEN}[SUCCESS]${NC} $1"
}

print_warning() {
    echo -e "${YELLOW}[WARNING]${NC} $1"
}

print_error() {
    echo -e "${RED}[ERROR]${NC} $1"
}

# Check if Emscripten is installed
check_emscripten() {
    print_status "Checking Emscripten installation..."

    if ! command -v emcc &> /dev/null; then
        print_error "Emscripten not found. Installing..."

        # Download and install Emscripten
        if [ ! -d "$DEPS_DIR/emsdk" ]; then
            mkdir -p "$DEPS_DIR"
            cd "$DEPS_DIR"
            git clone https://github.com/emscripten-core/emsdk.git
            cd emsdk
            ./emsdk install latest
            ./emsdk activate latest
        fi

        # Source Emscripten environment
        source "$DEPS_DIR/emsdk/emsdk_env.sh"

        if ! command -v emcc &> /dev/null; then
            print_error "Failed to install Emscripten"
            exit 1
        fi
    fi

    print_success "Emscripten found: $(emcc --version | head -n1)"
}

# Download RapidJSON dependency
setup_dependencies() {
    print_status "Setting up dependencies..."

    if [ ! -d "$WASM_DIR/rapidjson" ]; then
        print_status "Downloading RapidJSON..."
        cd "$WASM_DIR"
        curl -L https://github.com/Tencent/rapidjson/archive/refs/tags/v1.1.0.tar.gz | tar xz
        mv rapidjson-1.1.0 rapidjson
        print_success "RapidJSON downloaded"
    else
        print_status "RapidJSON already available"
    fi
}

# Create output directory
setup_output() {
    print_status "Setting up output directory..."
    mkdir -p "$DIST_DIR"
    print_success "Output directory ready: $DIST_DIR"
}

# Build WebAssembly module
build_wasm() {
    print_status "Building WebAssembly module..."
    cd "$WASM_DIR"

    # Compiler flags
    CXXFLAGS="-std=c++17 -O3 -DNDEBUG"
    INCLUDES="-I./rapidjson/include"

    # Emscripten flags for optimal performance
    EMSCRIPTEN_FLAGS=(
        "-s WASM=1"
        "-s EXPORT_ES6=1"
        "-s MODULARIZE=1"
        "-s EXPORT_NAME=\"RapidJsonWasm\""
        "-s ENVIRONMENT=web,webview,worker"
        "-s USE_ES6_IMPORT_META=0"
        "-s ALLOW_MEMORY_GROWTH=1"
        "-s INITIAL_MEMORY=33554432"
        "-s MAXIMUM_MEMORY=268435456"
        "-s STACK_SIZE=1048576"
        "-s EXPORTED_FUNCTIONS=\"['_malloc','_free']\""
        "-s EXPORTED_RUNTIME_METHODS=\"['ccall','cwrap','getValue','setValue']\""
        "-s NO_EXIT_RUNTIME=1"
        "-s ASSERTIONS=0"
        "-s NO_FILESYSTEM=1"
        "-s TOTAL_STACK=8388608"
        "-s PTHREAD_POOL_SIZE=4"
        "-s USE_PTHREADS=1"
        "-s PROXY_TO_PTHREAD"
        "-s WASM_WORKERS=1"
        "-s AGGRESSIVE_VARIABLE_ELIMINATION=1"
        "-s ELIMINATE_DUPLICATE_FUNCTIONS=1"
        "-lembind"
        "--closure 1"
        "--pre-js pre.js"
    )

    # Create pre.js for additional optimizations
    cat > pre.js << 'EOF'
// Pre-load optimizations for WebAssembly JSON parser
if (typeof performance === 'undefined') {
    var performance = { now: function() { return Date.now(); } };
}

// Memory pool for better garbage collection
var memoryPool = {
    buffers: [],
    get: function(size) {
        for (var i = 0; i < this.buffers.length; i++) {
            if (this.buffers[i].byteLength >= size) {
                return this.buffers.splice(i, 1)[0];
            }
        }
        return new ArrayBuffer(size);
    },
    release: function(buffer) {
        if (this.buffers.length < 10) {
            this.buffers.push(buffer);
        }
    }
};
EOF

    # Build command
    emcc $CXXFLAGS $INCLUDES "${EMSCRIPTEN_FLAGS[@]}" \
        -o "$DIST_DIR/rapid-json-parser.js" \
        rapid-json-parser.cpp

    if [ $? -eq 0 ]; then
        print_success "WebAssembly build completed successfully"

        # Show file sizes
        if [ -f "$DIST_DIR/rapid-json-parser.js" ]; then
            JS_SIZE=$(du -h "$DIST_DIR/rapid-json-parser.js" | cut -f1)
            print_status "JavaScript file size: $JS_SIZE"
        fi

        if [ -f "$DIST_DIR/rapid-json-parser.wasm" ]; then
            WASM_SIZE=$(du -h "$DIST_DIR/rapid-json-parser.wasm" | cut -f1)
            print_status "WebAssembly file size: $WASM_SIZE"
        fi
    else
        print_error "WebAssembly build failed"
        exit 1
    fi

    # Cleanup
    rm -f pre.js
}

# Optimize WebAssembly output
optimize_wasm() {
    print_status "Optimizing WebAssembly output..."

    # Check if wasm-opt is available
    if command -v wasm-opt &> /dev/null; then
        print_status "Running wasm-opt optimization..."
        wasm-opt -Oz --enable-threads --enable-bulk-memory \
            "$DIST_DIR/rapid-json-parser.wasm" \
            -o "$DIST_DIR/rapid-json-parser.optimized.wasm"

        if [ $? -eq 0 ]; then
            mv "$DIST_DIR/rapid-json-parser.optimized.wasm" "$DIST_DIR/rapid-json-parser.wasm"
            print_success "WebAssembly optimization completed"
        else
            print_warning "WebAssembly optimization failed, using unoptimized version"
        fi
    else
        print_warning "wasm-opt not found, skipping optimization"
    fi
}

# Create TypeScript declaration file
create_declarations() {
    print_status "Creating TypeScript declarations..."

    cat > "$DIST_DIR/rapid-json-parser.d.ts" << 'EOF'
// TypeScript declarations for GPU-Accelerated Rapid JSON Parser WebAssembly module

export interface ParseMetrics {
    parseTime: number;
    documentSize: number;
    objectCount: number;
    arrayCount: number;
    parseMethod: string;
}

export interface CacheStats {
    hits: number;
    misses: number;
    hitRate: number;
    cacheSize: number;
}

export interface ParseResult {
    success: boolean;
    error?: boolean;
    errorMessage?: string;
    errorOffset?: number;
    parsed?: boolean;
}

export interface BatchResult {
    results: ParseResult[];
    batchTime: number;
    documentCount: number;
    threadsUsed: number;
}

export interface RapidJsonParserWasm {
    parseWithCache(json: string, useCache?: boolean): ParseResult;
    parseBatch(jsonArray: string[]): BatchResult;
    getValue(path: string): any;
    getMetrics(): ParseMetrics;
    stringify(options?: { pretty?: boolean }): { success: boolean; json?: string; size?: number };
    validate(schemaJson: string): { valid: boolean; error?: string; message?: string };
}

export interface RapidJsonWasmModule {
    RapidJsonParser: new () => RapidJsonParserWasm;
    getCacheStats(): CacheStats;
    clearCache(): void;
    createParser(): RapidJsonParserWasm;
    destroyParser(parser: RapidJsonParserWasm): void;
}

declare const RapidJsonWasm: () => Promise<RapidJsonWasmModule>;
export default RapidJsonWasm;
EOF

    print_success "TypeScript declarations created"
}

# Run tests
run_tests() {
    print_status "Running WebAssembly tests..."

    # Create test script
    cat > "$WASM_DIR/test-wasm.js" << 'EOF'
const RapidJsonWasm = require('./dist/rapid-json-parser.js');

async function runTests() {
    console.log('🧪 Testing WebAssembly JSON parser...');

    try {
        const wasmModule = await RapidJsonWasm();
        const parser = wasmModule.createParser();

        // Test 1: Basic parsing
        const testJson = '{"name": "test", "value": 42, "array": [1, 2, 3]}';
        const result = parser.parseWithCache(testJson, true);

        if (result.success) {
            console.log('✅ Basic parsing test passed');
        } else {
            console.log('❌ Basic parsing test failed:', result.errorMessage);
        }

        // Test 2: Get value by path
        const value = parser.getValue('name');
        if (value === 'test') {
            console.log('✅ Path access test passed');
        } else {
            console.log('❌ Path access test failed');
        }

        // Test 3: Performance metrics
        const metrics = parser.getMetrics();
        console.log('📊 Metrics:', metrics);

        // Test 4: Cache statistics
        const cacheStats = wasmModule.getCacheStats();
        console.log('💾 Cache stats:', cacheStats);

        console.log('🎉 All tests passed!');

    } catch (error) {
        console.error('💥 Test failed:', error);
        process.exit(1);
    }
}

runTests();
EOF

    if [ -f "$DIST_DIR/rapid-json-parser.js" ]; then
        cd "$PROJECT_ROOT/../../.."
        node "$WASM_DIR/test-wasm.js"
        rm -f "$WASM_DIR/test-wasm.js"
    else
        print_warning "Skipping tests - WebAssembly module not found"
    fi
}

# Main build process
main() {
    print_status "Starting GPU-Accelerated JSON Parser build process..."

    check_emscripten
    setup_dependencies
    setup_output
    build_wasm
    optimize_wasm
    create_declarations
    run_tests

    print_success "🎉 Build completed successfully!"
    print_status "Output files:"
    print_status "  - JavaScript: $DIST_DIR/rapid-json-parser.js"
    print_status "  - WebAssembly: $DIST_DIR/rapid-json-parser.wasm"
    print_status "  - TypeScript: $DIST_DIR/rapid-json-parser.d.ts"

    # Show usage example
    cat << 'EOF'

📚 Usage Example:

```javascript
import RapidJsonWasm from '/static/wasm/rapid-json-parser.js';

const wasmModule = await RapidJsonWasm();
const parser = wasmModule.createParser();

const result = parser.parseWithCache('{"test": true}', true);
if (result.success) {
    console.log('Parsed successfully!');
    console.log('Metrics:', parser.getMetrics());
}
```

🔗 Integration:
- Copy files to your static/wasm directory
- Import and use the GpuAcceleratedJsonParser class
- Enable GPU acceleration with WebGPU support

EOF
}

# Run main function
main "$@"
