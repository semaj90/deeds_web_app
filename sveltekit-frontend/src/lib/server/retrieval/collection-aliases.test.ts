// @vitest-environment node

import { describe, expect, it } from 'vitest';
import { CODEBASE_COLLECTION_PRIORITY } from './collection-aliases.js';

describe('collection alias priority', () => {
  it('keeps the default alias fallback on the canonical 768 collections', () => {
    expect(CODEBASE_COLLECTION_PRIORITY).toEqual([
      'codebase_chunks_768_v2',
      'codebase_chunks_768',
    ]);
  });
});
