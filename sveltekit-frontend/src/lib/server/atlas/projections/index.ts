/**
 * Atlas Projection Adapters — Canonical Boundary Mapping
 *
 * Maps camelCase domain objects ↔ snake_case persistence representations
 * across all 4 storage layers:
 *
 * - PostgreSQL (canonical truth, Drizzle ORM)
 * - Qdrant (vector mirror, multiple collections)
 * - Redis (cache, BitFrost L1/L2)
 * - HyperRAG (RPC fact materialization)
 *
 * CRITICAL:
 * - These are READ-ONLY adapters
 * - Do NOT modify producers
 * - Producers continue to output camelCase objects
 * - Adapters only convert at persistence boundaries
 * - All adapters report violations instead of throwing
 */

export * from './postgres-packet-projection.js';
export * from './qdrant-packet-projection.js';
export * from './redis-packet-projection.js';
export * from './hyperrag-packet-projection.js';
