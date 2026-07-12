/**
 * Learning Circuit: Three-Layer Gemma4 Orchestration with LangGraph Control Plane
 *
 * Architecture:
 * - Layer 1 (Port 8091): Observation/Classification Engine
 *   Parses error text, extracts intent, classifies error type
 *   Input: raw error messages
 *   Output: classified error with intent metadata
 *
 * - Layer 2 (Port 8092): Evidence Research Worker
 *   Deep research on symbols, schemas, tests, graphs
 *   Input: classified error + target files
 *   Output: evidence bundle (symbols, schema validation, reranking evidence)
 *
 * - Layer 3 (Port 8093): Recommendation/Execution Engine
 *   Scores candidates via RRF, generates Kanban card, plans test
 *   Input: evidence bundle + ranked candidates
 *   Output: recommendation + execution plan
 *
 * LangGraph State Machine:
 * START → OBSERVE → CLASSIFY → RETRIEVE → VALIDATE_EVIDENCE → RECOMMEND → AUTHORIZE → EXECUTE → TEST → DIAGNOSE → COMPLETE
 */

import { Messaging, MessagingApiClient } from '@azure/cognitiveservices-speech-sdk';
import { TaskQueue } from '../task-queue.js';
import { db } from '../db/client.js';
import { sql } from 'drizzle-orm';

// ═══════════════════════════════════════════════════════════════════
// Learning Circuit State and Contracts
// ═══════════════════════════════════════════════════════════════════

export interface ErrorFixingGraphState {
  runId: string;
  queryId: string;
  traceId: string;

  hmmState:
    | 'OBSERVE'
    | 'CLASSIFY'
    | 'RETRIEVE'
    | 'VALIDATE_EVIDENCE'
    | 'RECOMMEND'
    | 'AUTHORIZE'
    | 'EXECUTE'
    | 'TEST'
    | 'DIAGNOSE'
    | 'COMPLETE'
    | 'BLOCKED';

  errorText?: string;
  targetFiles: string[];

  candidatePacketKeys: string[];
  evidence: EvidenceRecord[];
  recommendations: Recommendation[];

  selectedRecommendationId?: string;
  permission?: PermissionLevel;

  executionResult?: ExecutionResult;
  validationResults: ValidationResult[];

  retryCount: number;
  maxRetries: number;

  // Learning circuit additions
  classifiedError?: ClassifiedError;
  evidenceSpine?: RecommendationEvidenceSpine;
  rerankResults?: RerankResult[];
}

export interface ClassifiedError {
  errorType: string; // 'syntax' | 'type' | 'logic' | 'runtime' | 'test-failure'
  intent: string; // 'fix-compilation' | 'add-feature' | 'refactor' | 'debug'
  confidence: number; // 0-1
  targetSymbols: string[]; // Function names, class names, etc.
  suggestedApproaches: string[]; // ['ast-walk', 'schema-validation', 'test-rerun']
}

export interface EvidenceRecord {
  id: string;
  sourceRef: string;
  symbols: Array<{
    name: string;
    kind: string; // 'function' | 'class' | 'interface' | 'variable'
    astIdentity?: string;
    lineNumber?: number;
  }>;
  schemaEvidence: Array<{
    schemaName: string;
    validator: 'zod' | 'json-schema' | 'database';
    valid: boolean;
    errors?: string[];
  }>;
  retrievalScores: {
    lexicalRank?: number;
    bm25Score?: number;
    denseRank?: number;
    denseScore?: number;
    astScore?: number;
    graphScore?: number;
    rrfScore?: number;
  };
}

export interface RecommendationEvidenceSpine {
  queryId: string;
  packetKey: string;
  sourceRef: string;

  symbols: Array<{
    name: string;
    kind: string;
    astIdentity?: string;
  }>;

  schemaEvidence: Array<{
    schemaName: string;
    validator: 'zod' | 'json-schema' | 'database';
    valid: boolean;
    errors?: string[];
  }>;

  retrieval: {
    lexicalRank?: number;
    bm25Score?: number;
    denseRank?: number;
    denseScore?: number;
    astScore?: number;
    graphScore?: number;
    rrfScore?: number;
  };

  reranker?: {
    model: string;
    score: number;
    rankBefore: number;
    rankAfter: number;
  };

  sourceRefValid: boolean;
  contentHash?: string;
}

export interface Recommendation {
  id: string;
  packetKey: string;
  sourceRef: string;
  approach: string; // 'ast-guided' | 'schema-validation' | 'test-driven' | 'graph-expansion'
  confidence: number; // 0-1
  suggestedFiles: string[];
  suggestedEdits: string[]; // Pseudo-code or structured suggestions
  testPlan: string[];
  rationale: string;
  evidenceWeight: {
    symbolMatch: number;
    schemaAlignment: number;
    retrievalScore: number;
    regressionRisk: number;
  };
}

export interface RerankResult {
  packetKey: string;
  sourceRef: string;
  bm25Score: number;
  denseScore: number;
  astScore: number;
  graphScore: number;
  pagerankScore: number;
  somScore: number;
  telemetryScore?: number;
  rerankScore: number;
  rankBefore: number;
  rankAfter: number;
  modelVersion: string;
}

export type PermissionLevel = 'read-only' | 'dry-run' | 'approved' | 'blocked';

export interface ExecutionResult {
  success: boolean;
  filesChanged: string[];
  errors?: string[];
  stdout?: string;
}

export interface ValidationResult {
  testName: string;
  passed: boolean;
  duration: number;
  output?: string;
}

// ═══════════════════════════════════════════════════════════════════
// Layer 1: Observation/Classification Engine (Port 8091)
// ═══════════════════════════════════════════════════════════════════

export class ObservationClassificationEngine {
  private baseUrl = 'http://127.0.0.1:8091';

  async classifyError(errorText: string, targetFiles: string[]): Promise<ClassifiedError> {
    const prompt = `
Analyze this TypeScript/JavaScript error and classify it:

Error: ${errorText}

Target files: ${targetFiles.join(', ')}

Respond with JSON:
{
  "errorType": "syntax|type|logic|runtime|test-failure",
  "intent": "fix-compilation|add-feature|refactor|debug",
  "confidence": 0-1,
  "targetSymbols": ["symbol1", "symbol2"],
  "suggestedApproaches": ["ast-walk", "schema-validation", "test-rerun"]
}
    `.trim();

    const response = await fetch(`${this.baseUrl}/v1/chat/completions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: 'gemma4-legal-iq4xs-direct.gguf',
        messages: [
          {
            role: 'system',
            content:
              'You are an error classifier. Analyze code errors and extract structured metadata. Respond only with JSON, no markdown.'
          },
          { role: 'user', content: prompt }
        ],
        temperature: 0.3,
        max_tokens: 256
      })
    });

    if (!response.ok) throw new Error(`Classification failed: ${response.statusText}`);

    const data = (await response.json()) as any;
    const content = data.choices[0]?.message?.content || '{}';

    // Parse JSON from response (may be wrapped in markdown)
    const jsonMatch = content.match(/\{[\s\S]*\}/);
    return jsonMatch ? JSON.parse(jsonMatch[0]) : ({} as ClassifiedError);
  }
}

// ═══════════════════════════════════════════════════════════════════
// Layer 2: Evidence Research Worker (Port 8092)
// ═══════════════════════════════════════════════════════════════════

export class EvidenceResearchWorker {
  private baseUrl = 'http://127.0.0.1:8092';

  async investigateEvidence(
    classifiedError: ClassifiedError,
    targetFiles: string[]
  ): Promise<EvidenceRecord[]> {
    const prompt = `
You are a code investigator. Use the following tools to gather evidence:
- AST symbol lookup
- Schema/Zod validation
- Graph expansion
- Test discovery

Error Type: ${classifiedError.errorType}
Intent: ${classifiedError.intent}
Target Symbols: ${classifiedError.targetSymbols.join(', ')}
Target Files: ${targetFiles.join(', ')}

Return structured evidence for each relevant file:
{
  "sourceRef": "src/lib/...",
  "symbols": [...],
  "schemaEvidence": [...],
  "retrievalScores": {...}
}
    `.trim();

    const response = await fetch(`${this.baseUrl}/v1/chat/completions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: 'gemma4-legal-iq4xs-direct.gguf',
        messages: [
          {
            role: 'system',
            content:
              'You are a code investigation assistant. Gather structural evidence: symbols, schemas, tests, graphs. Respond with JSON arrays.'
          },
          { role: 'user', content: prompt }
        ],
        temperature: 0.3,
        max_tokens: 2048
      })
    });

    if (!response.ok) throw new Error(`Research failed: ${response.statusText}`);

    const data = (await response.json()) as any;
    const content = data.choices[0]?.message?.content || '[]';

    const jsonMatch = content.match(/\[[\s\S]*\]/);
    return jsonMatch ? JSON.parse(jsonMatch[0]) : [];
  }
}

// ═══════════════════════════════════════════════════════════════════
// Layer 3: Recommendation/Execution Engine (Port 8093)
// ═══════════════════════════════════════════════════════════════════

export class RecommendationExecutionEngine {
  private baseUrl = 'http://127.0.0.1:8093';

  async generateRecommendations(
    evidence: EvidenceRecord[],
    candidatePacketKeys: string[]
  ): Promise<Recommendation[]> {
    const prompt = `
You are a recommendation engine. Based on evidence and candidates, generate fix recommendations.

Evidence:
${JSON.stringify(evidence, null, 2)}

Candidate Packets: ${candidatePacketKeys.join(', ')}

Generate recommendations:
[
  {
    "packetKey": "...",
    "approach": "ast-guided|schema-validation|test-driven|graph-expansion",
    "confidence": 0-1,
    "suggestedFiles": ["file1.ts", "file2.ts"],
    "suggestedEdits": ["pseudo-code"],
    "testPlan": ["npm run test --testNamePattern='X'"],
    "rationale": "..."
  }
]
    `.trim();

    const response = await fetch(`${this.baseUrl}/v1/chat/completions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: 'gemma4-legal-iq4xs-direct.gguf',
        messages: [
          {
            role: 'system',
            content:
              'You are a recommendation engine. Generate structured fix recommendations based on evidence. Respond with JSON array.'
          },
          { role: 'user', content: prompt }
        ],
        temperature: 0.3,
        max_tokens: 2048
      })
    });

    if (!response.ok) throw new Error(`Recommendation failed: ${response.statusText}`);

    const data = (await response.json()) as any;
    const content = data.choices[0]?.message?.content || '[]';

    const jsonMatch = content.match(/\[[\s\S]*\]/);
    return jsonMatch ? JSON.parse(jsonMatch[0]) : [];
  }

  async scoreRecommendations(recommendations: Recommendation[]): Promise<RerankResult[]> {
    // Placeholder: deterministic reranker using evidence weight
    return recommendations.map((r, idx) => ({
      packetKey: r.packetKey,
      sourceRef: r.sourceRef,
      bm25Score: 0.5,
      denseScore: 0.7,
      astScore: 0.8,
      graphScore: 0.6,
      pagerankScore: 0.5,
      somScore: 0.65,
      rerankScore: r.confidence,
      rankBefore: idx + 1,
      rankAfter: 1, // To be sorted
      modelVersion: '1.0'
    }));
  }
}

// ═══════════════════════════════════════════════════════════════════
// Outcome Learning Circuit
// ═══════════════════════════════════════════════════════════════════

export interface AgentOutcome {
  runId: string;
  recommendationType: string;
  selectedTool: string;
  selectedAgent: string;

  evidenceTypes: string[];
  sourceRefValidity: number;

  executionSucceeded: boolean;
  testsPassed: boolean;
  regressionDetected: boolean;
  humanAccepted?: boolean;

  latencyMs: number;
  tokenCost?: number;
  timestamp: Date;
}

export async function recordOutcome(outcome: AgentOutcome): Promise<void> {
  // Store outcome for learning
  await db.execute(
    sql`
    INSERT INTO agent_outcomes
      (run_id, recommendation_type, selected_tool, selected_agent,
       evidence_types, source_ref_validity, execution_succeeded, tests_passed,
       regression_detected, human_accepted, latency_ms, token_cost, timestamp)
    VALUES
      (${outcome.runId}, ${outcome.recommendationType}, ${outcome.selectedTool}, ${outcome.selectedAgent},
       ${outcome.evidenceTypes.join(',')}, ${outcome.sourceRefValidity}, ${outcome.executionSucceeded},
       ${outcome.testsPassed}, ${outcome.regressionDetected}, ${outcome.humanAccepted},
       ${outcome.latencyMs}, ${outcome.tokenCost}, ${outcome.timestamp})
    `
  );
}

export function updateSuccessPrior(
  previous: number,
  outcome: AgentOutcome,
  alpha = 0.1
): number {
  const reward =
    outcome.testsPassed &&
    outcome.executionSucceeded &&
    !outcome.regressionDetected
      ? 1
      : 0;

  return previous * (1 - alpha) + reward * alpha;
}

export async function getOutcomeStats(
  recommendationType: string
): Promise<{ successRate: number; avgLatency: number }> {
  const result = await db.execute(
    sql`
    SELECT
      COUNT(*) as total,
      SUM(CASE WHEN execution_succeeded AND tests_passed AND NOT regression_detected THEN 1 ELSE 0 END) as successes,
      AVG(latency_ms) as avg_latency
    FROM agent_outcomes
    WHERE recommendation_type = ${recommendationType}
    LIMIT 1000
    `
  );

  const row = (result as any).rows?.[0];
  if (!row) return { successRate: 0.5, avgLatency: 0 };

  return {
    successRate: row.successes / row.total || 0.5,
    avgLatency: row.avg_latency || 0
  };
}
