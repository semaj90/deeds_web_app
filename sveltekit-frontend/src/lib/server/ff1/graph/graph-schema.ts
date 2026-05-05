/**
 * FF1 Graph Schema
 *
 * Types for the codebase knowledge graph, diagnostic entries, and repair plans.
 * The graph maps the entire codebase so Gemma4 can reason from structure
 * instead of grepping raw files.
 *
 * Architecture:
 *   ff1:index  → populates GraphNode / GraphEdge from AST + Graphify outputs
 *   ff1:audit  → attaches DiagnosticEntry nodes and computes risk scores
 *   ff1:fix    → produces RepairPlan, applies patch, stores ValidationResult
 */

// ── Graph ────────────────────────────────────────────────────────────────

export type GraphNodeType =
  | 'file'
  | 'route'
  | 'component'
  | 'function'
  | 'class'
  | 'type'
  | 'interface'
  | 'store'
  | 'db_table'
  | 'api_endpoint'
  | 'test'
  | 'diagnostic'
  | 'patch'
  | 'symbol';

export type GraphEdgeType =
  | 'imports'
  | 'exports'
  | 'calls'
  | 'renders'
  | 'uses_store'
  | 'queries_table'
  | 'validates'
  | 'tests'
  | 'fails_with'
  | 'fixed_by'
  | 'depends_on'
  | 'same_contract_as';

export interface GraphNode {
  id: string;                          // sha1(ref)
  nodeType: GraphNodeType;
  label: string;
  ref: string;                         // workspace-relative path or symbol ref
  properties: Record<string, unknown>;
  riskScore: number;
  updatedAt: string;                   // ISO timestamp
}

export interface GraphEdge {
  from: string;                        // GraphNode.id
  to: string;
  edgeType: GraphEdgeType;
  weight?: number;
  metadata?: Record<string, unknown>;
}

// ── Diagnostics ──────────────────────────────────────────────────────────

export interface DiagnosticEntry {
  id: string;                          // sha1(source:file:line:message)
  source: 'tsgo' | 'tsc' | 'svelte-check' | 'vitest' | 'eslint' | 'custom';
  severity: 'error' | 'warning' | 'info';
  filePath: string;                    // workspace-relative
  line?: number;
  column?: number;
  code?: string;
  message: string;
  context?: string;                    // 2 lines before + 2 after
  riskScore: number;
  nodeId?: string;
  auditRunId?: string;
}

// ── Repair plans ─────────────────────────────────────────────────────────

export interface FileEdit {
  type: 'replace' | 'insert' | 'delete';
  startLine?: number;
  endLine?: number;
  before?: string;
  after?: string;
}

export interface FileRepair {
  path: string;
  reason: string;
  edits: FileEdit[];
}

export interface RepairPlan {
  issueId: string;
  rootCause: string;
  confidence: number;                  // 0–1
  risk: 'low' | 'medium' | 'high';
  files: FileRepair[];
  validation: string[];                // commands to run after patch
  rollbackNotes: string;
  model?: string;
  promptTokens?: number;
  completionTokens?: number;
  createdAt?: string;
}

// ── Audit run ────────────────────────────────────────────────────────────

export interface AuditRunSummary {
  total: number;
  errors: number;
  warnings: number;
  bySource: Record<string, number>;
  topRiskFiles: Array<{ path: string; score: number; count: number }>;
  durationMs: number;
}

// ── Risk scoring ─────────────────────────────────────────────────────────
//
// From spec:
//   riskScore = diagnosticSeverity*4 + failedTests*3 + routeExposure*3
//             + importCentrality*2 + recentChurn*2 + penalties

export function computeRiskScore(params: {
  diagnosticSeverity?: number;         // error=4, warning=2, info=1
  failedTestCount?: number;
  routeExposure?: number;              // 0-3 (GET=1, POST=2, public=3)
  importCentrality?: number;           // fan-in count
  recentChurn?: number;                // commits in 7d
  missingContract?: boolean;
  degradedShape?: boolean;
  securityFlag?: boolean;
}): number {
  return (
    (params.diagnosticSeverity ?? 0) * 4 +
    (params.failedTestCount    ?? 0) * 3 +
    (params.routeExposure      ?? 0) * 3 +
    (params.importCentrality   ?? 0) * 2 +
    (params.recentChurn        ?? 0) * 2 +
    (params.missingContract ? 5  : 0) +
    (params.degradedShape   ? 4  : 0) +
    (params.securityFlag    ? 10 : 0)
  );
}

export function severityScore(s: DiagnosticEntry['severity']): number {
  return s === 'error' ? 4 : s === 'warning' ? 2 : 1;
}
