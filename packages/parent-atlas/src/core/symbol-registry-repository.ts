import { createHash } from 'node:crypto';
import type { Pool, PoolClient } from 'pg';
import { z } from 'zod';
import {
  symbolResolutionSchema,
  symbolVersionSchema,
  type StructuralSymbolNominationV1,
  type SymbolResolutionV1,
  type SymbolVersionV1,
} from './structural-symbol.js';

const id = z.string().min(1);
const revision = z.string().min(1);

export const symbolRegistryReadbackReceiptSchema = z.object({
  schema: z.literal('atlas.symbol-registry-readback-receipt.v1').default('atlas.symbol-registry-readback-receipt.v1'),
  stable_symbol_id: id,
  registry_revision: revision,
  alias_count: z.number().int().nonnegative(),
  version_count: z.number().int().nonnegative(),
  source_revision: revision,
  checksum: z.string().regex(/^[a-f0-9]{64}$/),
  producer_revision: revision,
}).strict();

export type SymbolRegistryReadbackReceiptV1 = z.infer<typeof symbolRegistryReadbackReceiptSchema>;

function sha256(value: string): string {
  return createHash('sha256').update(value, 'utf8').digest('hex');
}

function canonicalStableSymbolId(nomination: StructuralSymbolNominationV1): string {
  return `symbol:${sha256(JSON.stringify([
    nomination.language.toLowerCase(),
    nomination.kind,
    nomination.symbol_key,
  ])).slice(0, 40)}`;
}

function canonicalSymbolVersionId(stableSymbolId: string, nomination: StructuralSymbolNominationV1): string {
  return `symbol-version:${sha256(JSON.stringify([
    stableSymbolId,
    nomination.source_revision,
    nomination.upstream_node_id,
    nomination.declaration_hash,
  ])).slice(0, 40)}`;
}

async function withClient<T>(pool: Pool, fn: (client: PoolClient) => Promise<T>): Promise<T> {
  const client = await pool.connect();
  try {
    return await fn(client);
  } finally {
    client.release();
  }
}

async function resolveNominationAgainstRegistry(
  pool: Pool,
  input: { nomination: StructuralSymbolNominationV1; registry_revision: string },
): Promise<SymbolResolutionV1> {
  const { nomination } = input;
  return withClient(pool, async (client) => {
    const result = await client.query<{ stable_symbol_id: string; basis: string }>(`
      SELECT stable_symbol_id, basis
      FROM (
        SELECT stable_symbol_id, 'exact_symbol_key'::text AS basis, 1 AS priority
        FROM atlas_symbol_registry
        WHERE canonical_key = $1 AND status = 'active'
        UNION ALL
        SELECT a.stable_symbol_id, 'existing_alias'::text AS basis, 2 AS priority
        FROM atlas_symbol_aliases a
        JOIN atlas_symbol_registry r USING (stable_symbol_id)
        WHERE a.alias_key = $1 AND r.status = 'active'
        UNION ALL
        SELECT a.stable_symbol_id, 'existing_alias'::text AS basis, 3 AS priority
        FROM atlas_symbol_aliases a
        JOIN atlas_symbol_registry r USING (stable_symbol_id)
        WHERE $2::text IS NOT NULL
          AND a.alias_key = ('upstream-symbol:' || $2::text)
          AND r.status = 'active'
      ) q
      ORDER BY priority, stable_symbol_id
    `, [nomination.symbol_key, nomination.upstream_symbol_id ?? null]);

    const ids = [...new Set(result.rows.map((row) => row.stable_symbol_id))];
    if (ids.length === 1) {
      const row = result.rows.find((item) => item.stable_symbol_id === ids[0])!;
      return symbolResolutionSchema.parse({
        nomination_id: nomination.nomination_id,
        symbol_key: nomination.symbol_key,
        status: 'canonical',
        stable_symbol_id: ids[0],
        registry_revision: input.registry_revision,
        resolution_basis: row.basis === 'exact_symbol_key' ? 'exact_symbol_key' : 'existing_alias',
        candidate_symbol_ids: ids,
        evidence_refs: [],
      });
    }

    if (ids.length > 1) {
      return symbolResolutionSchema.parse({
        nomination_id: nomination.nomination_id,
        symbol_key: nomination.symbol_key,
        status: 'ambiguous',
        registry_revision: input.registry_revision,
        resolution_basis: 'unresolved',
        candidate_symbol_ids: ids,
        evidence_refs: [],
      });
    }

    return symbolResolutionSchema.parse({
      nomination_id: nomination.nomination_id,
      symbol_key: nomination.symbol_key,
      status: 'unresolved',
      registry_revision: input.registry_revision,
      resolution_basis: 'unresolved',
      candidate_symbol_ids: [],
      evidence_refs: [],
    });
  });
}

export type SymbolRegistryRepository = ReturnType<typeof createSymbolRegistryRepository>;

export function createSymbolRegistryRepository(pool: Pool) {
  return {
    resolveNomination(input: {
      nomination: StructuralSymbolNominationV1;
      registry_revision: string;
    }): Promise<SymbolResolutionV1> {
      return resolveNominationAgainstRegistry(pool, input);
    },

    async promoteNomination(input: {
      nomination: StructuralSymbolNominationV1;
      registry_revision: string;
      producer_revision: string;
      allow_create: boolean;
      evidence_refs?: string[];
    }): Promise<{ resolution: SymbolResolutionV1; version: SymbolVersionV1 }> {
      if (!input.allow_create) throw new Error('SYMBOL_PROMOTION_REQUIRES_EXPLICIT_ALLOW_CREATE');

      const nomination = input.nomination;
      const existing = await resolveNominationAgainstRegistry(pool, {
        nomination,
        registry_revision: input.registry_revision,
      });
      const stableSymbolId = existing.status === 'canonical' && existing.stable_symbol_id
        ? existing.stable_symbol_id
        : canonicalStableSymbolId(nomination);
      const symbolVersionId = canonicalSymbolVersionId(stableSymbolId, nomination);

      await withClient(pool, async (client) => {
        await client.query('BEGIN');
        try {
          await client.query(`
            INSERT INTO atlas_symbol_registry (
              stable_symbol_id, canonical_key, language, symbol_kind,
              canonical_name, canonical_qualified_name,
              created_from_nomination_id, created_from_source_ref,
              created_from_source_revision, registry_revision
            ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)
            ON CONFLICT (stable_symbol_id) DO UPDATE SET
              updated_at = now(), registry_revision = EXCLUDED.registry_revision
          `, [stableSymbolId, nomination.symbol_key, nomination.language, nomination.kind,
            nomination.name, nomination.qualified_name, nomination.nomination_id,
            nomination.source_ref, nomination.source_revision, input.registry_revision]);

          const aliases: Array<[string, string]> = [
            [nomination.symbol_key, 'symbol_key'],
            [nomination.qualified_name, 'qualified_name'],
          ];
          if (nomination.upstream_symbol_id) aliases.push([`upstream-symbol:${nomination.upstream_symbol_id}`, 'upstream_symbol_id']);

          for (const [aliasKey, aliasKind] of aliases) {
            await client.query(`
              INSERT INTO atlas_symbol_aliases (
                alias_key, stable_symbol_id, alias_kind, source_ref,
                source_revision, evidence_refs, registry_revision
              ) VALUES ($1,$2,$3,$4,$5,$6::jsonb,$7)
              ON CONFLICT (alias_key, stable_symbol_id) DO NOTHING
            `, [aliasKey, stableSymbolId, aliasKind, nomination.source_ref,
              nomination.source_revision, JSON.stringify(input.evidence_refs ?? []), input.registry_revision]);
          }

          await client.query(`
            INSERT INTO atlas_symbol_versions (
              symbol_version_id, stable_symbol_id, source_ref, source_revision,
              workspace_revision, upstream_node_id, upstream_symbol_id,
              upstream_chunk_id, qualified_name, declaration_hash,
              signature_normalized, byte_start, byte_end, parent_route,
              producer_revision
            ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14::jsonb,$15)
            ON CONFLICT (symbol_version_id) DO NOTHING
          `, [symbolVersionId, stableSymbolId, nomination.source_ref, nomination.source_revision,
            nomination.workspace_revision, nomination.upstream_node_id,
            nomination.upstream_symbol_id ?? null, nomination.upstream_chunk_id,
            nomination.qualified_name, nomination.declaration_hash,
            nomination.signature_normalized ?? null, nomination.byte_start, nomination.byte_end,
            JSON.stringify(nomination.parent_route), input.producer_revision]);
          await client.query('COMMIT');
        } catch (error) {
          await client.query('ROLLBACK');
          throw error;
        }
      });

      const version = symbolVersionSchema.parse({
        stable_symbol_id: stableSymbolId,
        symbol_version_id: symbolVersionId,
        symbol_key: nomination.symbol_key,
        source_ref: nomination.source_ref,
        source_revision: nomination.source_revision,
        workspace_revision: nomination.workspace_revision,
        upstream_node_id: nomination.upstream_node_id,
        upstream_symbol_id: nomination.upstream_symbol_id,
        upstream_chunk_id: nomination.upstream_chunk_id,
        qualified_name: nomination.qualified_name,
        declaration_hash: nomination.declaration_hash,
        signature_normalized: nomination.signature_normalized,
        producer_revision: input.producer_revision,
      });

      return {
        resolution: symbolResolutionSchema.parse({
          nomination_id: nomination.nomination_id,
          symbol_key: nomination.symbol_key,
          status: 'canonical',
          stable_symbol_id: stableSymbolId,
          registry_revision: input.registry_revision,
          resolution_basis: existing.status === 'canonical' ? existing.resolution_basis : 'human_review',
          candidate_symbol_ids: [stableSymbolId],
          evidence_refs: input.evidence_refs ?? [],
        }),
        version,
      };
    },

    async readbackReceipt(input: {
      stable_symbol_id: string;
      registry_revision: string;
      source_revision: string;
      producer_revision: string;
    }): Promise<SymbolRegistryReadbackReceiptV1> {
      return withClient(pool, async (client) => {
        const registry = await client.query(`SELECT * FROM atlas_symbol_registry WHERE stable_symbol_id = $1`, [input.stable_symbol_id]);
        if (registry.rowCount !== 1) throw new Error(`SYMBOL_READBACK_MISSING:${input.stable_symbol_id}`);
        const aliases = await client.query(`SELECT alias_key, alias_kind FROM atlas_symbol_aliases WHERE stable_symbol_id = $1 ORDER BY alias_key, alias_kind`, [input.stable_symbol_id]);
        const versions = await client.query(`SELECT symbol_version_id, source_revision, declaration_hash, upstream_node_id FROM atlas_symbol_versions WHERE stable_symbol_id = $1 ORDER BY symbol_version_id`, [input.stable_symbol_id]);
        const checksum = sha256(JSON.stringify({ registry: registry.rows[0], aliases: aliases.rows, versions: versions.rows }));
        return symbolRegistryReadbackReceiptSchema.parse({
          stable_symbol_id: input.stable_symbol_id,
          registry_revision: input.registry_revision,
          alias_count: aliases.rowCount ?? aliases.rows.length,
          version_count: versions.rowCount ?? versions.rows.length,
          source_revision: input.source_revision,
          checksum,
          producer_revision: input.producer_revision,
        });
      });
    },
  };
}
