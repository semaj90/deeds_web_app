import { z } from 'zod';
import {
  promoteResolvedSymbolsToEvidenceEntities,
  type EvidenceEntityFactV1,
} from './evidence-entity-backfill.js';
import type {
  StructuralReferenceFactV1,
  StructuralSymbolNominationV1,
  SymbolResolutionV1,
  SymbolVersionV1,
} from './structural-symbol.js';
import type { StructuralReferenceResolutionV1 } from './structural-reference-resolver.js';

const revision = z.string().min(1);

export const gisCanonicalizationReceiptSchema = z.object({
  schema: z.literal('atlas.gis-canonicalization-receipt.v1').default('atlas.gis-canonicalization-receipt.v1'),
  source_ref: z.string().min(1),
  source_revision: revision,
  workspace_revision: revision,
  nomination_count: z.number().int().nonnegative(),
  canonical_symbol_count: z.number().int().nonnegative(),
  unresolved_symbol_count: z.number().int().nonnegative(),
  ambiguous_symbol_count: z.number().int().nonnegative(),
  symbol_version_count: z.number().int().nonnegative(),
  reference_fact_count: z.number().int().nonnegative(),
  canonical_reference_count: z.number().int().nonnegative(),
  degraded_reference_count: z.number().int().nonnegative(),
  unresolved_reference_count: z.number().int().nonnegative(),
  evidence_entity_fact_count: z.number().int().nonnegative(),
  canonical_identity_created: z.boolean(),
  producer_revision: revision,
}).strict();

export type GisCanonicalizationReceiptV1 = z.infer<typeof gisCanonicalizationReceiptSchema>;

export interface GisSymbolResolverV1 {
  resolve(nomination: StructuralSymbolNominationV1): Promise<SymbolResolutionV1>;
  promote?(nomination: StructuralSymbolNominationV1): Promise<{ resolution: SymbolResolutionV1; version: SymbolVersionV1 }>;
}

export interface GisReferenceResolverV1 {
  resolve(fact: StructuralReferenceFactV1): Promise<StructuralReferenceResolutionV1>;
}

export type GisCanonicalizationResultV1 = {
  symbol_resolutions: SymbolResolutionV1[];
  symbol_versions: SymbolVersionV1[];
  reference_resolutions: StructuralReferenceResolutionV1[];
  evidence_entity_facts: EvidenceEntityFactV1[];
  receipt: GisCanonicalizationReceiptV1;
};

/**
 * GIS is the only stage in this structural slice allowed to turn nominations
 * into canonical symbol identity. By default it resolves only; creation of new
 * canonical symbols requires `promote_unresolved=true` AND a resolver that
 * exposes an explicit promote() method.
 */
export async function canonicalizeStructuralEvidence(input: {
  evidence_id: string;
  evidence_revision: string;
  source_ref: string;
  source_revision: string;
  workspace_revision: string;
  producer_revision: string;
  symbol_nominations: StructuralSymbolNominationV1[];
  reference_facts: StructuralReferenceFactV1[];
  symbol_resolver: GisSymbolResolverV1;
  reference_resolver?: GisReferenceResolverV1;
  promote_unresolved?: boolean;
}): Promise<GisCanonicalizationResultV1> {
  const symbolResolutions: SymbolResolutionV1[] = [];
  const symbolVersions: SymbolVersionV1[] = [];
  let created = false;

  for (const nomination of input.symbol_nominations) {
    let resolution = await input.symbol_resolver.resolve(nomination);
    if (
      resolution.status === 'unresolved'
      && input.promote_unresolved === true
      && input.symbol_resolver.promote
    ) {
      const promoted = await input.symbol_resolver.promote(nomination);
      resolution = promoted.resolution;
      symbolVersions.push(promoted.version);
      created = true;
    }
    symbolResolutions.push(resolution);
  }

  const evidenceEntityFacts = promoteResolvedSymbolsToEvidenceEntities({
    evidence_id: input.evidence_id,
    evidence_revision: input.evidence_revision,
    source_ref: input.source_ref,
    source_revision: input.source_revision,
    producer_revision: input.producer_revision,
    nominations: input.symbol_nominations,
    resolutions: symbolResolutions,
  });

  const referenceResolutions: StructuralReferenceResolutionV1[] = [];
  if (input.reference_resolver) {
    for (const fact of input.reference_facts) {
      referenceResolutions.push(await input.reference_resolver.resolve(fact));
    }
  }

  return {
    symbol_resolutions: symbolResolutions,
    symbol_versions: symbolVersions,
    reference_resolutions: referenceResolutions,
    evidence_entity_facts: evidenceEntityFacts,
    receipt: gisCanonicalizationReceiptSchema.parse({
      source_ref: input.source_ref,
      source_revision: input.source_revision,
      workspace_revision: input.workspace_revision,
      nomination_count: input.symbol_nominations.length,
      canonical_symbol_count: symbolResolutions.filter((item) => item.status === 'canonical').length,
      unresolved_symbol_count: symbolResolutions.filter((item) => item.status === 'unresolved').length,
      ambiguous_symbol_count: symbolResolutions.filter((item) => item.status === 'ambiguous').length,
      symbol_version_count: symbolVersions.length,
      reference_fact_count: input.reference_facts.length,
      canonical_reference_count: referenceResolutions.filter((item) => item.status === 'canonical').length,
      degraded_reference_count: referenceResolutions.filter((item) => item.status === 'degraded').length,
      unresolved_reference_count: referenceResolutions.filter((item) => item.status === 'unresolved' || item.status === 'ambiguous').length,
      evidence_entity_fact_count: evidenceEntityFacts.length,
      canonical_identity_created: created,
      producer_revision: input.producer_revision,
    }),
  };
}
