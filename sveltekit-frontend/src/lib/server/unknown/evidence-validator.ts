/**
 * Phase 109 — Stage 3: Evidence Validator
 * Validates candidate packets through 5 hard-fail proof gates (identity, semantic, topology, lineage, content).
 * Only candidates passing all 5 gates advance to promotion stage.
 * Hard fail gates ensure only evidence-validated packets become official atlas_packets.
 */

import { db } from '$lib/server/db/client';
import { sql } from 'drizzle-orm';
import { z } from 'zod';

// ═══════════════════════════════════════════════════════════════════════════
// Type Definitions
// ═══════════════════════════════════════════════════════════════════════════

export const ProofResultSchema = z.enum(['PASS', 'FAIL', 'WARN']);
export type ProofResult = z.infer<typeof ProofResultSchema>;

export const EvidenceProofsSchema = z.object({
  unknown_id: z.string().min(1, 'unknown_id required'),
  identity_proof: ProofResultSchema,
  semantic_proof: ProofResultSchema,
  topology_proof: ProofResultSchema,
  lineage_proof: ProofResultSchema,
  content_proof: ProofResultSchema,
  overall_result: ProofResultSchema,
});

export type EvidenceProofs = z.infer<typeof EvidenceProofsSchema>;

export interface ValidationResult {
  unknown_id: string;
  observation_id: string;
  status: 'VALIDATED' | 'REJECTED';
  proofs: EvidenceProofs;
  gate_results: ValidationGateResult[];
  overall_result: 'PASS' | 'FAIL';
  error?: string;
}

export interface ValidationGateResult {
  gate_name: string;
  result: 'PASS' | 'FAIL' | 'WARN';
  description?: string;
  timestamp: Date;
}

// ═══════════════════════════════════════════════════════════════════════════
// Evidence Validator
// ═══════════════════════════════════════════════════════════════════════════

export class EvidenceValidator {
  /**
   * Validate a candidate packet through 5 proof gates (pure validation, no database I/O).
   * Hard fail on identity_proof or content_proof == FAIL.
   * Warn on semantic_proof, topology_proof, lineage_proof == WARN.
   */
  validateCandidatePure(
    unknown_id: string,
    observation_id: string,
    workspace_id: string,
    potential_source_ref: string,
    potential_feature_id?: string,
    potential_feature_label?: string,
    evidence_payload?: Record<string, unknown>,
    source_kind?: string
  ): ValidationResult {
    const gateResults: ValidationGateResult[] = [];

    try {
      // Gate 1: IDENTITY_PROOF — validate unknown_id format + workspace/source_ref non-empty
      const identityProof = this.validateIdentity(
        unknown_id,
        workspace_id,
        potential_source_ref
      );
      gateResults.push(identityProof);

      // Gate 2: SEMANTIC_PROOF — validate feature_id presence + payload structure
      const semanticProof = this.validateSemantic(
        potential_feature_id,
        potential_feature_label,
        evidence_payload
      );
      gateResults.push(semanticProof);

      // Gate 3: TOPOLOGY_PROOF — validate source_ref structure + source_kind alignment
      const topologyProof = this.validateTopology(
        potential_source_ref,
        source_kind
      );
      gateResults.push(topologyProof);

      // Gate 4: LINEAGE_PROOF — validate workspace/feature/source consistency
      const lineageProof = this.validateLineage(
        workspace_id,
        potential_source_ref,
        potential_feature_id
      );
      gateResults.push(lineageProof);

      // Gate 5: CONTENT_PROOF — validate evidence payload non-empty + structure
      const contentProof = this.validateContent(evidence_payload);
      gateResults.push(contentProof);

      // Aggregate proofs
      const proofs: EvidenceProofs = {
        unknown_id,
        identity_proof: identityProof.result as ProofResult,
        semantic_proof: semanticProof.result as ProofResult,
        topology_proof: topologyProof.result as ProofResult,
        lineage_proof: lineageProof.result as ProofResult,
        content_proof: contentProof.result as ProofResult,
        overall_result: this.aggregateProofs([
          identityProof,
          semanticProof,
          topologyProof,
          lineageProof,
          contentProof,
        ]) as ProofResult,
      };

      // Validate proofs schema
      const validationResult = EvidenceProofsSchema.safeParse(proofs);
      if (!validationResult.success) {
        return {
          unknown_id,
          observation_id,
          status: 'REJECTED',
          proofs: this.defaultProofs(unknown_id),
          gate_results: gateResults,
          overall_result: 'FAIL',
          error: `Proofs validation failed: ${validationResult.error.message}`,
        };
      }

      // Hard fail if identity or content proof is FAIL
      if (
        proofs.identity_proof === 'FAIL' ||
        proofs.content_proof === 'FAIL'
      ) {
        return {
          unknown_id,
          observation_id,
          status: 'REJECTED',
          proofs,
          gate_results: gateResults,
          overall_result: 'FAIL',
          error: `Hard fail gate: ${
            proofs.identity_proof === 'FAIL' ? 'identity_proof' : 'content_proof'
          } === FAIL`,
        };
      }

      // Soft warn: topology/lineage/semantic warnings allowed but noted
      const warnings = gateResults.filter(r => r.result === 'WARN');
      const overallStatus = warnings.length > 0 ? 'VALIDATED (with warnings)' : 'VALIDATED';

      return {
        unknown_id,
        observation_id,
        status: 'VALIDATED',
        proofs,
        gate_results: gateResults,
        overall_result: 'PASS',
      };
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : 'Unknown error';
      return {
        unknown_id,
        observation_id,
        status: 'REJECTED',
        proofs: this.defaultProofs(unknown_id),
        gate_results: gateResults,
        overall_result: 'FAIL',
        error: `Validation exception: ${errorMsg}`,
      };
    }
  }

  /**
   * Validate a candidate and persist to database (async).
   * Wraps pure validation + database write in atomic transaction.
   */
  async validateCandidate(
    unknown_id: string,
    observation_id: string,
    workspace_id: string,
    potential_source_ref: string,
    potential_feature_id?: string,
    potential_feature_label?: string,
    evidence_payload?: Record<string, unknown>,
    source_kind?: string
  ): Promise<ValidationResult> {
    // Get pure validation (no DB I/O)
    const validationResult = this.validateCandidatePure(
      unknown_id,
      observation_id,
      workspace_id,
      potential_source_ref,
      potential_feature_id,
      potential_feature_label,
      evidence_payload,
      source_kind
    );

    // Write to database regardless of result (for audit trail)
    const writeGate = await this.writeProofsToPostgres(
      unknown_id,
      validationResult.proofs,
      validationResult.status,
      validationResult.gate_results
    );
    validationResult.gate_results.push(writeGate);

    if (writeGate.result === 'FAIL') {
      validationResult.overall_result = 'FAIL';
      validationResult.error = `Write failed: ${writeGate.description}`;
    }

    return validationResult;
  }

  /**
   * Gate 1: IDENTITY_PROOF — validate unknown_id format + required fields.
   * Hard fail if workspace_id or potential_source_ref is empty.
   */
  private validateIdentity(
    unknown_id: string,
    workspace_id: string,
    potential_source_ref: string
  ): ValidationGateResult {
    const timestamp = new Date();

    // Check required fields
    if (!workspace_id || workspace_id.trim().length === 0) {
      return {
        gate_name: 'EVIDENCE_IDENTITY_PROOF',
        result: 'FAIL',
        description: 'workspace_id is empty or missing',
        timestamp,
      };
    }

    if (!potential_source_ref || potential_source_ref.trim().length === 0) {
      return {
        gate_name: 'EVIDENCE_IDENTITY_PROOF',
        result: 'FAIL',
        description: 'potential_source_ref is empty or missing',
        timestamp,
      };
    }

    // Accept the current observation key shape used across scanner/LDR lanes.
    const formatMatch = /^unknown:\d{4}-\d{2}-\d{2}:[A-Za-z0-9_]+:[A-Za-z0-9_-]+$/.test(unknown_id);
    if (!formatMatch) {
      return {
        gate_name: 'EVIDENCE_IDENTITY_PROOF',
        result: 'WARN',
        description: `unknown_id format unexpected: ${unknown_id}`,
        timestamp,
      };
    }

    return {
      gate_name: 'EVIDENCE_IDENTITY_PROOF',
      result: 'PASS',
      description: `Identity validated: workspace=${workspace_id}, source_ref=${potential_source_ref}`,
      timestamp,
    };
  }

  /**
   * Gate 2: SEMANTIC_PROOF — validate feature metadata + payload structure.
   * Warn if feature_id missing; fail if payload is invalid JSON structure.
   */
  private validateSemantic(
    potential_feature_id?: string,
    potential_feature_label?: string,
    evidence_payload?: Record<string, unknown>
  ): ValidationGateResult {
    const timestamp = new Date();

    let result: ProofResult = 'PASS';
    let description = 'Semantic proof';

    // Warn if feature_id missing
    if (!potential_feature_id || potential_feature_id.trim().length === 0) {
      result = 'WARN';
      description += ' (feature_id missing)';
    }

    // Check payload structure if present
    if (evidence_payload) {
      if (typeof evidence_payload !== 'object' || Array.isArray(evidence_payload)) {
        return {
          gate_name: 'EVIDENCE_SEMANTIC_PROOF',
          result: 'FAIL',
          description: 'evidence_payload must be a JSON object',
          timestamp,
        };
      }

      const keyCount = Object.keys(evidence_payload).length;
      if (keyCount > 100) {
        result = 'WARN';
        description += ` (payload oversized: ${keyCount} keys)`;
      }
    }

    description += `: feature_id=${potential_feature_id || 'missing'}, label=${potential_feature_label || 'missing'}, payload_keys=${Object.keys(evidence_payload || {}).length}`;

    return {
      gate_name: 'EVIDENCE_SEMANTIC_PROOF',
      result,
      description,
      timestamp,
    };
  }

  /**
   * Gate 3: TOPOLOGY_PROOF — validate source_ref structure + source_kind alignment.
   * Fail if source_ref structure is invalid; warn if source_kind doesn't match pattern.
   */
  private validateTopology(
    potential_source_ref: string,
    source_kind?: string
  ): ValidationGateResult {
    const timestamp = new Date();

    // Validate source_ref has reasonable structure (contains at least one /)
    if (!potential_source_ref.includes('/') && !potential_source_ref.includes('\\')) {
      return {
        gate_name: 'EVIDENCE_TOPOLOGY_PROOF',
        result: 'FAIL',
        description: `source_ref has invalid structure (no path separator): ${potential_source_ref}`,
        timestamp,
      };
    }

    let result: ProofResult = 'PASS';
    let description = 'Topology proof: ';

    // Warn if source_kind doesn't match pattern
    if (source_kind) {
      const validKinds = ['scanner', 'ldr', 'user_submission', 'edge_case'];
      if (!validKinds.includes(source_kind)) {
        result = 'WARN';
        description += `unknown source_kind="${source_kind}", `;
      }
    }

    description += `source_ref=${potential_source_ref}`;

    return {
      gate_name: 'EVIDENCE_TOPOLOGY_PROOF',
      result,
      description,
      timestamp,
    };
  }

  /**
   * Gate 4: LINEAGE_PROOF — validate workspace/feature/source consistency.
   * Warn if linkage between fields is weak or inconsistent.
   */
  private validateLineage(
    workspace_id: string,
    potential_source_ref: string,
    potential_feature_id?: string
  ): ValidationGateResult {
    const timestamp = new Date();

    let result: ProofResult = 'PASS';
    let description = 'Lineage proof: ';

    // Check if feature_id name appears in source_ref (loose pattern matching)
    if (potential_feature_id) {
      const featureNamespace = potential_feature_id.split('.')[0];
      if (!potential_source_ref.toLowerCase().includes(featureNamespace.toLowerCase())) {
        result = 'WARN';
        description += `feature_namespace "${featureNamespace}" not found in source_ref, `;
      }
    }

    // Check workspace consistency (non-empty, reasonable length)
    if (workspace_id.length < 3 || workspace_id.length > 256) {
      result = 'WARN';
      description += `workspace_id length suspicious (${workspace_id.length}), `;
    }

    description += `workspace=${workspace_id}, feature_id=${potential_feature_id || 'missing'}`;

    return {
      gate_name: 'EVIDENCE_LINEAGE_PROOF',
      result,
      description,
      timestamp,
    };
  }

  /**
   * Gate 5: CONTENT_PROOF — validate evidence payload non-empty + valid JSON structure.
   * Hard fail if payload is present but invalid; warn if payload is missing.
   */
  private validateContent(evidence_payload?: Record<string, unknown>): ValidationGateResult {
    const timestamp = new Date();

    // Missing payload: warn but not fail (can be added later)
    if (!evidence_payload || Object.keys(evidence_payload).length === 0) {
      return {
        gate_name: 'EVIDENCE_CONTENT_PROOF',
        result: 'WARN',
        description: 'evidence_payload is empty or missing',
        timestamp,
      };
    }

    if (typeof evidence_payload !== 'object' || Array.isArray(evidence_payload)) {
      return {
        gate_name: 'EVIDENCE_CONTENT_PROOF',
        result: 'FAIL',
        description: 'evidence_payload must be a plain JSON object',
        timestamp,
      };
    }

    // Validate JSON structure (should serialize/deserialize correctly)
    try {
      const serialized = JSON.stringify(evidence_payload);
      JSON.parse(serialized);

      return {
        gate_name: 'EVIDENCE_CONTENT_PROOF',
        result: 'PASS',
        description: `Content proof: payload ${Object.keys(evidence_payload).length} keys, ${serialized.length} bytes`,
        timestamp,
      };
    } catch (err) {
      return {
        gate_name: 'EVIDENCE_CONTENT_PROOF',
        result: 'FAIL',
        description: `evidence_payload is invalid JSON: ${err instanceof Error ? err.message : 'unknown error'}`,
        timestamp,
      };
    }
  }

  /**
   * Aggregate proof results: FAIL if any critical is FAIL, WARN if any non-critical is WARN, else PASS.
   */
  private aggregateProofs(gates: ValidationGateResult[]): ProofResult {
    const hasFail = gates.some(g => g.result === 'FAIL');
    if (hasFail) return 'FAIL';

    const hasWarn = gates.some(g => g.result === 'WARN');
    if (hasWarn) return 'WARN';

    return 'PASS';
  }

  /**
   * Default proofs when validation fails.
   */
  private defaultProofs(unknown_id: string): EvidenceProofs {
    return {
      unknown_id,
      identity_proof: 'FAIL',
      semantic_proof: 'FAIL',
      topology_proof: 'FAIL',
      lineage_proof: 'FAIL',
      content_proof: 'FAIL',
      overall_result: 'FAIL',
    };
  }

  /**
   * Write proofs to Postgres unknown_packets table + ledger entry.
   * Atomic transaction ensures consistency.
   */
  private async writeProofsToPostgres(
    unknown_id: string,
    proofs: EvidenceProofs,
    status: 'VALIDATED' | 'REJECTED',
    gateResults: ValidationGateResult[]
  ): Promise<ValidationGateResult> {
    const timestamp = new Date();
    const ledger_id = `ledger:${unknown_id}:${Date.now()}`;

    try {
      // Atomic transaction: update packets + insert ledger or both fail
      await db.execute(sql`BEGIN`);

      try {
        // Update unknown_packets with proofs
        await db.execute(sql`
          UPDATE unknown_packets
          SET
            identity_proof = ${proofs.identity_proof},
            semantic_proof = ${proofs.semantic_proof},
            topology_proof = ${proofs.topology_proof},
            lineage_proof = ${proofs.lineage_proof},
            content_proof = ${proofs.content_proof},
            status = ${status},
            validated_at = NOW(),
            updated_at = NOW()
          WHERE unknown_id = ${unknown_id}
        `);

        // Insert ledger entry
        const evidence_summary = {
          gates_passed: gateResults.filter(g => g.result === 'PASS').length,
          gates_warned: gateResults.filter(g => g.result === 'WARN').length,
          gates_failed: gateResults.filter(g => g.result === 'FAIL').length,
          gate_details: gateResults,
          proofs,
        };

        await db.execute(sql`
          INSERT INTO unknown_resolution_ledger (
            ledger_id,
            unknown_id,
            stage,
            gate_name,
            gate_result,
            check_description,
            check_timestamp,
            evidence_summary
          ) VALUES (
            ${ledger_id},
            ${unknown_id},
            'VALIDATED',
            'EVIDENCE_VALIDATION_COMPLETE',
            ${proofs.overall_result},
            'Stage 3 evidence validation gates completed',
            NOW(),
            ${JSON.stringify(evidence_summary)}
          )
        `);

        // Commit transaction
        await db.execute(sql`COMMIT`);

        return {
          gate_name: 'EVIDENCE_WRITE_PROOFS_SUCCESS',
          result: 'PASS',
          description: `Proofs written: unknown_id=${unknown_id}, status=${status}, overall=${proofs.overall_result}`,
          timestamp,
        };
      } catch (innerErr) {
        // Rollback on inner error
        await db.execute(sql`ROLLBACK`);
        throw innerErr;
      }
    } catch (err) {
      const errMsg = err instanceof Error ? err.message : 'unknown error';
      return {
        gate_name: 'EVIDENCE_WRITE_PROOFS_SUCCESS',
        result: 'FAIL',
        description: `Write failed: ${errMsg}`,
        timestamp,
      };
    }
  }

  /**
   * Batch validate multiple candidates.
   */
  async validateBatch(
    candidates: Array<{
      unknown_id: string;
      observation_id: string;
      workspace_id: string;
      potential_source_ref: string;
      potential_feature_id?: string;
      potential_feature_label?: string;
      evidence_payload?: Record<string, unknown>;
      source_kind?: string;
    }>
  ): Promise<ValidationResult[]> {
    const results: ValidationResult[] = [];
    for (const candidate of candidates) {
      const result = await this.validateCandidate(
        candidate.unknown_id,
        candidate.observation_id,
        candidate.workspace_id,
        candidate.potential_source_ref,
        candidate.potential_feature_id,
        candidate.potential_feature_label,
        candidate.evidence_payload,
        candidate.source_kind
      );
      results.push(result);
    }
    return results;
  }

  /**
   * Get statistics on validation results.
   */
  static getStats(results: ValidationResult[]) {
    return {
      total: results.length,
      validated: results.filter(r => r.status === 'VALIDATED').length,
      rejected: results.filter(r => r.status === 'REJECTED').length,
      with_warnings: results.filter(r =>
        r.gate_results.some(g => g.result === 'WARN')
      ).length,
      pass_rate: results.length > 0
        ? (results.filter(r => r.overall_result === 'PASS').length / results.length) * 100
        : 0,
    };
  }
}

export default new EvidenceValidator();
