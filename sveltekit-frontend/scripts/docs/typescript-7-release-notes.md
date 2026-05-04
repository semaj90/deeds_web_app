# TypeScript 7.0 Release Notes

**Beta released**: April 21, 2026  
**Architecture**: Complete rewrite of the TypeScript compiler from JavaScript → Go (`tsgo`)  
**Install**: `npm install @typescript/native-preview` (beta) — entry point: `tsgo`  
**Migration path**: TypeScript 5.x → 6.0 (fix deprecations) → 7.0

---

## The Big Story: Native Go Compiler

TypeScript 7.0 is a ground-up rewrite of `tsc` in Go. The type system semantics are **identical** to 6.0 (same test suite passes). The gain is purely performance and parallelism.

### Benchmarks

| Project | TS 6.0 | TS 7.0 | Speedup |
|---------|--------|--------|---------|
| VS Code (400k lines) | 89s | 8.74s | **10.2×** |
| Sentry | 133s | 16s | **8.3×** |
| Playwright | 9.3s | 1.24s | **7.5×** |
| Editor startup | 9.6s | 1.2s | **8×** |

- **10.8× faster** full builds
- **30× faster** type checking
- **2.9× less** memory usage
- Default **4 worker threads** (tune with `--checkers N`)

### Flags

```bash
tsgo --watch          # native file watcher
tsgo --checkers 8     # parallel type checkers
tsgo --builders 4     # parallel project-reference builds
tsgo --singleThreaded # debug mode
```

---

## Breaking Changes (5.x → 6.0 → 7.0)

### Module system — removed/deprecated

| Option | Status |
|--------|--------|
| `--module amd` | ❌ Removed |
| `--module umd` | ❌ Removed |
| `--module system` | ❌ Removed |
| `--module commonjs` | ⚠️ Deprecated (use `esnext` + bundler) |
| `--moduleResolution classic` | ❌ Removed |
| `--moduleResolution node` | ⚠️ Deprecated (use `node16` / `nodenext`) |

### Output options — removed

| Option | Status |
|--------|--------|
| `--outFile` | ❌ Removed |
| `--baseUrl` | ⚠️ Deprecated (use `paths`) |
| `--downlevelIteration` | ⚠️ Deprecated |
| `target: es5` | ⚠️ Deprecated (min: ES2015) |

### Interop — now locked

- `esModuleInterop: false` → cannot be set (always-on, safer)
- `allowSyntheticDefaultImports: false` → cannot be set

### Plugins — removed

JavaScript-based compiler plugins / custom transformers no longer supported.  
New plugin system planned but not in beta.

### Strict mode — now default

`--strict` is **ON by default**. To opt out (not recommended): `"strict": false` in tsconfig.

---

## Recommended tsconfig for TS 7.0

```json
{
  "compilerOptions": {
    "target": "es2025",
    "module": "nodenext",
    "moduleResolution": "nodenext",
    "strict": true,
    "verbatimModuleSyntax": true,
    "lib": ["es2025", "esnext.disposable"],
    "noUncheckedSideEffectImports": true
  }
}
```

---

## Language Features (from 5.2–5.8, all carry into 7.0)

### `using` / `await using` (Explicit Resource Management, 5.2+)

Automatic cleanup of Redis, DB pools, file handles at scope end:

```typescript
// lib: ["esnext.disposable"]

// Sync disposal
{
  using conn = db.connect();
  await conn.query('SELECT 1');
} // conn[Symbol.dispose]() called automatically

// Async disposal
{
  await using redis = new Redis(REDIS_URL);
  await redis.ping();
} // redis[Symbol.asyncDispose]() called automatically

// Multiple resources — DisposableStack
{
  using stack = new DisposableStack();
  const pool = stack.use(new pg.Pool(...));
  const redis = stack.use(new Redis(...));
  // both cleaned up in LIFO order
}
```

**Note**: ioredis does not natively implement `Symbol.asyncDispose`. Wrap it:
```typescript
class DisposableRedis extends Redis {
  async [Symbol.asyncDispose]() { await this.quit(); }
}
```

### Inferred type predicates (5.5+)

```typescript
// Before: .filter((x): x is string => x !== null)
// After: TypeScript infers the type predicate automatically
const valid = rows.filter(r => r.content !== null); // Type: Row[] with content: string
```

### `satisfies` operator (5.0+)

```typescript
const config = {
  model: 'gemma4-legal-vlm:latest',
  temperature: 0.2,
} satisfies OllamaOptions; // validates without widening type
```

### `const` type parameters (5.0+)

```typescript
function parseResult<const T>(raw: string): T { ... }
// Infers literal types instead of widening
```

### `Promise.withResolvers` (ES2024, lib es2024+)

```typescript
const { promise, resolve, reject } = Promise.withResolvers<ClusterResult>();
const timeout = setTimeout(() => reject(new Error('timeout')), 30_000);
fetchResult().then(resolve, reject).finally(() => clearTimeout(timeout));
return promise;
```

### Iterator helpers (5.6+, `lib: ["esnext.iterator"]`)

```typescript
function* clusterIds(rows: Row[]) {
  for (const r of rows) yield r.gpu_cluster as number;
}
const top5 = clusterIds(rows).take(5).toArray();
```

### `--erasableSyntaxOnly` (5.8+)

Validates that code is compatible with Node.js native TypeScript stripping  
(`node --experimental-strip-types`). Disallows: `enum`, `namespace`, parameter properties.

### `--noCheck` (5.6+)

Separates emit from type-checking for faster iteration:
```bash
tsc --noCheck   # fast JS emit
tsc --noEmit    # thorough type check only
```

---

## Migration Checklist (5.x → 7.0)

```
□ npm install typescript@latest
□ Fix tsconfig: module → nodenext, moduleResolution → nodenext, target → es2025
□ Remove deprecated options: baseUrl, outFile, downlevelIteration
□ Remove: module amd/umd/system/commonjs
□ Add: strict: true (already default, but be explicit)
□ Add: lib includes es2025, esnext.disposable
□ Replace manual try/finally resource cleanup with using/await using
□ Update .filter() chains — remove manual type predicates where inferred
□ Replace new Promise((resolve, reject) => ...) with Promise.withResolvers()
□ If using compiler plugins: plan migration (plugins removed in 7.0)
□ Run: npx tsgo --noEmit (beta) or tsc --noEmit (stable)
□ Install @typescript/native-preview for 10× build speed
```

---

## Advanced Features: What tsgo Does and Doesn't Use

### Compilation Caching — ✅ YES

tsgo **reuses `.tsbuildinfo`** from tsc — same format, fully compatible. Incremental builds
exploit Go's shared-memory parallelism so unchanged files cost near-zero. Under `--build` mode
(project references), multiple sub-projects compile in parallel via `--builders N` flag.

```bash
tsgo --build --incremental   # reads/writes .tsbuildinfo like tsc
tsgo --builders 4            # 4 parallel project builders
tsgo --checkers 8            # 8 parallel type-checker goroutines
```

Go's goroutine scheduler provides **true shared-memory parallelism** — something the JS event loop
cannot do. That's the entire source of the 10× gain.

---

### CUDA / RTX Tensor Cores — ❌ NOT USED

tsgo's 10× speedup is **entirely CPU-based**. No CUDA, no RTX, no tensor cores. The Go runtime
uses OS threads with shared memory — not the GPU. Type checking is a graph traversal problem
(dependency resolution, structural subtyping), which is memory-latency-bound, not compute-bound
the way matrix multiply is. Tensor cores excel at dense matmul — they're the wrong tool here.

**What your RTX 3060 Ti does in this stack** (not tsgo):
- `tensorrt_bridge.node` — LibTorch CUDA k-means, PageRank, cosine similarity
- `embeddinggemma:latest` — Ollama GPU inference
- `gemma4-legal-vlm:latest` — TurboQuant KV-compressed inference at :8090

---

### SIMD (AVX2 / SSE4.2) — ⚠️ IMPLICIT via Go runtime

Go's standard library uses **SIMD assembly stubs** for `strings`, `bytes`, and `unicode` packages
on x86-64 (AVX2/SSE4.2 where available). tsgo's scanner and binder use these packages for source
tokenization and identifier comparison, so SIMD acceleration is **implicit** — not explicitly
configured, not documented, just there via Go's stdlib. No simdjson-equivalent is used because
TypeScript source is not JSON — the scanner is a hand-written lexer.

---

### JSONB / JSON Parsing — Partial

tsgo parses two kinds of JSON:
1. **`tsconfig.json`** — Go's standard `encoding/json` (no SIMD); supports `extends`, `compilerOptions`, `paths`
2. **`import ... with { type: "json" }` assertions** — handled by the module resolver, not a special parser

No simdjson-style binary-format JSONB involved. The only JSONB in your stack is PostgreSQL's
`jsonb` columns in Drizzle schema (`metadata`, `payload` fields) — that's a Postgres concern,
not a TypeScript compiler concern.

---

### gRPC — ❌ NOT used by tsgo; used elsewhere in this stack

tsgo communicates with editors via **native LSP** (Language Server Protocol) over stdio/pipe/TCP.
This is a major upgrade from the old `tsserver` proprietary protocol that required a wrapper
(`typescript-language-server`). With tsgo you run `tsgo --lsp` directly — no wrapper needed.

**gRPC in this codebase** (separate from tsgo):
| Port | Service |
|------|---------|
| 50051 | Go EmbeddingService |
| 50053 | Go RetrievalService |
| 50057 | ToolCalling |

These are your inference/retrieval microservices — not TypeScript compiler infrastructure.

---

### MCP (Model Context Protocol) — ❌ NOT in tsgo compiler

The TypeScript 7.0 **compiler** (`tsgo`) has no MCP integration. MCP is an LLM context protocol,
not a build tool protocol.

**MCP in this codebase** — your `src/mcp/server.ts` implements a FastMCP server with 9 tools
(`unified_ast_query`, `cross_language_similarity`, etc.) running over stdio transport. Completely
separate from the compiler.

The `@modelcontextprotocol/sdk` npm package lets TypeScript applications **expose** or **consume**
MCP tools — it doesn't touch the compiler.

---

### Google Agent2Agent (A2A) Protocol — ❌ NOT in tsgo

Google's A2A protocol (also called "Agentic Protocol") is an HTTP-based agent-to-agent
communication spec for multi-agent orchestration. tsgo has no integration.

**Relevance to this stack**: A2A is worth watching as an alternative to MCP for multi-agent
orchestration — it uses HTTP/JSON with an `AgentCard` discovery mechanism and SSE streaming.
Your existing `/api/ai/agent` endpoint (Gemma4 tool-calling loop) could expose an A2A-compatible
interface by adding the `AgentCard` well-known endpoint and A2A task JSON envelope.

A2A vs MCP quick comparison:
| | MCP | A2A |
|--|-----|-----|
| Transport | stdio / HTTP SSE | HTTP / SSE |
| Discovery | Manual | `/.well-known/agent.json` |
| Auth | None built-in | OAuth2 / API key |
| Target | LLM ↔ tools | Agent ↔ agent |
| Status | Anthropic standard | Google Labs (2025) |

---

### HTTP/3 / QUIC — ❌ NOT used by tsgo

tsgo makes no network calls during compilation. All module resolution is file-system-based.
npm registry access (during `npm install`) is handled by npm/pnpm — not tsgo.

**HTTP/3 in this stack** — your Caddy reverse proxy (`docker/caddy/`) supports HTTP/3 via QUIC
for browser-to-server connections. The SvelteKit app benefits from QUIC multiplexing (no
head-of-line blocking on SSE streams).

---

## Integration with This Codebase

```
tsgo (Go, CPU-parallel)            ← TypeScript compilation only
  └─ .tsbuildinfo cache

tensorrt_bridge.node (CUDA)        ← GPU k-means, PageRank, cosine sim
  └─ RTX 3060 Ti, CUDA 12.1

embeddinggemma / gemma4-legal-vlm  ← Ollama GPU inference
  └─ RTX 3060 Ti, 8GB VRAM

gRPC services (Go)                 ← Embedding, retrieval microservices
  └─ ports 50051, 50053, 50057

FastMCP server (src/mcp/)          ← LLM tool access (9 tools)
  └─ stdio transport

Caddy HTTP/3                       ← Browser ↔ SvelteKit (QUIC)
  └─ docker/caddy/
```

---

## Sources

- [Announcing TypeScript 7.0 Beta — devblogs.microsoft.com](https://devblogs.microsoft.com/typescript/announcing-typescript-7-0-beta/)
- [Progress on TypeScript 7 — December 2025](https://devblogs.microsoft.com/typescript/progress-on-typescript-7-december-2025/)
- [TypeScript 5.5 Release Notes](https://www.typescriptlang.org/docs/handbook/release-notes/typescript-5-5.html)
- [TypeScript 5.2 (using/await using)](https://www.typescriptlang.org/docs/handbook/release-notes/typescript-5-2.html)
- [TypeScript 5.8 Release Notes](https://www.typescriptlang.org/docs/handbook/release-notes/typescript-5-8.html)
- [GitHub: microsoft/TypeScript releases](https://github.com/microsoft/typescript/releases)
