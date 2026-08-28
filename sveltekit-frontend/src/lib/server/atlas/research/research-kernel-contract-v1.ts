import { createHash } from 'node:crypto';

export type ResearchKernelBudgetV1 = {
  maxRounds: number;
  maxSubqueries: number;
  maxOperations: number;
  maxCards: number;
  tokenBudget: number;
  maxWallTimeMs: number;
};

export type ResearchKernelSessionV1 = {
  schema: 'atlas.research-kernel-session.v1';
  sessionId: string;
  candidateSnapshotRevision: string;
  ordinalMapChecksum: string;
  workspaceRevision: string;
  kernelRevision: string;
  budget: ResearchKernelBudgetV1;
  canonicalAuthority: false;
};

export type ResearchOperationV1 = {
  schema: 'atlas.research-operation.v1';
  operationId: string;
  sessionId: string;
  kind: 'SYNTHESIZE_QUERY' | 'SEARCH' | 'SELECT_CARDS' | 'COVERAGE';
  inputChecksum: string;
  outputChecksum: string;
  status: 'SUCCEEDED' | 'REJECTED' | 'FAILED';
  canonicalAuthority: false;
};

export function sha256(value: unknown): string {
  return `sha256:${createHash('sha256').update(JSON.stringify(value)).digest('hex')}`;
}

export function createResearchKernelSession(input: {
  sessionId: string;
  candidateSnapshotRevision: string;
  ordinalMapChecksum: string;
  workspaceRevision: string;
  kernelRevision?: string;
  budget?: Partial<ResearchKernelBudgetV1>;
}): ResearchKernelSessionV1 {
  const budget: ResearchKernelBudgetV1 = {
    maxRounds: input.budget?.maxRounds ?? 3,
    maxSubqueries: input.budget?.maxSubqueries ?? 4,
    maxOperations: input.budget?.maxOperations ?? 12,
    maxCards: input.budget?.maxCards ?? 32,
    tokenBudget: input.budget?.tokenBudget ?? 8_192,
    maxWallTimeMs: input.budget?.maxWallTimeMs ?? 30_000,
  };
  if (!input.sessionId || !input.candidateSnapshotRevision || !input.ordinalMapChecksum || !input.workspaceRevision.startsWith('sha256:')) {
    throw new Error('RESEARCH_SESSION_COORDINATES_INVALID');
  }
  if (Object.values(budget).some((value) => !Number.isInteger(value) || value < 1)) throw new Error('RESEARCH_SESSION_BUDGET_INVALID');
  return {
    schema: 'atlas.research-kernel-session.v1',
    sessionId: input.sessionId,
    candidateSnapshotRevision: input.candidateSnapshotRevision,
    ordinalMapChecksum: input.ordinalMapChecksum,
    workspaceRevision: input.workspaceRevision,
    kernelRevision: input.kernelRevision ?? 'research-kernel-host-v1',
    budget,
    canonicalAuthority: false,
  };
}

export function assertResearchSessionRevision(session: ResearchKernelSessionV1, coordinates: Pick<ResearchKernelSessionV1, 'candidateSnapshotRevision' | 'ordinalMapChecksum' | 'workspaceRevision'>): void {
  if (session.candidateSnapshotRevision !== coordinates.candidateSnapshotRevision) throw new Error('RESEARCH_SESSION_CANDIDATE_SNAPSHOT_MISMATCH');
  if (session.ordinalMapChecksum !== coordinates.ordinalMapChecksum) throw new Error('RESEARCH_SESSION_ORDINAL_MAP_MISMATCH');
  if (session.workspaceRevision !== coordinates.workspaceRevision) throw new Error('RESEARCH_SESSION_WORKSPACE_REVISION_MISMATCH');
}
