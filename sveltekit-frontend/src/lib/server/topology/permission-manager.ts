/**
 * Permission Manager — Agentic Identity Recovery + Mutation Safety
 *
 * Guards all identity mutations:
 *   - Lost packet_key detection + recovery
 *   - Permission enforcement before write/delete
 *   - Approval workflow for destructive operations
 *   - Full audit trail of all mutations
 *
 * Role hierarchy:
 *   owner: Full control (read, write, delete, grant, recover, revoke)
 *   write: Modify data, create children, recovery proposals
 *   read: View data only
 *   none: Blocked
 */

import type { Permission, AccessLevel } from './canonical-id-hierarchy.js';

export interface PermissionGrant {
  user_id: string;
  resource_id: string; // packet_key, file_id, etc.
  resource_type: string;
  access_level: AccessLevel;
  expires_at?: Date; // Time-limited grants
  conditions?: Record<string, unknown>; // e.g., { ip_whitelist: [...] }
}

export interface AuditLog {
  timestamp: Date;
  user_id: string;
  action: 'read' | 'write' | 'delete' | 'grant' | 'revoke' | 'recover' | 'approve' | 'deny';
  resource_id: string;
  resource_type: string;
  outcome: 'success' | 'denied' | 'error';
  reason?: string;
  metadata?: Record<string, unknown>;
}

export interface IdentityRecoveryRequest {
  request_id: string;
  lost_packet_key: string;
  detected_lane: string; // which retrieval lane lost the ID
  recovery_strategy: 'reconstruct' | 'quarantine' | 'merge';
  requester_id: string;
  created_at: Date;
  status: 'pending' | 'approved' | 'denied' | 'executed';
  reviewed_by?: string;
  reviewed_at?: Date;
}

export class PermissionManager {
  constructor(private pool: any, private redisClient?: any) {}

  /**
   * Grant permission to a user for a specific resource
   */
  async grantPermission(grant: PermissionGrant, grantor_id: string): Promise<void> {
    // Verify grantor has 'owner' access
    const canGrant = await this.canGrantPermission(grantor_id, grant.resource_id);
    if (!canGrant) {
      this.logAudit({
        timestamp: new Date(),
        user_id: grantor_id,
        action: 'grant',
        resource_id: grant.resource_id,
        resource_type: grant.resource_type,
        outcome: 'denied',
        reason: 'User must be owner to grant access'
      });
      throw new Error('Insufficient permission to grant access');
    }

    const query = `
      INSERT INTO permissions (user_id, resource_id, resource_type, access_level, granted_by, granted_at, expires_at, conditions)
      VALUES ($1, $2, $3, $4, $5, NOW(), $6, $7)
      ON CONFLICT (user_id, resource_id) DO UPDATE SET
        access_level = EXCLUDED.access_level,
        updated_at = NOW()
    `;

    await this.pool.query(query, [
      grant.user_id,
      grant.resource_id,
      grant.resource_type,
      grant.access_level,
      grantor_id,
      grant.expires_at,
      grant.conditions ? JSON.stringify(grant.conditions) : null
    ]);

    if (this.redisClient) {
      await this.redisClient.del(`perm:${grant.user_id}:${grant.resource_id}`);
    }

    this.logAudit({
      timestamp: new Date(),
      user_id: grantor_id,
      action: 'grant',
      resource_id: grant.resource_id,
      resource_type: grant.resource_type,
      outcome: 'success',
      metadata: { granted_to: grant.user_id, level: grant.access_level }
    });
  }

  /**
   * Revoke permission
   */
  async revokePermission(user_id: string, resource_id: string, revoker_id: string): Promise<void> {
    const canRevoke = await this.canGrantPermission(revoker_id, resource_id);
    if (!canRevoke) {
      throw new Error('Insufficient permission to revoke access');
    }

    const query = `DELETE FROM permissions WHERE user_id = $1 AND resource_id = $2`;
    await this.pool.query(query, [user_id, resource_id]);

    if (this.redisClient) {
      await this.redisClient.del(`perm:${user_id}:${resource_id}`);
    }

    this.logAudit({
      timestamp: new Date(),
      user_id: revoker_id,
      action: 'revoke',
      resource_id,
      resource_type: 'permission',
      outcome: 'success',
      metadata: { revoked_from: user_id }
    });
  }

  /**
   * Check if user can perform an action (read/write/delete)
   */
  async checkAccess(
    user_id: string,
    resource_id: string,
    action: 'read' | 'write' | 'delete'
  ): Promise<{ allowed: boolean; reason?: string }> {
    // Check cache first
    if (this.redisClient) {
      const cached = await this.redisClient.get(`perm:${user_id}:${resource_id}`);
      if (cached) {
        const perm = JSON.parse(cached);
        const ok = this.canPerformAction(perm.access_level, action);
        return { allowed: ok };
      }
    }

    // Fetch from Postgres
    const query = `
      SELECT access_level, expires_at FROM permissions
      WHERE user_id = $1 AND resource_id = $2
    `;
    const result = await this.pool.query(query, [user_id, resource_id]);

    if (result.rows.length === 0) {
      return { allowed: false, reason: 'No permission grant found' };
    }

    const perm = result.rows[0];

    // Check expiration
    if (perm.expires_at && new Date(perm.expires_at) < new Date()) {
      await this.revokePermission(user_id, resource_id, 'system');
      return { allowed: false, reason: 'Permission grant has expired' };
    }

    // Cache result
    if (this.redisClient) {
      await this.redisClient.setex(
        `perm:${user_id}:${resource_id}`,
        300,
        JSON.stringify(perm)
      );
    }

    const ok = this.canPerformAction(perm.access_level, action);
    return {
      allowed: ok,
      reason: ok ? undefined : `Access level '${perm.access_level}' cannot ${action}`
    };
  }

  /**
   * Request agentic identity recovery
   * Called when packet_key is lost in a retrieval lane
   */
  async requestIdentityRecovery(
    lost_packet_key: string,
    detected_lane: string,
    recovery_strategy: 'reconstruct' | 'quarantine' | 'merge',
    requester_id: string
  ): Promise<IdentityRecoveryRequest> {
    const request_id = `recovery:${lost_packet_key}:${Date.now()}`;

    const query = `
      INSERT INTO identity_recovery_requests
        (request_id, lost_packet_key, detected_lane, recovery_strategy, requester_id, status, created_at)
      VALUES ($1, $2, $3, $4, $5, 'pending', NOW())
      RETURNING *
    `;

    const result = await this.pool.query(query, [
      request_id,
      lost_packet_key,
      detected_lane,
      recovery_strategy,
      requester_id
    ]);

    this.logAudit({
      timestamp: new Date(),
      user_id: requester_id,
      action: 'recover',
      resource_id: lost_packet_key,
      resource_type: 'identity_recovery',
      outcome: 'success',
      metadata: { request_id, lane: detected_lane, strategy: recovery_strategy }
    });

    return result.rows[0];
  }

  /**
   * Approve or deny identity recovery
   */
  async reviewRecoveryRequest(
    request_id: string,
    reviewer_id: string,
    decision: 'approved' | 'denied',
    comment?: string
  ): Promise<void> {
    // Check reviewer has write access
    const recovery = await this.pool.query(
      `SELECT lost_packet_key FROM identity_recovery_requests WHERE request_id = $1`,
      [request_id]
    );

    if (recovery.rows.length === 0) {
      throw new Error('Recovery request not found');
    }

    const canApprove = await this.checkAccess(reviewer_id, recovery.rows[0].lost_packet_key, 'write');
    if (!canApprove.allowed) {
      throw new Error(canApprove.reason || 'Insufficient permission to review recovery');
    }

    const query = `
      UPDATE identity_recovery_requests
      SET status = $1, reviewed_by = $2, reviewed_at = NOW(), comment = $3
      WHERE request_id = $4
    `;

    await this.pool.query(query, [decision, reviewer_id, comment, request_id]);

    this.logAudit({
      timestamp: new Date(),
      user_id: reviewer_id,
      action: decision === 'approved' ? 'approve' : 'deny',
      resource_id: request_id,
      resource_type: 'recovery_approval',
      outcome: 'success',
      metadata: { decision, comment }
    });
  }

  /**
   * Request deletion approval before any write/delete
   */
  async requestDeletionApproval(
    deleter_id: string,
    resource_id: string,
    reason: string
  ): Promise<{ approval_id: string; status: 'pending' | 'auto_approved' }> {
    // Check if deleter is owner (auto-approve)
    const isOwner = await this.isOwner(deleter_id, resource_id);

    const approval_id = `del:${resource_id}:${Date.now()}`;
    const status = isOwner ? 'auto_approved' : 'pending';

    const query = `
      INSERT INTO deletion_approvals (approval_id, requested_by, resource_id, reason, status, created_at, auto_approved)
      VALUES ($1, $2, $3, $4, $5, NOW(), $6)
    `;

    await this.pool.query(query, [
      approval_id,
      deleter_id,
      resource_id,
      reason,
      status,
      isOwner
    ]);

    this.logAudit({
      timestamp: new Date(),
      user_id: deleter_id,
      action: 'delete',
      resource_id,
      resource_type: 'deletion_request',
      outcome: 'success',
      metadata: { approval_id, reason, auto_approved: isOwner }
    });

    return { approval_id, status };
  }

  /**
   * List all permissions for a resource
   */
  async listResourcePermissions(resource_id: string): Promise<Permission[]> {
    const query = `
      SELECT user_id, resource_id, resource_type, access_level, granted_by, granted_at, expires_at
      FROM permissions
      WHERE resource_id = $1
      ORDER BY granted_at DESC
    `;

    const result = await this.pool.query(query, [resource_id]);
    return result.rows;
  }

  /**
   * List all resources a user has access to
   */
  async listUserResources(user_id: string, min_access_level: AccessLevel = 'read'): Promise<Permission[]> {
    // Map access levels to numeric rank for comparison
    const levelRank = (level: AccessLevel): number => {
      const map: Record<AccessLevel, number> = { owner: 3, write: 2, read: 1, none: 0 };
      return map[level] ?? 0;
    };

    const query = `
      SELECT resource_id, resource_type, access_level, granted_at, expires_at
      FROM permissions
      WHERE user_id = $1
        AND (expires_at IS NULL OR expires_at > NOW())
      ORDER BY granted_at DESC
    `;

    const result = await this.pool.query(query, [user_id]);

    // Filter by min access level in TypeScript (correct behavior)
    const minRank = levelRank(min_access_level);
    return result.rows.filter(row => levelRank(row.access_level as AccessLevel) >= minRank);
  }

  /**
   * Get audit log for a resource
   */
  async getAuditLog(resource_id: string, limit: number = 100): Promise<AuditLog[]> {
    const query = `
      SELECT timestamp, user_id, action, resource_id, resource_type, outcome, reason, metadata
      FROM audit_logs
      WHERE resource_id = $1
      ORDER BY timestamp DESC
      LIMIT $2
    `;

    const result = await this.pool.query(query, [resource_id, limit]);
    return result.rows;
  }

  /**
   * Private helpers
   */

  private async canGrantPermission(user_id: string, resource_id: string): Promise<boolean> {
    const query = `
      SELECT access_level FROM permissions
      WHERE user_id = $1 AND resource_id = $2
    `;
    const result = await this.pool.query(query, [user_id, resource_id]);
    return result.rows.length > 0 && result.rows[0].access_level === 'owner';
  }

  private async isOwner(user_id: string, resource_id: string): Promise<boolean> {
    return this.canGrantPermission(user_id, resource_id);
  }

  private canPerformAction(access_level: AccessLevel, action: string): boolean {
    const actionMap: Record<AccessLevel, string[]> = {
      owner: ['read', 'write', 'delete', 'grant', 'revoke', 'recover'],
      write: ['read', 'write', 'recover'],
      read: ['read'],
      none: []
    };

    return actionMap[access_level]?.includes(action) ?? false;
  }

  private logAudit(log: AuditLog): void {
    // Non-blocking audit logging
    this.pool
      .query(
        `INSERT INTO audit_logs (timestamp, user_id, action, resource_id, resource_type, outcome, reason, metadata)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
        [
          log.timestamp,
          log.user_id,
          log.action,
          log.resource_id,
          log.resource_type,
          log.outcome,
          log.reason,
          log.metadata ? JSON.stringify(log.metadata) : null
        ]
      )
      .catch(err => console.error('[AUDIT LOG ERROR]', err.message));
  }
}

export function createPermissionManager(pool: any, redisClient?: any): PermissionManager {
  return new PermissionManager(pool, redisClient);
}
