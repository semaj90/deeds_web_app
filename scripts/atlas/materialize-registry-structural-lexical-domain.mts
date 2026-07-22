#!/usr/bin/env npx tsx
/**
 * Materialize Registry Enrichment Projection
 *
 * Normalized precedence:
 *   1. feature_domain_facts
 *   2. feature_lexical_facts
 *   3. feature_structural_facts
 *   4. feature_ontology_tuples
 *   5. feature_file_edges
 *   6. atlas_packets fallback
 *
 * This script materializes the legacy registry_enrichment_projection table for the
 * cheap lanes while also emitting a provenance-rich smoke report that records the
 * exact join method, fallback usage, and hash classification for each row.
 */

import { promises as fs } from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { pool } from '$lib/server/db/client.js';
import { profileRegistryRowsWithDuckDb } from '../../sveltekit-frontend/packages/atlas-duckdb/src/index.ts';

const CONTRACT_VERSION = 'atlas-feature-registry-enrichment-v1';
const MATERIALIZATION_VERSION = 2;
const DEFAULT_SMOKE_JSON = path.join(process.cwd(), 'docs/reports/phase-107-materializer-smoke.json');
const DEFAULT_SMOKE_MD = path.join(process.cwd(), 'docs/reports/phase-107-materializer-smoke.md');

type JoinMethod =
  | 'packet_key'
  | 'source_ref'
  | 'feature_key_source_ref'
  | 'normalized_path'
  | 'atlas_packets_fallback'
  | 'unresolved';

type HashStatus =
  | 'CANONICAL_SOURCE_HASH'
  | 'DERIVED_MIGRATION_HASH'
  | 'MISSING'
  | 'INVALID_PLACEHOLDER';

interface AtlasPacketRow {
  packet_key: string;
  source_ref: string | null;
  source_ref_key: string | null;
  file_path: string | null;
  directory_path: string | null;
  feature_id: string | null;
  feature_label: string | null;
  domain_class: string | null;
  tree_node_id: string | null;
  qdrant_point_id: string | null;
  som_cluster: number | null;
  som_row: number | null;
  som_col: number | null;
  kmeans_cluster: number | null;
  pagerank: number | null;
  pagerank_score: number | null;
  sha256: string | null;
  summary_hash: string | null;
  used_concepts: string[] | null;
}

interface DomainFactRow {
  packet_key: string;
  source_ref: string;
  feature_key: string | null;
  domain_class: string;
  domain_confidence: number | null;
  classifier_kind: string;
  classifier_version: string;
  model_hash: string | null;
  feature_contract_version: string | null;
  content_hash: string;
  evidence: unknown;
}

interface LexicalFactRow {
  packet_key: string;
  source_ref: string;
  feature_key: string | null;
  keywords: string[] | null;
  identifiers: string[] | null;
  symbols: string[] | null;
  imported_modules: string[] | null;
  lexical_summary: string | null;
  language: string | null;
  content_hash: string;
}

interface StructuralFactRow {
  packet_key: string;
  source_ref: string;
  feature_key: string | null;
  tree_node_id: string | null;
  symbol_name: string | null;
  symbol_kind: string | null;
  structural_path: string[] | null;
  line_start: number | null;
  line_end: number | null;
  imports: string[] | null;
  calls: string[] | null;
  exports: string[] | null;
  content_hash: string;
}

interface OntologyFactRow {
  packet_key: string;
  source_ref: string;
  feature_key: string | null;
  subject_type: string;
  subject_id: string;
  predicate: string;
  object_type: string;
  object_id: string;
  object_value: unknown | null;
  confidence: number | null;
  ontology_version: string;
  extractor_version: string;
  evidence: unknown;
  valid_from: string | null;
  valid_to: string | null;
}

interface FileEdgeRow {
  feature_key: string;
  file_path: string;
  entry_export: string | null;
  role: string;
  packet_key: string | null;
  source_ref: string | null;
  content_hash: string | null;
}

interface MaterializedRegistryRecord {
  packetKey: string;
  sourceRef: string;
  contentHash: string | null;
  contentHashStatus: HashStatus;
  sourceTable: string;
  joinMethod: JoinMethod;
  fallbackUsed: boolean;
  evidenceIds: string[];
  processingPassId: string;
  contractVersion: string;
  generatedAt: string;
  domainClass: string | null;
  symbols: string[];
  astFacts: string[];
  keywords: string[];
  bm25Terms: string[];
  identifiers: string[];
  fileTokens: string[];
  provenance: {
    domain?: FieldProvenance;
    lexical?: FieldProvenance;
    structural?: FieldProvenance;
    ontology?: FieldProvenance;
    edges?: FieldProvenance;
    packet?: FieldProvenance;
  };
}

interface FieldProvenance {
  sourceTable: string;
  joinMethod: JoinMethod;
  fallbackUsed: boolean;
  evidenceIds: string[];
}

interface MaterializerSummary {
  packetsSelected: number;
  recordsEmitted: number;
  normalizedRecords: number;
  fallbackRecords: number;
  unresolvedRecords: number;
  ambiguousRecords: number;
  duplicateRecords: number;
  missingContentHashRecords: number;
  countsBySourceTable: Record<string, number>;
  countsByJoinMethod: Record<string, number>;
  countsByFallbackReason: Record<string, number>;
  contentHashStatusCounts: Record<HashStatus, number>;
  schemaValidationFailures: number;
}

interface MaterializerReport {
  contractVersion: string;
  generatedAt: string;
  dryRun: boolean;
  limit: number | null;
  summary: MaterializerSummary;
  duckDbProfile: DuckDbRegistryProfile | null;
  duckDbValidation: {
    matchesSummary: boolean;
    mismatches: string[];
  };
  sampleRows: Array<Pick<
    MaterializedRegistryRecord,
    | 'packetKey'
    | 'sourceRef'
    | 'contentHash'
    | 'contentHashStatus'
    | 'sourceTable'
    | 'joinMethod'
    | 'fallbackUsed'
  >>;
}

interface DuckDbRegistryProfile {
  rowCount: number;
  normalizedRecords: number;
  fallbackRecords: number;
  unresolvedRecords: number;
  duplicateRecords: number;
  missingContentHashRecords: number;
  schemaValidationFailures: number;
  countsBySourceTable: Record<string, number>;
  countsByJoinMethod: Record<string, number>;
  countsByContentHashStatus: Record<string, number>;
}

function normalizeRegistrySourceRef(value: unknown): string {
  return String(value ?? '')
    .trim()
    .replace(/^local:/i, '')
    .replace(/^sveltekit-frontend\//i, '')
    .replace(/#L\d+(?:-L?\d+)?$/i, '')
    .replace(/\\/g, '/')
    .replace(/^\.\/+/, '');
}

function toArray(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.map((item) => String(item ?? '').trim()).filter(Boolean);
}

function uniq(values: Iterable<string>): string[] {
  return Array.from(new Set(Array.from(values).map((value) => String(value).trim()).filter(Boolean)));
}

function compareDuckDbProfileToSummary(
  summary: MaterializerSummary,
  profile: DuckDbRegistryProfile | null,
): { matchesSummary: boolean; mismatches: string[] } {
  if (!profile) {
    return { matchesSummary: false, mismatches: ['duckdb_profile_unavailable'] };
  }

  const mismatches: string[] = [];
  const checks: Array<[string, number, number]> = [
    ['recordsEmitted', summary.recordsEmitted, profile.rowCount],
    ['normalizedRecords', summary.normalizedRecords, profile.normalizedRecords],
    ['fallbackRecords', summary.fallbackRecords, profile.fallbackRecords],
    ['unresolvedRecords', summary.unresolvedRecords, profile.unresolvedRecords],
    ['duplicateRecords', summary.duplicateRecords, profile.duplicateRecords],
    ['missingContentHashRecords', summary.missingContentHashRecords, profile.missingContentHashRecords],
    ['schemaValidationFailures', summary.schemaValidationFailures, profile.schemaValidationFailures],
  ];

  for (const [label, expected, actual] of checks) {
    if (expected !== actual) {
      mismatches.push(`${label}:${expected}!=${actual}`);
    }
  }

  return {
    matchesSummary: mismatches.length === 0,
    mismatches,
  };
}

function splitTokens(text: string): string[] {
  if (!text) return [];
  const normalized = text
    .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
    .replace(/[_/.-]+/g, ' ')
    .replace(/[^a-zA-Z0-9]+/g, ' ')
    .toLowerCase();

  return normalized
    .split(/\s+/g)
    .map((token) => token.trim())
    .filter((token) => token.length >= 2);
}

function pathTokens(value: string | null | undefined): string[] {
  if (!value) return [];
  const normalized = normalizeRegistrySourceRef(value);
  const parts = normalized.split('/').filter(Boolean);
  const tokens: string[] = [];

  for (const part of parts) {
    const stem = part.replace(/\.[^.]+$/, '');
    tokens.push(...splitTokens(stem));
  }

  return tokens;
}

function classifyContentHash(packet: AtlasPacketRow, contentHash: string | null): HashStatus {
  const trimmed = String(contentHash ?? '').trim();
  if (!trimmed) return 'MISSING';
  if (/^[0-9a-f]{64}$/i.test(trimmed) && packet.sha256 && trimmed === packet.sha256) {
    return 'CANONICAL_SOURCE_HASH';
  }
  if (/^[0-9a-f]{32}$/i.test(trimmed)) {
    const derived = packet.source_ref ? crypto.createHash('md5').update(`${packet.packet_key}${packet.source_ref}`).digest('hex') : null;
    if (derived && trimmed === derived) return 'DERIVED_MIGRATION_HASH';
  }
  if (/^[0-9a-f]{32}$/i.test(trimmed) || /^[0-9a-f]{64}$/i.test(trimmed)) {
    return packet.sha256 ? 'DERIVED_MIGRATION_HASH' : 'DERIVED_MIGRATION_HASH';
  }
  if (/^(unknown|null|n\/a|na|none|temp|todo|fixme|pending)$/i.test(trimmed)) {
    return 'INVALID_PLACEHOLDER';
  }
  if (/^[0-9a-f-]{36}$/i.test(trimmed)) {
    return 'INVALID_PLACEHOLDER';
  }
  return 'INVALID_PLACEHOLDER';
}

function coalesceText(...values: Array<string | null | undefined>): string | null {
  for (const value of values) {
    const trimmed = String(value ?? '').trim();
    if (trimmed) return trimmed;
  }
  return null;
}

function recordFieldProvenance(
  sourceTable: string,
  joinMethod: JoinMethod,
  fallbackUsed: boolean,
  evidenceIds: string[],
): FieldProvenance {
  return { sourceTable, joinMethod, fallbackUsed, evidenceIds };
}

function pickFirstFactRow<T>(
  keys: Array<{ key: string | null | undefined; joinMethod: JoinMethod }>,
  tables: Array<{ sourceTable: string; map: Map<string, T[]> }>,
): { row: T | null; joinMethod: JoinMethod; sourceTable: string } {
  for (const { key, joinMethod } of keys) {
    if (!key) continue;
    for (const { sourceTable, map } of tables) {
      const rows = map.get(key);
      if (rows?.length) {
        return {
          row: rows[0] ?? null,
          joinMethod,
          sourceTable,
        };
      }
    }
  }

  return { row: null, joinMethod: 'unresolved', sourceTable: 'atlas_packets' };
}

function buildDerivedTokens(
  packet: AtlasPacketRow,
  domain: DomainFactRow | null,
  lexical: LexicalFactRow | null,
  structural: StructuralFactRow | null,
  ontology: OntologyFactRow[],
  edge: FileEdgeRow | null,
): {
  symbols: string[];
  astFacts: string[];
  keywords: string[];
  bm25Terms: string[];
  identifiers: string[];
  fileTokens: string[];
} {
  const label = packet.feature_label ?? packet.feature_id ?? packet.source_ref ?? packet.file_path ?? '';
  const sourceRef = normalizeRegistrySourceRef(packet.source_ref ?? edge?.source_ref ?? packet.file_path ?? '');
  const filePath = normalizeRegistrySourceRef(packet.file_path ?? edge?.file_path ?? '');
  const directoryPath = normalizeRegistrySourceRef(packet.directory_path ?? '');

  const structuralSymbols = uniq([
    ...toArray(structural?.symbol_name ? [structural.symbol_name] : []),
    ...toArray(structural?.symbol_kind ? [structural.symbol_kind] : []),
    ...toArray(structural?.structural_path),
    ...toArray(structural?.imports),
    ...toArray(structural?.calls),
    ...toArray(structural?.exports),
  ]);

  const lexicalKeywords = uniq([
    ...toArray(lexical?.keywords),
    ...toArray(domain?.domain_class ? [domain.domain_class] : []),
    ...splitTokens(label),
    ...pathTokens(sourceRef),
    ...pathTokens(filePath),
    ...pathTokens(directoryPath),
    ...toArray(packet.used_concepts),
  ]);

  const lexicalTerms = uniq([
    ...toArray(lexical?.identifiers),
    ...toArray(lexical?.symbols),
    ...splitTokens(label),
    ...splitTokens(packet.feature_id ?? ''),
    ...pathTokens(sourceRef),
    ...pathTokens(filePath),
    ...pathTokens(directoryPath),
  ]);

  const ontologySymbols = uniq(
    ontology.map((tuple) => tuple.object_id)
      .concat(ontology.map((tuple) => tuple.subject_id))
      .concat(ontology.filter((tuple) => tuple.predicate === 'USES_CONCEPT').flatMap((tuple) => {
        const obj = tuple.object_value && typeof tuple.object_value === 'object'
          ? String((tuple.object_value as { concept?: string }).concept ?? '')
          : '';
        return obj ? [obj] : [];
      })),
  );

  return {
    symbols: uniq([...structuralSymbols, ...toArray(lexical?.symbols), ...ontologySymbols]),
    astFacts: uniq([
      ...(structural?.tree_node_id ? [`tree_node_id:${structural.tree_node_id}`] : []),
      ...(typeof structural?.line_start === 'number' && typeof structural?.line_end === 'number'
        ? [`lines:${structural.line_start}-${structural.line_end}`]
        : []),
      ...(structural?.structural_path ? structural.structural_path.map((value) => `path:${value}`) : []),
      ...(structural?.imports ? structural.imports.map((value) => `imports:${value}`) : []),
      ...(structural?.calls ? structural.calls.map((value) => `calls:${value}`) : []),
      ...(structural?.exports ? structural.exports.map((value) => `exports:${value}`) : []),
      ...(edge?.role ? [`edge_role:${edge.role}`] : []),
      ...(edge?.entry_export ? [`entry_export:${edge.entry_export}`] : []),
    ]),
    keywords: lexicalKeywords,
    bm25Terms: lexicalTerms,
    identifiers: uniq([
      ...toArray(lexical?.identifiers),
      ...splitTokens(packet.feature_id ?? ''),
      ...(packet.tree_node_id ? [packet.tree_node_id] : []),
      ...(structural?.symbol_name ? [structural.symbol_name] : []),
    ]),
    fileTokens: uniq([
      ...pathTokens(sourceRef),
      ...pathTokens(filePath),
      ...pathTokens(directoryPath),
      ...(edge?.file_path ? pathTokens(edge.file_path) : []),
    ]),
  };
}

async function queryRows<T>(client: any, statement: string, values: unknown[] = []): Promise<T[]> {
  try {
    const result = await client.query(statement, values);
    return Array.isArray(result.rows) ? (result.rows as T[]) : [];
  } catch {
    return [];
  }
}

async function loadInput(limit: number | null): Promise<{
  packets: AtlasPacketRow[];
  domainFacts: DomainFactRow[];
  lexicalFacts: LexicalFactRow[];
  structuralFacts: StructuralFactRow[];
  ontologyFacts: OntologyFactRow[];
  fileEdges: FileEdgeRow[];
}> {
  const client = await pool.connect();
  try {
    const packetSql = `
      SELECT
        packet_key,
        source_ref,
        source_ref_key,
        file_path,
        directory_path,
        feature_id,
        feature_label,
        domain_class,
        tree_node_id,
        qdrant_point_id,
        som_cluster,
        som_row,
        som_col,
        kmeans_cluster,
        pagerank,
        pagerank_score,
        sha256,
        summary_hash,
        used_concepts
      FROM atlas_packets
      ORDER BY packet_key
      ${limit ? 'LIMIT $1' : ''}
    `;
    const packetValues = limit ? [limit] : [];

    const [packets, domainFacts, lexicalFacts, structuralFacts, ontologyFacts, fileEdges] = await Promise.all([
      queryRows<AtlasPacketRow>(client, packetSql, packetValues),
      queryRows<DomainFactRow>(client, `
        SELECT packet_key, source_ref, feature_key, domain_class, domain_confidence,
               classifier_kind, classifier_version, model_hash, feature_contract_version,
               content_hash, evidence
        FROM feature_domain_facts
      `),
      queryRows<LexicalFactRow>(client, `
        SELECT packet_key, source_ref, feature_key, keywords, identifiers, symbols,
               imported_modules, lexical_summary, language, content_hash
        FROM feature_lexical_facts
      `),
      queryRows<StructuralFactRow>(client, `
        SELECT packet_key, source_ref, feature_key, tree_node_id, symbol_name, symbol_kind,
               structural_path, line_start, line_end, imports, calls, exports, content_hash
        FROM feature_structural_facts
      `),
      queryRows<OntologyFactRow>(client, `
        SELECT packet_key, source_ref, feature_key, subject_type, subject_id, predicate,
               object_type, object_id, object_value, confidence, ontology_version,
               extractor_version, evidence, valid_from, valid_to
        FROM feature_ontology_tuples
      `),
      queryRows<FileEdgeRow>(client, `
        SELECT feature_key, file_path, entry_export, role, packet_key, source_ref, content_hash
        FROM feature_file_edges
      `),
    ]);

    return { packets, domainFacts, lexicalFacts, structuralFacts, ontologyFacts, fileEdges };
  } finally {
    client.release();
  }
}

function indexBy<T>(rows: readonly T[], keySelector: (row: T) => string | null | undefined): Map<string, T[]> {
  const out = new Map<string, T[]>();
  for (const row of rows) {
    const key = keySelector(row);
    if (!key) continue;
    const bucket = out.get(key) ?? [];
    bucket.push(row);
    out.set(key, bucket);
  }
  return out;
}

function selectOntologyRows(
  packet: AtlasPacketRow,
  ontologyByPacketKey: Map<string, OntologyFactRow[]>,
  ontologyBySourceRef: Map<string, OntologyFactRow[]>,
  ontologyByFeatureKey: Map<string, OntologyFactRow[]>,
): { rows: OntologyFactRow[]; joinMethod: JoinMethod; sourceTable: string } {
  const packetRows = ontologyByPacketKey.get(packet.packet_key);
  if (packetRows?.length) {
    return { rows: packetRows, joinMethod: 'packet_key', sourceTable: 'feature_ontology_tuples' };
  }

  const normalizedSource = normalizeRegistrySourceRef(packet.source_ref ?? '');
  const sourceRows = normalizedSource ? ontologyBySourceRef.get(normalizedSource) : undefined;
  if (sourceRows?.length) {
    return { rows: sourceRows, joinMethod: 'source_ref', sourceTable: 'feature_ontology_tuples' };
  }

  const featureKey = packet.feature_id ?? '';
  const featureRows = featureKey ? ontologyByFeatureKey.get(featureKey) : undefined;
  if (featureRows?.length) {
    return { rows: featureRows, joinMethod: 'feature_key_source_ref', sourceTable: 'feature_ontology_tuples' };
  }

  return { rows: [], joinMethod: 'unresolved', sourceTable: 'feature_ontology_tuples' };
}

async function materialize(limit: number | null, dryRun: boolean): Promise<MaterializerReport> {
  const generatedAt = new Date().toISOString();
  const { packets, domainFacts, lexicalFacts, structuralFacts, ontologyFacts, fileEdges } = await loadInput(limit);

  const domainByPacket = indexBy(domainFacts, (row) => row.packet_key);
  const domainBySource = indexBy(domainFacts, (row) => normalizeRegistrySourceRef(row.source_ref));
  const domainByFeature = indexBy(domainFacts, (row) => row.feature_key ?? null);

  const lexicalByPacket = indexBy(lexicalFacts, (row) => row.packet_key);
  const lexicalBySource = indexBy(lexicalFacts, (row) => normalizeRegistrySourceRef(row.source_ref));
  const lexicalByFeature = indexBy(lexicalFacts, (row) => row.feature_key ?? null);

  const structuralByPacket = indexBy(structuralFacts, (row) => row.packet_key);
  const structuralBySource = indexBy(structuralFacts, (row) => normalizeRegistrySourceRef(row.source_ref));
  const structuralByFeature = indexBy(structuralFacts, (row) => row.feature_key ?? null);

  const ontologyByPacket = indexBy(ontologyFacts, (row) => row.packet_key);
  const ontologyBySource = indexBy(ontologyFacts, (row) => normalizeRegistrySourceRef(row.source_ref));
  const ontologyByFeature = indexBy(ontologyFacts, (row) => row.feature_key ?? null);

  const edgesByPacket = indexBy(fileEdges, (row) => row.packet_key ?? null);
  const edgesBySource = indexBy(fileEdges, (row) => normalizeRegistrySourceRef(row.source_ref));
  const edgesByFeature = indexBy(fileEdges, (row) => row.feature_key);
  const edgesByPath = indexBy(fileEdges, (row) => normalizeRegistrySourceRef(row.file_path));

  const rows: MaterializedRegistryRecord[] = [];
  const summary: MaterializerSummary = {
    packetsSelected: packets.length,
    recordsEmitted: 0,
    normalizedRecords: 0,
    fallbackRecords: 0,
    unresolvedRecords: 0,
    ambiguousRecords: 0,
    duplicateRecords: 0,
    missingContentHashRecords: 0,
    countsBySourceTable: {},
    countsByJoinMethod: {},
    countsByFallbackReason: {},
    contentHashStatusCounts: {
      CANONICAL_SOURCE_HASH: 0,
      DERIVED_MIGRATION_HASH: 0,
      MISSING: 0,
      INVALID_PLACEHOLDER: 0,
    },
    schemaValidationFailures: 0,
  };

  const seen = new Set<string>();

  for (const packet of packets) {
    const sourceRef = coalesceText(
      packet.source_ref,
      packet.source_ref_key,
      packet.file_path,
      packet.directory_path,
    ) ?? packet.packet_key;

    const normalizedSourceRef = normalizeRegistrySourceRef(sourceRef);
    const normalizedFilePath = normalizeRegistrySourceRef(packet.file_path ?? '');
    const normalizedDirectory = normalizeRegistrySourceRef(packet.directory_path ?? '');
    const featureKey = packet.feature_id ?? packet.feature_label ?? null;

    const domainSelection = pickFirstFactRow<DomainFactRow>(
      [
        { key: packet.packet_key, joinMethod: 'packet_key' },
        { key: normalizedSourceRef, joinMethod: 'source_ref' },
        { key: featureKey, joinMethod: 'feature_key_source_ref' },
      ],
      [
        { sourceTable: 'feature_domain_facts', map: domainByPacket },
        { sourceTable: 'feature_domain_facts', map: domainBySource },
        { sourceTable: 'feature_domain_facts', map: domainByFeature },
      ],
    );
    const lexicalSelection = pickFirstFactRow<LexicalFactRow>(
      [
        { key: packet.packet_key, joinMethod: 'packet_key' },
        { key: normalizedSourceRef, joinMethod: 'source_ref' },
        { key: featureKey, joinMethod: 'feature_key_source_ref' },
      ],
      [
        { sourceTable: 'feature_lexical_facts', map: lexicalByPacket },
        { sourceTable: 'feature_lexical_facts', map: lexicalBySource },
        { sourceTable: 'feature_lexical_facts', map: lexicalByFeature },
      ],
    );
    const structuralSelection = pickFirstFactRow<StructuralFactRow>(
      [
        { key: packet.packet_key, joinMethod: 'packet_key' },
        { key: normalizedSourceRef, joinMethod: 'source_ref' },
        { key: featureKey, joinMethod: 'feature_key_source_ref' },
      ],
      [
        { sourceTable: 'feature_structural_facts', map: structuralByPacket },
        { sourceTable: 'feature_structural_facts', map: structuralBySource },
        { sourceTable: 'feature_structural_facts', map: structuralByFeature },
      ],
    );
    const ontologySelection = selectOntologyRows(packet, ontologyByPacket, ontologyBySource, ontologyByFeature);
    const edgeSelection = pickFirstFactRow<FileEdgeRow>(
      [
        { key: packet.packet_key, joinMethod: 'packet_key' },
        { key: normalizedSourceRef, joinMethod: 'source_ref' },
        { key: featureKey, joinMethod: 'feature_key_source_ref' },
        { key: normalizedFilePath, joinMethod: 'normalized_path' },
      ],
      [
        { sourceTable: 'feature_file_edges', map: edgesByPacket },
        { sourceTable: 'feature_file_edges', map: edgesBySource },
        { sourceTable: 'feature_file_edges', map: edgesByFeature },
        { sourceTable: 'feature_file_edges', map: edgesByPath },
      ],
    );

    const domain = domainSelection.row;
    const lexical = lexicalSelection.row;
    const structural = structuralSelection.row;
    const edge = edgeSelection.row;
    const ontology = ontologySelection.rows;

    const derived = buildDerivedTokens(packet, domain, lexical, structural, ontology, edge);

    const packetContentHash = coalesceText(
      packet.sha256,
      packet.summary_hash,
      domain?.content_hash,
      lexical?.content_hash,
      structural?.content_hash,
      edge?.content_hash,
    );
    const contentHashStatus = classifyContentHash(packet, packetContentHash);

    const fallbackUsed =
      domainSelection.sourceTable === 'atlas_packets' ||
      lexicalSelection.sourceTable === 'atlas_packets' ||
      structuralSelection.sourceTable === 'atlas_packets' ||
      edgeSelection.sourceTable === 'atlas_packets' ||
      ontologySelection.sourceTable === 'atlas_packets';

    const sourceTable = domain
      ? domainSelection.sourceTable
      : lexical
        ? lexicalSelection.sourceTable
        : structural
          ? structuralSelection.sourceTable
          : ontology.length
            ? ontologySelection.sourceTable
            : edge
              ? edgeSelection.sourceTable
              : 'atlas_packets';

    const finalJoinMethod: JoinMethod =
      domain ? domainSelection.joinMethod
        : lexical ? lexicalSelection.joinMethod
          : structural ? structuralSelection.joinMethod
            : ontology.length ? ontologySelection.joinMethod
              : edge ? edgeSelection.joinMethod
                : 'atlas_packets_fallback';

    const evidenceIds = uniq([
      ...(domain ? [`feature_domain_facts:${domain.packet_key}`] : []),
      ...(lexical ? [`feature_lexical_facts:${lexical.packet_key}`] : []),
      ...(structural ? [`feature_structural_facts:${structural.packet_key}`] : []),
      ...ontology.map((tuple) => `feature_ontology_tuples:${tuple.packet_key}:${tuple.predicate}:${tuple.object_id}`),
      ...(edge ? [`feature_file_edges:${edge.feature_key}:${edge.file_path}`] : []),
      ...(packet.packet_key ? [`atlas_packets:${packet.packet_key}`] : []),
    ]);

    const record: MaterializedRegistryRecord = {
      packetKey: packet.packet_key,
      sourceRef: normalizedSourceRef || sourceRef,
      contentHash: packetContentHash ?? null,
      contentHashStatus,
      sourceTable,
      joinMethod: finalJoinMethod,
      fallbackUsed,
      evidenceIds,
      processingPassId: 'phase-107-materializer',
      contractVersion: CONTRACT_VERSION,
      generatedAt,
      domainClass: domain?.domain_class ?? packet.domain_class ?? null,
      symbols: derived.symbols,
      astFacts: derived.astFacts,
      keywords: derived.keywords,
      bm25Terms: derived.bm25Terms,
      identifiers: derived.identifiers,
      fileTokens: derived.fileTokens,
      provenance: {
        domain: domain
          ? recordFieldProvenance(domainSelection.sourceTable, domainSelection.joinMethod, false, [`feature_domain_facts:${domain.packet_key}`])
          : recordFieldProvenance('atlas_packets', 'atlas_packets_fallback', true, [`atlas_packets:${packet.packet_key}`]),
        lexical: lexical
          ? recordFieldProvenance(lexicalSelection.sourceTable, lexicalSelection.joinMethod, false, [`feature_lexical_facts:${lexical.packet_key}`])
          : recordFieldProvenance('atlas_packets', 'atlas_packets_fallback', true, [`atlas_packets:${packet.packet_key}`]),
        structural: structural
          ? recordFieldProvenance(structuralSelection.sourceTable, structuralSelection.joinMethod, false, [`feature_structural_facts:${structural.packet_key}`])
          : recordFieldProvenance('atlas_packets', 'atlas_packets_fallback', true, [`atlas_packets:${packet.packet_key}`]),
        ontology: ontology.length
          ? recordFieldProvenance('feature_ontology_tuples', ontologySelection.joinMethod, false, ontology.map((tuple) => `feature_ontology_tuples:${tuple.packet_key}:${tuple.predicate}:${tuple.object_id}`))
          : recordFieldProvenance('atlas_packets', 'atlas_packets_fallback', true, [`atlas_packets:${packet.packet_key}`]),
        edges: edge
          ? recordFieldProvenance(edgeSelection.sourceTable, edgeSelection.joinMethod, false, [`feature_file_edges:${edge.feature_key}:${edge.file_path}`])
          : recordFieldProvenance('atlas_packets', 'atlas_packets_fallback', true, [`atlas_packets:${packet.packet_key}`]),
        packet: recordFieldProvenance('atlas_packets', fallbackUsed ? 'atlas_packets_fallback' : 'packet_key', fallbackUsed, [`atlas_packets:${packet.packet_key}`]),
      },
    };

    const duplicateKey = `${record.packetKey}:${record.sourceRef}`;
    if (seen.has(duplicateKey)) {
      summary.duplicateRecords += 1;
    } else {
      seen.add(duplicateKey);
    }

    if (!record.contentHash || record.contentHashStatus === 'MISSING') {
      summary.missingContentHashRecords += 1;
    }

    summary.contentHashStatusCounts[record.contentHashStatus] += 1;
    summary.countsBySourceTable[record.sourceTable] = (summary.countsBySourceTable[record.sourceTable] ?? 0) + 1;
    summary.countsByJoinMethod[record.joinMethod] = (summary.countsByJoinMethod[record.joinMethod] ?? 0) + 1;
    if (record.fallbackUsed) {
      summary.fallbackRecords += 1;
      const reason = !domain
        ? 'domain_fallback'
        : !lexical
          ? 'lexical_fallback'
          : !structural
            ? 'structural_fallback'
            : !ontology.length
              ? 'ontology_fallback'
              : !edge
                ? 'edge_fallback'
                : 'mixed_fallback';
      summary.countsByFallbackReason[reason] = (summary.countsByFallbackReason[reason] ?? 0) + 1;
    }
    if (record.sourceTable !== 'atlas_packets') {
      summary.normalizedRecords += 1;
    }

    if (!record.packetKey || !record.sourceRef) {
      summary.unresolvedRecords += 1;
    }
    if (record.contentHashStatus === 'INVALID_PLACEHOLDER') {
      summary.unresolvedRecords += 1;
    }

    rows.push(record);
  }

  summary.recordsEmitted = rows.length;

  let schemaValidationFailures = 0;
  for (const record of rows) {
    if (!record.packetKey || !record.sourceRef) {
      schemaValidationFailures += 1;
    }
  }
  summary.schemaValidationFailures = schemaValidationFailures;

  const duckDbInput = rows.map((row) => ({
    packetKey: row.packetKey,
    sourceRef: row.sourceRef,
    sourceTable: row.sourceTable,
    joinMethod: row.joinMethod,
    fallbackUsed: row.fallbackUsed,
    contentHashStatus: row.contentHashStatus,
    contentHash: row.contentHash,
  }));

  let duckDbProfile: DuckDbRegistryProfile | null = null;
  try {
    duckDbProfile = await profileRegistryRowsWithDuckDb(duckDbInput);
  } catch (error) {
    console.warn('DuckDB registry profiling failed:', error);
  }

  const duckDbValidation = compareDuckDbProfileToSummary(summary, duckDbProfile);

  if (!dryRun) {
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      for (const row of rows) {
        await client.query(
          `
            INSERT INTO registry_enrichment_projection (
              packet_key,
              source_ref,
              symbols,
              ast_facts,
              keywords,
              bm25_terms,
              identifiers,
              file_tokens,
              domain_class,
              materialization_version,
              created_at,
              updated_at
            ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, NOW(), NOW())
            ON CONFLICT (packet_key) DO UPDATE SET
              source_ref = EXCLUDED.source_ref,
              symbols = EXCLUDED.symbols,
              ast_facts = EXCLUDED.ast_facts,
              keywords = EXCLUDED.keywords,
              bm25_terms = EXCLUDED.bm25_terms,
              identifiers = EXCLUDED.identifiers,
              file_tokens = EXCLUDED.file_tokens,
              domain_class = EXCLUDED.domain_class,
              materialization_version = EXCLUDED.materialization_version,
              updated_at = NOW()
          `,
          [
            row.packetKey,
            row.sourceRef,
            row.symbols,
            row.astFacts,
            row.keywords,
            row.bm25Terms,
            row.identifiers,
            row.fileTokens,
            row.domainClass,
            MATERIALIZATION_VERSION,
          ],
        );
      }
      await client.query('COMMIT');
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }

  const report: MaterializerReport = {
    contractVersion: CONTRACT_VERSION,
    generatedAt,
    dryRun,
    limit,
    summary,
    duckDbProfile,
    duckDbValidation,
    sampleRows: rows.slice(0, 10).map((row) => ({
      packetKey: row.packetKey,
      sourceRef: row.sourceRef,
      contentHash: row.contentHash,
      contentHashStatus: row.contentHashStatus,
      sourceTable: row.sourceTable,
      joinMethod: row.joinMethod,
      fallbackUsed: row.fallbackUsed,
    })),
  };

  await fs.mkdir(path.dirname(DEFAULT_SMOKE_JSON), { recursive: true });
  await fs.writeFile(DEFAULT_SMOKE_JSON, `${JSON.stringify(report, null, 2)}\n`, 'utf8');
  await fs.writeFile(
    DEFAULT_SMOKE_MD,
    [
      '# Phase 107 Materializer Smoke',
      '',
      `Generated at: ${generatedAt}`,
      `Mode: ${dryRun ? 'DRY-RUN' : 'APPLY'}`,
      `Limit: ${limit ?? 'all'}`,
      '',
      '## Summary',
      '',
      `- packets selected: ${summary.packetsSelected}`,
      `- records emitted: ${summary.recordsEmitted}`,
      `- normalized records: ${summary.normalizedRecords}`,
      `- fallback records: ${summary.fallbackRecords}`,
      `- unresolved records: ${summary.unresolvedRecords}`,
      `- ambiguous records: ${summary.ambiguousRecords}`,
      `- duplicate records: ${summary.duplicateRecords}`,
      `- missing content hash records: ${summary.missingContentHashRecords}`,
      `- schema validation failures: ${summary.schemaValidationFailures}`,
      '',
      '## Counts by source table',
      '',
      ...Object.entries(summary.countsBySourceTable).map(([key, value]) => `- ${key}: ${value}`),
      '',
      '## Counts by join method',
      '',
      ...Object.entries(summary.countsByJoinMethod).map(([key, value]) => `- ${key}: ${value}`),
      '',
      '## Counts by fallback reason',
      '',
      ...Object.entries(summary.countsByFallbackReason).map(([key, value]) => `- ${key}: ${value}`),
      '',
      '## Hash status',
      '',
      ...Object.entries(summary.contentHashStatusCounts).map(([key, value]) => `- ${key}: ${value}`),
      '',
      '## DuckDB profile',
      '',
      `- available: ${duckDbProfile ? 'yes' : 'no'}`,
      `- matches summary: ${duckDbValidation.matchesSummary ? 'yes' : 'no'}`,
      ...(duckDbValidation.mismatches.length > 0
        ? [
            '- mismatches:',
            ...duckDbValidation.mismatches.map((value) => `  - ${value}`),
          ]
        : []),
      ...(duckDbProfile
        ? [
            `- rowCount: ${duckDbProfile.rowCount}`,
            `- normalizedRecords: ${duckDbProfile.normalizedRecords}`,
            `- fallbackRecords: ${duckDbProfile.fallbackRecords}`,
            `- unresolvedRecords: ${duckDbProfile.unresolvedRecords}`,
            `- duplicateRecords: ${duckDbProfile.duplicateRecords}`,
            `- missingContentHashRecords: ${duckDbProfile.missingContentHashRecords}`,
          ]
        : []),
      '',
      '## Sample rows',
      '',
      ...report.sampleRows.map((row) => `- ${row.packetKey} | ${row.sourceRef} | ${row.sourceTable} | ${row.joinMethod} | ${row.contentHashStatus}`),
      '',
    ].join('\n'),
    'utf8',
  );

  return report;
}

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  const dryRun = args.includes('--dry-run');
  const limitArg = args.find((arg) => arg.startsWith('--limit='));
  const limit = limitArg ? Number.parseInt(limitArg.split('=')[1] ?? '', 10) : null;
  const boundedLimit = Number.isFinite(limit) && limit !== null && limit > 0 ? limit : null;

  console.log('🔧 Materializing Registry Enrichment Projection');
  console.log(`Mode: ${dryRun ? 'DRY-RUN' : 'APPLY'}`);
  console.log(`Limit: ${boundedLimit ?? 'all'}`);
  console.log(`Contract: ${CONTRACT_VERSION}`);

  try {
    const report = await materialize(boundedLimit, dryRun);
    console.log('\n📊 Materializer summary');
    console.log(JSON.stringify(report.summary, null, 2));
    console.log(`\nReport written: ${DEFAULT_SMOKE_MD}`);
    console.log(`Report written: ${DEFAULT_SMOKE_JSON}`);

    const exitCode = report.summary.schemaValidationFailures > 0 ? 1 : 0;
    process.exit(exitCode);
  } catch (error) {
    console.error('❌ Materialization failed:', error);
    process.exit(1);
  }
}

main();
