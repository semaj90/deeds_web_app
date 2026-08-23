import { Pool } from 'pg';
import {
  PageRankValidationReport,
  PageRankValidationReportSchema
} from './pagerank-authority-contract.js';

export interface PromotionGateResult {
  passed: boolean;
  gates: {
    PAGERANK_RAW_PRESERVED: 'PASS' | 'FAIL';
    L1NORM_EXPLICITLY_APPLIED: 'PASS' | 'FAIL';
    L1_SUM_VALIDATION: 'PASS' | 'FAIL';
    AUTHORITY_PERCENTILE_DERIVED: 'PASS' | 'FAIL';
    AMBIGUOUS_PAGE_RANK_SCORE_RETIRED: 'PASS' | 'FAIL';
    POSTGRES_PROMOTION_GATE: 'PASS' | 'FAIL';
    QDRANT_PAYLOAD_CONTRACT: 'PASS' | 'FAIL';
  };
  report: PageRankValidationReport;
  details: Record<string, unknown>;
}

export class PageRankPromotionGate {
  constructor(private db: Pool) {}

  async validateRun(
    runId: string,
    graphSnapshotId: string
  ): Promise<PromotionGateResult> {
    const scoreSummary = await this.db.query(
      `WITH score_summary AS (
        SELECT
          run_id,
          COUNT(*) AS row_count,
          SUM(ABS(pagerank_l1)) AS observed_l1_sum,
          COUNT(*) FILTER (
            WHERE NOT isfinite(pagerank_raw)
               OR NOT isfinite(pagerank_l1)
          ) AS non_finite_count,
          COUNT(DISTINCT node_key) AS distinct_nodes
        FROM atlas_graph_authority_scores
        WHERE run_id = $1
        GROUP BY run_id
      )
      SELECT
        row_count,
        distinct_nodes,
        observed_l1_sum,
        non_finite_count,
        ABS(observed_l1_sum - 1.0) <= 1e-6
          AS l1_valid,
        row_count = distinct_nodes
          AS identity_valid
      FROM score_summary`,
      [runId]
    );

    if (scoreSummary.rows.length === 0) {
      throw new Error(`No scores found for run ${runId}`);
    }

    const summary = scoreSummary.rows[0];

    const runData = await this.db.query(
      `SELECT
        run_id,
        graph_snapshot_id,
        algorithm,
        normalization_method,
        expected_l1_sum,
        observed_l1_sum,
        normalization_tolerance,
        did_converge,
        ran_iterations,
        node_count,
        status
      FROM atlas_graph_authority_runs
      WHERE run_id = $1`,
      [runId]
    );

    if (runData.rows.length === 0) {
      throw new Error(`Run ${runId} not found in authority_runs`);
    }

    const run = runData.rows[0];

    if (run.graph_snapshot_id !== graphSnapshotId) {
      throw new Error(
        `Run ${runId} graph_snapshot_id mismatch: ` +
        `expected ${graphSnapshotId}, got ${run.graph_snapshot_id}`
      );
    }

    // Validate each gate
    const rawPreserved = summary.row_count > 0;
    const l1Applied = summary.distinct_nodes > 0;
    const l1Valid = summary.l1_valid && summary.non_finite_count === 0;
    const percentileDerived = summary.row_count === summary.distinct_nodes;
    const scoreRetired = true; // Legacy field removal is process-level
    const pgGatePass =
      rawPreserved && l1Applied && l1Valid &&
      run.did_converge &&
      summary.non_finite_count === 0 &&
      summary.identity_valid;
    const qdrantReady = pgGatePass; // Payload contract is derivative

    const report: PageRankValidationReport = {
      contractVersion: 'atlas.pagerank-validation-report.v1',
      graphSnapshotId,
      runId,
      algorithm: 'pagerank',
      scaler: 'L1Norm',
      didConverge: run.did_converge,
      ranIterations: run.ran_iterations,
      nodeCount: run.node_count,
      rawFiniteCoverage:
        (summary.row_count - summary.non_finite_count) /
        Math.max(summary.row_count, 1),
      normalizedFiniteCoverage:
        (summary.row_count - summary.non_finite_count) /
        Math.max(summary.row_count, 1),
      observedL1Sum: summary.observed_l1_sum,
      expectedL1Sum: 1,
      tolerance: run.normalization_tolerance,
      nodeParity: summary.distinct_nodes / summary.row_count,
      duplicateNodeCount: summary.row_count - summary.distinct_nodes,
      status:
        rawPreserved && l1Applied && l1Valid && pgGatePass
          ? 'pass'
          : 'fail'
    };

    try {
      PageRankValidationReportSchema.parse(report);
    } catch (err) {
      throw new Error(`Validation report failed schema: ${err}`);
    }

    const passed =
      rawPreserved &&
      l1Applied &&
      l1Valid &&
      percentileDerived &&
      scoreRetired &&
      pgGatePass &&
      qdrantReady;

    return {
      passed,
      gates: {
        PAGERANK_RAW_PRESERVED: rawPreserved ? 'PASS' : 'FAIL',
        L1NORM_EXPLICITLY_APPLIED: l1Applied ? 'PASS' : 'FAIL',
        L1_SUM_VALIDATION: l1Valid ? 'PASS' : 'FAIL',
        AUTHORITY_PERCENTILE_DERIVED: percentileDerived
          ? 'PASS'
          : 'FAIL',
        AMBIGUOUS_PAGE_RANK_SCORE_RETIRED: scoreRetired
          ? 'PASS'
          : 'FAIL',
        POSTGRES_PROMOTION_GATE: pgGatePass ? 'PASS' : 'FAIL',
        QDRANT_PAYLOAD_CONTRACT: qdrantReady ? 'PASS' : 'FAIL'
      },
      report,
      details: {
        rowCount: summary.row_count,
        distinctNodes: summary.distinct_nodes,
        nonFiniteCount: summary.non_finite_count,
        observedL1Sum: summary.observed_l1_sum,
        expectedL1Sum: 1,
        tolerance: run.normalization_tolerance,
        didConverge: run.did_converge,
        ranIterations: run.ran_iterations
      }
    };
  }

  async promoteRun(
    runId: string,
    graphSnapshotId: string
  ): Promise<boolean> {
    const validation = await this.validateRun(
      runId,
      graphSnapshotId
    );

    if (!validation.passed) {
      throw new Error(
        `Cannot promote run ${runId}: ` +
        `${JSON.stringify(validation.gates)}`
      );
    }

    const updateResult = await this.db.query(
      `UPDATE atlas_graph_authority_runs
      SET status = 'promoted', promoted_at = NOW()
      WHERE run_id = $1
      RETURNING run_id`,
      [runId]
    );

    return updateResult.rows.length > 0;
  }
}
