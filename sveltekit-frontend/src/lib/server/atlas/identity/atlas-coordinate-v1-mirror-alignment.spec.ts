// @vitest-environment node

import { describe, expect, it } from 'vitest';
import * as compatibility from './atlas-coordinate-v1.js';
import * as canonical from '../../../../../../packages/atlas-core/src/identity/atlas-coordinate-v1.js';

/**
 * The frontend path is a compatibility re-export, not an independent implementation.
 */
describe('atlas-coordinate-v1 compatibility export', () => {
  it('re-exports the canonical package runtime objects', () => {
    expect(compatibility.atlasCoordinateV1Schema).toBe(canonical.atlasCoordinateV1Schema);
    expect(compatibility.packetEvidenceCoordinateV1Schema).toBe(canonical.packetEvidenceCoordinateV1Schema);
    expect(compatibility.chunkEvidenceCoordinateV1Schema).toBe(canonical.chunkEvidenceCoordinateV1Schema);
    expect(compatibility.satisfiesEvidenceEligibilityV1).toBe(canonical.satisfiesEvidenceEligibilityV1);
    expect(compatibility.assertChunkEvidenceCoordinateV1).toBe(canonical.assertChunkEvidenceCoordinateV1);
  });
});
