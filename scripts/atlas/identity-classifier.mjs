#!/usr/bin/env node
/**
 * scripts/atlas/identity-classifier.mjs
 *
 * DEPRECATED: This file is a placeholder stub.
 *
 * THE REAL IMPLEMENTATION IS: scripts/atlas/qdrant-postgres-identity-audit.mjs
 *
 * That script provides:
 * - Real Qdrant pagination (no cycles, offset-based scroll API)
 * - Real Postgres identity joins (atlas_packets + codebase_chunk_index)
 * - 9 classification lanes (EXACT_ATLAS_PACKET_KEY, EXACT_CHUNK_QDRANT_ID, LEGACY_INTEGER_POINT, etc.)
 * - NDJSON ledger output (54,224 entries, real data)
 * - Cycle detection + safety ceilings
 * - BigInt serialization fix
 * - --limit parameter for bounded smoke testing
 *
 * Usage:
 *   node scripts/atlas/qdrant-postgres-identity-audit.mjs [--limit=10] [--ledger=output.ndjson]
 *
 * This file is kept for reference only. Do NOT use it. It will not execute.
 */

// [DEPRECATED] This file (identity-classifier.mjs) is a non-functional placeholder.
// USE INSTEAD: scripts/atlas/qdrant-postgres-identity-audit.mjs

console.error('This file is deprecated. Use: node scripts/atlas/qdrant-postgres-identity-audit.mjs --limit=10');
process.exit(1);
