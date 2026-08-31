import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { json, type RequestHandler } from '@sveltejs/kit';

type GovernanceRecord = {
  kind?: string;
  status?: string;
  totalTasks?: number | null;
  completedTasks?: number | null;
  archiveEligible?: boolean;
};

const EMPTY = {
  schema: 'atlas.document.governance.summary.v1',
  available: false,
  registryChecksum: null,
  totalDocuments: 0,
  instructionDocuments: 0,
  openSpecChanges: 0,
  completedTasks: 0,
  totalTasks: 0,
  progressPercent: null,
  archiveEligible: 0,
  conflicts: 0,
  etaMs: null,
  etaConfidence: null,
  supersessionEdges: 0,
  unresolvedSupersessionReferences: 0,
};

function registryFile(): string {
  const candidates = [
    join(process.cwd(), 'docs', 'reports', 'document-governance-registry-v1.json'),
    join(process.cwd(), '..', 'docs', 'reports', 'document-governance-registry-v1.json'),
  ];
  return candidates.find((candidate) => existsSync(candidate)) ?? candidates[0];
}

export const GET: RequestHandler = async ({ locals }) => {
  if (!locals.user) return json({ error: 'Unauthorized', ...EMPTY }, { status: 401 });

  try {
    const registry = JSON.parse(readFileSync(registryFile(), 'utf8')) as {
      records?: GovernanceRecord[];
    };
    const records = registry.records ?? [];
    const tasks = records.filter((record) => record.kind === 'OPENSPEC' && record.totalTasks != null);
    const totalTasks = tasks.reduce((sum, record) => sum + (record.totalTasks ?? 0), 0);
    const completedTasks = tasks.reduce((sum, record) => sum + (record.completedTasks ?? 0), 0);
    const registryText = readFileSync(registryFile(), 'utf8');
    const crypto = await import('node:crypto');
    const auditPath = join(process.cwd(), 'docs', 'reports', 'document-supersession-audit-v1.json');
    const auditPathParent = join(process.cwd(), '..', 'docs', 'reports', 'document-supersession-audit-v1.json');
    const resolvedAuditPath = existsSync(auditPath) ? auditPath : auditPathParent;
    const audit = existsSync(resolvedAuditPath)
      ? JSON.parse(readFileSync(resolvedAuditPath, 'utf8')) as { explicitEdges?: number; unresolvedReferences?: number }
      : {};

    return json({
      ...EMPTY,
      available: true,
      registryChecksum: crypto.createHash('sha256').update(registryText).digest('hex'),
      totalDocuments: records.length,
      instructionDocuments: records.filter((record) => record.kind === 'PROJECT_INSTRUCTIONS').length,
      openSpecChanges: tasks.length,
      completedTasks,
      totalTasks,
      progressPercent: totalTasks ? Math.round((completedTasks / totalTasks) * 100) : null,
      archiveEligible: records.filter((record) => record.archiveEligible === true).length,
      conflicts: records.filter((record) => record.status === 'CONFLICT').length,
      supersessionEdges: audit.explicitEdges ?? 0,
      unresolvedSupersessionReferences: audit.unresolvedReferences ?? 0,
    });
  } catch {
    return json(EMPTY);
  }
};
