/**
 * Step 18: Runtime Lease Manager
 *
 * Manages lifecycle of ephemeral artifacts (ACE contexts, retrieval traces, rerank results).
 * Acquires lease (active, TTL 5min default), releases on completion, cleans up expired.
 *
 * Note: Dimension-agnostic (manages artifact lifecycles, not embeddings).
 */

export type ArtifactType = 'ace_context' | 'retrieval_trace' | 'rerank_results';

export interface Lease {
  lease_id: string;
  artifact_type: ArtifactType;
  artifact_key: string;
  status: 'active' | 'released' | 'expired';
  acquired_at: number;
  released_at?: number;
  ttl_seconds: number;
  metadata?: Record<string, unknown>;
}

export class RuntimeLeaseManager {
  private leases: Map<string, Lease> = new Map();
  private defaultTtl: number = 300; // 5 minutes
  private cleanupInterval: NodeJS.Timeout | null = null;

  constructor(cleanupIntervalSeconds: number = 60) {
    // Periodically clean up expired leases
    this.cleanupInterval = setInterval(() => {
      this.cleanup();
    }, cleanupIntervalSeconds * 1000);
  }

  acquire(
    artifactType: ArtifactType,
    artifactKey: string,
    ttl_seconds: number = this.defaultTtl,
    metadata?: Record<string, unknown>
  ): Lease {
    const leaseId = this.generateLeaseId();

    const lease: Lease = {
      lease_id: leaseId,
      artifact_type: artifactType,
      artifact_key: artifactKey,
      status: 'active',
      acquired_at: Date.now(),
      ttl_seconds,
      metadata,
    };

    this.leases.set(leaseId, lease);

    console.log(
      `[RuntimeLeaseManager] Acquired ${artifactType} lease ${leaseId} for ${artifactKey} (TTL ${ttl_seconds}s)`
    );

    return lease;
  }

  release(leaseId: string): boolean {
    const lease = this.leases.get(leaseId);

    if (!lease) {
      console.warn(`[RuntimeLeaseManager] Lease not found: ${leaseId}`);
      return false;
    }

    lease.status = 'released';
    lease.released_at = Date.now();

    console.log(
      `[RuntimeLeaseManager] Released ${lease.artifact_type} lease ${leaseId} after ${
        (lease.released_at - lease.acquired_at) / 1000
      }s`
    );

    // Keep in map for audit trail (cleanup will remove)
    return true;
  }

  status(leaseId: string): Lease | null {
    const lease = this.leases.get(leaseId);

    if (!lease) {
      return null;
    }

    // Check if expired
    const elapsedMs = Date.now() - lease.acquired_at;
    if (elapsedMs > lease.ttl_seconds * 1000) {
      lease.status = 'expired';
    }

    return lease;
  }

  cleanup(): number {
    const now = Date.now();
    let removed = 0;

    for (const [leaseId, lease] of this.leases) {
      const elapsedMs = now - lease.acquired_at;

      // Remove if expired or released
      if (
        elapsedMs > lease.ttl_seconds * 1000 ||
        (lease.status === 'released' && elapsedMs > 60000) // Keep released for 1 minute
      ) {
        this.leases.delete(leaseId);
        removed++;
      }
    }

    if (removed > 0) {
      console.log(`[RuntimeLeaseManager] Cleaned up ${removed} expired leases`);
    }

    return removed;
  }

  stats(): {
    total_leases: number;
    active_leases: number;
    released_leases: number;
    expired_leases: number;
    by_type: Record<ArtifactType, number>;
  } {
    let active = 0;
    let released = 0;
    let expired = 0;

    const byType: Record<ArtifactType, number> = {
      ace_context: 0,
      retrieval_trace: 0,
      rerank_results: 0,
    };

    for (const lease of this.leases.values()) {
      if (lease.status === 'active') {
        active++;
      } else if (lease.status === 'released') {
        released++;
      } else if (lease.status === 'expired') {
        expired++;
      }

      byType[lease.artifact_type]++;
    }

    return {
      total_leases: this.leases.size,
      active_leases: active,
      released_leases: released,
      expired_leases: expired,
      by_type: byType,
    };
  }

  destroy(): void {
    if (this.cleanupInterval) {
      clearInterval(this.cleanupInterval);
      this.cleanupInterval = null;
    }

    this.leases.clear();
    console.log('[RuntimeLeaseManager] Destroyed');
  }

  private generateLeaseId(): string {
    return `lease:${Date.now()}:${Math.random().toString(36).slice(2)}`;
  }
}

let leaseManagerInstance: RuntimeLeaseManager | null = null;

export function getRuntimeLeaseManager(): RuntimeLeaseManager {
  if (!leaseManagerInstance) {
    leaseManagerInstance = new RuntimeLeaseManager();
  }
  return leaseManagerInstance;
}
