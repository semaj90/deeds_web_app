/**
 * Patch Context Pipeline Types
 * Canonical schemas for query intent, candidate identification, and patch readiness
 */

import { z } from 'zod';
import { createHash } from 'crypto';

// ============================================================================
// Gap 1: Query Intent Compiler
// ============================================================================

export const EditOperationKindSchema = z.enum([
  'insert_statement',
  'insert_after_import',
  'insert_before_export',
  'replace_symbol',
  'rename_symbol',
  'change_contract',
  'add_parameter',
  'remove_parameter',
  'reorder_parameters',
  'extract_function',
  'inline_function',
  'delete_statement',
  'modify_condition',
  'add_guard_clause',
]);

export type EditOperationKind = z.infer<typeof EditOperationKindSchema>;

export interface EditSearchIntent {
  rawQuery: string;
  literalTerms: string[]; // "ExistingLogger", "DebouncedDagLogger"
  symbols: string[]; // "ExistingLogger", "DebouncedDagLogger"
  filePaths: string[]; // "src/lib/server/db/client.ts"
  errorStrings: string[]; // Extract from error messages
  imports: string[]; // "import { X } from 'y'"
  operationHints: EditOperationKind[]; // User intent: [insert_after_import, add_parameter]
  languages: string[]; // "typescript", "tsx"
  confidence: 'high' | 'medium' | 'low';
}

export interface PatchCandidate {
  candidateId: string; // SHA-256 of canonical key
  workspaceId: string;
  normalizedPath: string; // Absolute, symlink-resolved
  sourceRevision: number; // Git commit timestamp or schema version
  startByte: number;
  endByte: number;
  symbolVersionId?: string;
  nodeKind?: string; // "import_declaration", "function_definition", "class_declaration"
  sourceHash: string; // SHA-256 of entire file
  nodeHash: string; // SHA-256 of node text
  lane: 'lexical' | 'semantic' | 'ast' | 'graph';
  laneScore: number; // 0.0-1.0
  retrievedAt: string; // ISO timestamp
  parseValid: boolean;
  isExact: boolean;
}

export interface ValidationStep {
  stepId: string;
  description: string;
  toolCallId?: string;
  traceId?: string;
  status: 'pending' | 'completed' | 'failed' | 'skipped';
  result?: unknown;
}

export interface PreparePatchContextResult {
  requestId: string;
  requestKey: string;
  status: 'COMPLETED' | 'SUPERSEDED' | 'INSUFFICIENT_EVIDENCE' | 'CONFLICTED';
  intent: EditSearchIntent;
  candidates: PatchCandidate[];
  recommendedCandidateId?: string;
  unresolvedClaims: string[];
  validationPlan: ValidationStep[];
  audit: {
    toolCallId: string;
    traceId: string;
  };
  timings: Record<string, number>; // lane -> ms
  laneCounts: Record<string, number>; // lane -> count
  derivedPolicy: PatchSearchPolicy;
}

// ============================================================================
// Gap 2: Canonical Candidate Key
// ============================================================================

export function candidateKey(candidate: {
  workspaceId: string;
  normalizedPath: string;
  sourceRevision: number;
  startByte: number;
  endByte: number;
  symbolVersionId?: string;
}): string {
  const key = {
    workspaceId: candidate.workspaceId,
    normalizedPath: candidate.normalizedPath,
    sourceRevision: candidate.sourceRevision,
    startByte: candidate.startByte,
    endByte: candidate.endByte,
    symbolVersionId: candidate.symbolVersionId || 'unresolved',
  };
  return createHash('sha256').update(JSON.stringify(key)).digest('hex');
}

// ============================================================================
// Gap 3: Edit Anchor (AST-based patch location)
// ============================================================================

export interface AstEditAnchor {
  anchorId: string; // SHA-256 of <filePath>::<nodeHash>::<byteRange>
  filePath: string;
  language: string; // "typescript", "tsx", "javascript"
  nodeKind: string; // "import_declaration", "function_definition"
  nodeText: string;
  startByte: number;
  endByte: number;
  startPoint: { row: number; column: number };
  endPoint: { row: number; column: number };
  parentKind?: string;
  symbolName?: string;
  sourceHash: string; // SHA-256 of file at resolution time
  nodeHash: string; // SHA-256 of node text (dynamically derived)
  sourceRevision: number;
  parseNodeId: string; // tree-sitter node ID
  symbolId?: string;
  symbolVersionId?: string;
  parseValid: boolean;
  generatedCode: boolean;
}

// ============================================================================
// Gap 4: Patch Search Policy (Dynamic Parameter Derivation)
// ============================================================================

export interface PatchSearchPolicy {
  lexicalHits: number;
  semanticHits: number;
  astCandidates: number;
  outputCandidates: number;
  maxSourceBytes: number;
  enableSemantic: boolean;
  enableGraph: boolean;
  enableCrossEncoder: boolean;
  maxGraphHops: number;
  runInverseSearch: boolean;
  derivationReasons: string[];
}

export interface RuntimeSnapshot {
  lexicalResultCount: number;
  semanticResultCount: number;
  graphNodesAvailable: number;
  averageLaneLatencyMs: Record<string, number>;
  cacheHitRate: number;
  queueDepth: number;
  cpuUsagePercent: number;
  memoryUsagePercent: number;
  gpuAvailable: boolean;
  gpuUtilizationPercent?: number;
}

export function derivePatchSearchPolicy(
  intent: EditSearchIntent,
  runtime: RuntimeSnapshot,
  safetyLimits?: { maxLexical?: number; maxSemantic?: number; maxAst?: number }
): PatchSearchPolicy {
  const limits = {
    maxLexical: safetyLimits?.maxLexical ?? 200,
    maxSemantic: safetyLimits?.maxSemantic ?? 200,
    maxAst: safetyLimits?.maxAst ?? 50,
  };

  const hasExplicitTarget = intent.filePaths.length > 0 || intent.symbols.length > 0;
  const isRenameOp = intent.operationHints.includes('rename_symbol');
  const isStructuralChange = intent.operationHints.includes('change_contract') ||
    intent.operationHints.includes('extract_function');

  const reasons: string[] = [];

  let lexicalHits = 40;
  let semanticHits = 40;
  let astCandidates = 12;
  let maxGraphHops = 1;
  let enableSemantic = true;
  let enableGraph = false;
  let enableCrossEncoder = false;

  // Exactness tier: explicit target → smaller candidate sets
  if (hasExplicitTarget) {
    lexicalHits = 20;
    semanticHits = 10;
    astCandidates = 8;
    reasons.push('explicit target supplied (file path or symbol name)');
  }

  // Operation type: structural changes need graph context
  if (isStructuralChange && runtime.graphNodesAvailable > 100) {
    enableGraph = true;
    maxGraphHops = 2;
    reasons.push('structural change detected; enabling graph expansion');
  }

  // Resource availability: disable expensive lanes if constrained
  if (runtime.cpuUsagePercent > 80 || runtime.memoryUsagePercent > 85) {
    enableSemantic = false;
    enableCrossEncoder = false;
    reasons.push('CPU/memory constrained; disabling semantic + cross-encoder');
  }

  if (!runtime.gpuAvailable) {
    enableCrossEncoder = false;
    reasons.push('GPU unavailable; disabling cross-encoder reranking');
  }

  // High cache hit rate: can afford more candidates
  if (runtime.cacheHitRate > 0.7 && runtime.queueDepth < 3) {
    semanticHits = Math.min(semanticHits + 20, limits.maxSemantic);
    reasons.push('cache hit rate > 70%; increasing semantic candidates');
  }

  // Queue depth: throttle if backpressure exists
  if (runtime.queueDepth > 5) {
    lexicalHits = Math.max(lexicalHits - 20, 10);
    semanticHits = Math.max(semanticHits - 20, 5);
    reasons.push(`queue depth ${runtime.queueDepth}; throttling candidate retrieval`);
  }

  return {
    lexicalHits: Math.min(lexicalHits, limits.maxLexical),
    semanticHits: Math.min(semanticHits, limits.maxSemantic),
    astCandidates: Math.min(astCandidates, limits.maxAst),
    outputCandidates: 5,
    maxSourceBytes: 32768,
    enableSemantic,
    enableGraph,
    enableCrossEncoder,
    maxGraphHops,
    runInverseSearch: isRenameOp,
    derivationReasons: reasons,
  };
}

// ============================================================================
// Gap 5: Keyed Job Management (Supersession)
// ============================================================================

export interface KeyedJob {
  id: string;
  requestKey: string;
  sequenceNumber: number;
  controller: AbortController;
  status: 'queued' | 'running' | 'completed' | 'failed' | 'superseded';
  createdAt: string; // ISO timestamp
  startedAt?: string;
  completedAt?: string;
  reason?: string; // For superseded/failed status
}

export class KeyedJobQueue {
  private latestJobByKey = new Map<string, KeyedJob>();
  private jobs = new Map<string, KeyedJob>();
  private queue: KeyedJob[] = [];
  private activeCount = 0;
  private maxConcurrency = 4;

  constructor(maxConcurrency: number = 4) {
    this.maxConcurrency = maxConcurrency;
  }

  /**
   * Submit a new job. If a job with the same requestKey exists in queued/running state,
   * abort it and mark as superseded.
   */
  submitLatest(job: KeyedJob): void {
    const previous = this.latestJobByKey.get(job.requestKey);

    if (previous && ['queued', 'running'].includes(previous.status)) {
      previous.controller.abort();
      previous.status = 'superseded';
      previous.reason = `Superseded by job ${job.id}`;
    }

    this.latestJobByKey.set(job.requestKey, job);
    this.jobs.set(job.id, job);
    this.queue.push(job);
  }

  /**
   * Try to dequeue and start the next job if capacity allows.
   */
  tryStart(): KeyedJob | null {
    if (this.activeCount >= this.maxConcurrency || this.queue.length === 0) {
      return null;
    }

    const job = this.queue.shift()!;
    job.status = 'running';
    job.startedAt = new Date().toISOString();
    this.activeCount++;
    return job;
  }

  /**
   * Mark a job as completed. Returns true if result should be published
   * (i.e., job was not superseded while running).
   */
  markCompleted(jobId: string, success: boolean): boolean {
    const job = this.jobs.get(jobId);
    if (!job) return false;

    this.activeCount--;
    job.completedAt = new Date().toISOString();
    job.status = success ? 'completed' : 'failed';

    // Only publish if this job is still the latest for its requestKey
    const latest = this.latestJobByKey.get(job.requestKey);
    const shouldPublish = latest?.id === jobId && job.status === 'completed';

    return shouldPublish;
  }

  /**
   * Get job status.
   */
  getJob(jobId: string): KeyedJob | undefined {
    return this.jobs.get(jobId);
  }

  /**
   * Get queue stats.
   */
  stats(): { queued: number; active: number; completed: number; superseded: number } {
    return {
      queued: this.queue.length,
      active: this.activeCount,
      completed: Array.from(this.jobs.values()).filter(j => j.status === 'completed').length,
      superseded: Array.from(this.jobs.values()).filter(j => j.status === 'superseded').length,
    };
  }
}

// ============================================================================
// Gap 6: Concurrent Lane Architecture
// ============================================================================

export interface LaneResult {
  lane: string;
  candidates: PatchCandidate[];
  latencyMs: number;
  error?: string;
}

export interface ConcurrentLaneResult {
  lexical: LaneResult;
  variants?: LaneResult;
  semantic?: LaneResult;
  exactAst?: LaneResult;
  identity?: LaneResult;
  graph?: LaneResult;
  crossEncoder?: LaneResult;
}

// Exported for schema validation
export const PreparePatchContextSchema = z.object({
  workspaceId: z.string().default('default'),
  workspaceRevision: z.number().int().nonnegative().default(0),
  request: z.string().min(1),
  target: z.object({
    filePath: z.string().optional(),
    symbol: z.string().optional(),
    packetKey: z.string().optional(),
  }),
  limits: z.object({
    lexicalHits: z.number().int().min(1).max(200).default(40),
    semanticHits: z.number().int().min(0).max(200).default(40),
    astCandidates: z.number().int().min(1).max(50).default(12),
    outputCandidates: z.number().int().min(1).max(20).default(5),
    maxSourceBytes: z.number().int().min(1024).max(262144).default(32768),
  }).optional(),
  requestKey: z.string().optional(),
  supersedePrior: z.boolean().default(true),
});

export type PreparePatchContextInput = z.infer<typeof PreparePatchContextSchema>;
