import { describe, expect, it } from 'vitest';
import { compileContext, type ContextCandidate } from './context-compiler.parent-atlas.js';

const candidates: ContextCandidate[] = [
  {
    packet_key: 'packet:repair:source',
    canonical_id: 'src:repair-fixture',
    candidate_ordinal: 0,
    workspace_revision: 'workspace:r17',
    source_revision: 'source:r17',
    graph_revision: 'graph:r4',
    representation_revision: 'representation:semantic-768:r9',
    feature_revision: 'feature:r3',
    evidence_refs: ['evidence:repair:source-span'],
    source_ref: 'src/repair-fixture.ts',
    content: 'export function repairFixture(): number { return missingSymbol(); }',
    lanes: ['exact', 'graph'],
    relevance: 1,
    authority: 1,
    freshness: 1,
    required: true,
    token_count: 12,
  },
  {
    packet_key: 'packet:repair:caller',
    canonical_id: 'src:caller-fixture',
    candidate_ordinal: 1,
    workspace_revision: 'workspace:r17',
    source_revision: 'source:r17',
    graph_revision: 'graph:r4',
    representation_revision: 'representation:semantic-768:r9',
    feature_revision: 'feature:r3',
    evidence_refs: ['evidence:repair:caller-span'],
    source_ref: 'src/caller-fixture.ts',
    content: 'import { repairFixture } from "./repair-fixture";',
    lanes: ['graph', 'dense'],
    relevance: 0.8,
    authority: 0.9,
    freshness: 1,
    token_count: 8,
  },
];

function compileRepairContext(inputCandidates: ContextCandidate[] = candidates) {
  return compileContext({
    request_id: 'repair-request:r17',
    feature_id: 'agentic-repair',
    source_refs: ['src/repair-fixture.ts'],
    candidates: inputCandidates,
    policy: {
      version: 'repair-policy:r1',
      token_budget: 64,
      reserved_tokens: 8,
      max_packets: 4,
    },
    ordinal_map_checksum: 'sha256:ordinal-r17',
    model_revision: 'model:repair-shadow:r1',
    prompt_template_revision: 'prompt:repair:r1',
    feature_presence: {
      semantic_768: 'PROVEN',
      ast: 'PROVEN',
      graph: 'PROVEN',
    },
    now: new Date('2026-09-03T00:00:00.000Z'),
  });
}

describe('agentic repair context replay', () => {
  it('replays the same revision-qualified candidates into the same ACE manifest', () => {
    const first = compileRepairContext();
    const second = compileRepairContext();

    expect(first.manifest.manifest_id).toBe(second.manifest.manifest_id);
    expect(first.manifest.identity?.complete).toBe(true);
    expect(first.manifest.identity?.ordinal_map_checksum).toBe('sha256:ordinal-r17');
    expect(first.manifest.source_refs).toEqual(['src/caller-fixture.ts', 'src/repair-fixture.ts']);
    expect(first.selected.map((candidate) => candidate.packet_key)).toEqual(
      second.selected.map((candidate) => candidate.packet_key),
    );
    expect(first.prompt_packets).toEqual(second.prompt_packets);
  });

  it('does not claim a complete identity when a required revision is missing', () => {
    const missingRevision = candidates.map((candidate) => ({ ...candidate }));
    missingRevision[1] = { ...missingRevision[1], feature_revision: undefined };

    const result = compileRepairContext(missingRevision);

    expect(result.manifest.identity?.complete).toBe(false);
  });
});
