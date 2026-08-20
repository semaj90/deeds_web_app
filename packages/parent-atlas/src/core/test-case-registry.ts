import { createHash } from 'node:crypto';
import type { Pool, PoolClient } from 'pg';
import { z } from 'zod';

const id = z.string().min(1);
const revision = z.string().min(1);

export const testCaseNominationSchema = z.object({
  schema: z.literal('atlas.test-case-nomination.v1').default('atlas.test-case-nomination.v1'),
  nomination_id: id,
  test_key: id,
  identity_status: z.literal('nominated').default('nominated'),
  framework: z.string().min(1),
  source_ref: z.string().min(1),
  source_revision: revision,
  suite_path: z.array(z.string()),
  title: z.string().min(1),
  full_name: z.string().min(1),
  line: z.number().int().positive().nullable().optional(),
  column: z.number().int().positive().nullable().optional(),
  definition_hash: z.string().regex(/^[a-f0-9]{64}$/),
  extractor_revision: revision,
  canonical_authority: z.literal(false).default(false),
}).strict();

export const testCaseResolutionSchema = z.object({
  schema: z.literal('atlas.test-case-resolution.v1').default('atlas.test-case-resolution.v1'),
  nomination_id: id,
  test_key: id,
  status: z.enum(['canonical', 'ambiguous', 'unresolved']),
  stable_test_id: id.nullable().optional(),
  registry_revision: revision,
  resolution_basis: z.enum(['exact_test_key', 'existing_alias', 'explicit_rename', 'explicit_move', 'human_review', 'unresolved']),
  candidate_ids: z.array(id).default([]),
  evidence_refs: z.array(id).default([]),
}).strict().superRefine((value, ctx) => {
  if (value.status === 'canonical' && !value.stable_test_id) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['stable_test_id'], message: 'canonical test resolution requires stable_test_id' });
  }
});

export const testCaseVersionSchema = z.object({
  schema: z.literal('atlas.test-case-version.v1').default('atlas.test-case-version.v1'),
  test_version_id: id,
  stable_test_id: id,
  test_key: id,
  framework: z.string().min(1),
  source_ref: z.string().min(1),
  source_revision: revision,
  suite_path: z.array(z.string()),
  title: z.string().min(1),
  full_name: z.string().min(1),
  line: z.number().int().positive().nullable().optional(),
  column: z.number().int().positive().nullable().optional(),
  definition_hash: z.string().regex(/^[a-f0-9]{64}$/),
  producer_revision: revision,
}).strict();

export const testCaseReadbackReceiptSchema = z.object({
  schema: z.literal('atlas.test-case-readback-receipt.v1').default('atlas.test-case-readback-receipt.v1'),
  stable_test_id: id,
  registry_revision: revision,
  alias_count: z.number().int().nonnegative(),
  version_count: z.number().int().nonnegative(),
  checksum: z.string().regex(/^[a-f0-9]{64}$/),
  producer_revision: revision,
}).strict();

export type TestCaseNominationV1 = z.infer<typeof testCaseNominationSchema>;
export type TestCaseResolutionV1 = z.infer<typeof testCaseResolutionSchema>;
export type TestCaseVersionV1 = z.infer<typeof testCaseVersionSchema>;
export type TestCaseReadbackReceiptV1 = z.infer<typeof testCaseReadbackReceiptSchema>;

function stable(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stable).join(',')}]`;
  if (value && typeof value === 'object') {
    return `{${Object.entries(value as Record<string, unknown>)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([key, item]) => `${JSON.stringify(key)}:${stable(item)}`)
      .join(',')}}`;
  }
  return JSON.stringify(value) ?? 'null';
}

function hash(value: unknown): string {
  return createHash('sha256').update(stable(value), 'utf8').digest('hex');
}

function normalizePath(value: string): string {
  return value.replaceAll('\\', '/').replace(/^\.\//, '').normalize('NFC');
}

export function deriveTestCaseKey(input: {
  framework: string;
  source_ref: string;
  suite_path: string[];
  title: string;
}): string {
  return `test-key:${hash([
    input.framework.toLowerCase(),
    normalizePath(input.source_ref),
    input.suite_path.map((value) => value.normalize('NFC').trim()),
    input.title.normalize('NFC').trim(),
  ]).slice(0, 40)}`;
}

export function deriveTestCaseNominationId(input: {
  test_key: string;
  source_revision: string;
  definition_hash: string;
}): string {
  return `test-nomination:${hash([input.test_key, input.source_revision, input.definition_hash]).slice(0, 40)}`;
}

function stableTestId(nomination: TestCaseNominationV1): string {
  return `test:${hash([nomination.framework.toLowerCase(), nomination.test_key]).slice(0, 40)}`;
}

function testVersionId(stableId: string, nomination: TestCaseNominationV1): string {
  return `test-version:${hash([stableId, nomination.source_revision, nomination.definition_hash]).slice(0, 40)}`;
}

async function withClient<T>(pool: Pool, fn: (client: PoolClient) => Promise<T>): Promise<T> {
  const client = await pool.connect();
  try { return await fn(client); } finally { client.release(); }
}

export function createTestCaseRegistryRepository(pool: Pool) {
  const resolveNomination = async (input: {
    nomination: TestCaseNominationV1;
    registry_revision: string;
  }): Promise<TestCaseResolutionV1> => withClient(pool, async (client) => {
    const result = await client.query<{ stable_test_id: string; basis: string }>(`
      SELECT stable_test_id, basis FROM (
        SELECT stable_test_id, 'exact_test_key'::text AS basis, 1 AS priority
        FROM atlas_test_registry
        WHERE canonical_key = $1 AND status = 'active'
        UNION ALL
        SELECT a.stable_test_id, 'existing_alias'::text AS basis, 2 AS priority
        FROM atlas_test_aliases a
        JOIN atlas_test_registry r USING (stable_test_id)
        WHERE a.alias_key = $1 AND r.status = 'active'
      ) q
      ORDER BY priority, stable_test_id
    `, [input.nomination.test_key]);

    const ids = [...new Set(result.rows.map((row) => row.stable_test_id))];
    if (ids.length === 1) {
      const row = result.rows.find((item) => item.stable_test_id === ids[0])!;
      return testCaseResolutionSchema.parse({
        nomination_id: input.nomination.nomination_id,
        test_key: input.nomination.test_key,
        status: 'canonical',
        stable_test_id: ids[0],
        registry_revision: input.registry_revision,
        resolution_basis: row.basis === 'exact_test_key' ? 'exact_test_key' : 'existing_alias',
        candidate_ids: ids,
      });
    }
    return testCaseResolutionSchema.parse({
      nomination_id: input.nomination.nomination_id,
      test_key: input.nomination.test_key,
      status: ids.length > 1 ? 'ambiguous' : 'unresolved',
      registry_revision: input.registry_revision,
      resolution_basis: 'unresolved',
      candidate_ids: ids,
    });
  });

  return {
    resolveNomination,

    async promoteNomination(input: {
      nomination: TestCaseNominationV1;
      registry_revision: string;
      producer_revision: string;
      allow_create: boolean;
      evidence_refs?: string[];
    }): Promise<{ resolution: TestCaseResolutionV1; version: TestCaseVersionV1 }> {
      if (!input.allow_create) throw new Error('TEST_PROMOTION_REQUIRES_EXPLICIT_ALLOW_CREATE');
      const existing = await resolveNomination({ nomination: input.nomination, registry_revision: input.registry_revision });
      const stableId = existing.status === 'canonical' && existing.stable_test_id
        ? existing.stable_test_id
        : stableTestId(input.nomination);
      const versionId = testVersionId(stableId, input.nomination);

      await withClient(pool, async (client) => {
        await client.query('BEGIN');
        try {
          await client.query(`
            INSERT INTO atlas_test_registry (
              stable_test_id, canonical_key, framework, canonical_source_ref,
              canonical_full_name, created_from_nomination_id,
              created_from_source_revision, registry_revision
            ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8)
            ON CONFLICT (stable_test_id) DO UPDATE SET
              updated_at = now(), registry_revision = EXCLUDED.registry_revision
          `, [stableId, input.nomination.test_key, input.nomination.framework,
            input.nomination.source_ref, input.nomination.full_name,
            input.nomination.nomination_id, input.nomination.source_revision, input.registry_revision]);

          for (const [aliasKey, aliasKind] of [
            [input.nomination.test_key, 'test_key'],
            [`full-name:${input.nomination.framework}:${input.nomination.full_name}`, 'full_name'],
          ] as const) {
            await client.query(`
              INSERT INTO atlas_test_aliases (
                alias_key, stable_test_id, alias_kind, source_ref,
                source_revision, evidence_refs, registry_revision
              ) VALUES ($1,$2,$3,$4,$5,$6::jsonb,$7)
              ON CONFLICT (alias_key, stable_test_id) DO NOTHING
            `, [aliasKey, stableId, aliasKind, input.nomination.source_ref,
              input.nomination.source_revision, JSON.stringify(input.evidence_refs ?? []), input.registry_revision]);
          }

          await client.query(`
            INSERT INTO atlas_test_versions (
              test_version_id, stable_test_id, test_key, framework, source_ref,
              source_revision, suite_path, title, full_name, line, column_no,
              definition_hash, producer_revision
            ) VALUES ($1,$2,$3,$4,$5,$6,$7::jsonb,$8,$9,$10,$11,$12,$13)
            ON CONFLICT (test_version_id) DO NOTHING
          `, [versionId, stableId, input.nomination.test_key, input.nomination.framework,
            input.nomination.source_ref, input.nomination.source_revision,
            JSON.stringify(input.nomination.suite_path), input.nomination.title,
            input.nomination.full_name, input.nomination.line ?? null,
            input.nomination.column ?? null, input.nomination.definition_hash,
            input.producer_revision]);
          await client.query('COMMIT');
        } catch (error) {
          await client.query('ROLLBACK');
          throw error;
        }
      });

      return {
        resolution: testCaseResolutionSchema.parse({
          nomination_id: input.nomination.nomination_id,
          test_key: input.nomination.test_key,
          status: 'canonical',
          stable_test_id: stableId,
          registry_revision: input.registry_revision,
          resolution_basis: existing.status === 'canonical' ? existing.resolution_basis : 'human_review',
          candidate_ids: [stableId],
          evidence_refs: input.evidence_refs ?? [],
        }),
        version: testCaseVersionSchema.parse({
          test_version_id: versionId,
          stable_test_id: stableId,
          test_key: input.nomination.test_key,
          framework: input.nomination.framework,
          source_ref: input.nomination.source_ref,
          source_revision: input.nomination.source_revision,
          suite_path: input.nomination.suite_path,
          title: input.nomination.title,
          full_name: input.nomination.full_name,
          line: input.nomination.line ?? null,
          column: input.nomination.column ?? null,
          definition_hash: input.nomination.definition_hash,
          producer_revision: input.producer_revision,
        }),
      };
    },

    async readback(input: { stable_test_id: string; producer_revision: string }): Promise<TestCaseReadbackReceiptV1> {
      return withClient(pool, async (client) => {
        const registry = await client.query(`SELECT * FROM atlas_test_registry WHERE stable_test_id=$1`, [input.stable_test_id]);
        if (registry.rowCount !== 1) throw new Error(`TEST_READBACK_MISSING:${input.stable_test_id}`);
        const aliases = await client.query(`SELECT alias_key, alias_kind FROM atlas_test_aliases WHERE stable_test_id=$1 ORDER BY alias_key`, [input.stable_test_id]);
        const versions = await client.query(`SELECT test_version_id, source_revision, full_name, definition_hash FROM atlas_test_versions WHERE stable_test_id=$1 ORDER BY source_revision, test_version_id`, [input.stable_test_id]);
        const row = registry.rows[0] as { registry_revision: string };
        return testCaseReadbackReceiptSchema.parse({
          stable_test_id: input.stable_test_id,
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

export function describeTestCaseRegistry(): string {
  return [
    'Vitest/JUnit runner output owns execution truth but not cross-revision Atlas test identity.',
    'Reporter rows nominate test cases from framework + source path + suite path + title; line/column are version provenance only.',
    'Explicit registry promotion creates stable_test_id; reviewed aliases preserve identity across renames or moves.',
    'Only canonical registry resolutions may populate atlas.test-evidence.v1 test_id fields.',
  ].join(' ');
}
