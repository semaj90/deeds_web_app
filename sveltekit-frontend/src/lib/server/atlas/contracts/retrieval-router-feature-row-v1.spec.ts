// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { RouterWorkspaceRevisionV1Schema, RetrievalRouterFeatureRowV1Schema } from './retrieval-router-feature-row-v1.js';

describe('RouterWorkspaceRevisionV1Schema (SPINE-05A additive correction)', () => {
  it('accepts the canonical sha256 workspace revision used by live producers', () => {
    expect(RouterWorkspaceRevisionV1Schema.safeParse(`sha256:${'a'.repeat(64)}`).success).toBe(true);
  });

  it('keeps the legacy non-negative integer as compatibility coverage', () => {
    expect(RouterWorkspaceRevisionV1Schema.safeParse(742).success).toBe(true);
    expect(RouterWorkspaceRevisionV1Schema.safeParse(0).success).toBe(true);
  });

  it('rejects malformed or negative revisions instead of coercing them', () => {
    expect(RouterWorkspaceRevisionV1Schema.safeParse('sha256:short').success).toBe(false);
    expect(RouterWorkspaceRevisionV1Schema.safeParse('742').success).toBe(false);
    expect(RouterWorkspaceRevisionV1Schema.safeParse(-1).success).toBe(false);
    expect(RouterWorkspaceRevisionV1Schema.safeParse(1.5).success).toBe(false);
  });

  it('is nullable on the router row schema (field exists and uses the union)', () => {
    const shape = RetrievalRouterFeatureRowV1Schema.shape.workspaceRevision;
    expect(shape.safeParse(null).success).toBe(true);
    expect(shape.safeParse(`sha256:${'b'.repeat(64)}`).success).toBe(true);
    expect(shape.safeParse(742).success).toBe(true);
    expect(shape.safeParse('not-a-revision').success).toBe(false);
  });
});
