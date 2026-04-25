# AssemblyScript (ASM) Quick Reference Guide

## ✅ Installation Complete

AssemblyScript environment has been successfully installed and verified.

## 📦 What Was Installed

- **AssemblyScript Compiler**: v0.28.9 (asc command)
- **Binaryen Optimizer**: v124 (wasm-opt command)
- **WASM Parser Tools**: @webassemblyjs/wasm-parser, @webassemblyjs/ast
- **Build Configuration**: asconfig.json with 7 build targets

## 📁 Directory Structure

```
sveltekit-frontend/
├── assembly/                      # AssemblyScript source files
│   ├── index.ts                   # Default entry point
│   ├── vector-ops.ts              # GPU-optimized vector operations
│   ├── tsconfig.json              # AS TypeScript config
│   └── tests/                     # Test files
├── src/wasm/
│   └── vector-operations.ts       # Main WASM module (14KB)
├── build/
│   └── vector-ops.wasm            # Compiled output (5.2KB)
├── static/wasm/
│   └── vector-ops.wasm            # Production WASM (7.1KB)
└── asconfig.json                  # Build targets configuration
```

## 🔧 Available Commands

### Build Commands
```bash
# Production build (optimized)
npm run build:wasm

# Debug build (with source maps)
npm run build:wasm:debug

# Build with standard targets
npm run asbuild:release
npm run asbuild:debug

# Manual compilation
npx asc assembly/vector-ops.ts --target release
npx asc src/wasm/vector-operations.ts -o static/wasm/vector-ops.wasm -O3

# Optimize further with Binaryen
wasm-opt build/vector-ops.wasm -O3 -o build/vector-ops.opt.wasm
```

### Verification
```bash
# Run complete environment check
node scripts/verify-asm-complete.mjs

# Check version
npx asc --version

# Test WASM loading
node scripts/verify-wasm.mjs
```

## 🚀 Build Targets (asconfig.json)

1. **debug**: Development build with source maps
2. **release**: Production optimized build
3. **vector-ops**: Vector similarity operations
4. **legal-parser**: Legal document parsing
5. **legal-parser-simd**: SIMD-optimized parser
6. **vector-operations**: Main vector operations module
7. **simd-json-parser**: SIMD JSON parsing

## 🧩 Exported WASM Functions

The compiled `vector-ops.wasm` exports:

- `cosineSimilarity(a, b)` - Cosine similarity between vectors
- `euclideanDistance(a, b)` - Euclidean distance
- `dotProduct(a, b)` - Dot product
- `manhattanDistance(a, b)` - Manhattan distance
- `normalize(vec)` - Normalize vector to unit length
- `zScoreNormalize(vec)` - Z-score normalization
- `computeBatchSimilarity(query, docs)` - Batch similarity
- `batchNormalizeVectors(vecs)` - Batch normalization
- `hashEmbedding(vec)` - Vector hashing
- `allocateVectorMemory(size)` - Memory allocation

## 📝 Usage in TypeScript/SvelteKit

### Browser Import
```typescript
// Fetch and instantiate WASM module
const wasmModule = await WebAssembly.instantiateStreaming(
  fetch('/wasm/vector-ops.wasm'),
  {
    env: {
      abort: () => console.error('WASM abort')
    }
  }
);

// Use exported functions
const similarity = wasmModule.instance.exports.cosineSimilarity(vec1, vec2);
```

### Node.js Import
```typescript
import fs from 'fs';

const wasmBuffer = fs.readFileSync('./static/wasm/vector-ops.wasm');
const wasmModule = await WebAssembly.instantiate(wasmBuffer);

const { cosineSimilarity } = wasmModule.instance.exports;
const result = cosineSimilarity(queryVector, documentVector);
```

## 🔄 Development Workflow

1. **Edit AssemblyScript source**: `assembly/vector-ops.ts` or `src/wasm/vector-operations.ts`
2. **Compile to WASM**: `npm run build:wasm`
3. **Verify compilation**: Check `static/wasm/vector-ops.wasm` exists
4. **Test in browser**: Import in Svelte component
5. **Optimize**: Use `wasm-opt` for production

## 🎯 Phase 35+ Integration

AssemblyScript is now ready for:

- **Phase 35**: WASM module repair and optimization
- **Phase 36**: GPU-accelerated vector operations
- **Phase 37**: SIMD-optimized legal document parsing
- **Phase 38**: WebAssembly inference pipeline
- **Phase 40**: TensorRT/WebGPU integration

## 🐛 Troubleshooting

### "Could not determine executable to run"
```bash
# Reinstall AssemblyScript
npm install --save-dev assemblyscript

# Verify installation
npx asc --version
```

### Build errors
```bash
# Check source file exists
ls src/wasm/vector-operations.ts

# Verify package.json scripts
npm run build:wasm -- --help
```

### WASM instantiation errors
```bash
# Check imports object
const wasmModule = await WebAssembly.instantiate(buffer, {
  env: {
    abort: (msg, file, line, col) => console.error('Abort:', msg)
  }
});
```

## 📚 Resources

- **AssemblyScript Docs**: https://www.assemblyscript.org/
- **WebAssembly MDN**: https://developer.mozilla.org/en-US/docs/WebAssembly
- **SIMD Guide**: https://v8.dev/features/simd
- **Binaryen Tools**: https://github.com/WebAssembly/binaryen

## ✅ Current Status

- ✅ AssemblyScript v0.28.9 installed
- ✅ Binaryen v124 installed
- ✅ 7 build targets configured
- ✅ 18 verification checks passed
- ✅ WASM modules compiled (5.2KB + 7.1KB)
- ✅ Vector operations exported (10+ functions)
- ⚠️  1 warning: assembly/tests directory created

**Environment Status**: READY ✅

Next: Run Phase 35 repairs with `.\scripts\fix-phase35-wasm.ps1`
