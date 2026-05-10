import { getRedis } from '$lib/server/redis.js';
import { pool } from '$lib/server/db/client';
import crypto from 'node:crypto';

export interface ModelWeightMetadata {
  component: string;
  version: string;
  sha256: string;
  uploadedAt: string;
  status: 'candidate' | 'active' | 'archived';
}

/**
 * ModelManager Service
 * 
 * Implements the secure MCP Weight-Loading Workflow (Section 5).
 * Manages model weight candidates and promotion to production.
 */
export class ModelManager {
  private static CANDIDATE_PREFIX = 'ace:model:weights:candidate';
  private static LIVE_PREFIX = 'ace:model:weights:live';

  /**
   * Upload a weight candidate.
   * Validates SHA256 and stores in the 'candidate' Redis namespace.
   */
  static async uploadCandidate(
    component: string,
    version: string,
    sha256: string,
    buffer: Buffer
  ): Promise<{ success: boolean; error?: string }> {
    // 1. Verify Digest
    const actualHash = crypto.createHash('sha256').update(buffer).digest('hex');
    if (actualHash !== sha256) {
      return { success: false, error: `SHA256 mismatch: expected ${sha256}, got ${actualHash}` };
    }

    const redis = getRedis();
    const key = `${this.CANDIDATE_PREFIX}:${component}:${version}`;

    // 2. Store in Redis (Candidate storage)
    await redis.set(key, buffer);
    
    // 3. Persist metadata to Postgres for auditability
    await pool.query(
      `INSERT INTO admin_model_weights (component, version, sha256, status, metadata)
       VALUES ($1, $2, $3, 'candidate', $4)
       ON CONFLICT (component, version) DO UPDATE 
       SET status = 'candidate', updated_at = NOW(), metadata = $4`,
      [component, version, sha256, JSON.stringify({ uploadedBy: 'admin', fileSize: buffer.length })]
    );

    return { success: true };
  }

  /**
   * Promote a candidate to 'live' status.
   * Atomically updates the production weight key.
   */
  static async promoteCandidate(component: string, version: string): Promise<{ success: boolean; error?: string }> {
    const redis = getRedis();
    const candKey = `${this.CANDIDATE_PREFIX}:${component}:${version}`;
    const liveKey = `${this.LIVE_PREFIX}:${component}`;

    const exists = await redis.exists(candKey);
    if (!exists) {
      return { success: false, error: `Candidate ${component}:${version} not found in Redis storage.` };
    }

    // Atomic promotion in Redis
    const data = await redis.getBuffer(candKey);
    if (!data) return { success: false, error: 'Failed to read candidate buffer' };
    
    await redis.set(liveKey, data);

    // Update Postgres
    await pool.query('BEGIN');
    try {
      // Archive old live versions
      await pool.query(
        `UPDATE admin_model_weights SET status = 'archived' WHERE component = $1 AND status = 'active'`,
        [component]
      );
      // Promote new version
      await pool.query(
        `UPDATE admin_model_weights SET status = 'active' WHERE component = $1 AND version = $2`,
        [component, version]
      );
      await pool.query('COMMIT');
    } catch (err) {
      await pool.query('ROLLBACK');
      throw err;
    }

    return { success: true };
  }

  /**
   * List available weight versions for a component.
   */
  static async listWeights(component: string): Promise<ModelWeightMetadata[]> {
    const res = await pool.query(
      `SELECT component, version, sha256, status, created_at as "uploadedAt"
       FROM admin_model_weights
       WHERE component = $1
       ORDER BY created_at DESC`,
      [component]
    );
    return res.rows;
  }
}
