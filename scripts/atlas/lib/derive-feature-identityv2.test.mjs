import assert from 'node:assert/strict';
import test from 'node:test';
import { deriveFeatureIdentity } from './derive-feature-identityv2.mjs';

test('derives a feature label and ID from repository AST evidence without mutation', () => {
  const proposal = deriveFeatureIdentity(
    {
      canonical_source_ref: 'sveltekit-frontend/src/lib/search/+page.svelte',
      feature_label: '+page.svelte',
    },
    {
      astEvidence: {
        primaryFunctionalSymbol: 'Search Results Panel',
        exportedSymbols: ['SearchResultsPanel'],
        parseErrorCount: 0,
      },
      featureNamespace: 'sveltekit-frontend',
    },
  );

  assert.equal(proposal.featureLabelDerived, 'Search Results Panel');
  assert.equal(proposal.featureLabelSource, 'ast');
  assert.equal(proposal.featureIdProposed, 'sveltekit-frontend.search-results-panel');
  assert.equal(proposal.canonicalMutation, false);
  assert.equal(proposal.featureLabelStatus, 'GENERIC_REPLACEMENT_RECOMMENDED');
});

test('marks route-method-only labels for review rather than canonical use', () => {
  const proposal = deriveFeatureIdentity(
    { canonical_source_ref: 'sveltekit-frontend/src/routes/api/search/+server.ts' },
    { astEvidence: { primaryFunctionalSymbol: 'POST', routeMethods: ['POST'] } },
  );

  assert.equal(proposal.featureLabelDerived, 'Post');
  assert.equal(proposal.featureLabelStatus, 'GENERIC_REPLACEMENT_RECOMMENDED');
  assert.equal(proposal.canonicalMutation, false);
});

test('rejects structurally invalid or empty evidence instead of inventing identity', () => {
  const proposal = deriveFeatureIdentity({}, { astEvidence: { parseErrorCount: 30 } });

  assert.equal(proposal.featureLabelStatus, 'MANUAL_REVIEW');
  assert.equal(proposal.featureLabelDerived, null);
  assert.equal(proposal.featureIdProposed, null);
  assert.equal(proposal.canonicalMutation, false);
});

test('does not treat an existing label as independent canonical evidence', () => {
  const proposal = deriveFeatureIdentity({
    feature_id: 'sveltekit-frontend.search-runtime',
    feature_label: 'Search Runtime',
  });

  assert.equal(proposal.featureLabelSource, 'existing_label');
  assert.equal(proposal.featureLabelStatus, 'MANUAL_REVIEW');
  assert.equal(proposal.canonicalMutation, false);
});
