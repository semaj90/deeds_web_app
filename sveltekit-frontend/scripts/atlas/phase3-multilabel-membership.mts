#!/usr/bin/env node

/**
 * Phase 3 Step 3: Replace Flat Labels with Multi-Label Hierarchical Memberships
 *
 * Transition atlas_packets from Phase 1 flat domain_class to Phase 1.5 multi-domain
 * probabilistic membership (domain_memberships JSONB).
 *
 * Contract: DomainMembership
 * - packet_key (unique identity)
 * - primary_domain (highest probability)
 * - domain_memberships (JSON: domain → [0, 1])
 * - sum constraint: 0.85 ≤ Σ probabilities ≤ 1.15
 */

import { z } from 'zod';
import { readFileSync, writeFileSync } from 'fs';
import { resolve } from 'path';

// Import Phase 1 label hierarchy
const labelMapPath = resolve(process.cwd(), 'artifacts', 'domain_label_map_v1.json');
const labelMapText = readFileSync(labelMapPath, 'utf-8');
const labelMap = JSON.parse(labelMapText) as {
  domain_families: Array<{ domain_family: string; lifecycle_state: string; domain_classes?: any[] }>;
  flat_domain_classes: Array<{ domain_class: string; lifecycle_state: string }>;
  unclassified_labels: Array<{ original_label: string; canonical_label: string; lifecycle_state: string }>;
};

// Define multi-label membership contract
const DomainMembershipsSchema = z
  .record(z.string(), z.number().min(0).max(1))
  .refine(
    (memberships) => {
      const sum = Object.values(memberships).reduce((a, b) => a + b, 0);
      return sum >= 0.85 && sum <= 1.15;
    },
    { message: 'Domain probabilities must sum to ~1.0 (±0.15)' }
  );

const MultiDomainPacketSchema = z.object({
  packet_key: z.string().regex(/^ace:packet:[a-z0-9_-]+$/),
  source_ref: z.string(),
  feature_id: z.string(),
  domain_class: z.string().optional().describe('Phase 1: single flat label'),
  domain_memberships: DomainMembershipsSchema.describe('Phase 1.5: multi-domain probabilities'),
  primary_domain: z.string().describe('Domain with highest probability'),
  domain_confidence: z.number().min(0).max(1).describe('Confidence of primary domain'),
});

type MultiDomainPacket = z.infer<typeof MultiDomainPacketSchema>;

// Build hierarchical domain taxonomy
interface DomainNode {
  canonical_label: string;
  tier: 'root' | 'major' | 'specific';
  parent?: string;
  keywords: string[];
  active: boolean;
}

const domainTaxonomy: Record<string, DomainNode> = {};

// Phase 1 families → tier 2
for (const family of labelMap.domain_families) {
  domainTaxonomy[family.domain_family] = {
    canonical_label: family.domain_family,
    tier: 'major',
    parent: 'computer_science', // root
    keywords: [],
    active: family.lifecycle_state === 'ACTIVE',
  };
}

// Phase 1 classes → tier 3
for (const klass of labelMap.flat_domain_classes) {
  domainTaxonomy[klass.domain_class] = {
    canonical_label: klass.domain_class,
    tier: 'specific',
    parent: 'unknown', // will be mapped from family hierarchy
    keywords: [],
    active: klass.lifecycle_state === 'ACTIVE',
  };
}

console.log(`📊 Domain Taxonomy: ${Object.keys(domainTaxonomy).length} domains loaded`);

// Mapping function: Phase 1 flat label → Phase 1.5 multi-domain
function phaseOneToPhaseOnePointFive(label: string): { memberships: Record<string, number>; primary: string } {
  // Simple heuristic: single flat label → concentrated probability on primary + diffuse on similar
  const memberships: Record<string, number> = {};

  // If the label is ACTIVE, it gets primary probability
  const activeLabels = [
    ...labelMap.domain_families.filter((f) => f.lifecycle_state === 'ACTIVE').map((f) => f.domain_family),
    ...labelMap.flat_domain_classes.filter((c) => c.lifecycle_state === 'ACTIVE').map((c) => c.domain_class),
  ];

  if (activeLabels.includes(label)) {
    // Primary domain gets 0.75–0.85
    const primary = label;
    memberships[primary] = 0.80;

    // Secondary domains get 0.05–0.10 each (related by prefix matching)
    const related = activeLabels.filter(
      (l) => l !== primary && (l.startsWith(primary.split('_')[0]) || primary.startsWith(l.split('_')[0]))
    );

    const secondaryProb = (1.0 - memberships[primary]) / Math.max(related.length, 1);
    for (const rel of related.slice(0, 3)) {
      // max 3 secondaries to keep sum near 1.0
      memberships[rel] = Math.min(secondaryProb, 0.08);
    }
  } else {
    // UNRESOLVED or INVALID → spread across possible candidates
    const candidates = activeLabels.slice(0, 5); // top 5 active labels
    const prob = 1.0 / candidates.length;
    for (const cand of candidates) {
      memberships[cand] = prob;
    }
  }

  // Normalize to sum to exactly 1.0
  const sum = Object.values(memberships).reduce((a, b) => a + b, 0);
  const normalized: Record<string, number> = {};
  for (const [domain, prob] of Object.entries(memberships)) {
    normalized[domain] = prob / sum;
  }

  const primary = Object.entries(normalized).reduce((a, b) => (b[1] > a[1] ? b : a))[0];
  return { memberships: normalized, primary };
}

// Example conversion
const exampleFlatLabel = 'agent';
const { memberships: exampleMemberships, primary: examplePrimary } = phaseOneToPhaseOnePointFive(exampleFlatLabel);

const examplePacket: MultiDomainPacket = {
  packet_key: 'ace:packet:example-001',
  source_ref: 'src/lib/server/agent.ts',
  feature_id: 'agent.orchestration',
  domain_class: exampleFlatLabel,
  domain_memberships: exampleMemberships,
  primary_domain: examplePrimary,
  domain_confidence: exampleMemberships[examplePrimary],
};

console.log(`\n✅ Example Conversion: "${exampleFlatLabel}" → multi-domain`);
console.log(`   Primary: ${examplePrimary} (confidence: ${exampleMemberships[examplePrimary].toFixed(3)})`);
console.log(`   Memberships: ${JSON.stringify(exampleMemberships, null, 2)}`);

// Validate
const validation = MultiDomainPacketSchema.safeParse(examplePacket);
if (validation.success) {
  console.log(`\n✅ Example packet valid`);
} else {
  console.log(`\n❌ Example packet invalid:`, validation.error.errors);
  process.exit(1);
}

// Output schema for Phase 3 step 4
const schemaOutput = {
  description: 'Multi-Label Hierarchical Membership Contract',
  schema_version: '1.5.0',
  transition: 'Phase 1 (flat) → Phase 1.5 (multi-domain)',
  conversion_rule: 'Single label → primary (0.75-0.85) + secondaries (0.05-0.10)',
  validation_gates: [
    'All probabilities ∈ [0, 1]',
    'Sum ≈ 1.0 (±0.15 tolerance)',
    'primary_domain = argmax(domain_memberships)',
    'domain_confidence = domain_memberships[primary_domain]',
  ],
  example: examplePacket,
};

const outputPath = resolve(process.cwd(), 'artifacts', 'phase1_5_membership_contract.json');
writeFileSync(outputPath, JSON.stringify(schemaOutput, null, 2));

console.log(`\n✅ Schema written to ${outputPath}`);
