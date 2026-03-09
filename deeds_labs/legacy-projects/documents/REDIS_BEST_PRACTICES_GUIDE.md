# Redis Best Practices for Legal AI Platform

## Current Redis Configuration Status ✅

**Redis Container**: `legal-ai-redis` (redis/redis-stack:latest)
- **Status**: Healthy and running on ports 6379 (Redis) and 8001 (RedisInsight)
- **Protected Mode**: Disabled for development
- **Connection**: Successfully tested with PONG response

## 🔧 Configuration Best Practices

### 1. Environment Variables Standardization

**Current Issues Found:**
- Multiple Redis URL patterns across codebase (6379, 4005, 6380)
- Inconsistent fallback configurations
- Mixed host/port vs URL configurations

**Recommended Standard:**
```env
# Primary Redis (Legal AI Cache)
REDIS_URL=redis://localhost:6379

# Optional: Separate Redis for specific services
RAG_REDIS_URL=redis://localhost:6379
CACHE_REDIS_URL=redis://localhost:6379
```

### 2. Connection Pool Configuration

**High-Performance Legal AI Setup:**
```typescript
// Optimal Redis configuration for legal AI workloads
const redisConfig = {
  url: process.env.REDIS_URL || 'redis://localhost:6379',
  // Connection pool for high-concurrency legal queries
  socket: {
    connectTimeout: 10000,
    lazyConnect: true,
    keepAlive: 30000,
  },
  // Legal AI specific optimizations
  retryDelayOnFailover: 200,
  maxRetriesPerRequest: 3,
  
  // For legal document caching
  commandTimeout: 5000,
  lazyConnect: true,
  
  // Circuit breaker pattern for resilience
  enableAutoPipelining: true,
  enableOfflineQueue: false,
  
  // Memory optimization for large legal documents
  maxmemoryPolicy: 'allkeys-lfu', // Legal docs have access patterns
  
  // Persistence for legal compliance
  appendOnly: true,
  appendfsync: 'everysec'
};
```

### 3. Legal AI Specific Redis Patterns

#### A. Document Caching Strategy
```typescript
// Legal document types with appropriate TTL
const CACHE_STRATEGIES = {
  // Case data - frequently accessed, medium TTL
  'case:*': { ttl: 3600, pattern: 'case:{id}:{version}' },
  
  // Evidence - critical data, longer TTL
  'evidence:*': { ttl: 7200, pattern: 'evidence:{caseId}:{evidenceId}' },
  
  // Legal precedents - stable data, long TTL
  'precedent:*': { ttl: 86400, pattern: 'precedent:{jurisdiction}:{topic}' },
  
  // AI analysis results - expensive to compute, medium TTL
  'ai:analysis:*': { ttl: 1800, pattern: 'ai:analysis:{type}:{hash}' },
  
  // RAG embeddings - expensive to generate, long TTL
  'rag:embedding:*': { ttl: 604800, pattern: 'rag:embedding:{modelId}:{docHash}' },
  
  // Real-time session data - short TTL
  'session:*': { ttl: 300, pattern: 'session:{userId}:{sessionId}' }
};
```

#### B. Multi-Layer Cache Architecture
```typescript
// Implemented in parallel-cache-orchestrator.ts
const CACHE_LAYERS = {
  L1_MEMORY: {
    maxSize: '500MB',
    evictionPolicy: 'LRU',
    useCase: 'Frequently accessed case summaries'
  },
  
  L2_REDIS: {
    maxSize: '8GB',
    evictionPolicy: 'allkeys-lfu',
    useCase: 'Legal document full-text and metadata'
  },
  
  L3_STORAGE: {
    maxSize: '100GB',
    compression: 'gzip',
    useCase: 'Evidence files and large document archives'
  },
  
  GPU_TEXTURE: {
    maxSize: '2GB',
    format: 'float32',
    useCase: 'RAG embeddings and AI model weights'
  }
};
```

### 4. Performance Monitoring

#### Key Metrics for Legal AI Platform:
```typescript
const REDIS_MONITORING = {
  // Legal query performance
  avgLegalQueryTime: '<50ms',
  caseDataHitRate: '>90%',
  evidenceRetrievalTime: '<100ms',
  
  // AI/RAG specific metrics
  ragEmbeddingCacheHit: '>95%',
  aiAnalysisQueueDepth: '<100',
  
  // System health
  memoryUsage: '<80%',
  connectionPoolUtilization: '<70%',
  replicationLag: '<10ms',
  
  // Legal compliance metrics
  dataIntegrityChecks: 'daily',
  auditLogRetention: '7 years',
  backupFrequency: '4h'
};
```

### 5. Security Best Practices

#### A. Authentication & Authorization
```typescript
// Production Redis security
const productionRedisConfig = {
  // Strong authentication
  username: process.env.REDIS_USERNAME || 'legal_ai_user',
  password: process.env.REDIS_PASSWORD || 'generate_strong_password',
  
  // TLS encryption for legal data
  tls: {
    rejectUnauthorized: true,
    ca: fs.readFileSync('/path/to/ca-certificate.crt'),
    cert: fs.readFileSync('/path/to/client-certificate.crt'),
    key: fs.readFileSync('/path/to/client-key.key')
  },
  
  // Network security
  enableACL: true,
  allowedCommands: [
    'get', 'set', 'del', 'exists', 'expire', 
    'hget', 'hset', 'hdel', 'hgetall',
    'lpush', 'lpop', 'rpush', 'rpop',
    'sadd', 'srem', 'smembers'
  ],
  
  // Legal compliance
  enableAuditLog: true,
  logSensitiveCommands: true
};
```

#### B. Data Classification
```typescript
const LEGAL_DATA_CLASSIFICATION = {
  // Public legal precedents
  'precedent:public:*': { encryption: false, retention: 'indefinite' },
  
  // Client confidential data
  'case:confidential:*': { encryption: true, retention: '7years' },
  
  // Personal identifiable information
  'pii:*': { encryption: true, masking: true, retention: 'client_directed' },
  
  // Attorney work product
  'workproduct:*': { encryption: true, privilege: true, retention: 'indefinite' }
};
```

### 6. Backup & Recovery

#### Legal-Grade Backup Strategy:
```bash
# Automated Redis backup for legal compliance
#!/bin/bash

# Daily full backup
redis-cli --rdb /backups/redis-$(date +%Y%m%d).rdb

# Hourly incremental (AOF replay)
redis-cli BGREWRITEAOF
cp /data/appendonly.aof /backups/incremental/aof-$(date +%Y%m%d-%H).aof

# Verify backup integrity
redis-check-rdb /backups/redis-$(date +%Y%m%d).rdb

# Legal retention compliance
find /backups -name "redis-*.rdb" -mtime +2555 -delete  # 7 years
```

### 7. Development vs Production

#### Development Configuration:
```env
REDIS_URL=redis://localhost:6379
REDIS_PASSWORD=
REDIS_SSL=false
REDIS_CLUSTER=false
```

#### Production Configuration:
```env
REDIS_URL=rediss://user:password@redis-cluster.legal-ai.com:6380
REDIS_PASSWORD=super_secure_password_legal_ai_2024
REDIS_SSL=true
REDIS_CLUSTER=true
REDIS_SENTINEL=true
```

### 8. Common Patterns in Legal AI Codebase

#### A. Cache Key Naming Convention:
```typescript
// Current inconsistent patterns found:
// ❌ Inconsistent: 'case:123', 'cases/456', 'CASE_789'
// ✅ Standardized: 'legal:case:123:v1'

const REDIS_KEY_PATTERNS = {
  case: 'legal:case:{caseId}:{version}',
  evidence: 'legal:evidence:{caseId}:{evidenceId}',
  user_session: 'legal:session:{userId}:{sessionId}',
  ai_analysis: 'legal:ai:{analysisType}:{contentHash}',
  rag_context: 'legal:rag:{modelId}:{queryHash}',
  
  // Temporary data
  temp_upload: 'legal:temp:upload:{userId}:{uploadId}:ttl300',
  ai_queue: 'legal:queue:ai:{priority}:{timestamp}'
};
```

#### B. Error Handling & Fallback:
```typescript
class LegalRedisService {
  async get(key: string): Promise<any> {
    try {
      const result = await this.redis.get(key);
      return result ? JSON.parse(result) : null;
    } catch (error) {
      console.error(`Redis GET failed for key: ${key}`, error);
      
      // Legal AI fallback: check memory cache
      return this.memoryFallback.get(key);
    }
  }
  
  async set(key: string, value: any, ttl?: number): Promise<boolean> {
    try {
      const serialized = JSON.stringify(value);
      
      if (ttl) {
        await this.redis.setex(key, ttl, serialized);
      } else {
        await this.redis.set(key, serialized);
      }
      
      // Also store in memory fallback
      this.memoryFallback.set(key, value, ttl);
      return true;
      
    } catch (error) {
      console.error(`Redis SET failed for key: ${key}`, error);
      
      // At least save to memory fallback
      return this.memoryFallback.set(key, value, ttl);
    }
  }
}
```

## 🚀 Performance Optimizations Found in Codebase

### 1. Parallel Cache Orchestrator
Your existing `parallel-cache-orchestrator.ts` implements excellent patterns:
- **Multi-tier caching** (L1 Memory → L2 Redis → L3 Storage)
- **Circuit breaker patterns** for resilience
- **GPU texture caching** for AI embeddings
- **Quantized responses** for bandwidth optimization

### 2. RAG-Specific Optimizations
- **768-dimensional embeddings** cached with high TTL
- **Legal context preservation** across requests
- **Semantic similarity caching** for legal precedents

### 3. Real-time Features
- **WebSocket integration** for live legal updates
- **Pub/sub patterns** for case collaboration
- **Event-driven cache invalidation**

## 📊 Recommended Redis Configuration for Legal AI

```toml
# redis.conf optimizations for legal AI platform
maxmemory 8gb
maxmemory-policy allkeys-lfu

# Legal document persistence
save 900 1
save 300 10
save 60 10000

# AOF for legal audit trail
appendonly yes
appendfsync everysec
no-appendfsync-on-rewrite no

# Network optimizations
tcp-keepalive 300
timeout 300

# Legal AI specific
hash-max-ziplist-entries 512
list-max-ziplist-size -2
set-max-intset-entries 512

# Memory optimization for embeddings
memory-usage yes
```

## 🔍 Current Status Summary

✅ **Working**: Basic Redis connectivity (PONG response confirmed)  
✅ **Implemented**: Multi-layer cache orchestration  
✅ **Active**: Legal AI cache patterns in 60+ files  
⚠️ **Needs Cleanup**: Standardize Redis URLs across codebase  
⚠️ **Production Ready**: Add authentication and TLS  

## 🎯 Next Steps⚠️ **Needs Cleanup**: Standardize Redis URLs across codebase  

1. **Standardize Redis URLs** across all 60+ files to use `REDIS_URL=redis://localhost:6379`
3. **Add monitoring dashboard** for legal AI cache performance
4. **Set up automated backups** with legal retention compliance
5. **Create Redis ACLs** for different legal data classifications
2. **Implement Redis authentication** for production deployment

The Redis infrastructure is solid and ready for high-performance legal AI operations!