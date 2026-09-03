#!/usr/bin/env node
/**
 * Live proof for the domain-taxonomy-ml-bridge.ts fail-open contract
 * (openspec/changes/parent-atlas-search-classifier-sidecar task 6).
 * Run from sveltekit-frontend/: npx tsx scripts/atlas/prove-domain-taxonomy-ml-bridge-live.mts
 */
import { classifyDomainTaxonomy } from '../../src/lib/server/atlas/domain-taxonomy.js';
import { classifyDomainTaxonomyWithLearned } from '../../src/lib/server/atlas/domain-taxonomy-ml-bridge.js';

async function main() {
  const input = {
    sourceRef: 'src/lib/server/auth/session.ts',
    summary: 'function login(session) { return authenticate(session.token); }',
  };

  const deterministic = classifyDomainTaxonomy(input);
  console.log('Deterministic-only result:');
  console.log(JSON.stringify(deterministic, null, 2));

  const withLearned = await classifyDomainTaxonomyWithLearned(input);
  console.log('\nBridge result (deterministic + attempted learned label):');
  console.log(JSON.stringify(withLearned, null, 2));

  const checks: Array<[string, boolean]> = [
    ['primary_domain unchanged', withLearned.primary_domain === deterministic.primary_domain],
    ['confidence unchanged', withLearned.confidence === deterministic.confidence],
    ['fallback_label unchanged', withLearned.fallback_label === deterministic.fallback_label],
    ['deterministic labels all still present', deterministic.labels.every((l) =>
      withLearned.labels.some((wl) => wl.label === l.label && wl.source === l.source))],
    ['no crash / bridge returned a valid DomainClassification', Array.isArray(withLearned.labels)],
  ];

  let allPass = true;
  for (const [label, ok] of checks) {
    console.log(`  ${ok ? 'PASS' : 'FAIL'}: ${label}`);
    if (!ok) allPass = false;
  }

  const learnedLabels = withLearned.labels.filter((l) => l.source === 'learned');
  console.log(`\nlearned labels appended: ${learnedLabels.length} (expected 0 -- no trained checkpoint exists yet, this proves fail-open, not a bug)`);

  if (!allPass) {
    console.error('\nFAIL');
    process.exit(1);
  }
  console.log('\nPASS: bridge is fail-open and preserves deterministic behavior exactly.');
}

main().catch((err) => {
  console.error('FAIL:', err);
  process.exit(1);
});
