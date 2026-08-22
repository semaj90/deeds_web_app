import { z } from 'zod';

export const traceLaneSchema = z.enum([
  'lexical',
  'typescript_ast',
  'parser_ast',
  'semantic',
  'dependency_graph',
  'runtime',
  'browser',
  'telemetry',
]);

export type TraceLaneName = z.infer<typeof traceLaneSchema>;

export type TraceQuestionFamily = 'route' | 'symbol' | 'packet' | 'runtime' | 'unknown';

export interface StaticDiscoveryPattern {
  name: string;
  pattern: RegExp;
}

export type StaticDiscoveryLoader = (filePath: string) => Promise<string | null> | string | null;

export const proofStatusSchema = z.enum([
  'PROVEN',
  'PARTIAL_PROVEN',
  'NOT_PROVEN',
  'CONTRADICTED',
]);

export type ProofStatus = z.infer<typeof proofStatusSchema>;

export const traceTargetSchema = z.object({
  filePath: z.string().optional(),
  symbolId: z.string().optional(),
  symbolVersionId: z.string().optional(),
  packetKey: z.string().optional(),
  route: z.string().optional(),
  traceId: z.string().optional(),
});

export type TraceTarget = z.infer<typeof traceTargetSchema>;

export const traceLimitsSchema = z.object({
  topK: z.number().int().positive().max(100).default(20),
  maxFiles: z.number().int().positive().max(500).default(50),
  maxSymbols: z.number().int().positive().max(500).default(50),
  maxTokens: z.number().int().positive().max(20_000).default(4_000),
  graphDepth: z.number().int().min(0).max(8).default(2),
  timeoutMs: z.number().int().positive().max(300_000).default(15_000),
  runtimeMode: z.enum(['read_only', 'probe', 'test']).default('read_only'),
});

export type TraceLimits = z.infer<typeof traceLimitsSchema>;

export const traceDynamicContextRequestSchema = z.object({
  workspaceId: z.string().min(1),
  question: z.string().min(1),
  target: traceTargetSchema.optional(),
  workspaceRevision: z.string().min(1),
  sourceRevision: z.string().min(1).optional(),
  lanes: z.array(traceLaneSchema).min(1),
  limits: traceLimitsSchema,
});

export type TraceDynamicContextRequest = z.infer<typeof traceDynamicContextRequestSchema>;

export const evidenceItemSchema = z.object({
  kind: z.string().min(1),
  lane: traceLaneSchema.optional(),
  status: proofStatusSchema,
  source: z.string().min(1).optional(),
  path: z.string().optional(),
  symbol: z.string().optional(),
  line: z.number().int().positive().optional(),
  message: z.string().optional(),
  revision: z.string().optional(),
  score: z.number().min(0).max(1).optional(),
  digest: z.string().optional(),
});

export type EvidenceItem = z.infer<typeof evidenceItemSchema>;

export interface RuntimeRequestEvidence {
  method: string;
  url: string;
  status?: number;
  traceId?: string;
  notes?: string;
}

export interface TraceDynamicContextResult {
  traceId: string;
  workspaceRevision: string;
  targetResolution: {
    kind: 'file' | 'symbol' | 'symbol_version' | 'packet' | 'route' | 'trace' | 'unknown';
    value?: string;
  };
  sourceId?: string;
  sourceVersionId?: string;
  symbolId?: string;
  symbolVersionId?: string;
  parseNodeId?: string;
  packetKey?: string;
  confidence: number;
  methods: string[];
  evidence: EvidenceItem[];
  retrieval: {
    lexicalHits: EvidenceItem[];
    semanticHits: EvidenceItem[];
    graphHits: EvidenceItem[];
    runtimeHits: EvidenceItem[];
  };
  runtime?: {
    httpRequests: RuntimeRequestEvidence[];
    playwrightTracePath?: string;
    consoleErrors: string[];
    networkFailures: string[];
  };
  validation: {
    status: ProofStatus;
    passedGates: string[];
    failedGates: string[];
    unresolvedClaims: string[];
  };
  provenance: {
    generatedAt: string;
    toolVersions: Record<string, string>;
    queryDigest: string;
    evidenceDigest: string;
  };
}

export interface TraceEvidenceLane {
  lane: TraceLaneName;
  collect: (request: TraceDynamicContextRequest) => Promise<EvidenceItem[]> | EvidenceItem[];
}

export interface TraceValidationWriter {
  record: (result: TraceDynamicContextResult) => Promise<void> | void;
}

export interface TraceDynamicContextOptions {
  lanes?: TraceEvidenceLane[];
  validationWriter?: TraceValidationWriter;
  workflowTraceWriter?: (trace: import('../validation/workflow-trace-logger.js').WorkflowTrace) => Promise<void> | void;
  toolVersions?: Record<string, string>;
  firstSlice?: {
    staticDiscovery?: {
      filePath?: string;
      sourceText?: string;
      sourceRevision?: string;
      patterns?: StaticDiscoveryPattern[];
      loadSourceText?: StaticDiscoveryLoader;
    };
    postgresJoinBack?: {
      query: (sql: string, params?: unknown[]) => Promise<{ rows: Array<Record<string, unknown>> }>;
      packetKeys?: string[];
      tableName?: string;
      limit?: number;
    };
  };
}
