# C++ Error Analysis & Debugging Guide

## Overview

This guide explains how to use the C++ error checking system for analyzing compile-time and runtime errors in native components (CUDA, LibTorch, AVX2, Node.js addons). This system is designed to work similarly to `svelte-check` but for C++ components.

---

## Quick Start

### 1. Run Basic Error Check
```bash
npm run cpp:check
```

This will:
- ✅ Parse runtime errors from C++ error logger
- ✅ Run CMake build to detect compile errors
- ✅ Categorize errors by type (CUDA, LibTorch, MSVC, N-API)
- ✅ Display summary with error counts
- ✅ Export to JSON for pipeline integration

### 2. Export Errors to JSON
```bash
npm run cpp:check:json
```

Output file: `logs/cpp-errors-analysis.json`

### 3. Build C++ Components
```bash
npm run cpp:build
```

Equivalent to: `cmake --build build --config Release`

### 4. Clean Build
```bash
npm run cpp:clean
```

Removes compiled artifacts from `build/` directory.

---

## Error Logging in C++ Code

### Basic Usage

```cpp
#include "error-logger.hpp"

// Simple info logging
CPP_LOG_INFO("Starting vector processing", "VectorOps");

// Warning with file location
CPP_LOG_WARNING(__FILE__, __LINE__, "Large batch size detected", "Performance");

// Error with full context
CPP_LOG_ERROR(__FILE__, __LINE__, 0,
    "Failed to allocate GPU memory",
    "CUDA_OUT_OF_MEMORY",
    "CUDA");

// Critical error
CPP_LOG_CRITICAL("System initialization failed", "Startup");
```

### CUDA Error Checking

```cpp
#include "error-logger.hpp"
#include <cuda_runtime.h>

// Automatic error checking with CUDA_CHECK macro
float *d_data;
CUDA_CHECK(cudaMalloc(&d_data, 1024 * sizeof(float)));
CUDA_CHECK(cudaMemcpy(d_data, h_data, 1024 * sizeof(float), cudaMemcpyHostToDevice));

// Launch kernel
vectorKernel<<<gridSize, blockSize>>>(d_data);
CUDA_CHECK(cudaGetLastError());
CUDA_CHECK(cudaDeviceSynchronize());
```

**What happens on error:**
- Error logged to `logs/cpp-errors.log` as JSON
- Error printed to stderr (visible in terminal)
- Exception thrown with CUDA error message

### LibTorch Error Checking

```cpp
#include "error-logger.hpp"
#include <torch/torch.h>

// Validate tensor dimensions
auto input = torch::randn({32, 768});
TORCH_CHECK_ERROR(input.dim() == 2, "Input must be 2D tensor");
TORCH_CHECK_ERROR(input.size(1) == 768, "Input must have 768 features");

// Load model with error handling
try {
    CPP_LOG_INFO("Loading TorchScript model", "LibTorch");
    auto module = torch::jit::load("model.pt");
    module.to(torch::kCUDA);
    CPP_LOG_INFO("Model loaded successfully", "LibTorch");
} catch (const c10::Error& e) {
    CPP_LOG_ERROR(__FILE__, __LINE__, 0,
        "Model load failed: " + std::string(e.what()),
        "", "LibTorch");
    throw;
}
```

### N-API Addon Error Logging

```cpp
#include "error-logger.hpp"
#include <napi.h>

Napi::Value ProcessData(const Napi::CallbackInfo& info) {
    Napi::Env env = info.Env();

    try {
        if (info.Length() < 1) {
            CPP_LOG_ERROR(__FILE__, __LINE__, 0,
                "Missing required argument", "", "N-API");
            throw Napi::TypeError::New(env, "Argument required");
        }

        // Process data...
        CPP_LOG_INFO("Data processing completed", "N-API");
        return Napi::Boolean::New(env, true);

    } catch (const std::exception& e) {
        CPP_LOG_ERROR(__FILE__, __LINE__, 0,
            "Processing failed: " + std::string(e.what()), "", "N-API");
        throw Napi::Error::New(env, e.what());
    }
}
```

---

## Error Categories

### 1. CUDA Errors
**Common Issues:**
- Out of memory: `cudaMalloc` failures
- Invalid device ordinal: Wrong GPU selected
- Illegal memory access: Kernel accessing invalid pointers
- Launch failures: Grid/block dimension errors

**Example Output:**
```
src/native/cuda_kernels.cu:45:0 [CUDA] [error]
CUDA error: out of memory (code: 2)
```

**Debugging Strategy:**
```bash
# Check GPU memory usage
nvidia-smi

# Enable CUDA error checking
set CUDA_LAUNCH_BLOCKING=1

# Run with error logging
npm run cpp:check
```

### 2. LibTorch Errors
**Common Issues:**
- Tensor dimension mismatches
- Device placement errors (CPU vs CUDA)
- Model loading failures
- Incompatible operation types

**Example Output:**
```
src/native/libtorch_inference.cc:112:0 [LibTorch] [error]
Input must be 2D tensor
```

**Debugging Strategy:**
```bash
# Verify model compatibility
python -c "import torch; print(torch.__version__)"

# Check tensor shapes in logs
grep "LibTorch" logs/cpp-errors.log

# Rebuild with debug symbols
npm run cpp:build -- --config Debug
```

### 3. MSVC Compiler Errors
**Common Issues:**
- Missing include paths
- Undefined symbols
- Type mismatches
- Template instantiation errors

**Example Output:**
```
src/native/inference.cc(67,23): error C2664:
cannot convert argument 1 from 'float *' to 'const double *'
```

**Debugging Strategy:**
```bash
# Clean and rebuild
npm run cpp:clean
npm run cpp:build

# Check include paths
cmake --build build --target help

# Verbose compiler output
cmake --build build --config Release -- /verbosity:detailed
```

### 4. N-API Integration Errors
**Common Issues:**
- Memory leaks (unfreed `Napi::Buffer`)
- Type conversion errors (JS ↔ C++)
- Exception handling mismatches
- Thread safety violations

**Example Output:**
```
src/native/libtorch_inference.cc:234:0 [N-API] [error]
Forward pass failed: Expected Float32Array
```

**Debugging Strategy:**
```bash
# Enable N-API debugging
set NODE_DEBUG=napi

# Check for memory leaks
node --expose-gc --trace-gc test.js

# Verify addon loading
node -e "console.log(require('./build/Release/addon.node'))"
```

---

## Recommended Workflow

### Daily Development Cycle

```bash
# 1. Morning: Check for overnight build errors
npm run cpp:check

# 2. Fix errors, then rebuild
npm run cpp:build

# 3. Run integration tests
npm run test

# 4. Check for new errors before commit
npm run cpp:check:json
git add logs/cpp-errors-analysis.json
```

### CI/CD Pipeline Integration

```yaml
# .github/workflows/cpp-check.yml
name: C++ Component Check

on: [push, pull_request]

jobs:
  cpp-check:
    runs-on: windows-latest
    steps:
      - uses: actions/checkout@v3

      - name: Setup CUDA
        uses: Jimver/cuda-toolkit@v0.2.11

      - name: Configure CMake
        run: |
          cmake -S sveltekit-frontend -B sveltekit-frontend/build \
            -G "Visual Studio 17 2022" -A x64 \
            -DCMAKE_BUILD_TYPE=Release

      - name: Run C++ Error Check
        run: |
          cd sveltekit-frontend
          npm run cpp:check

      - name: Upload Error Report
        if: failure()
        uses: actions/upload-artifact@v3
        with:
          name: cpp-errors
          path: sveltekit-frontend/logs/cpp-errors-analysis.json
```

### Phase72 Pipeline Integration

```bash
# Combine with TypeScript error checking
npm run check:svelte         # TypeScript/Svelte errors
npm run cpp:check:json        # C++ errors

# Merge error reports
node scripts/merge-error-reports.mjs \
  --ts logs/svelte-errors.json \
  --cpp logs/cpp-errors-analysis.json \
  --output logs/all-errors.json

# Run Phase72 GPU pipeline
npm run phase72:gpu:pipeline
```

---

## Advanced Strategies

### 1. Error Rate Monitoring

Track error trends over time:

```bash
# scripts/monitor-cpp-errors.mjs
import fs from 'fs';
import path from 'path';

const HISTORY_FILE = 'logs/cpp-error-history.json';

export function logErrorSnapshot() {
  const analysis = JSON.parse(
    fs.readFileSync('logs/cpp-errors-analysis.json', 'utf-8')
  );

  const snapshot = {
    timestamp: new Date().toISOString(),
    totalErrors: analysis.summary.total,
    byCategory: analysis.summary.byCategory,
    bySeverity: analysis.summary.bySeverity
  };

  const history = JSON.parse(
    fs.existsSync(HISTORY_FILE)
      ? fs.readFileSync(HISTORY_FILE, 'utf-8')
      : '[]'
  );

  history.push(snapshot);
  fs.writeFileSync(HISTORY_FILE, JSON.stringify(history, null, 2));
}
```

**Usage:**
```bash
# Add to npm scripts
"cpp:check:track": "npm run cpp:check && node scripts/monitor-cpp-errors.mjs"

# Run daily
npm run cpp:check:track
```

### 2. Error Clustering with Embeddings

Generate semantic clusters of similar errors:

```bash
# scripts/cluster-cpp-errors.mjs
import { getOllamaEndpoint } from '../src/lib/config/ollama.js';

async function clusterErrors(errors) {
  const endpoint = getOllamaEndpoint();

  // Generate embeddings for error messages
  const embeddings = await Promise.all(
    errors.map(async (err) => {
      const response = await fetch(`${endpoint}/api/embeddings`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model: 'embeddinggemma:latest',
          prompt: `${err.category}: ${err.message}`
        })
      });
      const { embedding } = await response.json();
      return { error: err, vector: embedding };
    })
  );

  // Cluster using WebGPU SOM
  const clusters = await fetch('/api/v1/webgpu/cluster', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ vectors: embeddings.map(e => e.vector) })
  }).then(r => r.json());

  return clusters;
}
```

### 3. Automated Fix Suggestions

Use LLM to suggest fixes:

```bash
# scripts/suggest-cpp-fixes.mjs
import { getOllamaEndpoint } from '../src/lib/config/ollama.js';

async function suggestFix(error) {
  const endpoint = getOllamaEndpoint();

  const prompt = `
You are a C++ debugging expert. Analyze this error and suggest a fix:

File: ${error.file}
Line: ${error.line}
Category: ${error.category}
Error: ${error.message}
Code: ${error.code}

Provide:
1. Root cause analysis
2. Specific code fix
3. Prevention strategy
`;

  const response = await fetch(`${endpoint}/api/generate`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model: 'gemma3-legal:latest',
      prompt,
      stream: false
    })
  });

  const { response: suggestion } = await response.json();
  return suggestion;
}
```

**Usage:**
```bash
# Add to package.json
"cpp:suggest-fixes": "node scripts/suggest-cpp-fixes.mjs"

# Run after error check
npm run cpp:check && npm run cpp:suggest-fixes
```

### 4. GPU Memory Profiling

Track CUDA memory usage:

```cpp
// src/native/gpu-profiler.hpp
#pragma once
#include "error-logger.hpp"
#include <cuda_runtime.h>

namespace GPUProfiler {

struct MemorySnapshot {
    size_t free_bytes;
    size_t total_bytes;
    size_t used_bytes;
    std::string timestamp;
};

inline MemorySnapshot captureMemorySnapshot() {
    size_t free, total;
    CUDA_CHECK(cudaMemGetInfo(&free, &total));

    MemorySnapshot snap{
        free, total, total - free,
        ErrorLogger::getLogger().getCurrentTimestamp()
    };

    CPP_LOG_INFO(
        "GPU Memory: " + std::to_string(snap.used_bytes / 1024 / 1024) +
        " MB used / " + std::to_string(snap.total_bytes / 1024 / 1024) + " MB total",
        "GPU-Profiler"
    );

    return snap;
}

} // namespace GPUProfiler
```

**Usage:**
```cpp
#include "gpu-profiler.hpp"

// Before large allocation
auto before = GPUProfiler::captureMemorySnapshot();

// Allocate memory
float* d_data;
CUDA_CHECK(cudaMalloc(&d_data, size * sizeof(float)));

// After allocation
auto after = GPUProfiler::captureMemorySnapshot();

// Log delta
CPP_LOG_INFO(
    "Allocated " + std::to_string(after.used_bytes - before.used_bytes) + " bytes",
    "GPU-Profiler"
);
```

---

## Performance Optimization

### Reducing Error Check Overhead

```bash
# Only check on CI/pre-commit (skip in dev)
if [ "$CI" = "true" ]; then
  npm run cpp:check
fi

# Use incremental builds
cmake --build build --target myTarget

# Parallel compilation (8 cores)
cmake --build build --config Release --parallel 8
```

### Caching Build Results

```json
// .vscode/settings.json
{
  "cmake.buildDirectory": "${workspaceFolder}/build",
  "cmake.configureOnOpen": false,
  "cmake.buildBeforeRun": false
}
```

---

## Troubleshooting

### Issue: `cpp:check` hangs during build

**Solution:**
```bash
# Kill CMake processes
taskkill /F /IM cmake.exe

# Clean and reconfigure
npm run cpp:clean
cmake -S . -B build -G "Visual Studio 17 2022"
npm run cpp:build
```

### Issue: No errors detected but build fails

**Solution:**
```bash
# Check CMake output directly
cmake --build build --config Release --verbose

# Enable compiler diagnostics
set CL=/diagnostics:caret
npm run cpp:build
```

### Issue: CUDA errors not logged

**Solution:**
```bash
# Ensure CUDA_CHECK macro is used
grep -r "cudaMalloc\|cudaMemcpy" src/native/

# Verify error logger is initialized
grep "CPP_LOG_INFO.*Initializing" logs/cpp-errors.log
```

### Issue: N-API addon not loading

**Solution:**
```bash
# Check node-gyp configuration
node-gyp configure --verbose

# Verify addon exports
dumpbin /EXPORTS build/Release/addon.node

# Test loading manually
node -e "console.log(require('./build/Release/addon.node'))"
```

---

## Command Reference

### Core Commands

| Command | Description | Output |
|---------|-------------|--------|
| `npm run cpp:check` | Run full error analysis | Terminal + `logs/cpp-errors-analysis.json` |
| `npm run cpp:check:json` | Check and export JSON | `logs/cpp-errors-analysis.json` |
| `npm run cpp:build` | Build C++ components | `build/Release/*.lib`, `build/Release/*.node` |
| `npm run cpp:clean` | Clean build artifacts | Removes `build/` contents |

### Advanced Commands

| Command | Description |
|---------|-------------|
| `cmake --build build --target help` | List all build targets |
| `cmake --build build --config Debug` | Debug build with symbols |
| `cmake --build build --parallel 8` | Parallel build (8 cores) |
| `ctest --test-dir build` | Run C++ unit tests |

### Monitoring Commands

```bash
# Watch error log in real-time
Get-Content logs/cpp-errors.log -Wait

# Count errors by category
jq '.summary.byCategory' logs/cpp-errors-analysis.json

# Find top error files
jq '.summary.byFile | to_entries | sort_by(.value) | reverse | .[0:5]' logs/cpp-errors-analysis.json

# Track error trends
jq '[.[] | {date: .timestamp, total: .totalErrors}]' logs/cpp-error-history.json
```

---

## Integration with Existing Tools

### VS Code Tasks

Add to `.vscode/tasks.json`:

```json
{
  "label": "🔧 C++ Error Check",
  "type": "shell",
  "command": "npm",
  "args": ["run", "cpp:check"],
  "group": "test",
  "presentation": {
    "echo": true,
    "reveal": "always",
    "focus": false,
    "panel": "shared"
  },
  "problemMatcher": {
    "owner": "cpp",
    "fileLocation": ["relative", "${workspaceFolder}/sveltekit-frontend"],
    "pattern": {
      "regexp": "^(.+?):(\\d+):(\\d+)\\s+\\[(.+?)\\]\\s+\\[(.+?)\\]\\s+(.+)$",
      "file": 1,
      "line": 2,
      "column": 3,
      "severity": 5,
      "message": 6
    }
  }
}
```

### Pre-commit Hook

```bash
# .git/hooks/pre-commit
#!/bin/bash
cd sveltekit-frontend

echo "🔍 Running C++ error check..."
if ! npm run cpp:check; then
  echo "❌ C++ errors detected. Commit aborted."
  echo "Run 'npm run cpp:check' to see details."
  exit 1
fi

echo "✅ C++ check passed"
exit 0
```

### Phase72 Integration

```bash
# scripts/phase72-with-cpp.mjs
import { execSync } from 'child_process';
import fs from 'fs';

// Run TypeScript check
execSync('npx svelte-check --output json > logs/ts-errors.json', { stdio: 'inherit' });

// Run C++ check
execSync('npm run cpp:check:json', { stdio: 'inherit' });

// Merge reports
const tsErrors = JSON.parse(fs.readFileSync('logs/ts-errors.json', 'utf-8'));
const cppErrors = JSON.parse(fs.readFileSync('logs/cpp-errors-analysis.json', 'utf-8'));

const merged = {
  timestamp: new Date().toISOString(),
  summary: {
    typescript: tsErrors.summary,
    cpp: cppErrors.summary,
    total: tsErrors.summary.total + cppErrors.summary.total
  },
  errors: {
    typescript: tsErrors.errors,
    cpp: cppErrors.errors
  }
};

fs.writeFileSync('logs/all-errors.json', JSON.stringify(merged, null, 2));
console.log(`✅ Merged ${merged.summary.total} total errors`);
```

---

## Best Practices

### 1. Log Early and Often
```cpp
// ❌ Don't wait for failure
try {
    auto result = riskyOperation();
    return result;
} catch (...) {
    CPP_LOG_ERROR(...);
}

// ✅ Log at each step
CPP_LOG_INFO("Starting risky operation", "Component");
auto result = riskyOperation();
CPP_LOG_INFO("Risky operation completed", "Component");
return result;
```

### 2. Use Specific Error Categories
```cpp
// ❌ Generic category
CPP_LOG_ERROR(__FILE__, __LINE__, 0, "Operation failed", "", "General");

// ✅ Specific category for filtering
CPP_LOG_ERROR(__FILE__, __LINE__, 0, "CUDA kernel launch failed", "", "CUDA-Kernel");
```

### 3. Include Context in Messages
```cpp
// ❌ Vague message
CPP_LOG_ERROR(__FILE__, __LINE__, 0, "Invalid input", "", "Validation");

// ✅ Detailed message
CPP_LOG_ERROR(__FILE__, __LINE__, 0,
    "Invalid input tensor shape: got [" + std::to_string(dim0) + ", " +
    std::to_string(dim1) + "], expected [32, 768]", "", "Validation");
```

### 4. Clean Up Error Logs Periodically
```bash
# Clean logs older than 7 days
find logs/ -name "cpp-errors*.log" -mtime +7 -delete

# Archive old error reports
tar -czf logs/archive-$(date +%Y%m%d).tar.gz logs/cpp-errors-analysis-*.json
```

---

## Next Steps

1. **Set up automated error checking**: Add `cpp:check` to your CI/CD pipeline
2. **Configure pre-commit hooks**: Prevent commits with C++ errors
3. **Integrate with Phase72**: Merge C++ and TypeScript error analysis
4. **Enable GPU profiling**: Track CUDA memory usage over time
5. **Implement fix suggestions**: Use LLM to suggest automated fixes

For more information, see:
- [Phase72 Documentation](./PHASE72_HOWTO.md)
- [Phase77 AI Integration](./PHASE77_AUTOFIX_GUIDE.md)
- [Technology Stack Integration](../../TECH-STACK-INTEGRATION.md)
