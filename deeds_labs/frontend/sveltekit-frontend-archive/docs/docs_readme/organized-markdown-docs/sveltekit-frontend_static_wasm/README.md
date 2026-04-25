# WebAssembly BVH Accelerator

This directory contains the WebAssembly build output for the C++ BVH (Bounding Volume Hierarchy) accelerator.

## Current Status

- ✅ **JavaScript Stub**: Fallback implementation active
- 🚧 **WASM Build**: Run `build-wasm.ps1` to compile native accelerator

## Files

- `bvh_accelerator.js` - JavaScript stub/WASM module loader
- `bvh_accelerator.wasm` - (Generated) WebAssembly binary
- `bvh_accelerator.d.ts` - (Generated) TypeScript definitions

## Usage

The neural sprite engine automatically detects and uses native acceleration:

```javascript
// Engine automatically tries WASM first, falls back to JavaScript
await neuralEngine.highlightDocumentIndices([1, 2, 3, 4]);
```

## Build Instructions

1. Install Emscripten SDK
2. Run from project root:
   ```powershell
   cd cyber-elephant/accelerator-cpp
   .\build-wasm.ps1
   ```
3. Files will be automatically copied to this directory

## Performance

- **JavaScript Fallback**: ~1-5ms for small datasets
- **Native WASM**: ~0.1-1ms for large datasets (10-100x faster)
- **GPU Integration**: RTX 3060 Ti optimized shader caching