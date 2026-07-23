/**
 * Step 18: Runtime Lease Manager — Artifact Lifecycle Control
 */

export interface ArtifactLease {
  lease_id: string;
  artifact_type: 'ace_context' | 'retrieval_trace' | 'rerank_results';
  created_at: number;
  expires_at: number;
  ttl_seconds: number;
}

export class RuntimeLeaseManager {
  private leases = new Map<string, ArtifactLease>();
  private defaultTTL = 300; // 5 minutes

  async acquire(artifactType: string, ttlSeconds?: number): Promise<string> {
    const leaseId = `lease:${Date.now()}:${Math.random().toString(36).slice(2)}`;
    const ttl = ttlSeconds || this.defaultTTL;

    const lease: ArtifactLease = {
      lease_id: leaseId,
      artifact_type: artifactType as any,
      created_at: Date.now(),
      expires_at: Date.now() + ttl * 1000,
      ttl_seconds: ttl,
    };

    this.leases.set(leaseId, lease);
    return leaseId;
  }

  async release(leaseId: string): Promise<void> {
    this.leases.delete(leaseId);
  }

  async status(leaseId: string): Promise<ArtifactLease | null> {
    return this.leases.get(leaseId) || null;
  }

  async cleanup(): Promise<number> {
    const now = Date.now();
    let cleaned = 0;

    for (const [leaseId, lease] of this.leases.entries()) {
      if (lease.expires_at < now) {
        this.leases.delete(leaseId);
        cleaned++;
      }
    }

    return cleaned;
  }

  async stats(): Promise<{ total_leases: number; expired: number; active: number }> {
    const now = Date.now();
    let expired = 0;

    for (const lease of this.leases.values()) {
      if (lease.expires_at < now) {
        expired++;
      }
    }

    return {
      total_leases: this.leases.size,
      expired,
      active: this.leases.size - expired,
    };
  }
}

let manager: RuntimeLeaseManager | null = null;

export function getRuntimeLeaseManager(): RuntimeLeaseManager {
  if (!manager) {
    manager = new RuntimeLeaseManager();
  }
  return manager;
}
