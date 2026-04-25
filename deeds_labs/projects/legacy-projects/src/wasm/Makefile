# WebAssembly SIMD Compilation for Legal AI Platform
# Uses Emscripten to compile C SIMD operations to WebAssembly

# Emscripten paths (adjust if installed elsewhere)
EMSDK_PATH ?= /usr/local/emsdk
EMCC ?= emcc

# Compilation flags for SIMD optimization
CFLAGS = -O3 \
         -msimd128 \
         -msse4.2 \
         -mavx2 \
         -ffast-math \
         -flto \
         -DNDEBUG \
         -s WASM=1 \
         -s MODULARIZE=1 \
         -s EXPORT_ES6=1 \
         -s ENVIRONMENT='web,node' \
         -s ALLOW_MEMORY_GROWTH=1 \
         -s INITIAL_MEMORY=67108864 \
         -s MAXIMUM_MEMORY=2147483648 \
         -s EXPORTED_FUNCTIONS='["_vector_dot_product","_cosine_similarity","_batch_cosine_similarity","_euclidean_distance","_batch_euclidean_distance","_normalize_vector","_batch_normalize","_matrix_multiply","_softmax","_score_legal_documents","_top_k_indices","_alloc_float_array","_alloc_int_array","_free_array","_process_embedding_batch"]' \
         -s EXPORTED_RUNTIME_METHODS='["ccall","cwrap","getValue","setValue","UTF8ToString","stringToUTF8","malloc","free"]'

# Source and output files
SRC = simd_ops.c
OUTPUT = simd_ops.js
WASM_OUTPUT = simd_ops.wasm

# Build targets
.PHONY: all clean build install-deps

all: build

build: $(OUTPUT) $(WASM_OUTPUT)

$(OUTPUT) $(WASM_OUTPUT): $(SRC)
	@echo "Compiling SIMD operations to WebAssembly..."
	$(EMCC) $(CFLAGS) $(SRC) -o $(OUTPUT)
	@echo "WebAssembly SIMD module compiled successfully!"
	@echo "Output files: $(OUTPUT), $(WASM_OUTPUT)"

# Alternative build with SIMD128 intrinsics (more explicit)
build-simd128: $(SRC)
	@echo "Compiling with explicit SIMD128 intrinsics..."
	emcc -O3 \
	     -msimd128 \
	     -ffast-math \
	     -flto \
	     -DNDEBUG \
	     -s WASM=1 \
	     -s MODULARIZE=1 \
	     -s EXPORT_ES6=1 \
	     -s ENVIRONMENT='web,node' \
	     -s ALLOW_MEMORY_GROWTH=1 \
	     -s INITIAL_MEMORY=67108864 \
	     -s MAXIMUM_MEMORY=2147483648 \
	     -s EXPORTED_FUNCTIONS='["_vector_dot_product","_cosine_similarity","_batch_cosine_similarity","_euclidean_distance","_batch_euclidean_distance","_normalize_vector","_batch_normalize","_matrix_multiply","_softmax","_score_legal_documents","_top_k_indices","_alloc_float_array","_alloc_int_array","_free_array","_process_embedding_batch"]' \
	     -s EXPORTED_RUNTIME_METHODS='["ccall","cwrap","getValue","setValue","UTF8ToString","stringToUTF8","malloc","free"]' \
	     $(SRC) -o $(OUTPUT)

# Debug build with verbose output
debug: $(SRC)
	@echo "Debug build with verbose output..."
	emcc -O0 \
	     -g \
	     -s ASSERTIONS=1 \
	     -s SAFE_HEAP=1 \
	     -s WASM=1 \
	     -s MODULARIZE=1 \
	     -s EXPORT_ES6=1 \
	     -s ENVIRONMENT='web,node' \
	     -s ALLOW_MEMORY_GROWTH=1 \
	     -s EXPORTED_FUNCTIONS='["_vector_dot_product","_cosine_similarity","_batch_cosine_similarity","_euclidean_distance","_batch_euclidean_distance","_normalize_vector","_batch_normalize","_matrix_multiply","_softmax","_score_legal_documents","_top_k_indices","_alloc_float_array","_alloc_int_array","_free_array","_process_embedding_batch"]' \
	     -s EXPORTED_RUNTIME_METHODS='["ccall","cwrap","getValue","setValue","UTF8ToString","stringToUTF8","malloc","free"]' \
	     $(SRC) -o $(OUTPUT)

# Test compilation
test-compile:
	@echo "Testing Emscripten compilation..."
	emcc --version
	@echo "Emscripten is available and working!"

# Clean build artifacts
clean:
	@echo "Cleaning WebAssembly build artifacts..."
	rm -f $(OUTPUT) $(WASM_OUTPUT)
	rm -f *.wasm *.js.map

# Install Emscripten dependencies (if using package manager)
install-deps:
	@echo "Installing Emscripten dependencies..."
	@echo "Please ensure Emscripten SDK is installed and activated:"
	@echo "git clone https://github.com/emscripten-core/emsdk.git"
	@echo "cd emsdk && ./emsdk install latest && ./emsdk activate latest"
	@echo "source ./emsdk_env.sh"

# Performance benchmark target
benchmark: build
	@echo "WebAssembly SIMD module ready for benchmarking!"
	@echo "Use Node.js to test: node -e \"import('./simd_ops.js').then(m => m.default()).then(wasm => { /* benchmark code */ })\""

# Help target
help:
	@echo "WebAssembly SIMD Compilation Makefile"
	@echo ""
	@echo "Targets:"
	@echo "  all          - Build optimized WebAssembly SIMD module"
	@echo "  build        - Same as all"
	@echo "  build-simd128- Build with explicit SIMD128 intrinsics"
	@echo "  debug        - Build debug version with assertions"
	@echo "  test-compile - Test Emscripten installation"
	@echo "  clean        - Remove build artifacts"
	@echo "  install-deps - Show Emscripten installation instructions"
	@echo "  benchmark    - Build and show benchmarking instructions"
	@echo "  help         - Show this help message"
	@echo ""
	@echo "Environment variables:"
	@echo "  EMSDK_PATH   - Path to Emscripten SDK (default: /usr/local/emsdk)"
	@echo "  EMCC         - Emscripten compiler path (default: emcc)"