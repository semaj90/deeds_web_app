import { describe, expect, it } from 'vitest';
import {
  acpKanbanErrorTaskInputV1Schema,
  acpKanbanErrorTaskV1Schema,
  researchParameterArtifactV1Schema,
} from './kanban-acp-dag-contracts.js';

describe('ACP Kanban prefill contracts', () => {
  it('accepts only normalized relative paths and bounded input', () => {
    expect(acpKanbanErrorTaskInputV1Schema.safeParse({
      relativePath: 'src/lib/server/example.ts',
      errorSignature: 'type mismatch',
    }).success).toBe(true);

    for (const relativePath of ['../secrets', '/etc/passwd', 'src//file.ts', 'src\\file.ts', 'src/./file.ts']) {
      expect(acpKanbanErrorTaskInputV1Schema.safeParse({ relativePath, errorSignature: 'error' }).success).toBe(false);
    }
    expect(acpKanbanErrorTaskInputV1Schema.safeParse({
      relativePath: 'src/file.ts',
      errorSignature: 'error',
      dbSchemaVerified: true,
    }).success).toBe(false);
  });

  it('rejects fake prefill defaults and the misspelled DAG field', () => {
    const task = {
      schema: 'atlas.acp-kanban-error-task.v1',
      taskId: 'proposal-1',
      boardColumn: 'blocked',
      sourceAgent: 'trace-mcp-8788',
      targetAgent: 'a2a-error-fixer',
      relativePath: 'src/example.ts',
      errorSignature: 'error',
      sourceSha256: null,
      sourceRevision: null,
      status: 'BLOCKED_SOURCE_BYTES_UNAVAILABLE',
      admission: 'PROPOSAL_ONLY',
      extractionStatus: 'NOT_RUN',
      extractedSpans: [],
      dagPrefillNodes: [{
        nodeId: 'file:src/example.ts',
        relativePath: 'src/example.ts',
        topoClass: null,
        graphAuthority: null,
        pagerank: null,
        agentsDir: null,
        errorSignatures: ['error'],
      }],
      promptCards: [],
      recommendedFixActions: [],
      dbSchemaStatus: 'NOT_CHECKED',
      canonicalAuthority: false,
      writesPerformed: false,
    };

    expect(acpKanbanErrorTaskV1Schema.safeParse(task).success).toBe(true);
    expect(acpKanbanErrorTaskV1Schema.safeParse({ ...task, dagPrefillnodes: [] }).success).toBe(false);
    expect(acpKanbanErrorTaskV1Schema.safeParse({ ...task, dbSchemaVerified: true }).success).toBe(false);
    expect(acpKanbanErrorTaskV1Schema.safeParse({
      ...task,
      dagPrefillNodes: [{ ...task.dagPrefillNodes[0], graphAuthority: 0.8, pagerank: 0.7 }],
    }).success).toBe(false);
  });

  it('requires lowercase hexadecimal SHA-256 syntax on research artifacts', () => {
    const artifact = {
      schema: 'atlas.research-parameter.v1',
      parameterKey: 'retrieval.top_k',
      value: 10,
      inputChecksum: 'a'.repeat(64),
      producerRevision: 'fixture-v1',
      evidenceRefs: [],
      canonicalAuthority: false,
      writesPerformed: false,
    };
    expect(researchParameterArtifactV1Schema.safeParse(artifact).success).toBe(true);
    const withoutEvidenceRefs = researchParameterArtifactV1Schema.safeParse(
      Object.fromEntries(Object.entries(artifact).filter(([key]) => key !== 'evidenceRefs')),
    );
    expect(withoutEvidenceRefs.success).toBe(true);
    if (withoutEvidenceRefs.success) expect(withoutEvidenceRefs.data.evidenceRefs).toEqual([]);
    expect(researchParameterArtifactV1Schema.safeParse({ ...artifact, inputChecksum: 'g'.repeat(64) }).success).toBe(false);
    expect(researchParameterArtifactV1Schema.safeParse({ ...artifact, schema: 'atlas.parameter-artifact.v1' }).success).toBe(false);
  });
});
