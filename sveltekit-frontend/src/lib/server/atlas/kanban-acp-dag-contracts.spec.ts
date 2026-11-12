import { describe, expect, it } from 'vitest';
import {
  acpKanbanErrorTaskInputV1Schema,
  acpKanbanErrorTaskV1Schema,
  a2aErrorFixProposalRequestV1Schema,
  buildA2AErrorFixProposalResultV1,
  buildAcpKanbanErrorTaskV1,
  formatAcpKanbanErrorLineV1,
  researchParameterArtifactV1Schema,
} from './kanban-acp-dag-contracts.js';

describe('formatAcpKanbanErrorLineV1', () => {
  const parse = (line: string) => JSON.parse(line.slice(line.indexOf('{')));

  it('prints one line whose task input is exactly what acp.kanban_prefill_error_task accepts', () => {
    const line = formatAcpKanbanErrorLineV1(
      { relativePath: 'src/routes/api/documents/upload/+server.ts', errorSignature: 'ATTACHMENT_LINK_FAILED: duplicate key' },
      { documentId: 'doc-1' }
    );
    expect(line.split('\n')).toHaveLength(1);
    expect(line.startsWith('[acp-error] ATTACHMENT_LINK_FAILED ')).toBe(true);
    const payload = parse(line);
    expect(acpKanbanErrorTaskInputV1Schema.safeParse(payload.acpKanbanErrorTaskInput).success).toBe(true);
    expect(payload.acpKanbanErrorTaskInput.targetAgent).toBe('a2a-error-fixer');
    expect(payload.context).toEqual({ documentId: 'doc-1' });
  });

  it('never throws: an invalid path or unserializable context still yields a parseable line', () => {
    const bad = parse(formatAcpKanbanErrorLineV1({ relativePath: '/abs/path.ts', errorSignature: 'X_FAILED: boom' }));
    expect(bad.acpKanbanErrorTaskInput).toBeNull();
    expect(bad.invalid).toContain('RELATIVE_PATH_INVALID');

    const circular: Record<string, unknown> = {};
    circular.self = circular;
    const line = formatAcpKanbanErrorLineV1({ relativePath: 'a/b.ts', errorSignature: 'Y_FAILED' }, circular);
    expect(line.startsWith('[acp-error] Y_FAILED ')).toBe(true);
    expect(parse(line).context).toBe('UNSERIALIZABLE_CONTEXT');
    expect(formatAcpKanbanErrorLineV1({ relativePath: 'a.ts', errorSignature: '' }).startsWith('[acp-error] UNKNOWN_ERROR ')).toBe(true);
  });

  it('bounds the signature to the contract limit', () => {
    const payload = parse(formatAcpKanbanErrorLineV1({ relativePath: 'a/b.ts', errorSignature: 'Z'.repeat(9000) }));
    expect(payload.acpKanbanErrorTaskInput.errorSignature).toHaveLength(4000);
  });
});

describe('ACP Kanban prefill contracts', () => {
  const workboardTaskRef = {
    schema: 'atlas.openspec-workboard-task-ref.v1' as const,
    workboardTaskId: 'parent-atlas-workboard-feature-utility-fabric:481',
    stableKey: 'parent-atlas-workboard-feature-utility-fabric#0123456789abcdef',
    logicalTaskKey: null,
    taskRevision: `sha256:${'a'.repeat(64)}`,
    sourceRef: 'openspec/changes/parent-atlas-workboard-feature-utility-fabric/tasks.md',
    sourceFileSha256: `sha256:${'b'.repeat(64)}`,
    workboardSnapshotSha256: `sha256:${'c'.repeat(64)}`,
    workboardGeneratedAt: '2026-11-12T08:00:00.000Z',
    currentHead: 'head-1',
    status: 'CAPTURE_ASSERTED_SOURCE_CURRENT_LINK' as const,
    dispatchRevalidation: 'REQUIRED' as const,
    authority: 'PROPOSAL_REFERENCE_ONLY' as const,
    canonicalAuthority: false as const,
  };

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

  it('uses one deterministic proposal identity for ACP and A2A without claiming canonical task identity', () => {
    const input = acpKanbanErrorTaskInputV1Schema.parse({
      relativePath: 'src/lib/server/example.ts',
      errorSignature: 'TS2345: argument type mismatch',
      workboardTaskRef,
    });
    const acpProposal = buildAcpKanbanErrorTaskV1(input, { sourceAgent: 'trace-mcp-8788' });
    const a2aResult = buildA2AErrorFixProposalResultV1({
      requestId: 'a2a-request-1',
      errorFix: input,
    });
    const a2aProposal = a2aResult.artifacts[0]?.parts[0]?.data;

    expect(a2aResult.id).toBe('a2a-request-1');
    expect(a2aProposal).toEqual({ ...acpProposal, sourceAgent: 'a2a-agent-endpoint' });
    expect(acpProposal.taskId).toMatch(/^proposal-[a-f0-9]{64}$/);
    expect(buildAcpKanbanErrorTaskV1(input, { sourceAgent: 'trace-mcp-8788' }).taskId).toBe(acpProposal.taskId);
    expect(acpProposal).toMatchObject({
      sourceSha256: null,
      sourceRevision: null,
      status: 'BLOCKED_SOURCE_BYTES_UNAVAILABLE',
      admission: 'PROPOSAL_ONLY',
      canonicalAuthority: false,
      writesPerformed: false,
    });
    expect(a2aResult.metadata).toMatchObject({ proposalOnly: true, writesPerformed: false, canonicalAuthority: false });
    expect(acpProposal.workboardTaskRef).toEqual(workboardTaskRef);
  });

  it('rejects unqualified or authority-escalating OpenSpec task references', () => {
    const input = { relativePath: 'src/example.ts', errorSignature: 'TS2345', workboardTaskRef };
    expect(acpKanbanErrorTaskInputV1Schema.safeParse(input).success).toBe(true);
    expect(acpKanbanErrorTaskInputV1Schema.safeParse({
      ...input, workboardTaskRef: { ...workboardTaskRef, canonicalAuthority: true },
    }).success).toBe(false);
    expect(a2aErrorFixProposalRequestV1Schema.safeParse({
      ...input, workboardTaskRef: { ...workboardTaskRef, taskRevision: 'stale' },
    }).success).toBe(false);
  });

  it('rejects unqualified source claims and invalid A2A request IDs', () => {
    expect(a2aErrorFixProposalRequestV1Schema.safeParse({
      relativePath: 'src/example.ts',
      errorSignature: 'TS2345',
      sourceRevision: 'invented-revision',
    }).success).toBe(false);
    expect(() => buildA2AErrorFixProposalResultV1({ requestId: '', errorFix: {
      relativePath: 'src/example.ts',
      errorSignature: 'TS2345',
    } })).toThrow();
    expect(() => buildA2AErrorFixProposalResultV1({ requestId: 'a2a-1', errorFix: {
      relativePath: '../outside.ts',
      errorSignature: 'TS2345',
    } })).toThrow();
  });
});
