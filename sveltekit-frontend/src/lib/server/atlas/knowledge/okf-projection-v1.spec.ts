import { describe, expect, it } from 'vitest';

import { renderOkfProjectionV1 } from './okf-projection-v1.js';

describe('OkfProjectionV1', () => {
  it('renders revision-qualified human/agent knowledge without canonical authority', () => {
    const result = renderOkfProjectionV1({
      schema: 'atlas.okf-projection.v1',
      resource: 'atlas://contract/graphify-structural-batch-v1',
      title: 'Graphify Structural Batch V1',
      knowledgeType: 'CONTRACT',
      lifecycle: 'IMPLEMENTED_UNPROVEN',
      sourceRef: 'sveltekit-frontend/src/lib/server/atlas/indexing/graphify-structural-batch-v1.ts',
      workspaceRevision: 'ws-42',
      sourceRevision: 'src-7',
      producerRevision: 'okf-test',
      evidenceRefs: ['docs/reports/gph-production-integration-review-20260820.md'],
      tags: ['tree-sitter', 'graphify', 'tree-sitter'],
      bodyMarkdown: 'Structural delta orchestration contract.',
      canonicalAuthority: false,
      canonicalWritesAllowed: false,
    });

    expect(result.relativePath).toBe('docs/.okf/parent-atlas/contracts/graphify-structural-batch-v1.md');
    expect(result.markdown).toContain('canonical_authority: false');
    expect(result.markdown).toContain('canonical_writes_allowed: false');
    expect(result.markdown).toContain('workspace_revision: "ws-42"');
    expect(result.markdown).toContain('source_revision: "src-7"');
    expect(result.contentDigest).toMatch(/^[0-9a-f]{64}$/);
  });

  it('renders an empty evidence list as valid inline YAML', () => {
    const result = renderOkfProjectionV1({
      schema: 'atlas.okf-projection.v1',
      resource: 'atlas://gap/revision-owner',
      title: 'Revision Owner Gap',
      knowledgeType: 'GAP',
      lifecycle: 'BLOCKED',
      sourceRef: 'docs/reports/emb3a-upstream-revision-owner-audit.json',
      workspaceRevision: null,
      sourceRevision: null,
      producerRevision: 'okf-test',
      evidenceRefs: [],
      tags: ['emb3a'],
      bodyMarkdown: 'Revision authority is not proven.',
      canonicalAuthority: false,
      canonicalWritesAllowed: false,
    });

    expect(result.markdown).toContain('evidence_refs: []');
  });
});
