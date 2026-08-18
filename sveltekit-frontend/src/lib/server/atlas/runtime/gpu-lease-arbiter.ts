import { createHash, randomUUID } from 'node:crypto';

export type GpuLeasePriority = 'BACKGROUND' | 'INTERACTIVE' | 'MUTATION_CRITICAL';
export type GpuRuntime = 'windows-native' | 'wsl2';
export type GpuExecutor = 'cublas' | 'cublaslt' | 'libtorch' | 'tensorrt-rtx' | 'cusolver' | 'cutlass' | 'cutile' | 'cuvs-exact' | 'cagra' | 'cugraph' | 'pytorch' | 'tensorrt-llm';

export interface GpuLeaseV1 {
  schema: 'atlas.gpu-lease.v1';
  leaseId: string;
  deviceIdentity: { pciDeviceId: string; deviceUuid?: string | null; computeCapability: string };
  runtime: GpuRuntime;
  executor: GpuExecutor;
  requestedBytes: number;
  reservedBytes: number;
  priority: GpuLeasePriority;
  environmentReceiptId: string;
  acquiredAt: string;
  expiresAt: string;
  producerRevision: string;
  checksum: string;
}

export interface PhysicalGpuEnvelope {
  deviceIdentity: { pciDeviceId: string; deviceUuid?: string | null; computeCapability: string };
  totalBudgetBytes: number;
  safetyReserveBytes: number;
}

export interface LeaseRequest {
  runtime: GpuRuntime;
  executor: GpuExecutor;
  requestedBytes: number;
  priority: GpuLeasePriority;
  environmentReceiptId: string;
  ttlMs: number;
}

function stableChecksum(value: unknown): string {
  return createHash('sha256').update(JSON.stringify(value)).digest('hex');
}

function priorityRank(priority: GpuLeasePriority): number {
  return priority === 'MUTATION_CRITICAL' ? 3 : priority === 'INTERACTIVE' ? 2 : 1;
}

/**
 * In-memory reference arbiter for one physical GPU shared by Windows and WSL2.
 *
 * TODO(PRODUCTION): persist leases through the existing Parent Atlas coordination
 * store and add heartbeat/reaper semantics. Do not create a second GPU truth DB.
 */
export class GpuLeaseArbiter {
  private readonly leases = new Map<string, GpuLeaseV1>();

  constructor(
    private readonly envelope: PhysicalGpuEnvelope,
    private readonly producerRevision = 'gpu-lease-arbiter-v1',
  ) {}

  listActive(now = Date.now()): GpuLeaseV1[] {
    this.reapExpired(now);
    return [...this.leases.values()].sort((a, b) => a.acquiredAt.localeCompare(b.acquiredAt));
  }

  reservedBytes(now = Date.now()): number {
    return this.listActive(now).reduce((sum, lease) => sum + lease.reservedBytes, 0);
  }

  availableBytes(now = Date.now()): number {
    return Math.max(0, this.envelope.totalBudgetBytes - this.envelope.safetyReserveBytes - this.reservedBytes(now));
  }

  acquire(request: LeaseRequest, now = Date.now()): GpuLeaseV1 {
    if (!request.environmentReceiptId.trim()) throw new Error('GPU_LEASE_ENVIRONMENT_RECEIPT_REQUIRED');
    if (!Number.isFinite(request.requestedBytes) || request.requestedBytes < 0) throw new Error('GPU_LEASE_REQUEST_BYTES_INVALID');
    if (!Number.isFinite(request.ttlMs) || request.ttlMs <= 0) throw new Error('GPU_LEASE_TTL_INVALID');

    this.reapExpired(now);
    const available = this.availableBytes(now);
    if (request.requestedBytes > available) {
      const lowerPriority = [...this.leases.values()]
        .filter((lease) => priorityRank(lease.priority) < priorityRank(request.priority))
        .sort((a, b) => priorityRank(a.priority) - priorityRank(b.priority) || a.acquiredAt.localeCompare(b.acquiredAt));
      const reclaimable = lowerPriority.reduce((sum, lease) => sum + lease.reservedBytes, 0);
      throw new Error(`GPU_LEASE_CAPACITY_EXCEEDED requested=${request.requestedBytes} available=${available} reclaimable_lower_priority=${reclaimable}`);
    }

    const acquiredAt = new Date(now).toISOString();
    const expiresAt = new Date(now + request.ttlMs).toISOString();
    const base = {
      schema: 'atlas.gpu-lease.v1' as const,
      leaseId: randomUUID(),
      deviceIdentity: this.envelope.deviceIdentity,
      runtime: request.runtime,
      executor: request.executor,
      requestedBytes: request.requestedBytes,
      reservedBytes: request.requestedBytes,
      priority: request.priority,
      environmentReceiptId: request.environmentReceiptId,
      acquiredAt,
      expiresAt,
      producerRevision: this.producerRevision,
    };
    const lease: GpuLeaseV1 = { ...base, checksum: stableChecksum(base) };
    this.leases.set(lease.leaseId, lease);
    return lease;
  }

  release(leaseId: string): boolean {
    return this.leases.delete(leaseId);
  }

  assertActive(leaseId: string, now = Date.now()): GpuLeaseV1 {
    this.reapExpired(now);
    const lease = this.leases.get(leaseId);
    if (!lease) throw new Error(`GPU_LEASE_NOT_ACTIVE: ${leaseId}`);
    return lease;
  }

  private reapExpired(now: number): void {
    for (const [id, lease] of this.leases) {
      if (Date.parse(lease.expiresAt) <= now) this.leases.delete(id);
    }
  }
}
