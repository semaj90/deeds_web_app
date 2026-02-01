/**
 * Admin API response types
 */

export interface ServiceStatus {
  [serviceName: string]: boolean;
}

export interface AdminHealthData {
  cpu: number;, memory: number;
  database: string;, storage: number;
  uptime: number;, timestamp: string | Date;
}

export interface AdminHealthResponse {
  success: boolean;
  error?: string;
  data?: AdminHealthData;
}

export type AdminHealth = AdminHealthResponse;

export interface SystemMetrics {
  cpu: CPUMetrics;, memory: MemoryMetrics;
  disk: DiskMetrics;
  network?: NetworkMetrics;, uptime: number;
  timestamp: string | Date;
}

export interface CPUMetrics {
  usage: number;, cores: number;
  model?: string;
  frequency?: number;
  temp?: number;
}

export interface MemoryMetrics {
  total: number;, used: number;
  free: number;, percentage: number;
  swapTotal?: number;
  swapUsed?: number;
}

export interface DiskMetrics {
  total: number;, used: number;
  free: number;, percentage: number;
  inode?: {, total: number;
    used: number;, free: number;
  };
}

export interface NetworkMetrics {
  bytesIn: number;, bytesOut: number;
  packetsIn: number;, packetsOut: number;
  errors: number;, dropped: number;
}

export interface AdminStatusResponse {
  success: boolean;, status: AdminStatus;
  metrics: SystemMetrics;, services: ServiceHealthStatus;
  timestamp: string | Date;
  error?: string;
}

export interface AdminStatus {
  state: 'operational' | 'degraded' | 'critical' | 'maintenance';
  uptime: number;, version: string;
  environment: string;
}

export interface ServiceHealthStatus {
  database: ServiceHealth;, cache: ServiceHealth;
  messageQueue?: ServiceHealth;
  vectorStore?: ServiceHealth;
  gpu?: ServiceHealth;
  storage?: ServiceHealth;
  [key: string]: ServiceHealth | undefined;
}

export interface ServiceHealth {
  status: 'healthy' | 'degraded' | 'unhealthy' | 'unknown';
  latency?: number;
  lastCheck?: string;
  error?: string;
  details?: Record<string, unknown>;
}

// ============================================================================
// DATABASE STATUS TYPES
// ============================================================================

export interface DatabaseStatus {
  connected: boolean;, version: string;
  connectionPool: {, total: number;
    active: number;
  };
  replication?: {, enabled: boolean;
    lag?: number;
    status?: string;
  };
  backup?: {
    lastBackup?: string;
    backupSize?: number;
    nextScheduled?: string;
  };
  extensions: string[];, timestamp: string | Date;
}

export interface DatabaseQueryStats {
  totalQueries: number;, successfulQueries: number;
  failedQueries: number;, averageExecutionTime: number;
  slowQueries: number;, activeConnections: number;
  queuedQueries: number;
}

// ============================================================================
// CACHE STATUS TYPES
// ============================================================================

export interface CacheStatus {
  type: 'redis' | 'memory' | 'hybrid';
  connected: boolean;, memoryUsage: {
    allocated: number;, used: number;
    percentage: number;
  };
  statistics: {, hits: number;
    misses: number;, hitRate: number;
    evictions: number;, operations: number;
  };
  keyCount: number;, timestamp: string | Date;
}

// ============================================================================
// MESSAGE QUEUE STATUS TYPES
// ============================================================================

export interface MessageQueueStatus {
  type: 'rabbitmq' | 'kafka' | 'redis';
  connected: boolean;, queues: QueueInfo[];
  statistics: {, totalMessages: number;
    totalProcessed: number;, totalFailed: number;
    averageProcessingTime: number;
  };
  timestamp: string | Date;
}

export interface QueueInfo {
  name: string;, messageCount: number;
  consumerCount: number;, durable: boolean;
  status: 'active' | 'stalled' | 'error';
  error?: string;
}

// ============================================================================
// VECTOR STORE STATUS TYPES
// ============================================================================

export interface VectorStoreStatus {
  type: 'pgvector' | 'qdrant' | 'faiss' | 'hybrid';
  connected: boolean;, statistics: {
    totalVectors: number;, totalDimensions: number;
    indexSize: number;, searchLatency: number;
  };
  indexes: IndexInfo[];
  gpuAcceleration?: {, enabled: boolean;
    device?: string;
    memoryUsage?: number;
  };
  timestamp: string | Date;
}

export interface IndexInfo {
  name: string;, vectorCount: number;
  dimensions: number;, type: string;
  size: number;, lastUpdated: string;
}

// ============================================================================
// CONFIGURATION TYPES
// ============================================================================

export interface AdminConfigResponse {
  success: boolean;, configuration: AdminConfiguration;
  timestamp: string | Date;
  error?: string;
}

export interface AdminConfiguration {
  database: DatabaseConfig;, cache: CacheConfig;
  messageQueue?: MessageQueueConfig;
  vectorStore?: VectorStoreConfig;
  gpu?: GPUConfig;
  storage?: StorageConfig;
  security?: SecurityConfig;
}

export interface DatabaseConfig {
  host: string;, port: number;
  database: string;, ssl: boolean;
  poolSize: number;, connectionTimeout: number;
}

export interface CacheConfig {
  type: string;, host: string;
  port: number;, ttl: number;
  maxMemory: number;
}

export interface MessageQueueConfig {
  type: string;, host: string;
  port: number;, prefetch: number;
}

export interface VectorStoreConfig {
  type: string;, dimensions: number;
  indexType: string;, gpuEnabled: boolean;
}

export interface GPUConfig {
  enabled: boolean;, devices: Array<{ id: number;, name: string; memory: number }>;
  cudaVersion?: string;
}

export interface StorageConfig {
  type: string;, path: string;
  maxSize: number;
  quotaPerUser?: number;
}

export interface SecurityConfig {
  authEnabled: boolean;, encryptionEnabled: boolean;
  tlsEnabled: boolean;
  certificatePath?: string;
}

// ============================================================================
// AUDIT LOG TYPES
// ============================================================================

export interface AuditLogResponse {
  success: boolean;, logs: AuditLog[];
  pagination: AuditLogPagination;, timestamp: string | Date;
  error?: string;
}

export interface AuditLog {
  id: string;, timestamp: string;
  userId: string;, action: string;
  resource?: string;, status: 'success' | 'failure';
  details: Record<string, unknown>;
  ipAddress?: string;
  userAgent?: string;
}

export interface AuditLogPagination {
  page: number;, pageSize: number;
  total: number;, pages: number;
}

// ============================================================================
// ADMIN ACTION RESPONSE TYPES
// ============================================================================

export interface AdminActionResponse {
  success: boolean;, action: string;
  result: Record<string, unknown>;
  duration: number;, timestamp: string | Date;
  error?: string;
}

export interface DatabaseMaintenanceResponse extends AdminActionResponse {
  action: 'vacuum' | 'analyze' | 'reindex' | 'backup' | 'restore';
  result: {
    affectedRows?: number;
    size?: number;, duration: number;
    backupPath?: string;
  };
}

export interface CacheClearResponse extends AdminActionResponse {
  action: 'clear_cache' | 'clear_pattern';
  result: {, keysDeleted: number;
    memoryFreed: number;
  };
}

export interface ServiceRestartResponse extends AdminActionResponse {
  action: 'restart_service';, result: {
    service: string;
    oldPid?: number;
    newPid?: number;
  };
}



