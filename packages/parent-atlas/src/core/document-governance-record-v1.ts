import { z } from 'zod';

export const DOCUMENT_GOVERNANCE_STATUSES = [
  'CANONICAL_CURRENT',
  'ACTIVE_SUPPORTING',
  'EXPERIMENTAL',
  'LEGACY_REFERENCE',
  'SUPERSEDED',
  'ARCHIVE_READY',
  'ARCHIVED',
  'CONFLICT',
  'UNCLASSIFIED',
] as const;

export const DOCUMENT_GOVERNANCE_KINDS = [
  'CLAUDE_INSTRUCTIONS',
  'AGENT_INSTRUCTIONS',
  'ARCHITECTURE',
  'OPENSPEC_PROPOSAL',
  'OPENSPEC_SPEC',
  'OPENSPEC_DESIGN',
  'OPENSPEC_TASKS',
  'REPORT',
  'RUNBOOK',
  'HISTORICAL',
  'DOCUMENT',
] as const;

const nonNegativeInteger = z.number().int().nonnegative();
const relativeRepoPath = z.string().min(1).refine(
  (value) => !value.startsWith('/') && !value.includes('\\') && !value.split('/').includes('..'),
  'path must be a normalized repository-relative POSIX path',
);

export const documentGovernanceRecordV1Schema = z.object({
  schema: z.literal('atlas.document-governance-record.v1'),
  documentId: z.string().regex(/^doc:sha256:[a-f0-9]{64}$/),
  path: relativeRepoPath,
  sha256: z.string().regex(/^[a-f0-9]{64}$/),
  bytes: nonNegativeInteger,
  title: z.string().nullable(),
  documentKind: z.enum(DOCUMENT_GOVERNANCE_KINDS),
  status: z.enum(DOCUMENT_GOVERNANCE_STATUSES),
  topicIds: z.array(z.string().min(1)),
  canonicalForTopics: z.array(z.string().min(1)),
  topicOwnershipStatus: z.enum(['UNASSIGNED', 'ASSIGNED', 'CONFLICT']),
  instructionScope: z.object({
    scopePath: z.string().min(1),
    parentInstructionDocumentId: z.string().regex(/^doc:sha256:[a-f0-9]{64}$/).nullable(),
    parentScopeStatus: z.enum(['ROOT', 'RESOLVED', 'NO_PARENT_DISCOVERED', 'AMBIGUOUS']),
  }).strict().nullable(),
  supersedes: z.array(z.string().regex(/^doc:sha256:[a-f0-9]{64}$/)),
  supersededBy: z.array(z.string().regex(/^doc:sha256:[a-f0-9]{64}$/)),
  supersessionStatus: z.enum(['UNASSESSED', 'DECLARED', 'VALIDATED', 'CONFLICT']),
  supersessionReason: z.string().nullable(),
  openspec: z.object({
    change: z.string().regex(/^[-a-zA-Z0-9_]+$/).nullable(),
    taskRefs: z.array(z.string().min(1)),
    completedTasks: nonNegativeInteger.nullable(),
    totalTasks: nonNegativeInteger.nullable(),
    progressFraction: z.number().min(0).max(1).nullable(),
  }).strict(),
  validation: z.object({
    status: z.enum(['NOT_CHECKED', 'PARTIAL', 'PASSED', 'FAILED']),
    linksChecked: z.boolean(),
    referencesChecked: z.boolean(),
    smokePassed: z.boolean(),
    testsPassed: z.boolean(),
    contradictions: z.array(z.string()),
    receiptRefs: z.array(z.string()),
  }).strict(),
  workflow: z.object({
    workflowId: z.string().min(1).optional(),
    actionId: z.string().min(1).optional(),
    progressFraction: z.number().min(0).max(1).optional(),
    etaMs: z.number().finite().nonnegative().optional(),
    confidence: z.number().min(0).max(1).optional(),
    lastEventRef: z.string().min(1).optional(),
  }).strict().nullable(),
  experiment: z.object({
    sourceChange: z.literal('parent-atlas-neural-prefill-encoder'),
    receiptStatus: z.literal('EXECUTED_UNPROVEN'),
    policy: z.literal('TANG_INSPIRED_LOW_RANK_SHORTLIST'),
    observedAt: z.string().datetime(),
    featureRevision: z.string().min(1),
    inputCount: nonNegativeInteger,
    targetCount: nonNegativeInteger,
    rank: nonNegativeInteger,
    quality: z.object({
      recallAt10: z.number().min(0).max(1),
      recallAt24: z.number().min(0).max(1),
      top24Overlap: z.number().min(0).max(1),
      oracleNdcgAt24: z.number().min(0).max(1),
      ndcgAt24: z.number().min(0).max(1).nullable(),
    }).strict(),
    canonicalAuthority: z.literal(false),
  }).strict().optional(),
  archive: z.object({
    eligible: z.boolean(),
    blockedReasons: z.array(z.string()),
    archivedPath: relativeRepoPath.nullable(),
  }).strict(),
}).strict().superRefine((record, context) => {
  if (record.experiment && record.status !== 'EXPERIMENTAL') {
    context.addIssue({ code: 'custom', path: ['status'], message: 'experiment receipts must remain EXPERIMENTAL' });
  }
  if (record.topicOwnershipStatus === 'UNASSIGNED'
    && (record.topicIds.length > 0 || record.canonicalForTopics.length > 0)) {
    context.addIssue({ code: 'custom', path: ['topicOwnershipStatus'], message: 'UNASSIGNED cannot claim topics' });
  }
  if ((record.documentKind === 'CLAUDE_INSTRUCTIONS') !== (record.instructionScope !== null)) {
    context.addIssue({ code: 'custom', path: ['instructionScope'], message: 'only CLAUDE instruction records carry CLAUDE scope metadata' });
  }
  if (record.canonicalForTopics.some((topic) => !record.topicIds.includes(topic))) {
    context.addIssue({ code: 'custom', path: ['canonicalForTopics'], message: 'canonical topics must be declared in topicIds' });
  }
  if (record.supersessionStatus === 'UNASSESSED'
    && (record.supersedes.length > 0 || record.supersededBy.length > 0)) {
    context.addIssue({ code: 'custom', path: ['supersessionStatus'], message: 'UNASSESSED cannot contain supersession edges' });
  }
  if (record.openspec.progressFraction !== null
    && (record.openspec.completedTasks === null || record.openspec.totalTasks === null)) {
    context.addIssue({ code: 'custom', path: ['openspec', 'progressFraction'], message: 'progress requires task counts' });
  }
  if (record.archive.eligible && record.archive.blockedReasons.length > 0) {
    context.addIssue({ code: 'custom', path: ['archive'], message: 'eligible archive cannot have blocked reasons' });
  }
});

export const documentGovernanceRegistryV1Schema = z.object({
  schema: z.literal('atlas.document.governance.registry.v1'),
  generatedBy: z.string().min(1),
  generatedAt: z.literal('DETERMINISTIC'),
  canonicalAuthority: z.literal('DOCUMENT_STATUS_ONLY'),
  supersessionPolicy: z.literal('EXPLICIT_LINK_AND_RECEIPT_ONLY'),
  records: z.array(documentGovernanceRecordV1Schema),
}).strict();

export type DocumentGovernanceRecordV1 = z.infer<typeof documentGovernanceRecordV1Schema>;
