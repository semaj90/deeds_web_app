import { test } from 'node:test';
import assert from 'node:assert';
import { deriveFeatureIdentity, titleCase } from './derive-feature-identity.mjs';

test('Case 1: Case Scoring Dashboard page', () => {
  const row = {
    title_id: 'title.sveltekit.frontend.page.74bfb5ad',
    feature_id: 'sveltekit-frontend.+page',
    feature_label: '+page.svelte',
    summary: 'This component renders a "Case Scoring Dashboard," providing an interface for AI-driven risk assessment that visualizes case data using dynamic factors and confidence metrics.',
    canonical_source_ref: 'src/routes/(app)/demos/case-scoring/+page.svelte',
    file_path: 'src/routes/(app)/demos/case-scoring/+page.svelte'
  };

  const result = deriveFeatureIdentity(row);

  assert.strictEqual(result.featureLabel, 'Case Scoring Dashboard', 'Should derive "Case Scoring Dashboard"');
  assert.strictEqual(result.featureLabel, 'Case Scoring Dashboard', 'Should strip trailing comma from quoted phrase');
  assert.strictEqual(result.featureLabelSource, 'summary', 'Source should be summary');
  assert.strictEqual(result.featureLabelConfidence, 0.95, 'Confidence should be 0.95 for summary');
  assert.strictEqual(result.featureId, 'sveltekit-frontend.case-scoring-dashboard', 'Feature ID should be slugified');
  assert.strictEqual(result.sourceBasename, '+page.svelte', 'Source basename should be +page.svelte');
});

test('Case 2: Cache events handler', () => {
  const row = {
    title_id: 'title.sveltekit.frontend.server.cache.events.a2f91b33',
    feature_id: 'sveltekit-frontend.cache-events.ts',
    feature_label: 'cache-events.ts',
    summary: 'Cache event management and invalidation. Handles storage event propagation and cache lifecycle notifications.',
    canonical_source_ref: 'src/lib/server/cache/cache-events.ts',
    file_path: 'src/lib/server/cache/cache-events.ts'
  };

  const result = deriveFeatureIdentity(row);

  assert.strictEqual(result.featureLabel, 'Cache Event Management', 'Should derive "Cache Event Management"');
  assert.strictEqual(result.featureLabelSource, 'summary', 'Source should be summary');
  assert.strictEqual(result.featureLabelConfidence, 0.95, 'Confidence should be 0.95 for summary');
  assert.strictEqual(result.featureId, 'sveltekit-frontend.cache-event-management', 'Feature ID should be slugified');
  assert.strictEqual(result.sourceBasename, 'cache-events.ts', 'Source basename should be cache-events.ts');
});

test('Canonical label (non-generic) passes through unchanged', () => {
  const row = {
    title_id: 'title.sveltekit.frontend.page.xyz',
    feature_id: 'sveltekit-frontend.my-feature',
    feature_label: 'My Custom Feature Name',
    summary: 'Some other summary',
    canonical_source_ref: 'src/routes/some/path/+page.svelte',
    file_path: 'src/routes/some/path/+page.svelte'
  };

  const result = deriveFeatureIdentity(row);

  assert.strictEqual(result.featureLabel, 'My Custom Feature Name', 'Should pass through non-generic label');
  assert.strictEqual(result.featureLabelSource, 'canonical', 'Source should be canonical');
  assert.strictEqual(result.featureLabelConfidence, 1.0, 'Confidence should be 1.0');
});

test('Fallback to path derivation when summary has no pattern', () => {
  const row = {
    title_id: 'title.sveltekit.frontend.page.xyz',
    feature_id: 'sveltekit-frontend.+page',
    feature_label: '+page.svelte',
    summary: 'This is a generic summary with no meaningful pattern',
    canonical_source_ref: 'src/routes/user-profile/+page.svelte',
    file_path: 'src/routes/user-profile/+page.svelte'
  };

  const result = deriveFeatureIdentity(row);

  assert.strictEqual(result.featureLabel, 'User Profile', 'Should derive from path');
  assert.strictEqual(result.featureLabelSource, 'path', 'Source should be path');
  assert.strictEqual(result.featureLabelConfidence, 0.7, 'Confidence should be 0.7');
});

test('Fallback to title_id when summary and path fail', () => {
  const row = {
    title_id: 'title.sveltekit.frontend.admin.user-management.settings.abc123de',
    feature_id: 'sveltekit-frontend.+page',
    feature_label: '+server.ts',
    summary: 'Generic handler',
    canonical_source_ref: 'src/routes/+server.ts',
    file_path: 'src/routes/+server.ts'
  };

  const result = deriveFeatureIdentity(row);

  assert.strictEqual(result.featureLabel, 'Admin User Management Settings', 'Should derive from title_id');
  assert.strictEqual(result.featureLabelSource, 'title_id', 'Source should be title_id');
  assert.strictEqual(result.featureLabelConfidence, 0.5, 'Confidence should be 0.5');
});

test('Fallback to basename when all else fails', () => {
  const row = {
    title_id: '',
    feature_id: 'sveltekit-frontend.+page',
    feature_label: '+page.svelte',
    summary: '',
    canonical_source_ref: 'src/+page.svelte',
    file_path: 'src/+page.svelte'
  };

  const result = deriveFeatureIdentity(row);

  assert.strictEqual(result.featureLabel, '+Page', 'Should fallback to title-cased basename');
  assert.strictEqual(result.featureLabelSource, 'basename', 'Source should be basename');
  assert.strictEqual(result.featureLabelConfidence, 0.3, 'Confidence should be 0.3');
  assert.strictEqual(titleCase('page'), 'Page');
  assert.strictEqual(titleCase('_page'), '_Page');
  assert.strictEqual(titleCase('page route'), 'Page Route');
});
