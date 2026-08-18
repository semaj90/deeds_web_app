import type { Pool, PoolClient } from 'pg';
import { z } from 'zod';
import { reviewedIdentityAliasSchema, type ReviewedIdentityAliasV1 } from './reviewed-identity-alias.js';
import { createSchemaObjectRegistryRepository, schemaObjectNominationSchema, type SchemaObjectNominationV1, type SchemaObjectResolutionV1 } from './schema-object-registry.js';
import { createTestCaseRegistryRepository, testCaseNominationSchema, type TestCaseNominationV1, type TestCaseResolutionV1 } from './test-case-registry.js';

const applicationReceiptSchema = z.object({
  schema: z.literal('atlas.reviewed-alias-application-receipt.v1').default('atlas.reviewed-alias-application-receipt.v1'),
  decision_id: z.string().min(1),
  entity_kind: z.enum(['test', 'schema_object']),
  stable_id: z.string().min(1),
  new_key: z.string().min(1),
  resolution_basis: z.enum(['explicit_rename', 'explicit_move', 'human_review']),
  registry_revision: z.string().min(1),
  producer_revision: z.string().min(1),
}).strict();

export type ReviewedAliasApplicationReceiptV1 = z.infer<typeof applicationReceiptSchema>;

function basis(decision: ReviewedIdentityAliasV1): ReviewedAliasApplicationReceiptV1['resolution_basis'] {
  if (decision.transition === 'move') return 'explicit_move';
  if (decision.transition === 'rename' || decision.transition === 'rename_and_move') return 'explicit_rename';
  return 'human_review';
}

async function persistDecision(client: PoolClient, decision: ReviewedIdentityAliasV1): Promise<void> {
  await client.query(`
    INSERT INTO atlas_identity_alias_decisions (
      decision_id, entity_kind, stable_id, old_key, new_key, transition_kind,
      old_source_ref, new_source_ref, old_revision, new_revision, evidence_refs,
      reviewer_id, workflow_action_id, reviewed_at, registry_revision, producer_revision
    ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11::jsonb,$12,$13,$14,$15,$16)
    ON CONFLICT (decision_id) DO NOTHING
  `, [decision.decision_id, decision.entity_kind, decision.stable_id, decision.old_key,
    decision.new_key, decision.transition, decision.old_source_ref ?? null,
    decision.new_source_ref ?? null, decision.old_revision, decision.new_revision,
    JSON.stringify(decision.evidence_refs), decision.reviewer_id, decision.workflow_action_id,
    decision.reviewed_at, decision.registry_revision, decision.producer_revision]);
}

async function insertAliasProjection(client: PoolClient, decision: ReviewedIdentityAliasV1): Promise<void> {
  const aliasKind = decision.transition === 'move'
    ? 'move'
    : decision.transition === 'rename' || decision.transition === 'rename_and_move'
      ? 'rename'
      : 'human';
  if (decision.entity_kind === 'schema_object') {
    await client.query(`
      INSERT INTO atlas_schema_object_aliases (
        alias_key, stable_schema_object_id, alias_kind, source_ref, source_revision, evidence_refs, registry_revision
      ) VALUES ($1,$2,$3,$4,$5,$6::jsonb,$7)
      ON CONFLICT (alias_key, stable_schema_object_id) DO NOTHING
    `, [decision.new_key, decision.stable_id, aliasKind, decision.new_source_ref ?? null,
      decision.new_revision, JSON.stringify(decision.evidence_refs), decision.registry_revision]);
    return;
  }
  await client.query(`
    INSERT INTO atlas_test_aliases (
      alias_key, stable_test_id, alias_kind, source_ref, source_revision, evidence_refs, registry_revision
    ) VALUES ($1,$2,$3,$4,$5,$6::jsonb,$7)
    ON CONFLICT (alias_key, stable_test_id) DO NOTHING
  `, [decision.new_key, decision.stable_id, aliasKind, decision.new_source_ref ?? null,
    decision.new_revision, JSON.stringify(decision.evidence_refs), decision.registry_revision]);
}

async function applyDecisionProjection(pool: Pool, decision: ReviewedIdentityAliasV1, expectedOldKey: string): Promise<void> {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const table = decision.entity_kind === 'schema_object' ? 'atlas_schema_object_registry' : 'atlas_test_registry';
    const idColumn = decision.entity_kind === 'schema_object' ? 'stable_schema_object_id' : 'stable_test_id';
    const current = await client.query<{ canonical_key: string }>(`SELECT canonical_key FROM ${table} WHERE ${idColumn}=$1 AND status='active' FOR UPDATE`, [decision.stable_id]);
    if (current.rowCount !== 1) throw new Error(`REVIEWED_ALIAS_STABLE_ID_MISSING:${decision.stable_id}`);
    if (current.rows[0]!.canonical_key !== expectedOldKey || decision.old_key !== expectedOldKey) {
      throw new Error(`REVIEWED_ALIAS_OLD_KEY_MISMATCH:${decision.decision_id}`);
    }
    await persistDecision(client, decision);
    await insertAliasProjection(client, decision);
    await client.query('COMMIT');
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

export async function applyReviewedSchemaAlias(pool: Pool, input: {
  decision: ReviewedIdentityAliasV1;
  nomination: SchemaObjectNominationV1;
}): Promise<{ resolution: SchemaObjectResolutionV1; receipt: ReviewedAliasApplicationReceiptV1 }> {
  const decision = reviewedIdentityAliasSchema.parse(input.decision);
  const nomination = schemaObjectNominationSchema.parse(input.nomination);
  if (decision.entity_kind !== 'schema_object') throw new Error('REVIEWED_ALIAS_ENTITY_KIND_MISMATCH:schema_object');
  if (decision.new_key !== nomination.object_key) throw new Error('REVIEWED_ALIAS_NEW_KEY_MISMATCH:schema_object');

  await applyDecisionProjection(pool, decision, decision.old_key);
  const resolved = await createSchemaObjectRegistryRepository(pool).resolveNomination({ nomination, registry_revision: decision.registry_revision });
  if (resolved.status !== 'canonical' || resolved.stable_schema_object_id !== decision.stable_id) {
    throw new Error(`REVIEWED_ALIAS_RESOLUTION_FAILED:${decision.decision_id}`);
  }
  const resolution = { ...resolved, resolution_basis: basis(decision), evidence_refs: decision.evidence_refs } as SchemaObjectResolutionV1;
  return {
    resolution,
    receipt: applicationReceiptSchema.parse({ decision_id: decision.decision_id, entity_kind: decision.entity_kind, stable_id: decision.stable_id, new_key: decision.new_key, resolution_basis: basis(decision), registry_revision: decision.registry_revision, producer_revision: decision.producer_revision }),
  };
}

export async function applyReviewedTestAlias(pool: Pool, input: {
  decision: ReviewedIdentityAliasV1;
  nomination: TestCaseNominationV1;
}): Promise<{ resolution: TestCaseResolutionV1; receipt: ReviewedAliasApplicationReceiptV1 }> {
  const decision = reviewedIdentityAliasSchema.parse(input.decision);
  const nomination = testCaseNominationSchema.parse(input.nomination);
  if (decision.entity_kind !== 'test') throw new Error('REVIEWED_ALIAS_ENTITY_KIND_MISMATCH:test');
  if (decision.new_key !== nomination.test_key) throw new Error('REVIEWED_ALIAS_NEW_KEY_MISMATCH:test');

  await applyDecisionProjection(pool, decision, decision.old_key);
  const resolved = await createTestCaseRegistryRepository(pool).resolveNomination({ nomination, registry_revision: decision.registry_revision });
  if (resolved.status !== 'canonical' || resolved.stable_test_id !== decision.stable_id) {
    throw new Error(`REVIEWED_ALIAS_RESOLUTION_FAILED:${decision.decision_id}`);
  }
  const resolution = { ...resolved, resolution_basis: basis(decision), evidence_refs: decision.evidence_refs } as TestCaseResolutionV1;
  return {
    resolution,
    receipt: applicationReceiptSchema.parse({ decision_id: decision.decision_id, entity_kind: decision.entity_kind, stable_id: decision.stable_id, new_key: decision.new_key, resolution_basis: basis(decision), registry_revision: decision.registry_revision, producer_revision: decision.producer_revision }),
  };
}
