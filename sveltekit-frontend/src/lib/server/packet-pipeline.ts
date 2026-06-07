/**
 * packet-pipeline.ts
 *
 * TypeScript bridge to crates/turbovec-napi (Rust N-API packet compiler).
 *
 * LAYER RESPONSIBILITIES — do not mix:
 *
 *   Rust N-API (this file's backend)
 *     hash sourceRefs → u64          hashSourceRefs()
 *     dedupe graph edges              dedupeEdgesJson()
 *     SOM 20×20 proximity score       scoreSom20X20()
 *     JSONL → JSON string             loadJsonlPackets()
 *     JSON → MessagePack Buffer       packQdrantPayloads()
 *
 *   Valkey (via redis.ts)             hot semantic cache, ace:node:*, bifrost:*
 *   Qdrant (via qdrant-manager.ts)    ANN vector search, payload filters
 *   Neo4j (via neo4j-driver)          contextual trees, graph edges
 *   PyTorch / autoencoder             768→64 latent compression (server process)
 *   LangGraph (langgraph-client.ts)   orchestration
 *   BitFrost (bifrost-provider.ts)    routing / semantic cache gateway
 *   DuckDB / CouchDB                  offline archive, analytics
 *
 * int64 (BigUint64Array) usage:
 *   - source_ref_hash, feature_id_hash, edge_hash  →  u64 only
 *   - never use u64 for vector math
 *
 * SOM uint16 cell ids 0–399 (20×20 grid).
 * Vector dtype path: float32 → autoencoder → latent64 → int8 → TurboVec.
 */

import { createRequire } from 'module'
import path from 'path'

// ── N-API binding (lazy, graceful fallback) ────────────────────────────────

type NativeBinding = {
  hashSourceRefs(refs: string[]): Buffer
  dedupeEdgesJson(edgesJson: string): string
  scoreSom20X20(queryCell: number, candidateCells: number[]): Float32Array
  loadJsonlPackets(path: string): string
  packQdrantPayloads(payloadsJson: string): Buffer
  turbovecSmoke(dim: number, bits: number): string
}

let _native: NativeBinding | null = null
let _loadAttempted = false

function getNative(): NativeBinding | null {
  if (_loadAttempted) return _native
  _loadAttempted = true
  try {
    const require = createRequire(import.meta.url)
    // wrapper.js is the stable public entry that survives napi-rs index.js regeneration
    const wrapperPath = path.resolve(
      process.cwd(),
      '../crates/turbovec-napi/wrapper.js'
    )
    _native = require(wrapperPath) as NativeBinding
  } catch {
    // Addon not built or DLLs missing — all functions fall back to JS equivalents
    _native = null
  }
  return _native
}

// ── 1. hashSourceRefs ──────────────────────────────────────────────────────

/**
 * Hash each sourceRef string to a stable u64 (XxHash64, seed 42).
 * Returns BigUint64Array — use these as Valkey/Qdrant packet keys.
 * Falls back to a JS FNV-1a-based u64 approximation if N-API unavailable.
 */
export function hashSourceRefs(refs: string[]): BigUint64Array {
  const native = getNative()
  if (native) {
    const buf = native.hashSourceRefs(refs)
    return new BigUint64Array(buf.buffer, buf.byteOffset, buf.length / 8)
  }
  // JS fallback: FNV-1a 64-bit (two 32-bit halves)
  const out = new BigUint64Array(refs.length)
  for (let i = 0; i < refs.length; i++) {
    let lo = 0x811c9dc5
    let hi = 0
    for (let j = 0; j < refs[i].length; j++) {
      const c = refs[i].charCodeAt(j)
      lo ^= c
      hi ^= 0
      const lo2 = Math.imul(lo, 0x01000193)
      hi = Math.imul(hi, 0x01000193) + Math.imul(lo, 0) + ((lo2 >>> 0) < (lo >>> 0) ? 1 : 0)
      lo = lo2
    }
    out[i] = (BigInt(hi >>> 0) << 32n) | BigInt(lo >>> 0)
  }
  return out
}

// ── 2. dedupeEdges ────────────────────────────────────────────────────────

export interface EdgePacket {
  src: string
  dst: string
  type?: string
  confidence?: number
}

/**
 * Remove duplicate directed edges (same src+dst+type).
 * Falls back to JS Set if N-API unavailable.
 */
export function dedupeEdges(edges: EdgePacket[]): EdgePacket[] {
  const native = getNative()
  if (native) {
    return JSON.parse(native.dedupeEdgesJson(JSON.stringify(edges))) as EdgePacket[]
  }
  const seen = new Set<string>()
  return edges.filter((e) => {
    const key = `${e.src}|${e.dst}|${e.type ?? 'EDGE'}`
    if (seen.has(key)) return false
    seen.add(key)
    return true
  })
}

// ── 3. scoreSom20X20 ──────────────────────────────────────────────────────

/**
 * Score SOM candidate cells (uint16, 0–399) against a query cell.
 * Returns Float32Array of proximity scores in [0, 1] — higher = closer.
 * Cell index = row * 20 + col. Falls back to JS Euclidean distance.
 */
export function scoreSom20X20(queryCell: number, candidateCells: number[]): Float32Array {
  const native = getNative()
  if (native) {
    return native.scoreSom20X20(queryCell, candidateCells)
  }
  const qx = queryCell % 20
  const qy = Math.floor(queryCell / 20)
  return new Float32Array(
    candidateCells.map((c) => {
      const x = c % 20
      const y = Math.floor(c / 20)
      const dist = Math.sqrt((qx - x) ** 2 + (qy - y) ** 2)
      return 1 / (1 + dist)
    })
  )
}

// ── 4. loadJsonlPackets ───────────────────────────────────────────────────

/**
 * Read a JSONL file and return parsed rows as a JSON string.
 * Falls back to Node fs + JSON.parse if N-API unavailable.
 */
export async function loadJsonlPackets(filePath: string): Promise<unknown[]> {
  const native = getNative()
  if (native) {
    return JSON.parse(native.loadJsonlPackets(filePath)) as unknown[]
  }
  const { readFileSync } = await import('fs')
  return readFileSync(filePath, 'utf8')
    .split('\n')
    .filter((l) => l.trim())
    .map((l) => JSON.parse(l))
}

// ── 5. packQdrantPayloads ─────────────────────────────────────────────────

/**
 * Serialize an array of Qdrant payload objects to MessagePack (Buffer).
 * Falls back to JSON encoding if N-API unavailable (Qdrant HTTP API accepts both).
 */
export function packQdrantPayloads(payloads: unknown[]): Buffer {
  const native = getNative()
  if (native) {
    return native.packQdrantPayloads(JSON.stringify(payloads))
  }
  return Buffer.from(JSON.stringify(payloads), 'utf8')
}

// ── Diagnostic ────────────────────────────────────────────────────────────

export function turbovecNapiAvailable(): boolean {
  return getNative() !== null
}

export function turbovecSmoke(dim = 128, bits = 4): string {
  const native = getNative()
  if (!native) return 'native unavailable — using JS fallbacks'
  return native.turbovecSmoke(dim, bits)
}
