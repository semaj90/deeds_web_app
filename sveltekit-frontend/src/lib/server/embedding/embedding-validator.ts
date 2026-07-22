/**
 * Step 4: Embedding Validator — Verify L2 norms + identity parity
 *
 * Gate 1 validation:
 * - All 5K vectors are exactly L2-normalized (norm² = 1.0 ±0.01)
 * - No NULL embeddings
 * - Dimension matches contract (384)
 * - Packet identity is stable (packet_key, source_ref, feature_id)
 */

import type Database from 'duckdb-async';
import { EMBEDDING_CONTRACT, isValidEmbedding } from './embedding-contract.js';

export interface ValidationResult {
  passed: boolean;
  total_vectors: number;
  valid_vectors: number;
  invalid_vectors: number;
  null_vectors: number;
  dimension_mismatches: number;
  norm_violations: number[];
  issues: string[];
}

export class EmbeddingValidator {
  constructor(private db: Database) {}

  /**
   * Validate all vectors in the 5K snapshot
   */
  async validateSnapshot(snapshotPath: string): Promise<ValidationResult> {
    const result: ValidationResult = {
      passed: true,
      total_vectors: 0,
      valid_vectors: 0,
      invalid_vectors: 0,
      null_vectors: 0,
      dimension_mismatches: 0,
      norm_violations: [],
      issues: [],
    };

    try {
      // Load snapshot and validate each vector
      const query = `
        SELECT
          packet_key,
          source_ref,
          feature_id,
          domain_class,
          embedding,
          array_length(embedding, 1) as dim,
          SQRT(SUM(e * e)) as norm
        FROM (
          SELECT
            packet_key,
            source_ref,
            feature_id,
            domain_class,
            embedding
          FROM read_parquet('${snapshotPath}')
        ) p,
        LATERAL UNNEST(embedding) e
        GROUP BY packet_key, source_ref, feature_id, domain_class, embedding
        ORDER BY packet_key
      `;

      const rows = (await this.db.all(query)) as any[];

      result.total_vectors = rows.length;

      if (rows.length === 0) {
        result.issues.push('No vectors found in snapshot');
        result.passed = false;
        return result;
      }

      const normViolations: number[] = [];

      for (const row of rows) {
        if (!row.embedding) {
          result.null_vectors++;
          result.issues.push(`NULL embedding for packet ${row.packet_key}`);
          continue;
        }

        const embedding = row.embedding as number[];
        const dim = embedding.length;
        const norm = row.norm as number;

        // Check dimension
        if (dim !== EMBEDDING_CONTRACT.embedding_dimension) {
          result.dimension_mismatches++;
          result.issues.push(
            `Dimension mismatch for ${row.packet_key}: ${dim} (expected ${EMBEDDING_CONTRACT.embedding_dimension})`
          );
          continue;
        }

        // Check L2 norm (norm² should be ≈1.0)
        const normSq = norm * norm;
        if (
          normSq < EMBEDDING_CONTRACT.validation.min_norm_squared ||
          normSq > EMBEDDING_CONTRACT.validation.max_norm_squared
        ) {
          result.norm_violations.push(normSq);
          result.issues.push(
            `Norm violation for ${row.packet_key}: ${normSq.toFixed(4)} (expected 1.0 ±0.01)`
          );
          continue;
        }

        // Check identity (no NULLs)
        if (!row.packet_key || !row.source_ref) {
          result.issues.push(`Missing identity fields for packet ${row.packet_key}`);
          continue;
        }

        result.valid_vectors++;
      }

      result.invalid_vectors =
        result.null_vectors + result.dimension_mismatches + result.norm_violations.length;

      // Gate 1: All vectors must be valid
      if (result.invalid_vectors === 0 && result.null_vectors === 0) {
        result.passed = true;
      } else {
        result.passed = false;
      }

      return result;
    } catch (err) {
      result.passed = false;
      result.issues.push(`Validation error: ${(err as any).message}`);
      return result;
    }
  }

  /**
   * Validate identity parity: packet_key, source_ref, feature_id stability
   */
  async validateIdentityParity(): Promise<ValidationResult> {
    const result: ValidationResult = {
      passed: true,
      total_vectors: 0,
      valid_vectors: 0,
      invalid_vectors: 0,
      null_vectors: 0,
      dimension_mismatches: 0,
      norm_violations: [],
      issues: [],
    };

    try {
      const query = `
        SELECT
          packet_key,
          COUNT(DISTINCT source_ref) as ref_count,
          COUNT(DISTINCT feature_id) as feature_count,
          COUNT(DISTINCT domain_class) as domain_count
        FROM codebase_chunk_index
        WHERE embedding IS NOT NULL
        GROUP BY packet_key
        HAVING ref_count > 1 OR feature_count > 1 OR domain_count > 1
      `;

      const rows = (await this.db.all(query)) as any[];

      result.total_vectors = rows.length;

      if (rows.length === 0) {
        result.passed = true;
        result.issues.push('✅ All packet identities are stable (1:1 mapping)');
        return result;
      }

      // If we have duplicates, that's an issue
      for (const row of rows) {
        result.issues.push(
          `Duplicate identity for ${row.packet_key}: ` +
            `${row.ref_count} source_refs, ${row.feature_count} feature_ids, ${row.domain_count} domains`
        );
      }

      result.passed = false;
      return result;
    } catch (err) {
      result.passed = false;
      result.issues.push(`Identity parity check error: ${(err as any).message}`);
      return result;
    }
  }

  /**
   * Summary report
   */
  summarize(validationResult: ValidationResult): string {
    const lines: string[] = [];

    lines.push('\n=== Embedding Validation Report ===');
    lines.push(`Total vectors: ${validationResult.total_vectors}`);
    lines.push(`Valid vectors: ${validationResult.valid_vectors}`);
    lines.push(`Invalid vectors: ${validationResult.invalid_vectors}`);
    lines.push(`  - NULL: ${validationResult.null_vectors}`);
    lines.push(`  - Dimension mismatch: ${validationResult.dimension_mismatches}`);
    lines.push(`  - Norm violations: ${validationResult.norm_violations.length}`);

    if (validationResult.norm_violations.length > 0) {
      const minNorm = Math.min(...validationResult.norm_violations);
      const maxNorm = Math.max(...validationResult.norm_violations);
      const avgNorm =
        validationResult.norm_violations.reduce((a, b) => a + b, 0) /
        validationResult.norm_violations.length;

      lines.push(`  - Norm range: ${minNorm.toFixed(4)} – ${maxNorm.toFixed(4)}`);
      lines.push(`  - Avg norm²: ${avgNorm.toFixed(4)}`);
    }

    lines.push(`Status: ${validationResult.passed ? '✅ PASS' : '❌ FAIL'}`);

    if (validationResult.issues.length > 0 && validationResult.issues.length <= 10) {
      lines.push('\nIssues:');
      validationResult.issues.slice(0, 10).forEach((issue) => {
        lines.push(`  - ${issue}`);
      });

      if (validationResult.issues.length > 10) {
        lines.push(`  ... and ${validationResult.issues.length - 10} more issues`);
      }
    }

    return lines.join('\n');
  }
}

/**
 * CLI entry point for standalone validation
 */
export async function validateEmbeddingsStandalone(snapshotPath: string): Promise<void> {
  const Database = (await import('duckdb-async')).default;
  const db = new Database(':memory:');

  const validator = new EmbeddingValidator(db);

  console.log('[Validator] Starting embedding validation...');

  const result = await validator.validateSnapshot(snapshotPath);
  console.log(validator.summarize(result));

  if (!result.passed) {
    process.exit(1);
  }

  await db.close();
}
