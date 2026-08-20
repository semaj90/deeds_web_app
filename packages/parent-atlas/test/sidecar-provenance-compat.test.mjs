import test from 'node:test';
import assert from 'node:assert/strict';

import {
  adaptSidecarGroundedExtractions,
} from '../dist/core/langextract-sidecar-metadata-adapter.js';
import {
  adaptGroundedLangExtract,
} from '../dist/core/langextract-grounding-adapter.js';

test('legacy sidecar start_char/end_char remains compatible but alignment is observable', () => {
  const raw = adaptSidecarGroundedExtractions({
    grounded_extractions: [{
      class: 'authorization',
      text: 'case owner',
      start_char: 4,
      end_char: 14,
      attributes: { role: 'owner' },
    }],
  });

  assert.deepEqual(raw[0].char_interval, { start_pos: 4, end_pos: 14 });
  assert.equal(raw[0].alignment_status, null);

  const grounded = adaptGroundedLangExtract({
    source_ref: 'doc.md',
    source_revision: 'rev-1',
    source_text: 'xxxxcase owner rest',
    extractor_revision: 'langextract:test',
    producer_revision: 'atlas:test',
    extractions: raw,
  });

  assert.equal(grounded.observations.length, 1);
  assert.equal(grounded.receipt.unknown_alignment_count, 1);
});

test('LangExtract native char_interval and match_exact are preserved', () => {
  const raw = adaptSidecarGroundedExtractions({
    grounded_extractions: [{
      class: 'requirement',
      text: 'must verify',
      char_interval: { start_pos: 0, end_pos: 11 },
      alignment_status: 'match_exact',
      attributes: { source: 'openspec' },
    }],
  });

  const grounded = adaptGroundedLangExtract({
    source_ref: 'spec.md',
    source_revision: 'rev-2',
    source_text: 'must verify!',
    extractor_revision: 'langextract:test',
    producer_revision: 'atlas:test',
    extractions: raw,
  });

  assert.equal(grounded.observations[0].alignment_status, 'match_exact');
  assert.equal(grounded.observations[0].alignment_exact, true);
  assert.equal(grounded.receipt.exact_alignment_count, 1);
});
