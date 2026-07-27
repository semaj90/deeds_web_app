/**
 * Phase 109 — Stage 1: Observation Ingestion
 * Ingests unknown packets through identity validation, path normalization, and deduplication.
 * Hard fail gates ensure only valid observations enter the candidate scoring stage.
 */

import { db, pgRows } from '$lib/server/db/client';
import { sql } from 'drizzle-orm';
import { z } from 'zod';
import crypto from 'crypto';

// ═══════════════════════════════════════════════════════════════════════════
// Type Definitions
// ═══════════════════════════════════════════════════════════════════════════

export const RawObservationSchema = z.object({
  observation_id: z.string().min(1, 'observation_id required'),
  workspace_id: z.string().min(1, 'workspace_id required'),
  potential_source_ref: z.string().min(1, 'potential_source_ref required'),
  potential_feature_id: z.string().optional(),
  potential_feature_label: z.string().optional(),
  source_kind: z.enum(['scanner', 'ldr', 'user_submission', 'edge_case']),
  evidence_payload: z.record(z.string(), z.unknown()).optional(),
});

export type RawObservation = z.infer<typeof RawObservationSchema>;

export interface IngestionResult {
  unknown_id: string;
  observation_id: string;
  status: 'OBSERVATION';
  gate_results: GateResult[];
  overall_result: 'PASS' | 'FAIL';
  error?: string;
}

export interface GateResult {
  gate_name: string;
  result: 'PASS' | 'FAIL' | 'WARN';
  description?: string;
  timestamp: Date;
}

// ═══════════════════════════════════════════════════════════════════════════
// Observation Ingester
// ═══════════════════════════════════════════════════════════════════════════

export class ObservationIngester {
  /**
   * Ingest a raw observation through 5-gate validation pipeline.
   * Hard fail on any gate failure; do not proceed to database if validation fails.
   */
  async ingest(obs: RawObservation): Promise<IngestionResult> {
    const gateResults: GateResult[] = [];
    const unknown_id = this.generateUnknownId(obs);

    try {
      // Gate 1: OBSERVATION_IDENTITY_COMPLETE
      const identityGate = this.validateIdentityComplete(obs);
      gateResults.push(identityGate);
      if (identityGate.result === 'FAIL') {
        return {
          unknown_id,
          observation_id: obs.observation_id,
          status: 'OBSERVATION',
          gate_results: gateResults,
          overall_result: 'FAIL',
          error: identityGate.description,
        };
      }

      // Gate 2: OBSERVATION_PATH_NORMALIZATION
      const normalizedSourceRef = this.normalizePath(obs.potential_source_ref);
      const normalizationGate: GateResult = {
        gate_name: 'OBSERVATION_PATH_NORMALIZATION',
        result: 'PASS',
        description: `Path normalized: ${normalizedSourceRef}`,
        timestamp: new Date(),
      };
      gateResults.push(normalizationGate);

      // Gate 3: OBSERVATION_DEDUPLICATION
      const dedupGate = await this.validateNoDuplicate(obs.observation_id);
      gateResults.push(dedupGate);
      if (dedupGate.result === 'FAIL') {
        return {
          unknown_id,
          observation_id: obs.observation_id,
          status: 'OBSERVATION',
          gate_results: gateResults,
          overall_result: 'FAIL',
          error: dedupGate.description,
        };
      }

      // Gates 4-5: OBSERVATION_INSERT_SUCCESS + OBSERVATION_LEDGER_RECORDED
      const { insertGate, ledgerGate } = await this.insertObservationAndLedger(
        unknown_id,
        obs,
        normalizedSourceRef,
        gateResults
      );
      gateResults.push(insertGate, ledgerGate);

      if (insertGate.result === 'FAIL' || ledgerGate.result === 'FAIL') {
        return {
          unknown_id,
          observation_id: obs.observation_id,
          status: 'OBSERVATION',
          gate_results: gateResults,
          overall_result: 'FAIL',
          error: insertGate.result === 'FAIL' ? insertGate.description : ledgerGate.description,
        };
      }

      return {
        unknown_id,
        observation_id: obs.observation_id,
        status: 'OBSERVATION',
        gate_results: gateResults,
        overall_result: 'PASS',
      };
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : 'Unknown error';
      return {
        unknown_id,
        observation_id: obs.observation_id,
        status: 'OBSERVATION',
        gate_results: gateResults,
        overall_result: 'FAIL',
        error: `Ingestion exception: ${errorMsg}`,
      };
    }
  }

  /**
   * Gate 1: Validate workspace_id and source_ref are present and non-empty.
   */
  private validateIdentityComplete(obs: RawObservation): GateResult {
    const timestamp = new Date();

    if (!obs.workspace_id || obs.workspace_id.trim().length === 0) {
      return {
        gate_name: 'OBSERVATION_IDENTITY_COMPLETE',
        result: 'FAIL',
        description: 'workspace_id is required and must not be empty',
        timestamp,
      };
    }

    if (!obs.potential_source_ref || obs.potential_source_ref.trim().length === 0) {
      return {
        gate_name: 'OBSERVATION_IDENTITY_COMPLETE',
        result: 'FAIL',
        description: 'potential_source_ref is required and must not be empty',
        timestamp,
      };
    }

    return {
      gate_name: 'OBSERVATION_IDENTITY_COMPLETE',
      result: 'PASS',
      description: 'workspace_id and source_ref validated',
      timestamp,
    };
  }

  /**
   * Gate 2: Normalize file paths (Windows → POSIX).
   * Converts backslashes to forward slashes for canonical storage.
   */
  private normalizePath(path: string): string {
    return path.replace(/\\/g, '/');
  }

  /**
   * Gate 3: Check for duplicate observation_id in unknown_packets table.
   */
  private async validateNoDuplicate(observation_id: string): Promise<GateResult> {
    const timestamp = new Date();

    try {
      const existing = pgRows<{ id: number }>(
        await db.execute(sql`
          SELECT 1 AS id
          FROM unknown_packets
          WHERE observation_id = ${observation_id}
          LIMIT 1
        `)
      );

      if (existing.length > 0) {
        return {
          gate_name: 'OBSERVATION_DEDUPLICATION',
          result: 'FAIL',
          description: `Duplicate observation_id: ${observation_id}`,
          timestamp,
        };
      }

      return {
        gate_name: 'OBSERVATION_DEDUPLICATION',
        result: 'PASS',
        description: 'No duplicate observation_id found',
        timestamp,
      };
    } catch (err) {
      return {
        gate_name: 'OBSERVATION_DEDUPLICATION',
        result: 'FAIL',
        description: `Deduplication check failed: ${err instanceof Error ? err.message : 'unknown error'}`,
        timestamp,
      };
    }
  }

  /**
   * Gate 4-5: Insert observation + ledger in atomic transaction.
   * Hard fail if either insert fails; no partial rows.
   */
  private async insertObservationAndLedger(
    unknown_id: string,
    obs: RawObservation,
    normalizedSourceRef: string,
    gateResults: GateResult[]
  ): Promise<{ insertGate: GateResult; ledgerGate: GateResult }> {
    const timestamp = new Date();
    const ledger_id = `ledger:${unknown_id}:${Date.now()}`;

    try {
      // Atomic transaction: both inserts or none
      await db.execute(sql`BEGIN`);

      try {
        // Insert packet
        await db.execute(sql`
          INSERT INTO unknown_packets (
            unknown_id,
            observation_id,
            workspace_id,
            potential_source_ref,
            potential_feature_id,
            potential_feature_label,
            status,
            source_kind,
            evidence_payload,
            ingested_at,
            updated_at
          ) VALUES (
            ${unknown_id},
            ${obs.observation_id},
            ${obs.workspace_id},
            ${normalizedSourceRef},
            ${obs.potential_feature_id || null},
            ${obs.potential_feature_label || null},
            'OBSERVATION',
            ${obs.source_kind},
            ${obs.evidence_payload ? JSON.stringify(obs.evidence_payload) : null},
            NOW(),
            NOW()
          )
        `);

        // Insert ledger
        const evidence_summary = {
          gates_passed: gateResults.filter(g => g.result === 'PASS').length,
          gates_failed: gateResults.filter(g => g.result === 'FAIL').length,
          gate_details: gateResults,
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
            'OBSERVATION',
            'OBSERVATION_IDENTITY_COMPLETE',
            'PASS',
            'Stage 1 observation ingestion gates',
            NOW(),
            ${JSON.stringify(evidence_summary)}
          )
        `);

        // Commit transaction
        await db.execute(sql`COMMIT`);

        return {
          insertGate: {
            gate_name: 'OBSERVATION_INSERT_SUCCESS',
            result: 'PASS',
            description: `Observation inserted: ${unknown_id}`,
            timestamp,
          },
          ledgerGate: {
            gate_name: 'OBSERVATION_LEDGER_RECORDED',
            result: 'PASS',
            description: `Ledger entry recorded: ${ledger_id}`,
            timestamp,
          },
        };
      } catch (innerErr) {
        // Rollback on any inner error
        await db.execute(sql`ROLLBACK`);
        throw innerErr;
      }
    } catch (err) {
      const errMsg = err instanceof Error ? err.message : 'unknown error';
      return {
        insertGate: {
          gate_name: 'OBSERVATION_INSERT_SUCCESS',
          result: 'FAIL',
          description: `Insert failed: ${errMsg}`,
          timestamp,
        },
        ledgerGate: {
          gate_name: 'OBSERVATION_LEDGER_RECORDED',
          result: 'FAIL',
          description: `Transaction rolled back: ${errMsg}`,
          timestamp,
        },
      };
    }
  }

  /**
   * Generate unique unknown_id based on observation data.
   * Format: unknown:{YYYY-MM-DD}:{source_kind}:{hash}
   */
  private generateUnknownId(obs: RawObservation): string {
    const date = new Date().toISOString().split('T')[0];
    const hash = crypto
      .createHash('sha256')
      .update(`${obs.observation_id}:${obs.workspace_id}:${obs.potential_source_ref}`)
      .digest('hex')
      .substring(0, 8);
    return `unknown:${date}:${obs.source_kind}:${hash}`;
  }

  /**
   * Batch ingest multiple observations.
   */
  async ingestBatch(observations: RawObservation[]): Promise<IngestionResult[]> {
    const results: IngestionResult[] = [];
    for (const obs of observations) {
      const result = await this.ingest(obs);
      results.push(result);
    }
    return results;
  }

  /**
   * Get statistics on ingestion results.
   */
  static getStats(results: IngestionResult[]) {
    return {
      total: results.length,
      passed: results.filter(r => r.overall_result === 'PASS').length,
      failed: results.filter(r => r.overall_result === 'FAIL').length,
      success_rate: results.length > 0 ? (results.filter(r => r.overall_result === 'PASS').length / results.length) * 100 : 0,
    };
  }
}

export default new ObservationIngester();
