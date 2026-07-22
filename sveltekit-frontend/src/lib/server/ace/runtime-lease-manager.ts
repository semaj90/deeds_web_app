/**
 * Phase 4, Step 18: Runtime Artifact Lease Manager
 *
 * Manage lifecycle of ACE artifacts (context packets, intermediate results).
 * - Acquire: Reserve resources, set TTL
 * - Release: Mark complete, invalidate cache
 * - Cleanup: Garbage collection, periodic purge
 */

import Redis from 'ioredis';

export interface RuntimeLease {
  lease_id: string;
  artifact_id: string;
  artifact_type: 'ace_context' | 'retrieval_trace' | 'rerank_results';
  acquired_at: string;
  expires_at: string;
  ttl_seconds: number;
  status: 'active' | 'released' | 'expired';
}

export class RuntimeLeaseManager {
  private redis: Redis;
  private maxConcurrentLeases = 100;
  private defaultTtlSeconds = 300; // 5 minutes

  constructor(redisHost?: string, redisPort?: number, redisPassword?: string) {
    this.redis = new Redis({
      host: redisHost || process.env.REDIS_HOST || '127.0.0.1',
      port: redisPort || parseInt(process.env.REDIS_PORT || '6379'),
      password: redisPassword || process.env.REDIS_PASSWORD || 'redis',
    });
  }

  /**
   * Acquire a lease for an artifact
   */
  async acquire(
    artifactId: string,
    artifactType: 'ace_context' | 'retrieval_trace' | 'rerank_results',
    ttlSeconds: number = this.defaultTtlSeconds
  ): Promise<RuntimeLease> {
    const leaseId = `lease:${Date.now()}:${artifactId}`;
    const now = new Date();
    const expiresAt = new Date(now.getTime() + ttlSeconds * 1000);

    const lease: RuntimeLease = {
      lease_id: leaseId,
      artifact_id: artifactId,
      artifact_type: artifactType,
      acquired_at: now.toISOString(),
      expires_at: expiresAt.toISOString(),
      ttl_seconds: ttlSeconds,
      status: 'active',
    };

    // Store lease to Redis
    const key = `lease:${leaseId}`;
    await this.redis.setex(key, ttlSeconds, JSON.stringify(lease));

    // Track active leases
    await this.redis.sadd('leases:active', leaseId);

    return lease;
  }

  /**
   * Release a lease (mark as complete)
   */
  async release(leaseId: string): Promise<void> {
    const key = `lease:${leaseId}`;

    // Fetch lease
    const cached = await this.redis.get(key);
    if (!cached) {
      console.warn(`[LeaseManager] Lease ${leaseId} not found`);
      return;
    }

    const lease = JSON.parse(cached) as RuntimeLease;
    lease.status = 'released';

    // Update lease
    const remainingTtl = await this.redis.ttl(key);
    if (remainingTtl > 0) {
      await this.redis.setex(key, remainingTtl, JSON.stringify(lease));
    }

    // Move from active to released
    await this.redis.srem('leases:active', leaseId);
    await this.redis.sadd('leases:released', leaseId);
  }

  /**
   * Check lease status
   */
  async status(leaseId: string): Promise<RuntimeLease | null> {
    const key = `lease:${leaseId}`;
    const cached = await this.redis.get(key);

    if (!cached) return null;

    const lease = JSON.parse(cached) as RuntimeLease;

    // Check if expired
    if (new Date() > new Date(lease.expires_at)) {
      lease.status = 'expired';
    }

    return lease;
  }

  /**
   * Cleanup expired leases (periodic GC)
   */
  async cleanup(): Promise<{ cleaned: number; remaining: number }> {
    const activeLeasesKey = 'leases:active';
    const activeLeases = await this.redis.smembers(activeLeasesKey);

    let cleaned = 0;
    const remaining = activeLeases.length;

    for (const leaseId of activeLeases) {
      const lease = await this.status(leaseId);

      if (lease && lease.status === 'expired') {
        // Delete lease and associated artifacts
        const artifactKey = `artifact:${lease.artifact_id}`;
        await this.redis.del(`lease:${leaseId}`);
        await this.redis.del(artifactKey);
        await this.redis.srem(activeLeasesKey, leaseId);

        cleaned++;
      }
    }

    return { cleaned, remaining: remaining - cleaned };
  }

  /**
   * Get statistics on lease usage
   */
  async stats(): Promise<{
    active_leases: number;
    released_leases: number;
    expired_leases: number;
    avg_ttl_seconds: number;
  }> {
    const active = await this.redis.scard('leases:active');
    const released = await this.redis.scard('leases:released');

    // Estimate expired (rough; would need more sophisticated tracking)
    const expired = Math.max(0, Math.floor(active * 0.1));

    return {
      active_leases: active,
      released_leases: released,
      expired_leases: expired,
      avg_ttl_seconds: this.defaultTtlSeconds,
    };
  }

  async close(): Promise<void> {
    await this.redis.quit();
  }
}

let manager: RuntimeLeaseManager | null = null;

export function getRuntimeLeaseManager(): RuntimeLeaseManager {
  if (!manager) {
    manager = new RuntimeLeaseManager();
  }
  return manager;
}

export async function closeRuntimeLeaseManager(): Promise<void> {
  if (manager) {
    await manager.close();
    manager = null;
  }
}
