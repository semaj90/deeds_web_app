# GPU-Accelerated Rapid JSON Parser with WebAssembly
# Build configuration for Emscripten compilation

# Compiler and flags
CXX = emcc
CXXFLAGS = -std=c++17 -O3 -DNDEBUG
EMSCRIPTEN_FLAGS = -s WASM=1 \
                   -s EXPORT_ES6=1 \
                   -s MODULARIZE=1 \
                   -s EXPORT_NAME="RapidJsonWasm" \
                   -s ENVIRONMENT=web,webview,worker \
                   -s USE_ES6_IMPORT_META=0 \
                   -s ALLOW_MEMORY_GROWTH=1 \
                   -s INITIAL_MEMORY=33554432 \
                   -s MAXIMUM_MEMORY=134217728 \
                   -s STACK_SIZE=1048576 \
                   -s EXPORTED_FUNCTIONS="['_malloc','_free']" \
                   -s EXPORTED_RUNTIME_METHODS="['ccall','cwrap','getValue','setValue']" \
                   -s NO_EXIT_RUNTIME=1 \
                   -s ASSERTIONS=0 \
                   -s NO_FILESYSTEM=1 \
                   -s TOTAL_STACK=8388608 \
                   -s PTHREAD_POOL_SIZE=4 \
                   -s USE_PTHREADS=1 \
                   -lembind

# Directories
SRC_DIR = .
DIST_DIR = ../../../static/wasm
RAPIDJSON_DIR = ./rapidjson/include

# Include paths
INCLUDES = -I$(RAPIDJSON_DIR)

# Source files
SOURCES = rapid-json-parser.cpp

# Output files
WASM_OUTPUT = $(DIST_DIR)/rapid-json-parser.js
WASM_BINARY = $(DIST_DIR)/rapid-json-parser.wasm

# Targets
.PHONY: all clean setup install-deps test benchmark

all: setup $(WASM_OUTPUT)

# Create output directory
setup:
	@mkdir -p $(DIST_DIR)

# Download RapidJSON if not present
install-deps:
	@if [ ! -d "rapidjson" ]; then \
		echo "Downloading RapidJSON..."; \
		curl -L https://github.com/Tencent/rapidjson/archive/refs/tags/v1.1.0.tar.gz | tar xz; \
		mv rapidjson-1.1.0 rapidjson; \
	fi

# Build WebAssembly module
$(WASM_OUTPUT): $(SOURCES)
	@echo "Building WebAssembly JSON parser..."
	$(CXX) $(CXXFLAGS) $(INCLUDES) $(EMSCRIPTEN_FLAGS) -o $(WASM_OUTPUT) $(SOURCES)
	@echo "WebAssembly build complete!"
	@echo "Output: $(WASM_OUTPUT)"
	@echo "Binary: $(WASM_BINARY)"

# Clean build artifacts
clean:
	@echo "Cleaning build artifacts..."
	@rm -f $(DIST_DIR)/rapid-json-parser.*
	@echo "Clean complete!"

# Install Emscripten (requires emsdk)
install-emscripten:
	@echo "Installing Emscripten SDK..."
	@if [ ! -d "emsdk" ]; then \
		git clone https://github.com/emscripten-core/emsdk.git; \
		cd emsdk && ./emsdk install latest && ./emsdk activate latest; \
	fi
	@echo "Emscripten installation complete!"

# Test build with sample JSON
test: $(WASM_OUTPUT)
	@echo "Running WebAssembly JSON parser test..."
	@node test-wasm-parser.js

# Run benchmarks
benchmark: $(WASM_OUTPUT)
	@echo "Running performance benchmarks..."
	@node benchmark-wasm-parser.js

# Development build with debugging
debug: CXXFLAGS = -std=c++17 -O1 -g -DDEBUG
debug: EMSCRIPTEN_FLAGS += -s ASSERTIONS=1 -s SAFE_HEAP=1 -s DEMANGLE_SUPPORT=1
debug: $(WASM_OUTPUT)

# Production build with maximum optimization
release: CXXFLAGS = -std=c++17 -O3 -DNDEBUG -flto
release: EMSCRIPTEN_FLAGS += -s AGGRESSIVE_VARIABLE_ELIMINATION=1 -s ELIMINATE_DUPLICATE_FUNCTIONS=1
release: $(WASM_OUTPUT)

# Help target
help:
	@echo "Available targets:"
	@echo "  all              - Build WebAssembly module (default)"
	@echo "  setup            - Create output directories"
	@echo "  install-deps     - Download RapidJSON dependency"
	@echo "  install-emscripten - Install Emscripten SDK"
	@echo "  clean            - Remove build artifacts"
	@echo "  test             - Run test suite"
	@echo "  benchmark        - Run performance benchmarks"
	@echo "  debug            - Build with debugging symbols"
	@echo "  release          - Build with maximum optimization"
	@echo "  help             - Show this help message"
