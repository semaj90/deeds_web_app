import { z } from 'zod';
import {
  type FeatureResolutionV1,
  type FeatureResolutionProposalV1,
  FeatureResolutionV1Schema,
  FeatureRegistryLookupV1Schema,
  FeatureResolutionLookupV1Schema,
} from './contracts/feature-resolution-v1.js';
import { pool } from '../db/client.js';

const sourceRefsSchema = z.array(z.string().trim().min(1).max(1024)).max(2048);
const requiredRegistryColumns = new Set([
  'id', 'feature_key', 'title', 'description', 'status', 'summary', 'source_refs',
  'chunk_ids', 'tags', 'code_refs', 'test_refs', 'retry_queries', 'cluster_id',
  'trust_tier', 'last_verified_at',
]);
const registryRowSchema = z.object({
  feature_key: z.string().trim().min(1).max(512),
  title: z.string().trim().min(1).max(512),
  source_refs: sourceRefsSchema,
}).strict();

type ReadQueryResult = { rows: Record<string, unknown>[] };
type ReadQuery = (text: string, values?: unknown[]) => Promise<ReadQueryResult>;

async function queryRegistry(text: string, values?: unknown[]): Promise<ReadQueryResult> {
  const result = await pool.query(text, values);
  return { rows: result.rows as Record<string, unknown>[] };
}

function unresolved(reason: 'NO_MATCH' | 'AMBIGUOUS_MATCH' | 'SOURCE_REF_MISMATCH' | 'REGISTRY_UNAVAILABLE' | 'INVALID_LOOKUP'):
  FeatureResolutionProposalV1 {
  return { state: 'UNRESOLVED', reason, canonicalAuthority: false };
}

export async function resolveFeatureRegistryV1(
  input: unknown,
  readQuery: ReadQuery = queryRegistry,
): Promise<FeatureResolutionProposalV1> {
  const parsed = FeatureRegistryLookupV1Schema.safeParse(input);
  if (!parsed.success) return unresolved('INVALID_LOOKUP');

  try {
    const catalog = await readQuery("SELECT to_regclass('public.feature_registry') AS registry_table");
    if (!catalog.rows[0]?.registry_table) {
      return { state: 'REGISTRY_ABSENT', reason: 'NO_CANONICAL_REGISTRY', canonicalAuthority: false };
    }

    const columns = await readQuery(
      `SELECT column_name FROM information_schema.columns
       WHERE table_schema = 'public' AND table_name = 'feature_registry'`,
    );
    const columnNames = new Set(columns.rows.map((row) => String(row.column_name)));
    if (columnNames.size !== requiredRegistryColumns.size || [...requiredRegistryColumns].some((name) => !columnNames.has(name))) {
      return unresolved('REGISTRY_UNAVAILABLE');
    }

    const rows = await readQuery(
      `SELECT feature_key, title, source_refs FROM public.feature_registry
       WHERE feature_key = $1 LIMIT 2`,
      [parsed.data.featureKey],
    );
    if (rows.rows.length === 0) return unresolved('NO_MATCH');
    if (rows.rows.length !== 1) return unresolved('AMBIGUOUS_MATCH');

    const row = registryRowSchema.safeParse(rows.rows[0]);
    if (!row.success) return unresolved('REGISTRY_UNAVAILABLE');
    if (row.data.feature_key !== parsed.data.featureKey) return unresolved('NO_MATCH');
    if (!row.data.source_refs.includes(parsed.data.sourceRef)) return unresolved('SOURCE_REF_MISMATCH');

    return FeatureResolutionV1Schema.parse({
      state: 'PROPOSED',
      proposedFeatureId: row.data.feature_key,
      proposedLabel: row.data.title,
      sourceRef: parsed.data.sourceRef,
      sourceRevision: null,
      method: 'review_candidate',
      registryStatus: 'PRESENT',
      canonicalAuthority: false,
    }) as FeatureResolutionProposalV1;
  } catch {
    return unresolved('REGISTRY_UNAVAILABLE');
  }
}

export interface FeatureResolutionReadOnlyClientV1 {
  query(text: string, values?: unknown[]): Promise<{ rows: Record<string, unknown>[] }>;
}

export interface FeatureRegistryReadOnlyInspectionV1 {
  databaseName: string | null;
  serverVersion: string | null;
  resolution: FeatureResolutionProposalV1;
}

export async function resolveFeatureRegistryReadOnlyTransactionV1(
  input: unknown,
  client: FeatureResolutionReadOnlyClientV1,
): Promise<FeatureRegistryReadOnlyInspectionV1> {
  const parsed = FeatureRegistryLookupV1Schema.safeParse(input);
  if (!parsed.success) {
    return {
      databaseName: null,
      serverVersion: null,
      resolution: unresolved('INVALID_LOOKUP'),
    };
  }

  let transactionStarted = false;
  let databaseName: string | null = null;
  let serverVersion: string | null = null;
  try {
    await client.query('BEGIN READ ONLY');
    transactionStarted = true;
    await client.query("SET LOCAL statement_timeout = '3000ms'");
    const scope = await client.query(
      `SELECT current_database() AS database_name,
              current_setting('server_version') AS server_version`,
    );
    databaseName = typeof scope.rows[0]?.database_name === 'string' ? scope.rows[0].database_name : null;
    serverVersion = typeof scope.rows[0]?.server_version === 'string' ? scope.rows[0].server_version : null;
    const resolution = await resolveFeatureRegistryV1(parsed.data, (text, values) => client.query(text, values));
    await client.query('ROLLBACK');
    transactionStarted = false;
    return { databaseName, serverVersion, resolution };
  } catch {
    if (transactionStarted) {
      try {
        await client.query('ROLLBACK');
      } catch {
        return {
          databaseName,
          serverVersion,
          resolution: unresolved('REGISTRY_UNAVAILABLE'),
        };
      }
    }
    return {
      databaseName,
      serverVersion,
      resolution: unresolved('REGISTRY_UNAVAILABLE'),
    };
  }
}

export function resolveFeatureCandidateV1(input: unknown): FeatureResolutionProposalV1 {
  const parsed = FeatureResolutionLookupV1Schema.safeParse(input);
  if (!parsed.success) {
    return { state: 'UNRESOLVED', reason: 'INVALID_LOOKUP', canonicalAuthority: false };
  }

  const { sourceRef, registryStatus, candidates } = parsed.data;
  const sourceMatches = candidates.filter((candidate) => candidate.sourceRef === sourceRef);
  if (sourceMatches.length > 1) {
    return { state: 'UNRESOLVED', reason: 'AMBIGUOUS_MATCH', canonicalAuthority: false };
  }
  if (sourceMatches.length === 0 && candidates.length > 0) {
    return { state: 'UNRESOLVED', reason: 'SOURCE_REF_MISMATCH', canonicalAuthority: false };
  }

  const candidate = sourceMatches[0];
  if (candidate) {
    const proposal: FeatureResolutionV1 = {
      state: 'PROPOSED',
      proposedFeatureId: candidate.featureId,
      proposedLabel: candidate.featureLabel,
      sourceRef: candidate.sourceRef,
      sourceRevision: candidate.sourceRevision,
      method: candidate.method,
      registryStatus,
      canonicalAuthority: false,
    };
    return FeatureResolutionV1Schema.parse(proposal) as FeatureResolutionProposalV1;
  }

  if (registryStatus === 'ABSENT') {
    return { state: 'REGISTRY_ABSENT', reason: 'NO_CANONICAL_REGISTRY', canonicalAuthority: false };
  }
  if (registryStatus === 'UNAVAILABLE') {
    return { state: 'UNRESOLVED', reason: 'REGISTRY_UNAVAILABLE', canonicalAuthority: false };
  }
  return { state: 'UNRESOLVED', reason: 'NO_MATCH', canonicalAuthority: false };
}

export function resolveBatchFeatureCandidatesV1(inputs: unknown[]): FeatureResolutionProposalV1[] {
  return inputs.map(resolveFeatureCandidateV1);
}
