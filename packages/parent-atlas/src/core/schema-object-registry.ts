import { createHash } from 'node:crypto';
import type { Pool, PoolClient } from 'pg';
import { z } from 'zod';

const id = z.string().min(1);
const revision = z.string().min(1);

export const SCHEMA_OBJECT_KINDS = [
  'database', 'schema', 'table', 'view', 'column', 'foreign_key', 'index',
  'database_policy', 'constraint', 'database_function', 'trigger',
] as const;
export const schemaObjectKindSchema = z.enum(SCHEMA_OBJECT_KINDS);

export const schemaObjectNominationSchema = z.object({
  schema: z.literal('atlas.schema-object-nomination.v1').default('atlas.schema-object-nomination.v1'),
  nomination_id: id,
  object_key: id,
  identity_status: z.literal('nominated').default('nominated'),
  kind: schemaObjectKindSchema,
  database_key: id,
  schema_name: z.string().min(1),
  object_name: z.string().min(1),
  parent_object_key: id.nullable().optional(),
  qualified_name: z.string().min(1),
  source_ref: z.string().min(1),
  source_revision: revision,
  schema_revision: revision,
  catalog_oid: z.number().int().nonnegative().nullable().optional(),
  definition_hash: z.string().regex(/^[a-f0-9]{64}$/),
  extractor_revision: revision,
  canonical_authority: z.literal(false).default(false),
}).strict();

export const schemaObjectResolutionSchema = z.object({
  schema: z.literal('atlas.schema-object-resolution.v1').default('atlas.schema-object-resolution.v1'),
  nomination_id: id,
  object_key: id,
  status: z.enum(['canonical', 'ambiguous', 'unresolved']),
  stable_schema_object_id: id.nullable().optional(),
  registry_revision: revision,
  resolution_basis: z.enum(['exact_object_key', 'existing_alias', 'explicit_rename', 'explicit_move', 'human_review', 'unresolved']),
  candidate_ids: z.array(id).default([]),
  evidence_refs: z.array(id).default([]),
}).strict().superRefine((value, ctx) => {
  if (value.status === 'canonical' && !value.stable_schema_object_id) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['stable_schema_object_id'], message: 'canonical resolution requires stable_schema_object_id' });
  }
});

export const schemaObjectVersionSchema = z.object({
  schema: z.literal('atlas.schema-object-version.v1').default('atlas.schema-object-version.v1'),
  schema_object_version_id: id,
  stable_schema_object_id: id,
  object_key: id,
  kind: schemaObjectKindSchema,
  qualified_name: z.string().min(1),
  source_ref: z.string().min(1),
  source_revision: revision,
  schema_revision: revision,
  parent_stable_schema_object_id: id.nullable().optional(),
  catalog_oid: z.number().int().nonnegative().nullable().optional(),
  definition_hash: z.string().regex(/^[a-f0-9]{64}$/),
  producer_revision: revision,
}).strict();

export const schemaObjectReadbackReceiptSchema = z.object({
  schema: z.literal('atlas.schema-object-readback-receipt.v1').default('atlas.schema-object-readback-receipt.v1'),
  stable_schema_object_id: id,
  registry_revision: revision,
  alias_count: z.number().int().nonnegative(),
  version_count: z.number().int().nonnegative(),
  checksum: z.string().regex(/^[a-f0-9]{64}$/),
  producer_revision: revision,
}).strict();

export type SchemaObjectNominationV1 = z.infer<typeof schemaObjectNominationSchema>;
export type SchemaObjectResolutionV1 = z.infer<typeof schemaObjectResolutionSchema>;
export type SchemaObjectVersionV1 = z.infer<typeof schemaObjectVersionSchema>;
export type SchemaObjectReadbackReceiptV1 = z.infer<typeof schemaObjectReadbackReceiptSchema>;

function hash(value: unknown): string {
  return createHash('sha256').update(JSON.stringify(value), 'utf8').digest('hex');
}

export function deriveSchemaObjectKey(input: {
  database_key: string;
  schema_name: string;
  kind: z.infer<typeof schemaObjectKindSchema>;
  qualified_name: string;
}): string {
  return `schema-key:${hash([
    input.database_key.normalize('NFC'),
    input.schema_name.normalize('NFC'),
    input.kind,
    input.qualified_name.normalize('NFC'),
  ]).slice(0, 40)}`;
}

export function deriveSchemaObjectNominationId(input: {
  object_key: string;
  schema_revision: string;
  definition_hash: string;
}): string {
  return `schema-nomination:${hash([input.object_key, input.schema_revision, input.definition_hash]).slice(0, 40)}`;
}

function stableId(nomination: SchemaObjectNominationV1): string {
  return `schema-object:${hash([nomination.kind, nomination.object_key]).slice(0, 40)}`;
}

function versionId(stableSchemaObjectId: string, nomination: SchemaObjectNominationV1): string {
  return `schema-object-version:${hash([
    stableSchemaObjectId,
    nomination.schema_revision,
    nomination.definition_hash,
  ]).slice(0, 40)}`;
}

async function withClient<T>(pool: Pool, fn: (client: PoolClient) => Promise<T>): Promise<T> {
  const client = await pool.connect();
  try { return await fn(client); } finally { client.release(); }
}

export function createSchemaObjectRegistryRepository(pool: Pool) {
  const resolveNomination = async (input: {
    nomination: SchemaObjectNominationV1;
    registry_revision: string;
  }): Promise<SchemaObjectResolutionV1> => withClient(pool, async (client) => {
    const rows = await client.query<{ stable_schema_object_id: string; basis: string }>(`
      SELECT stable_schema_object_id, basis FROM (
        SELECT stable_schema_object_id, 'exact_object_key'::text basis, 1 priority
        FROM atlas_schema_object_registry
        WHERE canonical_key = $1 AND status = 'active'
        UNION ALL
        SELECT a.stable_schema_object_id, 'existing_alias'::text basis, 2 priority
        FROM atlas_schema_object_aliases a
        JOIN atlas_schema_object_registry r USING (stable_schema_object_id)
        WHERE a.alias_key = $1 AND r.status = 'active'
      ) q ORDER BY priority, stable_schema_object_id
    `, [input.nomination.object_key]);
    const ids = [...new Set(rows.rows.map((row) => row.stable_schema_object_id))];
    if (ids.length === 1) {
      return schemaObjectResolutionSchema.parse({
        nomination_id: input.nomination.nomination_id,
        object_key: input.nomination.object_key,
        status: 'canonical', stable_schema_object_id: ids[0], registry_revision: input.registry_revision,
        resolution_basis: rows.rows[0]?.basis === 'exact_object_key' ? 'exact_object_key' : 'existing_alias', candidate_ids: ids,
      });
    }
    return schemaObjectResolutionSchema.parse({
      nomination_id: input.nomination.nomination_id,
      object_key: input.nomination.object_key,
      status: ids.length > 1 ? 'ambiguous' : 'unresolved',
      registry_revision: input.registry_revision,
      resolution_basis: 'unresolved', candidate_ids: ids,
    });
  });

  return {
    resolveNomination,

    async promoteNomination(input: {
      nomination: SchemaObjectNominationV1;
      registry_revision: string;
      producer_revision: string;
      allow_create: boolean;
      evidence_refs?: string[];
      parent_stable_schema_object_id?: string | null;
    }): Promise<{ resolution: SchemaObjectResolutionV1; version: SchemaObjectVersionV1 }> {
      if (!input.allow_create) throw new Error('SCHEMA_OBJECT_PROMOTION_REQUIRES_EXPLICIT_ALLOW_CREATE');
      const existing = await resolveNomination({ nomination: input.nomination, registry_revision: input.registry_revision });
      const stableSchemaObjectId = existing.status === 'canonical' && existing.stable_schema_object_id
        ? existing.stable_schema_object_id
        : stableId(input.nomination);
      const schemaObjectVersionId = versionId(stableSchemaObjectId, input.nomination);

      await withClient(pool, async (client) => {
        await client.query('BEGIN');
        try {
          await client.query(`
            INSERT INTO atlas_schema_object_registry (
              stable_schema_object_id, canonical_key, object_kind, database_key, schema_name,
              canonical_name, canonical_qualified_name, created_from_nomination_id,
              created_from_source_ref, created_from_source_revision, registry_revision
            ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)
            ON CONFLICT (stable_schema_object_id) DO UPDATE SET updated_at=now(), registry_revision=EXCLUDED.registry_revision
          `, [stableSchemaObjectId, input.nomination.object_key, input.nomination.kind, input.nomination.database_key,
            input.nomination.schema_name, input.nomination.object_name, input.nomination.qualified_name,
            input.nomination.nomination_id, input.nomination.source_ref, input.nomination.source_revision, input.registry_revision]);

          for (const [aliasKey, aliasKind] of [
            [input.nomination.object_key, 'object_key'],
            [input.nomination.qualified_name, 'qualified_name'],
          ] as const) {
            await client.query(`
              INSERT INTO atlas_schema_object_aliases (
                alias_key, stable_schema_object_id, alias_kind, source_ref, source_revision, evidence_refs, registry_revision
              ) VALUES ($1,$2,$3,$4,$5,$6::jsonb,$7)
              ON CONFLICT (alias_key, stable_schema_object_id) DO NOTHING
            `, [aliasKey, stableSchemaObjectId, aliasKind, input.nomination.source_ref, input.nomination.source_revision,
              JSON.stringify(input.evidence_refs ?? []), input.registry_revision]);
          }

          await client.query(`
            INSERT INTO atlas_schema_object_versions (
              schema_object_version_id, stable_schema_object_id, object_key, object_kind,
              qualified_name, source_ref, source_revision, schema_revision,
              parent_stable_schema_object_id, catalog_oid, definition_hash, producer_revision
            ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)
            ON CONFLICT (schema_object_version_id) DO NOTHING
          `, [schemaObjectVersionId, stableSchemaObjectId, input.nomination.object_key, input.nomination.kind,
            input.nomination.qualified_name, input.nomination.source_ref, input.nomination.source_revision,
            input.nomination.schema_revision, input.parent_stable_schema_object_id ?? null,
            input.nomination.catalog_oid ?? null, input.nomination.definition_hash, input.producer_revision]);
          await client.query('COMMIT');
        } catch (error) {
          await client.query('ROLLBACK');
          throw error;
        }
      });

      return {
        resolution: schemaObjectResolutionSchema.parse({
          nomination_id: input.nomination.nomination_id,
          object_key: input.nomination.object_key,
          status: 'canonical', stable_schema_object_id: stableSchemaObjectId,
          registry_revision: input.registry_revision,
          resolution_basis: existing.status === 'canonical' ? existing.resolution_basis : 'human_review',
          candidate_ids: [stableSchemaObjectId], evidence_refs: input.evidence_refs ?? [],
        }),
        version: schemaObjectVersionSchema.parse({
          schema_object_version_id: schemaObjectVersionId,
          stable_schema_object_id: stableSchemaObjectId,
          object_key: input.nomination.object_key,
          kind: input.nomination.kind,
          qualified_name: input.nomination.qualified_name,
          source_ref: input.nomination.source_ref,
          source_revision: input.nomination.source_revision,
          schema_revision: input.nomination.schema_revision,
          parent_stable_schema_object_id: input.parent_stable_schema_object_id ?? null,
          catalog_oid: input.nomination.catalog_oid ?? null,
          definition_hash: input.nomination.definition_hash,
          producer_revision: input.producer_revision,
        }),
      };
    },

    async readback(input: { stable_schema_object_id: string; producer_revision: string }): Promise<SchemaObjectReadbackReceiptV1> {
      return withClient(pool, async (client) => {
        const registry = await client.query(`SELECT * FROM atlas_schema_object_registry WHERE stable_schema_object_id=$1`, [input.stable_schema_object_id]);
        if (registry.rowCount !== 1) throw new Error(`SCHEMA_OBJECT_READBACK_MISSING:${input.stable_schema_object_id}`);
        const aliases = await client.query(`SELECT alias_key, alias_kind FROM atlas_schema_object_aliases WHERE stable_schema_object_id=$1 ORDER BY alias_key`, [input.stable_schema_object_id]);
        const versions = await client.query(`SELECT schema_object_version_id, schema_revision, qualified_name, catalog_oid, definition_hash FROM atlas_schema_object_versions WHERE stable_schema_object_id=$1 ORDER BY schema_revision, schema_object_version_id`, [input.stable_schema_object_id]);
        const row = registry.rows[0] as { registry_revision: string };
        return schemaObjectReadbackReceiptSchema.parse({
          stable_schema_object_id: input.stable_schema_object_id,
          registry_revision: row.registry_revision,
          alias_count: aliases.rowCount ?? 0,
          version_count: versions.rowCount ?? 0,
          checksum: hash({ registry: registry.rows[0], aliases: aliases.rows, versions: versions.rows }),
          producer_revision: input.producer_revision,
        });
      });
    },
  };
}

export function describeSchemaObjectRegistry(): string {
  return [
    'PostgreSQL catalog OIDs are revision-local provenance and never Atlas stable schema identity.',
    'Schema discovery nominates qualified objects; explicit registry promotion alone creates stable_schema_object_id.',
    'Aliases preserve identity across reviewed renames/moves; versions retain catalog_oid and definition_hash for one schema revision.',
    'Schema evidence may enter atlas_evidence_entities only after registry resolution returns canonical identity.',
  ].join(' ');
}
