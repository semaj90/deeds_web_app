import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import { resolveOpenSpecReportDirectory } from './report-reader';

export type OpenSpecEvidenceHealthSnapshot = {
  exists: boolean;
  reportPath: string;
  size: number;
  mtimeMs: number;
  sha256: string | null;
  schema: string;
  status: string;
  promotionEligible: boolean;
  source: {
    census: string | null;
    workspaceRevision: string | null;
    generatedAt: string | null;
  };
  claims: Record<string, number>;
  identity: Record<string, number>;
  receipts: Record<string, number>;
  proof: {
    states: Record<string, number>;
    contradictionTasks: number;
    blockedTasks: number;
    heuristicPromotionCount: number;
    predicateCount: number;
  };
  graph: Record<string, number>;
  workboard: {
    status: string;
    boardTaskCount: number;
    evidenceCardCount: number;
    exactSourceRefJoinCount: number;
    boardOnlyCount: number;
    evidenceOnlyCount: number;
    doneWithoutProvenCount: number;
    openWithProvenCount: number;
  };
  stages: Array<{ id: string; status: string; writesPerformed: boolean; report: string | null }>;
  contracts: {
    canonicalVector: string;
    vectorDimension: number;
    writesPerformed: boolean;
    taskMutationAllowed: boolean;
    projectionMutationAllowed: boolean;
    authoritativeSurface: string;
  };
};

function record(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

function stringValue(value: unknown): string | null {
  return typeof value === 'string' && value.trim() ? value : null;
}

function numberRecord(value: unknown): Record<string, number> {
  return Object.fromEntries(Object.entries(record(value)).map(([key, raw]) => [key, Number.isFinite(Number(raw)) ? Number(raw) : 0]));
}

function boundedSnapshot(parsed: unknown, reportPath: string, stat: { size: number; mtimeMs: number }, content: string): OpenSpecEvidenceHealthSnapshot {
  const source = record(record(parsed).source);
  const proof = record(record(parsed).proof);
  const contracts = record(record(parsed).contracts);
  const workboard = record(record(parsed).workboard);
  const stages: unknown[] = Array.isArray(record(parsed).stages) ? record(parsed).stages as unknown[] : [];
  return {
    exists: true,
    reportPath,
    size: stat.size,
    mtimeMs: stat.mtimeMs,
    sha256: crypto.createHash('sha256').update(content).digest('hex'),
    schema: stringValue(record(parsed).schema) ?? 'unknown',
    status: stringValue(record(parsed).status) ?? 'REPORT_INVALID',
    promotionEligible: record(parsed).promotionEligible === true,
    source: {
      census: stringValue(source.census),
      workspaceRevision: stringValue(source.workspaceRevision),
      generatedAt: stringValue(source.generatedAt),
    },
    claims: numberRecord(record(parsed).claims),
    identity: numberRecord(record(parsed).identity),
    receipts: numberRecord(record(parsed).receipts),
    proof: {
      states: numberRecord(proof.states),
      contradictionTasks: Number(proof.contradictionTasks) || 0,
      blockedTasks: Number(proof.blockedTasks) || 0,
      heuristicPromotionCount: Number(proof.heuristicPromotionCount) || 0,
      predicateCount: Number(proof.predicateCount) || 0,
    },
    graph: numberRecord(record(parsed).graph),
    workboard: {
      status: stringValue(workboard.status) ?? 'REPORT_MISSING',
      boardTaskCount: Number(workboard.boardTaskCount) || 0,
      evidenceCardCount: Number(workboard.evidenceCardCount) || 0,
      exactSourceRefJoinCount: Number(workboard.exactSourceRefJoinCount) || 0,
      boardOnlyCount: Number(workboard.boardOnlyCount) || 0,
      evidenceOnlyCount: Number(workboard.evidenceOnlyCount) || 0,
      doneWithoutProvenCount: Number(workboard.doneWithoutProvenCount) || 0,
      openWithProvenCount: Number(workboard.openWithProvenCount) || 0,
    },
    stages: stages.slice(0, 32).map((stage) => {
      const value = record(stage);
      return {
        id: stringValue(value.id) ?? 'UNKNOWN_STAGE',
        status: stringValue(value.status) ?? 'REPORT_INVALID',
        writesPerformed: value.writesPerformed === true,
        report: stringValue(value.report),
      };
    }),
    contracts: {
      canonicalVector: stringValue(contracts.canonicalVector) ?? 'unknown',
      vectorDimension: Number(contracts.vectorDimension) || 0,
      writesPerformed: contracts.writesPerformed === true,
      taskMutationAllowed: contracts.taskMutationAllowed === true,
      projectionMutationAllowed: contracts.projectionMutationAllowed === true,
      authoritativeSurface: stringValue(contracts.authoritativeSurface) ?? 'unknown',
    },
  };
}

export async function readOpenSpecEvidenceHealthSnapshot(): Promise<OpenSpecEvidenceHealthSnapshot> {
  let reportDirectory: string;
  try {
    reportDirectory = await resolveOpenSpecReportDirectory();
  } catch {
    reportDirectory = path.resolve(process.cwd(), 'docs', 'reports');
  }
  const reportPath = path.join(reportDirectory, 'openspec-evidence-health-v1.json');
  try {
    const [content, stat] = await Promise.all([fs.readFile(reportPath, 'utf8'), fs.stat(reportPath)]);
    return boundedSnapshot(JSON.parse(content), reportPath, stat, content);
  } catch {
    return {
      exists: false,
      reportPath,
      size: 0,
      mtimeMs: 0,
      sha256: null,
      schema: 'atlas.openspec-evidence-health.v1',
      status: 'REPORT_MISSING',
      promotionEligible: false,
      source: { census: null, workspaceRevision: null, generatedAt: null },
      claims: {},
      identity: {},
      receipts: {},
      proof: { states: {}, contradictionTasks: 0, blockedTasks: 0, heuristicPromotionCount: 0, predicateCount: 0 },
      graph: {},
      workboard: { status: 'REPORT_MISSING', boardTaskCount: 0, evidenceCardCount: 0, exactSourceRefJoinCount: 0, boardOnlyCount: 0, evidenceOnlyCount: 0, doneWithoutProvenCount: 0, openWithProvenCount: 0 },
      stages: [],
      contracts: {
        canonicalVector: 'unknown',
        vectorDimension: 0,
        writesPerformed: false,
        taskMutationAllowed: false,
        projectionMutationAllowed: false,
        authoritativeSurface: 'unknown',
      },
    };
  }
}
