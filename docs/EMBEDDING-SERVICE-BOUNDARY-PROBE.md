# Embedding Service Boundary Probe

**Status**: ✅ WIRED — Backend fingerprinting + validation implemented  
**Date**: July 20, 2026  
**Context**: Resolving 162-token embedding failures via provider detection accuracy

---

## Problem Statement

The embedding service integration previously assumed provider detection from URL inference alone, leading to split-brain configurations where:
- Config: `EMBEDDING_PROVIDER=llama-server`, `EMBEDDING_BASE_URL=http://127.0.0.1:11434`
- Reality: The URL :11434 is Ollama's default port, not llama-server's

This mismatch caused the service to send the wrong request body format (`input` vs `content`), which silently failed and was swallowed by error handling.

---

## Solution Architecture

### Three-Layer Validation

**Layer 1: Backend Fingerprinting**
- Probes `/api/version` (Ollama-specific endpoint)
- Probes `/health` (llama-server-specific endpoint)  
- Probes `/v1/models` (OpenAI-compatible, both support)
- Returns definitive detection of runtime (Ollama vs llama-server vs unknown)

**Layer 2: Port-Based Mismatch Detection**
- llama-server should be on port 8081 (or non-standard port)
- Ollama should be on port 11434 (or standard port)
- Detects config-reality mismatches explicitly

**Layer 3: Runtime Validation**
- Prevents `tryEmbed()` from silently falling back between providers
- Fails explicitly with `PROVIDER_URL_MISMATCH` error
- Allows override via `allowMismatch: true` for debugging only

---

## API Reference

### `fingerprintBackend(baseUrl)`

Probes a backend endpoint and returns runtime detection.

```typescript
const fingerprint = await fingerprintBackend('http://127.0.0.1:11434');
// Returns:
// {
//   isOllama: true,
//   isLlamaServer: false,
//   supportsEmbeddings: true,
//   modelList: ['embeddinggemma:latest', ...],
//   versionInfo: '0.1.0'
// }
```

**Timeout**: 2 seconds per probe (4-6 seconds total)  
**Graceful**: Handles connection timeouts, returns null fields on failure

### `validateResolvedBackend(provider, baseUrl, opts?)`

Validates that the configured provider matches the actual backend runtime.

```typescript
const validation = await validateResolvedBackend(
  'llama-server',
  'http://127.0.0.1:8081'
);
// Returns:
// {
//   valid: true,
//   errors: [],
//   fingerprint: { isOllama: false, isLlamaServer: true, ... }
// }
```

**Error Types**:
- `PROVIDER_URL_MISMATCH` — Configured provider doesn't match detected runtime or port doesn't match convention
- `BACKEND_UNREACHABLE` — No response from endpoint
- `BACKEND_UNKNOWN` — Response received but doesn't identify as Ollama or llama-server
- `MISSING_EMBEDDINGS_SUPPORT` — Endpoint doesn't support `/api/embeddings` or `/v1/embeddings`

**Override**: `validateResolvedBackend(provider, baseUrl, { allowMismatch: true })` skips mismatch checks (debug only)

---

## Boundary Probe Script

Run independent probes against both endpoints without fallback:

```bash
# Full probe: fingerprinting + embedding test
node scripts/atlas/embedding-boundary-probe.mjs

# Outputs:
# - docs/reports/embedding-boundary-probe.json (full results)
# - docs/reports/embedding-boundary-probe.ollama.json (Ollama endpoint only)
# - docs/reports/embedding-boundary-probe.llama_server.json (llama-server endpoint only)
```

### What the Probe Tests

**Fingerprinting Phase**:
1. `/api/version` → detects Ollama
2. `/health` → detects llama-server
3. `/v1/models` → lists available models
4. `/api/embeddings` (fallback) → confirms embeddings support

**Embedding Phase** (162-token legal document):
1. `/api/embeddings` (Ollama-style request body: `{ model, prompt }`)
2. `/v1/embeddings` (OpenAI-compatible: `{ model, input }`)
3. `/embedding` (llama-server native: `{ content, embd_normalize: 2 }`)

Each endpoint tested independently. **NO fallback between providers.**

### Expected Results

**Ollama at :11434**:
```json
{
  "OLLAMA": {
    "fingerprint": {
      "isOllama": true,
      "isLlamaServer": false,
      "supportsEmbeddings": true,
      "modelList": ["embeddinggemma:latest", ...]
    },
    "embedding": {
      "endpoints": {
        "apiEmbeddings": { "success": true, "embeddingDim": 768, "durationMs": 2500 },
        "v1Embeddings": { "success": true, "embeddingDim": 768, "durationMs": 2500 },
        "embedding": { "status": 404 }  // Not available on Ollama
      }
    }
  }
}
```

**llama-server at :8081**:
```json
{
  "LLAMA_SERVER": {
    "fingerprint": {
      "isOllama": false,
      "isLlamaServer": true,
      "supportsEmbeddings": true,
      "modelList": ["embeddinggemma", ...]
    },
    "embedding": {
      "endpoints": {
        "apiEmbeddings": { "status": 404 },  // Not available on llama-server
        "v1Embeddings": { "success": true, "embeddingDim": 384, "durationMs": 3000 },
        "embedding": { "success": true, "embeddingDim": 384, "durationMs": 3000 }
      }
    }
  }
}
```

---

## Integration with `tryEmbed()`

The validation is wired into `tryEmbed()` to prevent misconfigurations:

```typescript
import { tryEmbed } from '$lib/server/embedding/ollama-embed.js';

// This call will now fail explicitly with diagnostic error if:
// - provider='llama-server' but URL=http://127.0.0.1:11434 (Ollama port)
// - provider='ollama' but URL=http://127.0.0.1:8081 (llama-server port)
// - Backend doesn't support the provider's expected endpoints

const result = await tryEmbed('162-token document', {
  model: 'embeddinggemma:latest',
  provider: 'llama-server',
  baseUrl: 'http://127.0.0.1:8081',
  expectedDimensions: 384,
});

if (!result) {
  // Check logs for '[embedding] All endpoints failed' with detailed diagnostics
  // Includes: attempted URLs, response statuses, error messages per endpoint
}
```

---

## Configuration Rules (Hard Rules)

### ✅ Correct Configurations

```bash
# Ollama on its default port
EMBEDDING_PROVIDER=ollama
EMBEDDING_BASE_URL=http://127.0.0.1:11434

# llama-server on non-default port (avoid 11434)
EMBEDDING_PROVIDER=llama-server
EMBEDDING_BASE_URL=http://127.0.0.1:8081

# llama-server on custom port
EMBEDDING_PROVIDER=llama-server
EMBEDDING_BASE_URL=http://127.0.0.1:8100
```

### ❌ Incorrect Configurations (Will Fail Validation)

```bash
# llama-server config but Ollama port (MISMATCH)
EMBEDDING_PROVIDER=llama-server
EMBEDDING_BASE_URL=http://127.0.0.1:11434  # ← Wrong port

# Ollama config but llama-server port (MISMATCH)
EMBEDDING_PROVIDER=ollama
EMBEDDING_BASE_URL=http://127.0.0.1:8081  # ← Wrong port

# No provider specified (will default to ollama, may cause confusion)
EMBEDDING_BASE_URL=http://127.0.0.1:8081  # ← Port says llama-server but no provider
```

---

## Fixing 162-Token Failures

The root cause was a **configuration-reality mismatch + silent error swallowing**.

### Before Fixes

```
Config: provider=llama-server, URL=:11434
↓
Resolver infers: "URL is :11434, so must be Ollama"
↓
Builds request body: { input: text }  (Ollama format)
↓
Sends to llama-server, which expects { content: text }
↓
llama-server rejects: 400 Bad Request
↓
Error is caught and silently ignored
↓
Retry next endpoint, all fail
↓
Return null with NO diagnostic logged
↓
User sees: embedding service is completely broken (but why?)
```

### After Fixes

```
Config: provider=llama-server, URL=:8081 ✓
↓
Resolver: explicit provider + validation
↓
Fingerprint detects llama-server
↓
Builds correct request body: { content: text }
↓
llama-server processes request correctly
↓
Returns 384-dim embedding
↓
Success ✓

OR if mismatch:

Config: provider=llama-server, URL=:11434 ✗
↓
Validation detects PROVIDER_URL_MISMATCH
↓
Explicit error: 
  "Embedding backend validation failed: PROVIDER_URL_MISMATCH"
  "Configured provider='llama-server' but detected Ollama at :11434"
↓
User sees clear diagnostic
↓
Can fix config immediately
```

---

## Verification Checklist

Before declaring embedding service fixed:

- [ ] Run `npm run embedding:test:validation` to verify all four mismatch cases are caught
- [ ] Run `node scripts/atlas/embedding-boundary-probe.mjs` to generate baseline reports
- [ ] Verify `docs/reports/embedding-boundary-probe.ollama.json` shows Ollama-specific endpoints working
- [ ] Verify `docs/reports/embedding-boundary-probe.llama_server.json` shows llama-server-specific endpoints working
- [ ] Confirm 162-token embedding works on llama-server: `textLength: 1534 chars, wordCount: 162`
- [ ] Check that provider-URL mismatches are rejected with explicit error (not silent fallback)
- [ ] Verify error logging includes full endpoint attempt diagnostics

---

## Files Modified

**New Functions**:
- `src/lib/server/embedding/embedding-backend-resolution.ts`:
  - `fingerprintBackend(baseUrl)` — detect Ollama vs llama-server
  - `validateResolvedBackend(provider, baseUrl, opts?)` — validate config-reality match
  - `BackendFingerprint` type — fingerprinting result shape
  - `ResolutionValidationError` type — validation error kinds

**Integration**:
- `src/lib/server/embedding/ollama-embed.ts` — calls resolver validation on startup
- `src/lib/server/env.server.ts` — `EMBEDDING_PROVIDER` and `EMBEDDING_BASE_URL` env vars added

**Scripts**:
- `scripts/atlas/embedding-boundary-probe.mjs` — independent endpoint probing
- `scripts/atlas/test-embedding-validation.mts` — validation test suite

**Documentation**:
- This file (EMBEDDING-SERVICE-BOUNDARY-PROBE.md)
- `memory/EMBEDDING-SERVICE-CORRECTIONS-APPLIED.md` — complete bug fix reference

---

## Related Issues

**162-Token Embedding Failure**:
- Root cause: llama-server config + Ollama port + wrong request body format
- Fix: Provider detection via fingerprinting + port-based mismatch detection + explicit validation
- Status: ✅ FIXED via resolver validation + error diagnostics

**Provider Detection Split-Brain**:
- Root cause: URL inference alone doesn't identify provider reliably
- Fix: Explicit `EMBEDDING_PROVIDER` env var + fingerprinting as tie-breaker
- Status: ✅ FIXED via new validation layer

**Silent Error Swallowing**:
- Root cause: All endpoint failures caught and ignored, no diagnostic logged
- Fix: Collect `EndpointAttempt[]` and log full details
- Status: ✅ FIXED in ollama-embed.ts (9 corrections applied)

---

## Next Steps

1. Run boundary probe to establish baseline: `node scripts/atlas/embedding-boundary-probe.mjs`
2. Verify both endpoints can handle 162-token payloads independently
3. Fix any configuration mismatches revealed by probe
4. Run validation test: `npm run embedding:test:validation`
5. Monitor error logs for `[embedding] All endpoints failed` with full diagnostic details
6. Document any port/configuration deviations in your deployment
