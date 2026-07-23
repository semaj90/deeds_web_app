export interface ArtifactLease {
  lease_id: string;
  artifact_type: 'ace_context' | 'retrieval_trace' | 'rerank_results';
  expires_at: number;
}

export class RuntimeLeaseManager {
  private leases = new Map<string, ArtifactLease>();

  async acquire(type: string, ttlSeconds: number = 300): Promise<string> {
    const id = `lease:${Date.now()}`;
    this.leases.set(id, {
      lease_id: id,
      artifact_type: type as any,
      expires_at: Date.now() + ttlSeconds * 1000,
    });
    return id;
  }

  async release(leaseId: string): Promise<void> {
    this.leases.delete(leaseId);
  }
}

export function getRuntimeLeaseManager(): RuntimeLeaseManager {
  return new RuntimeLeaseManager();
}
