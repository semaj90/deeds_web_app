import { z } from 'zod';

const count = z.number().int().nonnegative();
const documentRow = z.object({
  documentId: z.string().min(1),
  path: z.string().min(1),
  sha256: z.string().regex(/^[a-f0-9]{64}$/),
  title: z.string().nullable(),
  documentKind: z.string().min(1),
  status: z.string().min(1),
  topics: z.array(z.string()),
  canonicalTopics: z.array(z.string()),
  supersedes: z.array(z.string()),
  supersededBy: z.array(z.string()),
  receiptRefs: z.array(z.string()),
  contradictions: z.array(z.string()),
  archiveEligible: z.boolean(),
  archiveBlockedReasons: z.array(z.string()),
  openSpec: z.object({
    change: z.string().nullable(),
    completedTasks: count.nullable(),
    totalTasks: count.nullable(),
    progressPercent: z.number().int().min(0).max(100).nullable(),
  }).strict().nullable(),
}).strict();

export const documentGovernanceSummaryV1Schema = z.object({
  schema: z.literal('atlas.document.governance.summary.v1'),
  available: z.boolean(),
  registryChecksum: z.string().regex(/^[a-f0-9]{64}$/).nullable(),
  totalDocuments: count,
  instructionDocuments: count,
  openSpecChanges: count,
  completedTasks: count,
  totalTasks: count,
  progressPercent: z.number().int().min(0).max(100).nullable(),
  archiveEligible: count,
  conflicts: count,
  activeOpenSpecProgress: z.object({
    changes: z.array(z.object({
      change: z.string().nullable(),
      path: z.string().min(1),
      completedTasks: count.nullable(),
      totalTasks: count.nullable(),
      progressPercent: z.number().int().min(0).max(100).nullable(),
    }).strict()),
    changeCount: count,
  }).strict(),
  documents: z.object({
    current: z.array(documentRow),
    openSpec: z.array(documentRow),
    superseded: z.array(documentRow),
    archiveReady: z.array(documentRow),
    conflicts: z.array(documentRow),
  }).strict(),
  archiveReadiness: z.object({
    eligibleCount: count,
    notEligibleCount: count,
    blockerCounts: z.record(z.string(), count),
    writesPerformed: z.literal(false),
    applyAuthorized: z.literal(false),
  }).strict(),
  topicConflicts: z.array(z.object({
    documentId: z.string().min(1),
    path: z.string().min(1),
    topics: z.array(z.string()),
    canonicalTopics: z.array(z.string()),
    contradictions: z.array(z.string()),
  }).strict()),
  latestReceipts: z.object({
    status: z.enum(['UNAVAILABLE', 'REFERENCES_UNORDERED']),
    references: z.array(z.string()),
    reason: z.string().min(1),
  }).strict(),
  etaMs: z.number().finite().nonnegative().nullable(),
  etaConfidence: z.number().min(0).max(1).nullable(),
  supersessionEdges: count,
  unresolvedSupersessionReferences: count,
  error: z.string().optional(),
}).strict();

export type DocumentGovernanceSummaryV1 = z.infer<typeof documentGovernanceSummaryV1Schema>;
