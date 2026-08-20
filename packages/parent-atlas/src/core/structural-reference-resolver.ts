import type { Pool } from 'pg';
import { z } from 'zod';
import type { StructuralReferenceFactV1 } from './structural-symbol.js';

const id = z.string().min(1);
const revision = z.string().min(1);

export const structuralReferenceResolutionSchema = z.object({
  schema: z.literal('atlas.structural-reference-resolution.v1').default('atlas.structural-reference-resolution.v1'),
  reference_id: id,
  reference_kind: z.string().min(1),
  source_stable_symbol_id: id.nullable(),
  target_stable_symbol_id: id.nullable(),
  target_text: z.string().min(1),
  status: z.enum(['canonical', 'degraded', 'ambiguous', 'unresolved']),
  resolution_basis: z.enum([
    'upstream_node_version',
    'upstream_symbol_alias',
    'qualified_name_alias',
    'target_text_alias',
    'ambiguous',
    'unresolved',
  ]),
  candidate_symbol_ids: z.array(id).default([]),
  source_revision: revision,
  evidence_refs: z.array(id).default([]),
  producer_revision: revision,
}).strict();

export type StructuralReferenceResolutionV1 = z.infer<typeof structuralReferenceResolutionSchema>;

async function resolveOneSide(pool: Pool, input: {
  upstream_node_id?: string | null;
  upstream_symbol_id?: string | null;
  text?: string | null;
  source_revision: string;
}): Promise<{ ids: string[]; basis: StructuralReferenceResolutionV1['resolution_basis'] }> {
  if (input.upstream_node_id) {
    const result = await pool.query<{ stable_symbol_id: string }>(`
      SELECT DISTINCT stable_symbol_id
      FROM atlas_symbol_versions
      WHERE upstream_node_id = $1 AND source_revision = $2
      ORDER BY stable_symbol_id
    `, [input.upstream_node_id, input.source_revision]);
    if (result.rows.length > 0) return { ids: result.rows.map((row) => row.stable_symbol_id), basis: 'upstream_node_version' };
  }

  if (input.upstream_symbol_id) {
    const result = await pool.query<{ stable_symbol_id: string }>(`
      SELECT DISTINCT stable_symbol_id
      FROM atlas_symbol_aliases
      WHERE alias_key = $1
      ORDER BY stable_symbol_id
    `, [`upstream-symbol:${input.upstream_symbol_id}`]);
    if (result.rows.length > 0) return { ids: result.rows.map((row) => row.stable_symbol_id), basis: 'upstream_symbol_alias' };
  }

  if (input.text) {
    const qualified = await pool.query<{ stable_symbol_id: string }>(`
      SELECT DISTINCT stable_symbol_id
      FROM atlas_symbol_aliases
      WHERE alias_key = $1
      ORDER BY stable_symbol_id
    `, [input.text]);
    if (qualified.rows.length > 0) return { ids: qualified.rows.map((row) => row.stable_symbol_id), basis: 'qualified_name_alias' };

    const fuzzy = await pool.query<{ stable_symbol_id: string }>(`
      SELECT DISTINCT stable_symbol_id
      FROM atlas_symbol_registry
      WHERE canonical_name = $1 AND status = 'active'
      ORDER BY stable_symbol_id
    `, [input.text]);
    if (fuzzy.rows.length > 0) return { ids: fuzzy.rows.map((row) => row.stable_symbol_id), basis: 'target_text_alias' };
  }

  return { ids: [], basis: 'unresolved' };
}

export function createStructuralReferenceResolver(pool: Pool) {
  return {
    async resolve(input: {
      fact: StructuralReferenceFactV1;
      producer_revision: string;
      persist?: boolean;
    }): Promise<StructuralReferenceResolutionV1> {
      const fact = input.fact;
      const source = await resolveOneSide(pool, {
        upstream_node_id: fact.upstream_source_node_id,
        source_revision: fact.source_revision,
      });
      const target = await resolveOneSide(pool, {
        upstream_node_id: fact.upstream_target_node_id,
        text: fact.target_text,
        source_revision: fact.source_revision,
      });

      const sourceId = source.ids.length === 1 ? source.ids[0]! : null;
      const targetId = target.ids.length === 1 ? target.ids[0]! : null;
      const candidates = [...new Set([...source.ids, ...target.ids])].sort();
      const ambiguous = source.ids.length > 1 || target.ids.length > 1;
      const status: StructuralReferenceResolutionV1['status'] = ambiguous
        ? 'ambiguous'
        : sourceId && targetId
          ? 'canonical'
          : sourceId || targetId
            ? 'degraded'
            : 'unresolved';
      const basis: StructuralReferenceResolutionV1['resolution_basis'] = ambiguous
        ? 'ambiguous'
        : target.basis !== 'unresolved'
          ? target.basis
          : source.basis !== 'unresolved'
            ? source.basis
            : 'unresolved';

      const resolution = structuralReferenceResolutionSchema.parse({
        reference_id: fact.reference_id,
        reference_kind: fact.reference_kind,
        source_stable_symbol_id: sourceId,
        target_stable_symbol_id: targetId,
        target_text: fact.target_text,
        status,
        resolution_basis: basis,
        candidate_symbol_ids: candidates,
        source_revision: fact.source_revision,
        evidence_refs: fact.evidence_refs,
        producer_revision: input.producer_revision,
      });

      if (input.persist ?? true) {
        await pool.query(`
          INSERT INTO atlas_structural_reference_resolutions (
            reference_id, source_stable_symbol_id, target_stable_symbol_id,
            reference_kind, target_text, resolution_status, resolution_basis,
            source_revision, evidence_refs, producer_revision
          ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9::jsonb,$10)
          ON CONFLICT (reference_id) DO UPDATE SET
            source_stable_symbol_id = EXCLUDED.source_stable_symbol_id,
            target_stable_symbol_id = EXCLUDED.target_stable_symbol_id,
            resolution_status = EXCLUDED.resolution_status,
            resolution_basis = EXCLUDED.resolution_basis,
            evidence_refs = EXCLUDED.evidence_refs,
            producer_revision = EXCLUDED.producer_revision,
            updated_at = now()
        `, [
          resolution.reference_id,
          resolution.source_stable_symbol_id,
          resolution.target_stable_symbol_id,
          resolution.reference_kind,
          resolution.target_text,
          resolution.status,
          resolution.resolution_basis,
          resolution.source_revision,
          JSON.stringify(resolution.evidence_refs),
          resolution.producer_revision,
        ]);
      }

      return resolution;
    },
  };
}
