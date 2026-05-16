# ACE Startup Infrastructure & CUDA Bridge Wiring

**Status:** Verified Operational  
**Verified date:** 2026-05-15  
**Stack:** SvelteKit 2 + N-API bridge using LibTorch / TensorRT-style scoring + simdjson + Port `8101` Topology Server

Recommended location:

```text
sveltekit-frontend/docs/ACE_STARTUP_CUDA_BRIDGE.md
```

Optional short link from root docs:

```text
README.md → docs/ACE_STARTUP_CUDA_BRIDGE.md
CLAUDE.md → ACE startup / native bridge safety notes
```

---

## Purpose

This document records the operational wiring for the ACE startup path, the LibTorch CUDA bridge, the topology search server, and the native JSON parsing path. It is intended to prevent regressions where a startup smoke test passes superficially while the native bridge, topology router, or inference logging path silently fails.

The key principle is:

> ACE should fail open to safe CPU or fallback logic when native GPU helpers are unavailable, but diagnostics must clearly report which path was used.

---

## Architecture Summary

```text
SvelteKit 2 server runtime
  ↓
src/lib/server/env.server.ts
  ↓
ACE / KAG / topology routing services
  ↓
Topology Search Server :8101
  ↓
Optional native acceleration
  ├─ LibTorch / TensorRT-style N-API bridge
  ├─ simdjson fast JSON parsing
  └─ CPU fallback path
  ↓
Inference logging / diagnostics
  ├─ CouchDB :5984
  ├─ Postgres proxy :5434
  └─ TurboQuant / llama-server :8090 optional GPU boost
```

---

## LibTorch CUDA Bridge: Path Regression Trap

The LibTorch reranker uses a native N-API bridge named:

```text
tensorrt_bridge.node
```

This bridge provides fast GPU-side attention scoring / reranking support. Because the server-side AI services are deeply nested, pathing to this binary is a frequent point of failure.

### Regression Fixed

**Affected file:**

```text
src/lib/server/ai/libtorch-reranker.ts
```

**Problem:**  
The file previously used `../../../../` to resolve the project root.

**Root cause:**  
From:

```text
src/lib/server/ai/
```

four `..` segments only reach:

```text
sveltekit-frontend/
```

However, the native bridge lives outside the frontend folder at the monorepo root:

```text
simd-bridge/
```

**Fix:**  
The path was upgraded to five levels:

```text
../../../../../simd-bridge/...
```

This reaches the monorepo root before entering `simd-bridge`.

---

## Recommended Future Wiring

### Prefer `process.cwd()` for service-local absolute resolution

For scripts or services that run from the `sveltekit-frontend` directory, prefer:

```ts
path.resolve(process.cwd(), '../simd-bridge/cpp/build/Release/tensorrt_bridge.node')
```

instead of file-relative paths such as:

```ts
path.resolve(__dirname, '../../../../simd-bridge/...')
```

Reason: `process.cwd()` is more robust for service entrypoints that are always launched from `sveltekit-frontend`, while relative `require()` paths are fragile because they depend on the source file location.

### Use silent fallback with visible warnings

Native bridge loading should never crash the whole ACE server path unless the current command is an explicit native verification command.

Recommended pattern:

```ts
let nativeBridge: unknown | null = null;
let nativeBridgeMode: 'native' | 'fallback' = 'fallback';

try {
  const bridgePath = path.resolve(
    process.cwd(),
    '../simd-bridge/cpp/build/Release/tensorrt_bridge.node'
  );

  nativeBridge = require(bridgePath);
  nativeBridgeMode = 'native';
} catch (err) {
  console.warn(
    '[libtorch-reranker] native bridge unavailable; falling back to CPU path',
    err instanceof Error ? err.message : err
  );
}
```

Rules:

- Use `console.warn`, not `console.error`, for optional native fallback.
- Do not crash the process when the CPU fallback is valid.
- Do crash only in explicit verification scripts such as `scratch/verify-libtorch.mjs`.
- Surface the selected mode in diagnostics.

### Add diagnostic metadata

Use existing inference logging or diagnostics paths to report whether the runtime selected:

```text
native
```

or:

```text
fallback
```

Recommended diagnostic fields:

```ts
{
  bridge: 'libtorch-reranker',
  bridgeMode: 'native' | 'fallback',
  bridgePath,
  nativeAddonLoaded: boolean,
  simdjsonAvailable: boolean,
  cudaAvailable: boolean | 'unknown'
}
```

Good places to surface this:

```text
logInference
ollama-diag
startup health check
smoke:hypergraph-routing
```

---

## gRPC vs JSON vs N-API TypedArrays

The system uses multiple high-performance transport and serialization paths. These must not be confused.

| Path | Transport | Serialization | Native Bridge Role |
|---|---|---|---|
| gRPC | HTTP/2 | Protobuf binary | None; handled by `@grpc/grpc-js` |
| Ollama / TurboQuant-compatible APIs | HTTP/1.1 | JSON text | `simdjson` fast validation / parsing |
| LibTorch reranker | N-API | TypedArrays / binary memory | Tensor scoring / attention reranking |

### Avoidance rules

Do **not** use `fastJsonParse` on:

```text
gRPC streams
Protobuf buffers
TypedArray tensor payloads
```

Do use `fastJsonParse` for:

```text
large Ollama / TurboQuant JSON synthesis responses, especially > 1 KB
```

This reduces V8 JSON parsing overhead and garbage collection pressure for large text responses.

### Native memory warning

Both LibTorch bridge functions and simdjson helpers may be exposed through the same `.node` addon. If that addon fails to load, both native acceleration paths are unavailable.

Expected artifact location:

```text
simd-bridge/cpp/build/Release/tensorrt_bridge.node
```

If this file is missing, ACE must continue through fallback logic, but the diagnostics should clearly say that native acceleration is disabled.

---

## Startup Failure Prevention Checklist

### Environment initialization

`src/lib/server/env.server.ts` must call dotenv setup before reading service URLs, database credentials, or inference settings.

Recommended first action:

```ts
import dotenv from 'dotenv';
dotenv.config();
```

Reason: standalone scripts launched with `npx tsx`, `node`, or smoke commands may not inherit the same environment-loading behavior as the SvelteKit dev server.

If `dotenv.config()` is missing or delayed, common failures include:

```text
missing DB password
missing DATABASE_URL
wrong Postgres port
missing CouchDB URL
missing TurboQuant / Ollama URL
```

---

## Service Sequencing

Startup should validate in this order:

```text
L1: Start topology-search-server.mjs on :8101
L2: Verify LibTorch bridge load or fallback mode
L3: Confirm CouchDB inference log connectivity
L4: Confirm Postgres proxy connectivity
L5: Confirm optional TurboQuant / llama-server connectivity
```

The topology search server is required for routing. TurboQuant is optional GPU boost and should not block baseline ACE routing unless the specific test requires it.

---

## Port Checklist

| Port | Service | Required | Notes |
|---:|---|---|---|
| `5434` | Postgres proxy | Yes | Required for database-backed ACE / atlas / graphify paths |
| `8101` | Topology Search Server | Yes | Required for routing |
| `5984` | CouchDB | Yes | Required for inference logs |
| `8090` | TurboQuant / llama-server | Optional | GPU boost / local model endpoint |
| `8788` | TRACE MCP Server | Context-dependent | Required for TRACE MCP tool calls |

---

## Verification Commands

Run from:

```text
C:\Users\james\Videos\deeds-web-app\sveltekit-frontend
```

### Verify LibTorch bridge

```powershell
npx tsx scratch/verify-libtorch.mjs
```

Expected result:

```text
native bridge loaded
```

or a clear fallback/diagnostic message if the bridge is intentionally unavailable.

### Verify topology search

```powershell
node scripts/ensure-search-engine.mjs --spawn
```

Expected result:

```text
Topology Search Server ready on :8101
```

### Verify hypergraph routing

```powershell
npm run smoke:hypergraph-routing
```

Expected result:

```text
PASS
```

### Verify graphify daily path

```powershell
npm run graphify:daily
```

If this fails with:

```text
ECONNREFUSED 127.0.0.1:5434
```

then Postgres proxy is not listening on `5434`. Check Docker port mappings before debugging ACE routing.

---

## PowerShell Startup Guardrails

Avoid Bash-style assignments in PowerShell scripts.

Incorrect:

```powershell
FOO=bar
= "value"
```

Correct:

```powershell
$env:FOO = "bar"
$FOO = "bar"
```

If startup prints:

```text
=: The term '=' is not recognized as a name of a cmdlet, function, script file, or executable program.
```

search the startup scripts with:

```powershell
Select-String -Path .\*.ps1,.\scripts\*.ps1,.\package.json -Pattern "^\s*=|[A-Z_]+="
```

---

## Recommended Code Comments

Add near the native bridge resolver in `src/lib/server/ai/libtorch-reranker.ts`:

```ts
// IMPORTANT: this file lives at src/lib/server/ai/.
// The native bridge lives outside sveltekit-frontend at ../simd-bridge/.
// Prefer process.cwd() when this service is launched from sveltekit-frontend.
// Avoid fragile ../../../../ paths; four levels only reaches sveltekit-frontend.
// Native bridge failure must fall back to CPU scoring unless this is an explicit verification command.
```

Add near fast JSON parsing helpers:

```ts
// simdjson is only for JSON text payloads such as Ollama / TurboQuant responses.
// Do not use fastJsonParse on gRPC streams, Protobuf buffers, or tensor TypedArrays.
```

Add near startup health checks:

```ts
// Startup order matters:
// 1. Load env with dotenv.
// 2. Start topology search on :8101.
// 3. Detect native LibTorch/simdjson bridge mode.
// 4. Confirm CouchDB inference logs.
// 5. Confirm Postgres proxy on :5434.
// 6. Treat TurboQuant :8090 as optional unless the command explicitly requires local GPU inference.
```

---

## Operational Rule

Do not treat `graphify:daily complete` as proof that the full graphify chain succeeded. Some launchers may print completion after an inner command fails.

Trust the actual command exit code and the earliest failure in the log.

Common real blocker:

```text
Error: connect ECONNREFUSED 127.0.0.1:5434
```

This is a Postgres availability or port-mapping issue, not a TRACE MCP or CUDA bridge issue.

