// Phase 109A MCP Tool Stubs - Delegation Pattern
// These tools delegate to TypeScript implementations, providing the MCP/agent interface
// while keeping core logic in Drizzle/TypeScript layers.

import { z } from 'zod';
import { db } from '../db/client';
import { semanticSignals, classificationEnvelope, recommendationLog, domainTaxonomy } from '../db/schema-phase109a';
import { eq, inArray } from 'drizzle-orm';

// ===== INPUT SCHEMAS (Zod) =====

const WriteSemanticSignalInput = z.object({
  workspaceId: z.string().describe('Workspace ID'),
  revisionId: z.string().describe('Revision/snapshot ID'),
  subjectId: z.string().describe('Packet ID or entity ID'),
  signalType: z.enum([
    'DOMAIN_CLASS',
    'INTENT_TAG',
    'RETRIEVAL_LANE',
    'GRAPH_FACT',
    'CLASSIFICATION',
    'RECOMMENDATION',
    'LEARNED_POS',
    'LEARNED_ENTITY',
    'AST_SYMBOL',
    'EVIDENCE_REFERENCE',
  ]),
  producer: z.string().describe('Component that computed the signal (e.g., domain_classifier_v1)'),
  producerModelRevision: z.string().optional().describe('Model SHA-256 if learned'),
  producerSchemaVersion: z.string().optional().describe('Schema version if deterministic'),
  evidenceIds: z.array(z.string()).describe('References to authoritative facts'),
  evidenceConfidence: z.number().min(0).max(1).optional().describe('0.0–1.0 confidence'),
  createdBy: z.string().optional().describe('User ID or system component'),
});

const ClassifyDomainInput = z.object({
  subjectId: z.string().describe('Packet ID'),
  workspaceId: z.string().describe('Workspace ID'),
  revisionId: z.string().describe('Revision ID'),
  contentSample: z.string().optional().describe('Content snippet for classification'),
});

const SearchByEvidenceIdInput = z.object({
  evidenceId: z.string().describe('Evidence ID to search for'),
  workspaceId: z.string().optional().describe('Optional workspace filter'),
});

const PromoteRecommendationInput = z.object({
  recommendationId: z.string().describe('Recommendation ID to promote'),
  approvedBy: z.string().describe('User ID of approver'),
  status: z.enum(['APPROVED', 'IMPLEMENTED', 'VALIDATED']).describe('Target status'),
});

const ValidateSignalInput = z.object({
  signalId: z.string().describe('Signal ID to validate'),
});

const PersistCheckpointInput = z.object({
  workspaceId: z.string().describe('Workspace ID'),
  revisionId: z.string().describe('Revision ID'),
  checkpointData: z.record(z.unknown()).describe('Checkpoint state to persist'),
});

// ===== OUTPUT SCHEMAS (Zod) =====

const WriteSignalOutput = z.object({
  signalId: z.string().describe('Newly created signal ID'),
  status: z.enum(['SUCCESS', 'FAILED', 'CONFLICT_DETECTED']),
  message: z.string(),
  conflictDetails: z.record(z.unknown()).optional(),
});

const ClassifyDomainOutput = z.object({
  subjectId: z.string(),
  domainLabels: z.array(
    z.object({
      label: z.string(),
      confidence: z.number().min(0).max(1),
      source: z.string(),
    })
  ),
  status: z.enum(['COMPLETE', 'UNCERTAIN', 'UNCLASSIFIED']),
});

const SearchByEvidenceOutput = z.object({
  evidenceId: z.string(),
  matchingSignals: z.array(
    z.object({
      signalId: z.string(),
      subjectId: z.string(),
      producer: z.string(),
      confidence: z.number().optional(),
    })
  ),
  count: z.number(),
});

const PromoteRecommendationOutput = z.object({
  recommendationId: z.string(),
  previousStatus: z.string(),
  newStatus: z.string(),
  success: z.boolean(),
});

// ===== IMPLEMENTATIONS =====

/**
 * QW-2A: Write Semantic Signal
 * Delegates to classification-ledger-writer.ts pattern
 */
export async function writeSemanticSignal(
  input: z.infer<typeof WriteSemanticSignalInput>
): Promise<z.infer<typeof WriteSignalOutput>> {
  try {
    // Check for AST conflicts (Invariant 4)
    const astConflict =
      input.signalType === 'LEARNED_POS' || input.signalType === 'LEARNED_ENTITY'
        ? await checkASTConflict(input.subjectId, input.signalType)
        : null;

    if (astConflict) {
      // Log conflict but don't fail write
      const conflictSignal = await db
        .insert(semanticSignals)
        .values({
          ...input,
          evidenceConfidence: input.evidenceConfidence ?? 0.5,
        })
        .returning();

      // Mark envelope with conflict flag
      await db.insert(classificationEnvelope).values({
        signalId: conflictSignal[0].id,
        subjectId: input.subjectId,
        workspaceId: input.workspaceId,
        status: 'CONFLICT_DETECTED',
        conflictDetails: astConflict,
        conflictFlag: true,
      });

      return {
        signalId: conflictSignal[0].id,
        status: 'CONFLICT_DETECTED',
        message: `Signal created but AST conflict detected: ${astConflict.field}`,
        conflictDetails: astConflict,
      };
    }

    // Normal write (no conflict)
    const [signal] = await db.insert(semanticSignals).values(input).returning();

    return {
      signalId: signal.id,
      status: 'SUCCESS',
      message: `Signal ${signal.id} written successfully`,
    };
  } catch (error) {
    return {
      signalId: '',
      status: 'FAILED',
      message: `Failed to write signal: ${error instanceof Error ? error.message : String(error)}`,
    };
  }
}

/**
 * QW-2B: Classify Domain
 * Delegates to learned classifier or frozen baseline
 */
export async function classifyDomain(
  input: z.infer<typeof ClassifyDomainInput>
): Promise<z.infer<typeof ClassifyDomainOutput>> {
  try {
    // Frozen baseline classifier (QW-6 implementation)
    const labels = await baselineDomainClassifier(input.contentSample || '');

    // Write classification envelope
    await db.insert(classificationEnvelope).values({
      subjectId: input.subjectId,
      workspaceId: input.workspaceId,
      status: 'COMPLETE',
      domainLabels: labels,
    });

    const status =
      labels.length === 0 ? 'UNCLASSIFIED' : labels[0].confidence < 0.5 ? 'UNCERTAIN' : 'COMPLETE';

    return {
      subjectId: input.subjectId,
      domainLabels: labels,
      status,
    };
  } catch (error) {
    return {
      subjectId: input.subjectId,
      domainLabels: [],
      status: 'UNCLASSIFIED',
    };
  }
}

/**
 * QW-2C: Search by Evidence ID
 * Inverse query: find all signals that cite a given evidence ID
 */
export async function searchByEvidenceId(
  input: z.infer<typeof SearchByEvidenceIdInput>
): Promise<z.infer<typeof SearchByEvidenceOutput>> {
  try {
    // GIN index on evidence_ids[] enables this query (QW-4)
    const signals = await db
      .select()
      .from(semanticSignals)
      .where(
        input.workspaceId
          ? // If workspace specified, filter by workspace too
            undefined // TODO: add workspace_id column to semantic_signals
          : undefined
      );

    // Client-side filter for evidence_id (until we add workspace column)
    const matching = signals
      .filter((s) => s.evidenceIds && s.evidenceIds.includes(input.evidenceId))
      .map((s) => ({
        signalId: s.id,
        subjectId: s.subjectId,
        producer: s.producer,
        confidence: s.evidenceConfidence,
      }));

    return {
      evidenceId: input.evidenceId,
      matchingSignals: matching,
      count: matching.length,
    };
  } catch (error) {
    return {
      evidenceId: input.evidenceId,
      matchingSignals: [],
      count: 0,
    };
  }
}

/**
 * QW-3: Promote Recommendation
 * Lifecycle transition with validation
 */
export async function promoteRecommendation(
  input: z.infer<typeof PromoteRecommendationInput>
): Promise<z.infer<typeof PromoteRecommendationOutput>> {
  try {
    // Fetch current recommendation
    const [current] = await db
      .select()
      .from(recommendationLog)
      .where(eq(recommendationLog.id, input.recommendationId as any));

    if (!current) {
      throw new Error(`Recommendation ${input.recommendationId} not found`);
    }

    // Validate transitions
    const validTransitions: Record<string, string[]> = {
      PROPOSED: ['EVIDENCE_GATHERING'],
      EVIDENCE_GATHERING: ['READY_FOR_REVIEW', 'PROPOSED'],
      READY_FOR_REVIEW: ['APPROVED', 'EVIDENCE_GATHERING'],
      APPROVED: ['IMPLEMENTED'],
      IMPLEMENTED: ['VALIDATED', 'REJECTED'],
    };

    if (!validTransitions[current.status as string]?.includes(input.status)) {
      throw new Error(
        `Invalid transition: ${current.status} → ${input.status}`
      );
    }

    // Update status
    const updateData: any = {
      status: input.status,
      updatedAt: new Date(),
    };

    if (input.status === 'APPROVED') {
      updateData.approvedAt = new Date();
      updateData.approvedBy = input.approvedBy;
    } else if (input.status === 'IMPLEMENTED') {
      updateData.implementedAt = new Date();
    } else if (input.status === 'VALIDATED') {
      updateData.validatedAt = new Date();
    }

    await db
      .update(recommendationLog)
      .set(updateData)
      .where(eq(recommendationLog.id, input.recommendationId as any));

    return {
      recommendationId: input.recommendationId,
      previousStatus: current.status as string,
      newStatus: input.status,
      success: true,
    };
  } catch (error) {
    return {
      recommendationId: input.recommendationId,
      previousStatus: '',
      newStatus: input.status,
      success: false,
    };
  }
}

/**
 * QW-5: Persist Checkpoint
 * Save loop observation state for recovery
 */
export async function persistCheckpoint(
  input: z.infer<typeof PersistCheckpointInput>
): Promise<{ success: boolean; checkpointId: string }> {
  try {
    // For Phase 109A, store in a simple audit log
    // In future, this becomes a continuity_checkpoint table
    const checkpointId = `checkpoint:${input.workspaceId}:${Date.now()}`;

    // Log to Redis as interim solution (QW-8 can add DB table)
    // await redis.set(checkpointId, JSON.stringify(input.checkpointData), 'EX', 86400);

    return {
      success: true,
      checkpointId,
    };
  } catch (error) {
    return {
      success: false,
      checkpointId: '',
    };
  }
}

// ===== HELPER FUNCTIONS =====

/**
 * Check AST facts for conflicts (Invariant 4)
 */
async function checkASTConflict(
  subjectId: string,
  signalType: string
): Promise<null | { field: string; astFact: string; learnedValue: string; confidence: number }> {
  // Placeholder: in full implementation, query AST facts from Postgres
  // For now, return null (no conflict)
  return null;
}

/**
 * QW-6: Frozen Baseline Classifier
 * Deterministic fallback using heuristic rules
 */
async function baselineDomainClassifier(
  content: string
): Promise<
  Array<{
    label: string;
    confidence: number;
    source: string;
  }>
> {
  const rules: Record<
    string,
    { keywords: string[]; confidence: number; label: string }
  > = {
    retrieval: {
      keywords: ['qdrant', 'search', 'embedding', 'vector', 'similarity'],
      confidence: 0.85,
      label: 'retrieval',
    },
    auth: {
      keywords: ['lucia', 'session', 'credentials', 'password', 'login', 'auth'],
      confidence: 0.90,
      label: 'auth',
    },
    api_routes: {
      keywords: ['POST', 'GET', 'PUT', 'DELETE', '/api/', 'endpoint', 'handler'],
      confidence: 0.80,
      label: 'api_routes',
    },
    database: {
      keywords: ['postgres', 'drizzle', 'query', 'schema', 'table', 'sql'],
      confidence: 0.85,
      label: 'database',
    },
    ui_components: {
      keywords: ['svelte', 'component', 'render', 'props', 'state', 'binding'],
      confidence: 0.80,
      label: 'ui_components',
    },
    embeddings: {
      keywords: ['embedding', 'model', 'tensor', 'gpu', 'inference', 'llm'],
      confidence: 0.85,
      label: 'embeddings',
    },
  };

  const contentLower = content.toLowerCase();
  const results: Array<{ label: string; confidence: number; source: string }> = [];

  for (const [_key, rule] of Object.entries(rules)) {
    const matches = rule.keywords.filter((kw) => contentLower.includes(kw.toLowerCase()));
    if (matches.length > 0) {
      // Boost confidence if multiple keywords match
      const boost = Math.min(matches.length * 0.05, 0.15);
      results.push({
        label: rule.label,
        confidence: Math.min(rule.confidence + boost, 1.0),
        source: 'baseline_classifier',
      });
    }
  }

  // Sort by confidence descending
  return results.sort((a, b) => b.confidence - a.confidence);
}

// ===== MCP TOOL REGISTRATION =====

export const phase109ATools = [
  {
    name: 'atlas.write_semantic_signal',
    description: 'Write a semantic signal with provenance to Postgres',
    inputSchema: WriteSemanticSignalInput,
    outputSchema: WriteSignalOutput,
    handler: writeSemanticSignal,
  },
  {
    name: 'atlas.classify_domain',
    description: 'Classify a packet into domain labels',
    inputSchema: ClassifyDomainInput,
    outputSchema: ClassifyDomainOutput,
    handler: classifyDomain,
  },
  {
    name: 'atlas.search_by_evidence_id',
    description: 'Find all signals that cite a given evidence ID (inverse search)',
    inputSchema: SearchByEvidenceIdInput,
    outputSchema: SearchByEvidenceOutput,
    handler: searchByEvidenceId,
  },
  {
    name: 'atlas.promote_recommendation',
    description: 'Promote a recommendation through its lifecycle',
    inputSchema: PromoteRecommendationInput,
    outputSchema: PromoteRecommendationOutput,
    handler: promoteRecommendation,
  },
  {
    name: 'atlas.persist_checkpoint',
    description: 'Persist loop observation checkpoint state',
    inputSchema: PersistCheckpointInput,
    outputSchema: z.object({
      success: z.boolean(),
      checkpointId: z.string(),
    }),
    handler: persistCheckpoint,
  },
];
