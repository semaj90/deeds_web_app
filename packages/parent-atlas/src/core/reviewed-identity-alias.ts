import { createHash } from 'node:crypto';
import type { Pool } from 'pg';
import { z } from 'zod';

const id = z.string().min(1);
const revision = z.string().min(1);

export const REVIEWED_ALIAS_ENTITY_KINDS = ['test', 'schema_object'] as const;
export const REVIEWED_ALIAS_TRANSITIONS = ['rename', 'move', 'rename_and_move', 'human'] as const;

export const reviewedIdentityAliasSchema = z.object({
  schema: z.literal('atlas.reviewed-identity-alias.v1').default('atlas.reviewed-identity-alias.v1'),
  decision_id: id,
  entity_kind: z.enum(REVIEWED_ALIAS_ENTITY_KINDS),
  stable_id: id,
  old_key: id,
  new_key: id,
  transition: z.enum(REVIEWED_ALIAS_TRANSITIONS),
  old_source_ref: z.string().min(1).nullable().optional(),
  new_source_ref: z.string().min(1).nullable().optional(),
  old_revision: revision,
  new_revision: revision,
  evidence_refs: z.array(id).min(1),
  reviewer_id: id,
  workflow_action_id: id,
  reviewed_at: z.string().datetime(),
  registry_revision: revision,
  producer_revision: revision,
}).strict().superRefine((value, ctx) => {
  if (value.old_key === value.new_key) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['new_key'], message: 'reviewed alias requires a changed key' });
  }
  if (value.transition === 'move' && value.old_source_ref === value.new_source_ref) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['new_source_ref'], message: 'move transition requires source_ref change' });
  }
});

export const reviewedIdentityAliasReadbackSchema = z.object({
  schema: z.literal('atlas.reviewed-identity-alias-readback.v1').default('atlas.reviewed-identity-alias-readback.v1'),
  decision_id: id,
  stable_id: id,
  new_key: id,
  registry_revision: revision,
  checksum: z.string().regex(/^[a-f0-9]{64}$/),
  producer_revision: revision,
}).strict();

export type ReviewedIdentityAliasV1 = z.infer<typeof reviewedIdentityAliasSchema>;
export type ReviewedIdentityAliasReadbackV1 = z.infer<typeof reviewedIdentityAliasReadbackSchema>;

function stable(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stable).join(',')}]`;
  if (value && typeof value === 'object') return `{${Object.entries(value as Record<string, unknown>).sort(([a],[b]) => a.localeCompare(b)).map(([k,v]) => `${JSON.stringify(k)}:${stable(v)}`).join(',')}}`;
  return JSON.stringify(value) ?? 'null';
}

function checksum(value: unknown): string {
  return createHash('sha256').update(stable(value), 'utf8').digest('hex');
}

export function deriveReviewedAliasDecisionId(input: Omit<z.input<typeof reviewedIdentityAliasSchema>, 'decision_id' | 'schema'>): string {
  return `alias-decision:${checksum(input).slice(0, 40)}`;
}

export function createReviewedIdentityAliasRepository(pool: Pool) {
  const readback = async (input: { decision_id: string; producer_revision: string }): Promise<ReviewedIdentityAliasReadbackV1> => {
    const result = await pool.query(`SELECT * FROM atlas_identity_alias_decisions WHERE decision_id=$1`, [input.decision_id]);
    if (result.rowCount !== 1) throw new Error(`REVIEWED_ALIAS_READBACK_MISSING:${input.decision_id}`);
    const row = result.rows[0] as { stable_id: string; new_key: string; registry_revision: string };
    return reviewedIdentityAliasReadbackSchema.parse({
      decision_id: input.decision_id,
      stable_id: row.stable_id,
      new_key: row.new_key,
      registry_revision: row.registry_revision,
      checksum: checksum(result.rows[0]),
      producer_revision: input.producer_revision,
    });
  };

  return {
    async persist(decisionInput: ReviewedIdentityAliasV1): Promise<ReviewedIdentityAliasReadbackV1> {
      const decision = reviewedIdentityAliasSchema.parse(decisionInput);
      await pool.query(`
        INSERT INTO atlas_identity_alias_decisions (
          decision_id, entity_kind, stable_id, old_key, new_key, transition_kind,
          old_source_ref, new_source_ref, old_revision, new_revision, evidence_refs,
          reviewer_id, workflow_action_id, reviewed_at, registry_revision, producer_revision
        ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11::jsonb,$12,$13,$14,$15,$16)
        ON CONFLICT (decision_id) DO NOTHING
      `, [
        decision.decision_id, decision.entity_kind, decision.stable_id, decision.old_key, decision.new_key,
        decision.transition, decision.old_source_ref ?? null, decision.new_source_ref ?? null,
        decision.old_revision, decision.new_revision, JSON.stringify(decision.evidence_refs), decision.reviewer_id,
        decision.workflow_action_id, decision.reviewed_at, decision.registry_revision, decision.producer_revision,
      ]);
      return readback({ decision_id: decision.decision_id, producer_revision: decision.producer_revision });
    },
    readback,
  };
}
