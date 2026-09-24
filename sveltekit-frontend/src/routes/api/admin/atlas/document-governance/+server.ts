import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { json, type RequestHandler } from '@sveltejs/kit';
import { documentGovernanceRegistryV1Schema } from '@deeds/parent-atlas/core/document-governance-record-v1';
import { documentGovernanceSummaryV1Schema, type DocumentGovernanceSummaryV1 } from '$lib/types/document-governance-summary-v1.js';
import { summarizeDocumentGovernanceV1 } from './summary-v1';

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
  activeOpenSpecProgress: { changes: [], changeCount: 0 },
  documents: { current: [], openSpec: [], superseded: [], archiveReady: [], conflicts: [] },
  archiveReadiness: { eligibleCount: 0, notEligibleCount: 0, blockerCounts: {}, writesPerformed: false, applyAuthorized: false },
  topicConflicts: [],
  latestReceipts: { status: 'UNAVAILABLE', references: [], reason: 'Registry summary is unavailable.' },
  etaMs: null,
  etaConfidence: null,
  supersessionEdges: 0,
  unresolvedSupersessionReferences: 0,
} satisfies DocumentGovernanceSummaryV1;

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
    const registryText = readFileSync(registryFile(), 'utf8');
    const parsedRegistry = documentGovernanceRegistryV1Schema.safeParse(JSON.parse(registryText));
    if (!parsedRegistry.success) return json(EMPTY, { status: 503 });
    const crypto = await import('node:crypto');
    const auditPath = join(process.cwd(), 'docs', 'reports', 'document-supersession-audit-v1.json');
    const auditPathParent = join(process.cwd(), '..', 'docs', 'reports', 'document-supersession-audit-v1.json');
    const resolvedAuditPath = existsSync(auditPath) ? auditPath : auditPathParent;
    const audit = existsSync(resolvedAuditPath)
      ? JSON.parse(readFileSync(resolvedAuditPath, 'utf8')) as { explicitEdges?: number; unresolvedReferences?: number }
      : {};

    const summary = documentGovernanceSummaryV1Schema.parse({
      ...EMPTY,
      available: true,
      registryChecksum: crypto.createHash('sha256').update(registryText).digest('hex'),
      ...summarizeDocumentGovernanceV1(parsedRegistry.data),
      supersessionEdges: audit.explicitEdges ?? 0,
      unresolvedSupersessionReferences: audit.unresolvedReferences ?? 0,
    });
    return json(summary);
  } catch {
    return json(EMPTY);
  }
};
