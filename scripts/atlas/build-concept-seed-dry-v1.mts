#!/usr/bin/env node
/**
 * CONCEPT-SEED-DRY-01 (PARENT ATLAS CONCEPT FABRIC 01, step 2 — per direct operator instruction:
 * "build proposals, not inserts").
 *
 * Derives ConceptDefinitionV1 proposals MECHANICALLY from existing authoritative owners — never
 * hand-authored as a master glossary, never inserted into Postgres (writesPerformed is always
 * false; this script performs zero database writes of any kind).
 *
 * Owners actually extracted this pass (chosen because each is a concrete, checkable, machine-
 * readable source — not because the full owner table from the operator's instruction is covered):
 *   1. domain-taxonomy.ts::CANONICAL_DOMAINS (9 coarse domain concepts, namespace 'domain')
 *   2. domain_mapping.py::_DEFAULT_MAPPINGS (7 ontology-admission domain classes + their 15
 *      specific-label aliases, namespace 'ontology-domain' — kept namespace-DISTINCT from (1)
 *      deliberately: these are two genuinely different taxonomies (9 coarse domains for the NLP
 *      classifier vs. 7 admission classes for classify-domain-ontology.mjs's 15 labels), and
 *      silently merging them into one namespace would be exactly the "second competing authority"
 *      failure mode this whole effort is trying to avoid).
 *   3. atlas_ontology_relations's live predicate CHECK constraint (drizzle/schema.ts:6216) — 14
 *      RELATION_PREDICATE proposals. This is the ALREADY-LIVE enum the empty table enforces.
 *   4. atlas_ontology_concepts's live concept_type CHECK constraint (drizzle/schema.ts:6189) — 11
 *      STRUCTURAL_TYPE proposals (the meta-level type vocabulary itself, not concept instances).
 *
 * Owners named in the operator's table but NOT extracted this pass (flagged explicitly, per this
 * repo's "record what you found, even when you don't fix it" governance convention, rather than
 * silently omitted): the representation registry (semantic_768/latent_256/etc.), retrieval
 * contracts (exact KNN/ANN/Top-K/RRF/lexical/semantic lanes), and evidence/citation contracts.
 * Mining these from CLAUDE.md prose would itself be the "manually authored glossary" anti-pattern
 * this script exists to avoid — they need a real machine-readable owner identified first.
 *
 * No datastore writes. Output: docs/reports/concept-seed-dry-v1.json
 */
import { execFileSync } from 'node:child_process';
import { writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { CANONICAL_DOMAINS } from '../../sveltekit-frontend/src/lib/server/atlas/domain-taxonomy.js';
import {
  computeConceptDefinitionRevision,
  validateNoAliasCollisions,
  type ConceptDefinitionV1,
} from '../../sveltekit-frontend/src/lib/server/atlas/contracts/concept-fabric-v1.js';

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');

// Mirrors drizzle/schema.ts:6216's live CHECK constraint on atlas_ontology_relations.predicate.
const LIVE_RELATION_PREDICATES = [
  'IS_A', 'INSTANCE_OF', 'ALIAS_OF', 'IMPLEMENTS', 'USES_SYSTEM', 'CALLS', 'FOLLOWS',
  'IMPROVES', 'DEPENDS_ON', 'PART_OF', 'PRODUCES', 'CONSUMES', 'STORES_IN', 'READS_FROM',
] as const;

// Mirrors drizzle/schema.ts:6189's live CHECK constraint on atlas_ontology_concepts.concept_type.
const LIVE_CONCEPT_TYPES = [
  'concept', 'alias', 'instance', 'category', 'capability', 'operation',
  'storage_system', 'protocol', 'artifact', 'domain', 'relationship',
] as const;

interface DomainMappingRow {
  domainLabel: string;
  classId: string;
  aliases: string[];
  minimumConfidence: number;
}

function draftConcept(input: {
  conceptId: string;
  canonicalLabel: string;
  definition: string;
  conceptType: ConceptDefinitionV1['conceptType'];
  namespace: string;
  aliases: string[];
  sourceOwner: string;
  evidenceRefs: string[];
}): ConceptDefinitionV1 {
  const base = {
    schema: 'atlas.concept-definition.v1' as const,
    conceptId: input.conceptId,
    canonicalLabel: input.canonicalLabel,
    definition: input.definition,
    conceptType: input.conceptType,
    namespace: input.namespace,
    aliases: input.aliases,
    schemaVersion: 1,
    sourceOwner: input.sourceOwner,
    evidenceRefs: input.evidenceRefs,
    status: 'PROPOSED' as const, // dry proposals are never ACTIVE — that requires the canary insert
    canonicalAuthority: true as const,
  };
  return { ...base, definitionRevision: computeConceptDefinitionRevision(base) };
}

/** Fetches domain_mapping.py's _DEFAULT_MAPPINGS as JSON via a one-shot python subprocess.
 * Reads the live Python module directly (does not reimplement/parse its source as text) — the
 * mechanical-derivation requirement is satisfied by calling the real owner, not scraping it. */
function fetchDomainMappingRows(): DomainMappingRow[] {
  const script = [
    'import json, sys',
    'sys.path.insert(0, "python")',
    'from parent_atlas_ontology.domain_mapping import _DEFAULT_MAPPINGS',
    'print(json.dumps([',
    '  {"domainLabel": m.domainLabel, "classId": m.classId, "aliases": list(m.aliases), "minimumConfidence": m.minimumConfidence}',
    '  for m in _DEFAULT_MAPPINGS',
    ']))',
  ].join('\n');
  const out = execFileSync('python', ['-c', script], { cwd: REPO_ROOT, encoding: 'utf8' });
  return JSON.parse(out);
}

async function main(): Promise<void> {
  const canonicalConceptProposals: ConceptDefinitionV1[] = [];
  const domainMappingProposals: ConceptDefinitionV1[] = [];
  const structuralTypeProposals: ConceptDefinitionV1[] = [];
  const relationPredicateProposals: ConceptDefinitionV1[] = [];
  const missingOwners: string[] = [
    'representation-registry (semantic_768/latent_256/etc.) — not mechanically extracted this pass',
    'retrieval-contracts (exact KNN/ANN/Top-K/RRF/lexical/semantic lanes) — not mechanically extracted this pass',
    'evidence-contracts (citation evidence concepts) — not mechanically extracted this pass',
  ];

  // Owner 1: domain-taxonomy.ts::CANONICAL_DOMAINS
  for (const domain of CANONICAL_DOMAINS) {
    canonicalConceptProposals.push(
      draftConcept({
        conceptId: `concept:domain:${domain}`,
        canonicalLabel: domain,
        definition: `Coarse source-code domain "${domain}" per domain-taxonomy.ts's 9-domain keyword/path classifier.`,
        conceptType: 'domain',
        namespace: 'domain',
        aliases: [],
        sourceOwner: 'sveltekit-frontend/src/lib/server/atlas/domain-taxonomy.ts::CANONICAL_DOMAINS',
        evidenceRefs: ['sveltekit-frontend/src/lib/server/atlas/domain-taxonomy.ts'],
      }),
    );
  }

  // Owner 2: domain_mapping.py::_DEFAULT_MAPPINGS (distinct namespace — see file header comment)
  let domainMappingFetchError: string | null = null;
  try {
    const rows = fetchDomainMappingRows();
    for (const row of rows) {
      domainMappingProposals.push(
        draftConcept({
          conceptId: `concept:ontology-domain:${row.classId}`,
          canonicalLabel: row.domainLabel,
          definition: `Ontology-admission domain class "${row.classId}" for classify-domain-ontology.mjs label admission (minimumConfidence=${row.minimumConfidence}).`,
          conceptType: 'domain',
          namespace: 'ontology-domain',
          aliases: row.aliases,
          sourceOwner: 'python/parent_atlas_ontology/domain_mapping.py::_DEFAULT_MAPPINGS',
          evidenceRefs: ['python/parent_atlas_ontology/domain_mapping.py'],
        }),
      );
    }
  } catch (err) {
    domainMappingFetchError = err instanceof Error ? err.message : String(err);
    missingOwners.push(
      `domain_mapping.py::_DEFAULT_MAPPINGS — fetch FAILED this run (${domainMappingFetchError}), proposals for this owner are absent, not fabricated`,
    );
  }

  // Owner 3: atlas_ontology_relations's live predicate CHECK constraint
  for (const predicate of LIVE_RELATION_PREDICATES) {
    relationPredicateProposals.push(
      draftConcept({
        conceptId: `concept:predicate:${predicate}`,
        canonicalLabel: predicate,
        definition: `Relation predicate "${predicate}", already enforced by atlas_ontology_relations's live (empty) CHECK constraint.`,
        conceptType: 'relationship',
        namespace: 'predicate',
        aliases: [],
        sourceOwner: 'drizzle/schema.ts::atlasOntologyRelations (predicate CHECK constraint)',
        evidenceRefs: ['sveltekit-frontend/drizzle/schema.ts'],
      }),
    );
  }

  // Owner 4: atlas_ontology_concepts's live concept_type CHECK constraint
  for (const conceptType of LIVE_CONCEPT_TYPES) {
    structuralTypeProposals.push(
      draftConcept({
        conceptId: `concept:type:${conceptType}`,
        canonicalLabel: conceptType,
        definition: `Concept-type vocabulary entry "${conceptType}", already enforced by atlas_ontology_concepts's live (empty) CHECK constraint.`,
        conceptType: 'category',
        namespace: 'meta',
        aliases: [],
        sourceOwner: 'drizzle/schema.ts::atlasOntologyConcepts (concept_type CHECK constraint)',
        evidenceRefs: ['sveltekit-frontend/drizzle/schema.ts'],
      }),
    );
  }

  const allProposals = [
    ...canonicalConceptProposals,
    ...domainMappingProposals,
    ...structuralTypeProposals,
    ...relationPredicateProposals,
  ];

  // duplicates: same conceptId proposed more than once across all owners
  const conceptIdCounts = new Map<string, number>();
  for (const c of allProposals) conceptIdCounts.set(c.conceptId, (conceptIdCounts.get(c.conceptId) ?? 0) + 1);
  const duplicates = [...conceptIdCounts.entries()].filter(([, n]) => n > 1).map(([id]) => id);

  const aliasCollisionIssues = validateNoAliasCollisions(allProposals);

  // missingDefinitions: PROPOSED concepts are allowed empty status-gating (they're not ACTIVE),
  // but a truly empty definition string is still worth flagging as a proposal-quality signal.
  const missingDefinitions = allProposals.filter((c) => c.definition.trim().length === 0).map((c) => c.conceptId);
  const missingEvidence = allProposals.filter((c) => c.evidenceRefs.length === 0).map((c) => c.conceptId);

  const namespaces = [...new Set(allProposals.map((c) => c.namespace))].sort();
  const sourceOwners = [...new Set(allProposals.map((c) => c.sourceOwner))].sort();

  // ambiguousMappings: an alias in domainMappingProposals that also appears as a canonicalLabel
  // in canonicalConceptProposals (the two taxonomies' vocabularies overlapping is exactly the
  // kind of thing that must be surfaced, not silently merged).
  const coarseDomainLabels = new Set(canonicalConceptProposals.map((c) => c.canonicalLabel.toLowerCase()));
  const ambiguousMappings: string[] = [];
  for (const proposal of domainMappingProposals) {
    for (const alias of proposal.aliases) {
      if (coarseDomainLabels.has(alias.toLowerCase())) {
        ambiguousMappings.push(
          `"${alias}" is both a domain-taxonomy.ts coarse domain AND an ontology-domain-mapping alias under ${proposal.conceptId} — flagged, not auto-merged`,
        );
      }
    }
  }

  const { createHash } = await import('node:crypto');
  const proposalChecksum = `sha256:${createHash('sha256')
    .update(allProposals.map((c) => `${c.conceptId}:${c.definitionRevision}`).sort().join('\n'), 'utf8')
    .digest('hex')}`;
  const populationChecksum = `sha256:${createHash('sha256')
    .update([...conceptIdCounts.keys()].sort().join('\n'), 'utf8')
    .digest('hex')}`;

  const report = {
    schema: 'atlas.concept-seed-dry.v1',
    generatedAt: new Date().toISOString(),
    writesPerformed: false,
    proposalCount: allProposals.length,
    conceptCount: allProposals.length,
    aliasCount: allProposals.reduce((n, c) => n + c.aliases.length, 0),
    canonicalConceptProposals: canonicalConceptProposals.length,
    aliasProposals: allProposals.reduce((n, c) => n + c.aliases.length, 0),
    structuralMappingProposals: structuralTypeProposals.length,
    domainMappingProposals: domainMappingProposals.length,
    relationPredicateProposals: relationPredicateProposals.length,
    namespaces,
    sourceOwners,
    duplicates,
    aliasCollisions: aliasCollisionIssues.map((i) => i.message),
    missingDefinitions,
    missingOwners,
    missingEvidence,
    ambiguousMappings,
    populationChecksum,
    proposalChecksum,
    proposals: allProposals,
  };

  const outPath = path.resolve(REPO_ROOT, 'docs/reports/concept-seed-dry-v1.json');
  await writeFile(outPath, `${JSON.stringify(report, null, 2)}\n`, 'utf8');

  console.log(`Wrote ${allProposals.length} concept proposals to docs/reports/concept-seed-dry-v1.json`);
  console.log(`  canonicalConceptProposals: ${canonicalConceptProposals.length} (domain-taxonomy.ts)`);
  console.log(`  domainMappingProposals:    ${domainMappingProposals.length} (domain_mapping.py)`);
  console.log(`  structuralTypeProposals:   ${structuralTypeProposals.length} (concept_type CHECK)`);
  console.log(`  relationPredicateProposals:${relationPredicateProposals.length} (predicate CHECK)`);
  console.log(`  duplicates: ${duplicates.length}, aliasCollisions: ${aliasCollisionIssues.length}, ambiguousMappings: ${ambiguousMappings.length}`);
  console.log(`  proposalChecksum: ${proposalChecksum}`);
  if (domainMappingFetchError) {
    console.warn(`  [warn] domain_mapping.py fetch failed: ${domainMappingFetchError}`);
  }
}

main().catch((err) => {
  console.error('FAIL:', err);
  process.exit(1);
});
