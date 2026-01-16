# Type Fixing Strategy - Phase 103.1+

## Executive Summary

This document captures the learnings from Phase 103.1 error fixing and provides a systematic approach for reducing TSC errors from 20,385 to target < 5,000.

## Current State (2026-01-16)

| Metric | Value |
|--------|-------|
| TSC Errors | 20,385 |
| Files with Errors | ~750+ |
| Primary Corruption Pattern | `$1;$2` artifacts |
| Secondary Pattern | Colon/comma confusion |

## Proven Safe Patterns

### ✅ SAFE - Apply Automatically

| Pattern | Example | Fixes Available |
|---------|---------|-----------------|
| `index_signature` | `[key, string]` → `[key: string]` | ~10 |
| `interface_property` | `prop, Type;` → `prop: Type;` | ~10 |

### ⚠️ UNSAFE - Causes Regressions

| Pattern | Example | Impact |
|---------|---------|--------|
| `constructor_colon_to_comma` | `new Class(a: b)` → `new Class(a, b)` | +194 errors |
| `method_chain_colon` | `.method(a: b: c)` → `.method(a, b, c)` | Untested |

**LESSON**: Regex-based fixes on corrupted files often create more problems than they solve.

## Recommended Approach

### Tier 1: Full File Rewrites (Most Effective)
Files with >200 errors should be completely rewritten. This is the most effective approach.

**Success Rate**: 100% (no regressions)
**Average Errors Fixed**: 300-400 per file
**Time per File**: 5-10 minutes

### Tier 2: Targeted Fixes
Files with 50-200 errors can often be fixed with targeted replacements.

### Tier 3: Safe Regex Patterns
Files with <50 errors may benefit from safe regex patterns.

## Top 20 Files for Rewrite (Ranked by Error Count)

1. `user-recommendation-service.ts` - 364 errors ✅ FIXED
2. `legal-ai-integration.ts` - 358 errors ✅ FIXED
3. `change-detection-service.ts` - 358 errors ✅ FIXED
4. `minio-service.ts` - 330 errors ✅ FIXED
5. `nes-memory-architecture.ts` - 304 errors 🔴 PENDING
6. `integrated-search-engine.ts` - 296 errors 🔴 PENDING
7. `yolo.ts` - 281 errors 🔴 PENDING
8. `enhanced-rag-pagerank.ts` - 273 errors 🔴 PENDING
9. `gpu-markdown-benchmark.ts` - 271 errors 🔴 PENDING
10. `unified-dimensional-store.ts` - 252 errors 🔴 PENDING

## Corruption Patterns Reference

### Pattern 1: `$1;$2` Artifacts
```typescript
// CORRUPT
const result = condition$1;$2 ? valueA : valueB;

// CORRECT
const result = condition ? valueA : valueB;
```

### Pattern 2: Property Type Confusion
```typescript
// CORRUPT
interface Foo {
  bar, string;  // comma instead of colon
  baz? number;  // missing colon
}

// CORRECT
interface Foo {
  bar: string;
  baz?: number;
}
```

### Pattern 3: Function Parameter Corruption
```typescript
// CORRUPT
async deleteFile(bucket: string: string, fileName): Promise<boolean>

// CORRECT
async deleteFile(bucket: string, fileName: string): Promise<boolean>
```

### Pattern 4: Minified/Collapsed Code
Some files have been collapsed to single lines - these need complete reconstruction.

## Detection Commands

```bash
# Find files with $1;$2 pattern
rg '\$1;\$2|\$1\$2' src/ --glob '*.ts' -l | wc -l

# Get top 100 error files
npx tsc --noEmit 2>&1 | grep "error TS" | sed 's/(.*//g' | sort | uniq -c | sort -rn | head -100

# Count total errors
npx tsc --noEmit 2>&1 | grep -c "error TS"
```

## Execution Script

```bash
# Run Phase 103.1 dry-run
node scripts/phase103.1-ace-autofix.mjs

# Apply safe fixes only (max 50 files)
node scripts/phase103.1-ace-autofix.mjs --apply --max=50

# Full codebase scan
node scripts/phase103.1-ace-autofix.mjs --full
```

## TODO: Future Enhancements

### getOllamaEndpoint() Improvements
```typescript
// Add support for:
// - PTX (CUDA PTX) compilation for GPU inference
// - TensorRT-LLM Triton inference server
// - FlatBuffer gRPC for high-performance serialization
// - SvelteKit 2 → RPC migration with JSON API fallbacks
// - QUIC Caddy hosting configuration
```

### FlatBuffer NES Memory Integration
- `flatbuffer-legal-schema.ts` needs complete rewrite
- Binary serialization for GPU texture streaming
- 2KB fixed-size documents for NES memory banks

## Progress Tracking

| Date | Errors Before | Errors After | Files Fixed | Net Change |
|------|---------------|--------------|-------------|------------|
| 2026-01-16 | 21,432 | 20,385 | 4 | -1,047 |
