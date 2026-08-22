import { describe, expect, it } from 'vitest';
import { classifyAtlasQuery } from './query-classifier.js';
import { buildRetrievalPlan } from './retrieval-plan.js';

describe('buildRetrievalPlan', () => {
  it('contains one semantic lane and no executor names', () => {
    const classification = classifyAtlasQuery({ requestId: 'r1', query: 'implement cache adapter using CAGRA evidence' });
    const plan = buildRetrievalPlan({ classification, workspaceRevision: 'w1' });
    expect(plan.lanes.filter((lane) => lane === 'semantic')).toHaveLength(1);
    expect(JSON.stringify(plan.lanes)).not.toMatch(/CAGRA|QDRANT|DISKANN|CUVS/);
  });
});
