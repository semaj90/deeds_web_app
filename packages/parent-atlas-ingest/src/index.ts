/**
 * Parent Atlas Ingest: Repository scanning, AST parsing, and packet generation
 *
 * Provides reusable layers for ingesting any codebase:
 * 1. Directory scanner (repo-agnostic)
 * 2. Language parsers (extract symbols per language)
 * 3. Feature classifier (infer feature_id/label)
 * 4. Packet generator (create atlas_codebase_packets rows)
 * 5. Store adapters (write to Postgres/Qdrant/Redis/Neo4j)
 */

export { scanDirectory, scanDirectorySync } from './scanner/directory-scanner.js';
export type { ScannerConfig, FileEntry } from './scanner/directory-scanner.js';
