# TIER 2 OPTIMIZATION IMPLEMENTATION PLAN
**Legal AI Platform - Advanced Performance & Scalability**

**Date:** 2025-01-17
**Status:** 📋 Planning Phase
**Duration:** 2-3 days implementation
**Complexity:** Medium
**Risk Level:** 🟡 Medium (requires infrastructure changes)
**Prerequisites:** ✅ Tier 1 Complete

---

## 📊 EXECUTIVE SUMMARY

Tier 2 optimizations focus on **horizontal scalability** and **high availability** for production deployments handling 1000+ concurrent users. These optimizations build on Tier 1's caching and quantization improvements.

### Goals:
- **Scale horizontally:** Handle 10x traffic increase without degradation
- **Eliminate single points of failure:** Redis clustering, DB replication
- **Optimize database load:** Connection pooling, read replicas
- **Maintain <100ms p95 latency:** Even under heavy load

### Expected Impact:
```
Concurrent users:    100 → 1000+     (10x capacity) 🚀
Cache availability:  95% → 99.9%     (no single point of failure) ✅
DB connection pool:  20 → 100        (5x connections) ✅
Read query latency:  50ms → 15ms    (3.3x faster) ✅
Write throughput:    100/s → 500/s  (5x capacity) ✅
Overall capacity:    5-10x improvement 🎯
```

---

## 🎯 TIER 2 OPTIMIZATIONS

### 1. Distributed Caching with Redis Cluster
### 2. Database Sharding for Horizontal Scaling
### 3. Connection Pooling Optimization
### 4. Read Replicas for Heavy SELECT Workloads

---

## 1️⃣ DISTRIBUTED CACHING WITH REDIS CLUSTER

### **Why Redis Cluster?**
Current setup: Single Redis instance = single point of failure
- If Redis crashes → all cache lost → 3.75x slower queries
- Memory limit: ~16GB per instance → can't scale beyond this
- No automatic failover → manual intervention required

**Redis Cluster provides:**
- Automatic sharding across 3-6 nodes (horizontal scaling)
- High availability with automatic failover (99.9% uptime)
- Scales to 1000+ GB cache (64x more than single instance)
- Zero downtime during node failures

---

### **Architecture Design**

#### Current Architecture (Tier 1):
```
┌─────────────────┐
│  SvelteKit App  │
└────────┬────────┘
         │
         ▼
┌─────────────────┐
│  Redis (Single) │  ⚠️ Single Point of Failure
│  Port: 6379     │  ⚠️ 16GB memory limit
└─────────────────┘
```

#### Tier 2 Architecture (Redis Cluster):
```
┌─────────────────────────────────────────────────┐
│              SvelteKit Application              │
└────────────────────┬────────────────────────────┘
                     │
                     ▼
         ┌───────────────────────┐
         │  Redis Cluster Client │ (ioredis cluster mode)
         └───────────┬───────────┘
                     │
         ┌───────────┴───────────┬───────────────┐
         ▼                       ▼               ▼
┌─────────────────┐    ┌─────────────────┐    ┌─────────────────┐
│  Master 1       │    │  Master 2       │    │  Master 3       │
│  Port: 7001     │    │  Port: 7002     │    │  Port: 7003     │
│  Slots: 0-5461  │    │  Slots: 5462-   │    │  Slots: 10923-  │
│                 │    │  10922          │    │  16383          │
└────────┬────────┘    └────────┬────────┘    └────────┬────────┘
         │                      │                       │
         ▼                      ▼                       ▼
┌─────────────────┐    ┌─────────────────┐    ┌─────────────────┐
│  Replica 1      │    │  Replica 2      │    │  Replica 3      │
│  Port: 8001     │    │  Port: 8002     │    │  Port: 8003     │
└─────────────────┘    └─────────────────┘    └─────────────────┘

Key Distribution (Automatic Sharding):
- query:semantic:* → Master 1 (based on hash slot)
- query:vector:*   → Master 2
- embedding:*      → Master 3
- Automatic failover: Replica promotes to Master if Master fails
```

---

### **Implementation Steps**

#### **Step 1: Set Up Redis Cluster (Docker Compose)**

Create `sveltekit-frontend/docker-compose.redis-cluster.yml`:

```yaml
version: '3.8'

services:
  # Master Nodes
  redis-master-1:
    image: redis:7.2-alpine
    container_name: redis-master-1
    ports:
      - "7001:7001"
      - "17001:17001"
    command: >
      redis-server
      --port 7001
      --cluster-enabled yes
      --cluster-config-file nodes.conf
      --cluster-node-timeout 5000
      --appendonly yes
      --requirepass redis
      --masterauth redis
    volumes:
      - redis-master-1-data:/data
    networks:
      - redis-cluster

  redis-master-2:
    image: redis:7.2-alpine
    container_name: redis-master-2
    ports:
      - "7002:7002"
      - "17002:17002"
    command: >
      redis-server
      --port 7002
      --cluster-enabled yes
      --cluster-config-file nodes.conf
      --cluster-node-timeout 5000
      --appendonly yes
      --requirepass redis
      --masterauth redis
    volumes:
      - redis-master-2-data:/data
    networks:
      - redis-cluster

  redis-master-3:
    image: redis:7.2-alpine
    container_name: redis-master-3
    ports:
      - "7003:7003"
      - "17003:17003"
    command: >
      redis-server
      --port 7003
      --cluster-enabled yes
      --cluster-config-file nodes.conf
      --cluster-node-timeout 5000
      --appendonly yes
      --requirepass redis
      --masterauth redis
    volumes:
      - redis-master-3-data:/data
    networks:
      - redis-cluster

  # Replica Nodes
  redis-replica-1:
    image: redis:7.2-alpine
    container_name: redis-replica-1
    ports:
      - "8001:8001"
      - "18001:18001"
    command: >
      redis-server
      --port 8001
      --cluster-enabled yes
      --cluster-config-file nodes.conf
      --cluster-node-timeout 5000
      --appendonly yes
      --requirepass redis
      --masterauth redis
    volumes:
      - redis-replica-1-data:/data
    networks:
      - redis-cluster
    depends_on:
      - redis-master-1

  redis-replica-2:
    image: redis:7.2-alpine
    container_name: redis-replica-2
    ports:
      - "8002:8002"
      - "18002:18002"
    command: >
      redis-server
      --port 8002
      --cluster-enabled yes
      --cluster-config-file nodes.conf
      --cluster-node-timeout 5000
      --appendonly yes
      --requirepass redis
      --masterauth redis
    volumes:
      - redis-replica-2-data:/data
    networks:
      - redis-cluster
    depends_on:
      - redis-master-2

  redis-replica-3:
    image: redis:7.2-alpine
    container_name: redis-replica-3
    ports:
      - "8003:8003"
      - "18003:18003"
    command: >
      redis-server
      --port 8003
      --cluster-enabled yes
      --cluster-config-file nodes.conf
      --cluster-node-timeout 5000
      --appendonly yes
      --requirepass redis
      --masterauth redis
    volumes:
      - redis-replica-3-data:/data
    networks:
      - redis-cluster
    depends_on:
      - redis-master-3

  # Cluster Initialization
  redis-cluster-init:
    image: redis:7.2-alpine
    container_name: redis-cluster-init
    command: >
      sh -c "
        sleep 5 &&
        redis-cli -a redis --cluster create
        redis-master-1:7001
        redis-master-2:7002
        redis-master-3:7003
        redis-replica-1:8001
        redis-replica-2:8002
        redis-replica-3:8003
        --cluster-replicas 1
        --cluster-yes
      "
    networks:
      - redis-cluster
    depends_on:
      - redis-master-1
      - redis-master-2
      - redis-master-3
      - redis-replica-1
      - redis-replica-2
      - redis-replica-3

volumes:
  redis-master-1-data:
  redis-master-2-data:
  redis-master-3-data:
  redis-replica-1-data:
  redis-replica-2-data:
  redis-replica-3-data:

networks:
  redis-cluster:
    driver: bridge
```

**Start Redis Cluster:**
```bash
docker-compose -f docker-compose.redis-cluster.yml up -d

# Verify cluster status
docker exec -it redis-master-1 redis-cli -a redis -p 7001 cluster info

# Expected output:
# cluster_state:ok
# cluster_slots_assigned:16384
# cluster_known_nodes:6
```

---

#### **Step 2: Update Redis Client for Cluster Mode**

Create `sveltekit-frontend/src/lib/server/cache/redis-cluster.ts`:

```typescript
/**
 * Redis Cluster Client for Distributed Caching
 * Provides automatic sharding, failover, and high availability
 */
import Redis, { Cluster } from 'ioredis';
import type { ClusterOptions } from 'ioredis';

export interface RedisClusterConfig {
  nodes: Array<{ host: string; port: number }>;
  password: string;
  maxRetries: number;
  retryDelay: number;
  enableReadyCheck: boolean;
  enableOfflineQueue: boolean;
  scaleReads: 'master' | 'slave' | 'all';
}

export class RedisClusterClient {
  private cluster: Cluster;
  private config: RedisClusterConfig;
  private metrics = {
    hits: 0,
    misses: 0,
    errors: 0,
    redirects: 0,
    nodeFailures: 0,
  };

  constructor(config: RedisClusterConfig) {
    this.config = config;

    const clusterOptions: ClusterOptions = {
      redisOptions: {
        password: config.password,
        connectTimeout: 10000,
        maxRetriesPerRequest: config.maxRetries,
        enableReadyCheck: config.enableReadyCheck,
        enableOfflineQueue: config.enableOfflineQueue,
      },
      scaleReads: config.scaleReads, // Read from replicas
      maxRedirections: 16,
      retryDelayOnFailover: config.retryDelay,
      retryDelayOnClusterDown: config.retryDelay,
      slotsRefreshTimeout: 2000,
    };

    this.cluster = new Redis.Cluster(config.nodes, clusterOptions);

    // Event listeners for monitoring
    this.cluster.on('error', (err) => {
      console.error('Redis Cluster error:', err);
      this.metrics.errors++;
    });

    this.cluster.on('node error', (err, node) => {
      console.error(`Redis node error (${node}):`, err);
      this.metrics.nodeFailures++;
    });

    this.cluster.on('ready', () => {
      console.log('✅ Redis Cluster ready');
    });

    this.cluster.on('+node', (node) => {
      console.log(`➕ Redis node added: ${node.options.host}:${node.options.port}`);
    });

    this.cluster.on('-node', (node) => {
      console.log(`➖ Redis node removed: ${node.options.host}:${node.options.port}`);
    });
  }

  /**
   * Get value from cluster (automatic sharding based on key hash)
   */
  async get(key: string): Promise<string | null> {
    try {
      const value = await this.cluster.get(key);
      if (value) {
        this.metrics.hits++;
      } else {
        this.metrics.misses++;
      }
      return value;
    } catch (error) {
      this.metrics.errors++;
      console.error('Redis Cluster GET error:', error);
      return null;
    }
  }

  /**
   * Set value in cluster with TTL
   */
  async set(key: string, value: string, ttl?: number): Promise<void> {
    try {
      if (ttl) {
        await this.cluster.setex(key, ttl, value);
      } else {
        await this.cluster.set(key, value);
      }
    } catch (error) {
      this.metrics.errors++;
      console.error('Redis Cluster SET error:', error);
      throw error;
    }
  }

  /**
   * Delete key from cluster
   */
  async del(key: string): Promise<number> {
    try {
      return await this.cluster.del(key);
    } catch (error) {
      this.metrics.errors++;
      console.error('Redis Cluster DEL error:', error);
      return 0;
    }
  }

  /**
   * Get multiple keys (uses MGET with automatic key routing)
   */
  async mget(keys: string[]): Promise<(string | null)[]> {
    try {
      return await this.cluster.mget(...keys);
    } catch (error) {
      this.metrics.errors++;
      console.error('Redis Cluster MGET error:', error);
      return keys.map(() => null);
    }
  }

  /**
   * Pipeline operations for better performance
   */
  async pipeline(commands: Array<[string, ...any[]]>): Promise<any[]> {
    const pipeline = this.cluster.pipeline();
    commands.forEach(([cmd, ...args]) => {
      (pipeline as any)[cmd](...args);
    });
    const results = await pipeline.exec();
    return results?.map(([err, result]) => (err ? null : result)) || [];
  }

  /**
   * Get cluster statistics
   */
  async getClusterStats(): Promise<{
    nodes: number;
    slots: number;
    state: string;
    metrics: typeof this.metrics;
    nodeInfo: Array<{
      id: string;
      host: string;
      port: number;
      role: 'master' | 'slave';
      slots?: string;
      connectedSlaves?: number;
    }>;
  }> {
    const clusterInfo = await this.cluster.cluster('INFO');
    const clusterNodes = await this.cluster.cluster('NODES');

    // Parse cluster info
    const info = clusterInfo.split('\r\n').reduce((acc, line) => {
      const [key, value] = line.split(':');
      if (key && value) acc[key] = value;
      return acc;
    }, {} as Record<string, string>);

    // Parse cluster nodes
    const nodes = clusterNodes
      .split('\n')
      .filter((line) => line.trim())
      .map((line) => {
        const parts = line.split(' ');
        return {
          id: parts[0],
          host: parts[1].split('@')[0].split(':')[0],
          port: parseInt(parts[1].split('@')[0].split(':')[1]),
          role: parts[2].includes('master') ? 'master' : 'slave',
          slots: parts[8],
          connectedSlaves: parts[2].includes('master') ? parseInt(parts[9] || '0') : undefined,
        } as const;
      });

    return {
      nodes: parseInt(info.cluster_known_nodes || '0'),
      slots: parseInt(info.cluster_slots_assigned || '0'),
      state: info.cluster_state || 'unknown',
      metrics: this.metrics,
      nodeInfo: nodes,
    };
  }

  /**
   * Health check for cluster
   */
  async healthCheck(): Promise<boolean> {
    try {
      const info = await this.cluster.cluster('INFO');
      return info.includes('cluster_state:ok');
    } catch (error) {
      console.error('Redis Cluster health check failed:', error);
      return false;
    }
  }

  /**
   * Close cluster connections
   */
  async disconnect(): Promise<void> {
    await this.cluster.quit();
  }
}

/**
 * Default Redis Cluster Configuration
 */
export const defaultClusterConfig: RedisClusterConfig = {
  nodes: [
    { host: 'localhost', port: 7001 },
    { host: 'localhost', port: 7002 },
    { host: 'localhost', port: 7003 },
  ],
  password: process.env.REDIS_PASSWORD || 'redis',
  maxRetries: 3,
  retryDelay: 100,
  enableReadyCheck: true,
  enableOfflineQueue: true,
  scaleReads: 'slave', // Read from replicas to reduce master load
};

/**
 * Singleton instance
 */
let clusterInstance: RedisClusterClient | null = null;

export function getRedisCluster(): RedisClusterClient {
  if (!clusterInstance) {
    clusterInstance = new RedisClusterClient(defaultClusterConfig);
  }
  return clusterInstance;
}
```

---

#### **Step 3: Migrate Query Cache to Use Redis Cluster**

Update `sveltekit-frontend/src/lib/server/optimize/query-cache.ts`:

```typescript
// Add at the top of the file:
import { getRedisCluster } from '../cache/redis-cluster';

// Replace in QueryCache constructor:
export class QueryCache {
  private redis: RedisClusterClient; // Changed from RedisMetricsCache

  constructor(config?: Partial<CacheConfig>) {
    this.redis = getRedisCluster(); // Use cluster instead of single instance
    // ... rest of constructor
  }

  // All existing methods work unchanged (get, set, del, etc.)
  // Redis Cluster client provides same interface
}
```

---

#### **Step 4: Testing & Validation**

Create `sveltekit-frontend/scripts/test-redis-cluster.ts`:

```typescript
import { getRedisCluster } from '../src/lib/server/cache/redis-cluster';

async function testRedisCluster() {
  console.log('🧪 Testing Redis Cluster...\n');

  const cluster = getRedisCluster();

  // Test 1: Health Check
  console.log('Test 1: Health Check');
  const isHealthy = await cluster.healthCheck();
  console.log(`  Status: ${isHealthy ? '✅ Healthy' : '❌ Unhealthy'}\n`);

  // Test 2: Basic Operations
  console.log('Test 2: Basic Operations');
  await cluster.set('test:key1', 'value1', 60);
  const value = await cluster.get('test:key1');
  console.log(`  SET/GET: ${value === 'value1' ? '✅ Pass' : '❌ Fail'}\n`);

  // Test 3: Automatic Sharding
  console.log('Test 3: Automatic Sharding (1000 keys)');
  const keys: string[] = [];
  for (let i = 0; i < 1000; i++) {
    const key = `shard:test:${i}`;
    keys.push(key);
    await cluster.set(key, `value-${i}`, 60);
  }
  console.log(`  ✅ Written 1000 keys across cluster\n`);

  // Test 4: Cluster Statistics
  console.log('Test 4: Cluster Statistics');
  const stats = await cluster.getClusterStats();
  console.log(`  Nodes: ${stats.nodes}`);
  console.log(`  Slots: ${stats.slots}/16384`);
  console.log(`  State: ${stats.state}`);
  console.log(`  Cache Hits: ${stats.metrics.hits}`);
  console.log(`  Cache Misses: ${stats.metrics.misses}`);
  console.log(`  Errors: ${stats.metrics.errors}\n`);

  console.log('Node Distribution:');
  stats.nodeInfo.forEach((node) => {
    console.log(`  ${node.role.toUpperCase()} - ${node.host}:${node.port}`);
    if (node.slots) console.log(`    Slots: ${node.slots}`);
  });

  // Test 5: Failover Simulation (optional, requires manual node stop)
  console.log('\nTest 5: Failover Simulation');
  console.log('  To test: Stop redis-master-1 and run queries');
  console.log('  Expected: Replica-1 promotes to master, queries continue\n');

  await cluster.disconnect();
  console.log('✅ All tests complete!');
}

testRedisCluster().catch(console.error);
```

**Run tests:**
```bash
npx tsx scripts/test-redis-cluster.ts
```

---

### **Deployment Checklist**

- [ ] Start Redis Cluster: `docker-compose -f docker-compose.redis-cluster.yml up -d`
- [ ] Verify cluster status: `docker exec -it redis-master-1 redis-cli -a redis -p 7001 cluster info`
- [ ] Update environment variables: `REDIS_CLUSTER_NODES=localhost:7001,localhost:7002,localhost:7003`
- [ ] Run cluster tests: `npx tsx scripts/test-redis-cluster.ts`
- [ ] Update query-cache.ts to use Redis Cluster
- [ ] Deploy application with cluster config
- [ ] Monitor cluster metrics for 24 hours
- [ ] Test failover: Stop one master node and verify automatic promotion

---

### **Monitoring & Alerts**

Add to Grafana dashboard:

```
Redis Cluster Health
├── Cluster State:     ✅ OK
├── Active Nodes:      6/6 (3 masters, 3 replicas)
├── Assigned Slots:    16384/16384
├── Node Failures:     0 (last 24h)
└── Failover Events:   0 (last 24h)

Redis Cluster Performance
├── Cache Hit Rate:    87.3% ✅
├── Redirects/sec:     12 (key routing)
├── Avg GET Latency:   1.8ms ✅
├── Avg SET Latency:   2.4ms ✅
└── Keys per Node:     ~333k (balanced)
```

**Alerts:**
- Cluster state != OK → PagerDuty
- Node failure detected → Slack
- Cache hit rate < 70% → Email
- Slot migration in progress → Info log

---

### **Cost & Resource Estimates**

**Development Environment (Docker):**
- 6 containers × 512MB RAM = 3GB total
- Disk: ~5GB (with persistence)
- Cost: $0 (local development)

**Production (AWS ElastiCache):**
- 3 masters (cache.r7g.large): 3 × $0.226/hour = $0.678/hour
- 3 replicas (cache.r7g.large): 3 × $0.226/hour = $0.678/hour
- **Total:** ~$1,000/month for HA Redis Cluster
- Disk (if persistent): +$50/month

**Alternative (Self-Hosted):**
- 6 × t3.medium EC2: 6 × $30/month = $180/month
- Much cheaper but requires DevOps management

---

## 2️⃣ DATABASE SHARDING FOR HORIZONTAL SCALING

### **Why Database Sharding?**
Current setup: Single PostgreSQL instance = vertical scaling limit
- Max connections: ~200 (limited by single instance)
- Max throughput: ~5,000 writes/sec (single disk I/O bottleneck)
- Storage limit: Single instance disk size (can't scale beyond)

**Sharding provides:**
- Horizontal write scaling: 3 shards = 3x write throughput
- Distributed storage: No single instance disk limit
- Improved query performance: Queries only scan relevant shard
- Better isolation: High-traffic cases don't affect others

---

### **Sharding Strategy**

#### **Option 1: Shard by Case ID (Recommended)**
```
Shard 1: case_id % 3 = 0  (Cases 0, 3, 6, 9, ...)
Shard 2: case_id % 3 = 1  (Cases 1, 4, 7, 10, ...)
Shard 3: case_id % 3 = 2  (Cases 2, 5, 8, 11, ...)

Advantages:
✅ Even distribution (33% per shard)
✅ No hotspots (random case access)
✅ Simple routing logic
✅ Easy to add more shards (re-shard 3 → 6)

Disadvantages:
❌ Cross-shard queries expensive (joins across shards)
❌ Global queries need fan-out to all shards
```

#### **Option 2: Shard by User/Organization**
```
Shard 1: Organization A (law firm 1)
Shard 2: Organization B (law firm 2)
Shard 3: Organization C (law firm 3)

Advantages:
✅ No cross-shard queries within org
✅ Easy org-level backups
✅ Data locality (all org data on one shard)

Disadvantages:
❌ Uneven distribution (large orgs → hotspots)
❌ Hard to rebalance (requires data migration)
```

**Recommendation:** Use **Option 1 (Case ID sharding)** for legal AI platform because:
- Even distribution across shards
- Predictable performance
- Easy to scale horizontally

---

### **Architecture Design**

#### Current Architecture:
```
┌─────────────────┐
│  SvelteKit App  │
└────────┬────────┘
         │
         ▼
┌─────────────────┐
│  PostgreSQL     │  ⚠️ Single Point of Failure
│  Port: 5432     │  ⚠️ Limited to 200 connections
│  All Tables     │  ⚠️ 5,000 writes/sec max
└─────────────────┘
```

#### Tier 2 Architecture (Sharded):
```
┌───────────────────────────────────────────────────────┐
│              SvelteKit Application                    │
└───────────────────────┬───────────────────────────────┘
                        │
                        ▼
           ┌────────────────────────┐
           │  Shard Router Service  │ (Determines which shard)
           │  (query-router.ts)     │
           └────────┬───────────────┘
                    │
        ┌───────────┼───────────┬───────────────┐
        │           │           │               │
        ▼           ▼           ▼               ▼
┌──────────────┐ ┌──────────────┐ ┌──────────────┐ ┌──────────────┐
│  Shard 0     │ │  Shard 1     │ │  Shard 2     │ │  Global DB   │
│  Port: 5433  │ │  Port: 5434  │ │  Port: 5435  │ │  Port: 5432  │
│              │ │              │ │              │ │              │
│  case_id % 3 │ │  case_id % 3 │ │  case_id % 3 │ │  Users       │
│  = 0         │ │  = 1         │ │  = 2         │ │  Auth        │
│              │ │              │ │              │ │  Config      │
│  Cases       │ │  Cases       │ │  Cases       │ │  Analytics   │
│  Evidence    │ │  Evidence    │ │  Evidence    │ │              │
│  Documents   │ │  Documents   │ │  Documents   │ │  (Global)    │
└──────────────┘ └──────────────┘ └──────────────┘ └──────────────┘

Routing Logic:
- case_id=123 → 123 % 3 = 0 → Shard 0
- case_id=456 → 456 % 3 = 0 → Shard 0
- case_id=789 → 789 % 3 = 0 → Shard 0
- Global queries → Fan-out to all shards + merge results
```

---

### **Implementation Steps**

#### **Step 1: Set Up Database Shards (Docker Compose)**

Create `sveltekit-frontend/docker-compose.sharded-db.yml`:

```yaml
version: '3.8'

services:
  # Global Database (Users, Auth, Config)
  postgres-global:
    image: pgvector/pgvector:pg17
    container_name: postgres-global
    environment:
      POSTGRES_USER: legal_admin
      POSTGRES_PASSWORD: 123456
      POSTGRES_DB: legal_ai_global
    ports:
      - "5432:5432"
    volumes:
      - postgres-global-data:/var/lib/postgresql/data
    networks:
      - legal-ai-network

  # Shard 0 (case_id % 3 = 0)
  postgres-shard-0:
    image: pgvector/pgvector:pg17
    container_name: postgres-shard-0
    environment:
      POSTGRES_USER: legal_admin
      POSTGRES_PASSWORD: 123456
      POSTGRES_DB: legal_ai_shard_0
    ports:
      - "5433:5432"
    volumes:
      - postgres-shard-0-data:/var/lib/postgresql/data
    networks:
      - legal-ai-network

  # Shard 1 (case_id % 3 = 1)
  postgres-shard-1:
    image: pgvector/pgvector:pg17
    container_name: postgres-shard-1
    environment:
      POSTGRES_USER: legal_admin
      POSTGRES_PASSWORD: 123456
      POSTGRES_DB: legal_ai_shard_1
    ports:
      - "5434:5432"
    volumes:
      - postgres-shard-1-data:/var/lib/postgresql/data
    networks:
      - legal-ai-network

  # Shard 2 (case_id % 3 = 2)
  postgres-shard-2:
    image: pgvector/pgvector:pg17
    container_name: postgres-shard-2
    environment:
      POSTGRES_USER: legal_admin
      POSTGRES_PASSWORD: 123456
      POSTGRES_DB: legal_ai_shard_2
    ports:
      - "5435:5432"
    volumes:
      - postgres-shard-2-data:/var/lib/postgresql/data
    networks:
      - legal-ai-network

volumes:
  postgres-global-data:
  postgres-shard-0-data:
  postgres-shard-1-data:
  postgres-shard-2-data:

networks:
  legal-ai-network:
    driver: bridge
```

**Start sharded databases:**
```bash
docker-compose -f docker-compose.sharded-db.yml up -d

# Apply schema to all shards
for port in 5433 5434 5435; do
  PGPASSWORD=123456 psql -h localhost -p $port -U legal_admin -d legal_ai_shard_$((port - 5433)) \
    -f src/lib/server/db/migrations/001_initial_schema.sql
done
```

---

#### **Step 2: Create Shard Router**

Create `sveltekit-frontend/src/lib/server/db/shard-router.ts`:

```typescript
/**
 * Database Shard Router
 * Routes queries to appropriate shard based on case_id
 */
import postgres from 'postgres';
import type { Sql } from 'postgres';

export interface ShardConfig {
  global: {
    host: string;
    port: number;
    database: string;
    username: string;
    password: string;
  };
  shards: Array<{
    id: number;
    host: string;
    port: number;
    database: string;
    username: string;
    password: string;
  }>;
  shardCount: number;
}

export class ShardRouter {
  private globalDb: Sql;
  private shards: Map<number, Sql> = new Map();
  private config: ShardConfig;

  constructor(config: ShardConfig) {
    this.config = config;

    // Initialize global database connection
    this.globalDb = postgres({
      host: config.global.host,
      port: config.global.port,
      database: config.global.database,
      username: config.global.username,
      password: config.global.password,
      max: 20, // Connection pool size
    });

    // Initialize shard connections
    config.shards.forEach((shard) => {
      this.shards.set(
        shard.id,
        postgres({
          host: shard.host,
          port: shard.port,
          database: shard.database,
          username: shard.username,
          password: shard.password,
          max: 20,
        })
      );
    });

    console.log(`✅ Shard Router initialized with ${config.shards.length} shards`);
  }

  /**
   * Determine shard for a given case_id
   */
  getShardId(caseId: string | number): number {
    const numericId = typeof caseId === 'string' ? parseInt(caseId) : caseId;
    return numericId % this.config.shardCount;
  }

  /**
   * Get database connection for a specific case
   */
  getShardForCase(caseId: string | number): Sql {
    const shardId = this.getShardId(caseId);
    const shard = this.shards.get(shardId);
    if (!shard) {
      throw new Error(`Shard ${shardId} not found for case_id ${caseId}`);
    }
    return shard;
  }

  /**
   * Get global database (for users, auth, config)
   */
  getGlobalDb(): Sql {
    return this.globalDb;
  }

  /**
   * Execute query on all shards and merge results
   * Use for global queries like "list all cases"
   */
  async queryAllShards<T>(
    queryFn: (db: Sql) => Promise<T[]>
  ): Promise<T[]> {
    const results = await Promise.all(
      Array.from(this.shards.values()).map((shard) => queryFn(shard))
    );
    return results.flat();
  }

  /**
   * Get shard statistics
   */
  async getShardStats(): Promise<
    Array<{
      shardId: number;
      caseCount: number;
      evidenceCount: number;
      documentCount: number;
      diskUsage: string;
    }>
  > {
    const stats = await Promise.all(
      Array.from(this.shards.entries()).map(async ([shardId, shard]) => {
        const [caseCount] = await shard`SELECT COUNT(*) as count FROM cases`;
        const [evidenceCount] = await shard`SELECT COUNT(*) as count FROM evidence`;
        const [documentCount] = await shard`SELECT COUNT(*) as count FROM legal_documents`;
        const [diskUsage] = await shard`SELECT pg_database_size(current_database()) as size`;

        return {
          shardId,
          caseCount: Number(caseCount.count),
          evidenceCount: Number(evidenceCount.count),
          documentCount: Number(documentCount.count),
          diskUsage: `${(Number(diskUsage.size) / 1024 / 1024).toFixed(2)} MB`,
        };
      })
    );

    return stats;
  }

  /**
   * Close all connections
   */
  async disconnect(): Promise<void> {
    await this.globalDb.end();
    await Promise.all(Array.from(this.shards.values()).map((shard) => shard.end()));
  }
}

/**
 * Default shard configuration
 */
export const defaultShardConfig: ShardConfig = {
  global: {
    host: 'localhost',
    port: 5432,
    database: 'legal_ai_global',
    username: 'legal_admin',
    password: '123456',
  },
  shards: [
    {
      id: 0,
      host: 'localhost',
      port: 5433,
      database: 'legal_ai_shard_0',
      username: 'legal_admin',
      password: '123456',
    },
    {
      id: 1,
      host: 'localhost',
      port: 5434,
      database: 'legal_ai_shard_1',
      username: 'legal_admin',
      password: '123456',
    },
    {
      id: 2,
      host: 'localhost',
      port: 5435,
      database: 'legal_ai_shard_2',
      username: 'legal_admin',
      password: '123456',
    },
  ],
  shardCount: 3,
};

/**
 * Singleton instance
 */
let routerInstance: ShardRouter | null = null;

export function getShardRouter(): ShardRouter {
  if (!routerInstance) {
    routerInstance = new ShardRouter(defaultShardConfig);
  }
  return routerInstance;
}
```

---

#### **Step 3: Update API Routes to Use Shard Router**

Example: Update `/api/cases/[id]/+server.ts`:

```typescript
import { getShardRouter } from '$lib/server/db/shard-router';

export const GET: RequestHandler = async ({ params }) => {
  const caseId = params.id;
  const router = getShardRouter();

  // Route to appropriate shard based on case_id
  const shard = router.getShardForCase(caseId);

  // Query runs on the correct shard
  const caseData = await shard`
    SELECT * FROM cases WHERE id = ${caseId}
  `;

  return json({ success: true, case: caseData[0] });
};
```

Example: List all cases (cross-shard query):

```typescript
export const GET: RequestHandler = async () => {
  const router = getShardRouter();

  // Query all shards and merge results
  const allCases = await router.queryAllShards(async (shard) => {
    return await shard`SELECT * FROM cases ORDER BY created_at DESC LIMIT 100`;
  });

  // Sort merged results
  allCases.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());

  return json({ success: true, cases: allCases.slice(0, 100) });
};
```

---

#### **Step 4: Data Migration Strategy**

Create `sveltekit-frontend/scripts/migrate-to-shards.ts`:

```typescript
import { getShardRouter } from '../src/lib/server/db/shard-router';
import postgres from 'postgres';

async function migrateToShards() {
  console.log('📦 Starting data migration to shards...\n');

  // Connect to old single database
  const oldDb = postgres({
    host: 'localhost',
    port: 5432,
    database: 'legal_ai_db',
    username: 'legal_admin',
    password: '123456',
  });

  const router = getShardRouter();

  // Migrate cases table
  console.log('Migrating cases...');
  const cases = await oldDb`SELECT * FROM cases`;
  let migrated = 0;

  for (const caseData of cases) {
    const shard = router.getShardForCase(caseData.id);
    await shard`INSERT INTO cases ${shard(caseData)}`;
    migrated++;
    if (migrated % 100 === 0) {
      console.log(`  Migrated ${migrated}/${cases.length} cases`);
    }
  }
  console.log(`✅ Migrated ${migrated} cases\n`);

  // Migrate evidence table
  console.log('Migrating evidence...');
  const evidence = await oldDb`SELECT * FROM evidence`;
  migrated = 0;

  for (const evidenceData of evidence) {
    const shard = router.getShardForCase(evidenceData.case_id);
    await shard`INSERT INTO evidence ${shard(evidenceData)}`;
    migrated++;
    if (migrated % 100 === 0) {
      console.log(`  Migrated ${migrated}/${evidence.length} evidence records`);
    }
  }
  console.log(`✅ Migrated ${migrated} evidence records\n`);

  // Migrate global tables (users, auth) to global DB
  console.log('Migrating global tables...');
  const globalDb = router.getGlobalDb();

  const users = await oldDb`SELECT * FROM users`;
  for (const user of users) {
    await globalDb`INSERT INTO users ${globalDb(user)}`;
  }
  console.log(`✅ Migrated ${users.length} users\n`);

  await oldDb.end();
  await router.disconnect();

  console.log('✅ Migration complete!');
}

migrateToShards().catch(console.error);
```

**Run migration:**
```bash
npx tsx scripts/migrate-to-shards.ts
```

---

### **Deployment Checklist**

- [ ] Start sharded databases: `docker-compose -f docker-compose.sharded-db.yml up -d`
- [ ] Apply schema to all shards
- [ ] Run data migration: `npx tsx scripts/migrate-to-shards.ts`
- [ ] Verify data distribution: Check each shard has ~33% of cases
- [ ] Update environment variables with shard connection strings
- [ ] Deploy application with shard router
- [ ] Monitor query performance for 24 hours
- [ ] Test cross-shard queries (list all cases)
- [ ] Backup each shard independently

---

### **Monitoring & Alerts**

Add to Grafana dashboard:

```
Database Sharding
├── Shard 0:  12,543 cases  |  33.1%  ✅
├── Shard 1:  12,498 cases  |  33.0%  ✅
├── Shard 2:  12,889 cases  |  33.9%  ✅
└── Total:    37,930 cases

Shard Performance
├── Shard 0:  245 writes/sec  |  1,234 reads/sec
├── Shard 1:  238 writes/sec  |  1,189 reads/sec
├── Shard 2:  252 writes/sec  |  1,301 reads/sec
└── Total:    735 writes/sec  |  3,724 reads/sec (3x improvement)

Cross-Shard Queries
├── Fan-out queries:  45/min
├── Avg latency:      125ms (acceptable)
└── Result merges:    45/min
```

---

## 3️⃣ CONNECTION POOLING OPTIMIZATION

### **Why Optimize Connection Pooling?**
Current setup: Default connection pool (20 connections per shard)
- Under load: Connection exhaustion → 503 errors
- New connections: 50-100ms latency (TCP handshake + auth)
- Inefficient: Connections not reused optimally

**Optimized pooling provides:**
- 5x more connections (20 → 100 per shard)
- Connection reuse: <1ms vs 50ms for new connections
- Better load balancing across connections
- Automatic connection health checks

---

### **Architecture Design**

#### Current Architecture:
```
┌─────────────────┐
│  SvelteKit      │
│  (100 requests) │
└────────┬────────┘
         │
         ▼
┌─────────────────┐
│  Connection     │  ⚠️ Only 20 connections
│  Pool (default) │  ⚠️ Requests queue when pool full
└────────┬────────┘
         │
         ▼
┌─────────────────┐
│  PostgreSQL     │
└─────────────────┘
```

#### Tier 2 Architecture (Optimized Pooling):
```
┌─────────────────────────────────────────┐
│  SvelteKit Application                  │
│  (1000 concurrent requests)             │
└────────────────────┬────────────────────┘
                     │
                     ▼
         ┌───────────────────────┐
         │  PgBouncer             │  (Connection Pooler)
         │  Pool Mode: Session    │
         │  Max Connections: 500  │
         └───────────┬───────────┘
                     │
         ┌───────────┴────────────┬─────────────┐
         │                        │             │
         ▼                        ▼             ▼
┌─────────────────┐    ┌─────────────────┐    ┌─────────────────┐
│  Shard 0        │    │  Shard 1        │    │  Shard 2        │
│  Pool: 100 conn │    │  Pool: 100 conn │    │  Pool: 100 conn │
│  Max: 200       │    │  Max: 200       │    │  Max: 200       │
└─────────────────┘    └─────────────────┘    └─────────────────┘

Connection Flow:
1. Request arrives → Check pool for idle connection
2. If available → Reuse connection (<1ms)
3. If pool full → Wait in queue (max 5s)
4. If timeout → Return 503 error

Benefits:
✅ 500 pooled connections (vs 20 default)
✅ Connection reuse: <1ms latency
✅ Automatic health checks
✅ Load balancing across shards
```

---

### **Implementation Steps**

#### **Step 1: Add PgBouncer to Docker Compose**

Update `docker-compose.sharded-db.yml`:

```yaml
  # PgBouncer - Connection Pooler
  pgbouncer:
    image: pgbouncer/pgbouncer:1.21.0
    container_name: pgbouncer
    ports:
      - "6432:6432"
    environment:
      DATABASES: |
        legal_ai_global = host=postgres-global port=5432 dbname=legal_ai_global
        legal_ai_shard_0 = host=postgres-shard-0 port=5432 dbname=legal_ai_shard_0
        legal_ai_shard_1 = host=postgres-shard-1 port=5432 dbname=legal_ai_shard_1
        legal_ai_shard_2 = host=postgres-shard-2 port=5432 dbname=legal_ai_shard_2
      PGBOUNCER_AUTH_TYPE: md5
      PGBOUNCER_AUTH_FILE: /etc/pgbouncer/userlist.txt
      PGBOUNCER_POOL_MODE: session
      PGBOUNCER_MAX_CLIENT_CONN: 500
      PGBOUNCER_DEFAULT_POOL_SIZE: 100
      PGBOUNCER_RESERVE_POOL_SIZE: 50
      PGBOUNCER_STATS_USERS: legal_admin
    volumes:
      - ./pgbouncer/pgbouncer.ini:/etc/pgbouncer/pgbouncer.ini
      - ./pgbouncer/userlist.txt:/etc/pgbouncer/userlist.txt
    networks:
      - legal-ai-network
    depends_on:
      - postgres-global
      - postgres-shard-0
      - postgres-shard-1
      - postgres-shard-2
```

Create `sveltekit-frontend/pgbouncer/pgbouncer.ini`:

```ini
[databases]
legal_ai_global = host=postgres-global port=5432 dbname=legal_ai_global
legal_ai_shard_0 = host=postgres-shard-0 port=5432 dbname=legal_ai_shard_0
legal_ai_shard_1 = host=postgres-shard-1 port=5432 dbname=legal_ai_shard_1
legal_ai_shard_2 = host=postgres-shard-2 port=5432 dbname=legal_ai_shard_2

[pgbouncer]
listen_addr = 0.0.0.0
listen_port = 6432
auth_type = md5
auth_file = /etc/pgbouncer/userlist.txt

# Pool configuration
pool_mode = session
max_client_conn = 500
default_pool_size = 100
reserve_pool_size = 50
reserve_pool_timeout = 5

# Connection limits per database
max_db_connections = 200
max_user_connections = 200

# Timeouts
server_idle_timeout = 600
server_lifetime = 3600
server_connect_timeout = 15
query_timeout = 0
query_wait_timeout = 120
client_idle_timeout = 0
idle_transaction_timeout = 600

# Logging
log_connections = 1
log_disconnections = 1
log_pooler_errors = 1
stats_period = 60

# Admin
admin_users = legal_admin
stats_users = legal_admin
```

Create `sveltekit-frontend/pgbouncer/userlist.txt`:

```
"legal_admin" "md53175bce1d3201d16594cebf9d7eb3f9d"
```

**Generate password hash:**
```bash
echo -n "123456legal_admin" | md5sum
# Output: 3175bce1d3201d16594cebf9d7eb3f9d
```

---

#### **Step 2: Update Shard Router to Use PgBouncer**

Update `shard-router.ts`:

```typescript
export const defaultShardConfig: ShardConfig = {
  global: {
    host: 'localhost',
    port: 6432, // Changed from 5432 to PgBouncer port
    database: 'legal_ai_global',
    username: 'legal_admin',
    password: '123456',
  },
  shards: [
    {
      id: 0,
      host: 'localhost',
      port: 6432, // PgBouncer routes to correct backend
      database: 'legal_ai_shard_0',
      username: 'legal_admin',
      password: '123456',
    },
    {
      id: 1,
      host: 'localhost',
      port: 6432,
      database: 'legal_ai_shard_1',
      username: 'legal_admin',
      password: '123456',
    },
    {
      id: 2,
      host: 'localhost',
      port: 6432,
      database: 'legal_ai_shard_2',
      username: 'legal_admin',
      password: '123456',
    },
  ],
  shardCount: 3,
};
```

---

#### **Step 3: Configure Application Pool Settings**

Update postgres.js pool configuration in `shard-router.ts`:

```typescript
postgres({
  host: shard.host,
  port: shard.port,
  database: shard.database,
  username: shard.username,
  password: shard.password,
  max: 100, // Increased from 20 to 100
  idle_timeout: 30, // Close idle connections after 30s
  connect_timeout: 10, // Timeout if can't connect in 10s
  prepare: false, // Disable prepared statements for PgBouncer session mode
  onnotice: () => {}, // Suppress NOTICE messages
  connection: {
    application_name: 'legal-ai-sveltekit',
    statement_timeout: 30000, // 30s query timeout
  },
});
```

---

#### **Step 4: Monitor Pool Statistics**

Create `sveltekit-frontend/scripts/monitor-pool.ts`:

```typescript
import postgres from 'postgres';

async function monitorPool() {
  // Connect to PgBouncer stats database
  const pgbouncer = postgres({
    host: 'localhost',
    port: 6432,
    database: 'pgbouncer',
    username: 'legal_admin',
    password: '123456',
  });

  console.log('📊 PgBouncer Pool Statistics\n');

  // Get pool statistics
  const pools = await pgbouncer`SHOW POOLS`;
  console.log('Active Pools:');
  console.table(
    pools.map((p) => ({
      Database: p.database,
      User: p.user,
      'Active Conns': p.cl_active,
      'Waiting Conns': p.cl_waiting,
      'Server Conns': p.sv_active,
      'Idle Conns': p.sv_idle,
      'Max Wait (s)': p.maxwait,
    }))
  );

  // Get database statistics
  const stats = await pgbouncer`SHOW STATS`;
  console.log('\nDatabase Statistics:');
  console.table(
    stats.map((s) => ({
      Database: s.database,
      'Total Queries': s.total_xact_count,
      'Queries/sec': s.total_query_count,
      'Avg Query Time (ms)': (Number(s.total_query_time) / 1000).toFixed(2),
      'Bytes Received': `${(Number(s.total_received) / 1024 / 1024).toFixed(2)} MB`,
    }))
  );

  // Get server statistics
  const servers = await pgbouncer`SHOW SERVERS`;
  console.log('\nServer Connections:');
  console.table(
    servers.map((s) => ({
      Database: s.database,
      Host: s.host,
      Port: s.port,
      State: s.state,
      'Connect Time (s)': s.connect_time,
      'Request Time (s)': s.request_time,
    }))
  );

  await pgbouncer.end();
}

// Run every 10 seconds
setInterval(monitorPool, 10000);
monitorPool();
```

**Run monitoring:**
```bash
npx tsx scripts/monitor-pool.ts
```

---

### **Expected Performance Impact**

**Before (Default Pool):**
```
Max concurrent requests:  20 (limited by pool)
Connection wait time:     50-100ms (new connections)
Pool exhaustion:          Frequent under load
503 errors under load:    High (pool full)
```

**After (PgBouncer + Optimized Pool):**
```
Max concurrent requests:  500 (25x increase) ✅
Connection reuse time:    <1ms ✅
Pool exhaustion:          Rare (large pool + queueing) ✅
503 errors under load:    Minimal ✅
Throughput:               5x improvement ✅
```

---

## 4️⃣ READ REPLICAS FOR HEAVY SELECT WORKLOADS

### **Why Read Replicas?**
Current setup: All reads and writes hit same database
- Read:write ratio: 80:20 (typical for legal AI)
- Read queries slow down writes (resource contention)
- Cannot scale read throughput independently

**Read replicas provide:**
- Dedicated read servers (no write contention)
- 3x read throughput (1 master + 2 replicas)
- Geographic distribution for low latency
- Disaster recovery (replicas can be promoted)

---

### **Architecture Design**

#### Current Architecture:
```
┌─────────────────┐
│  SvelteKit App  │
└────────┬────────┘
         │
         ▼ (All queries)
┌─────────────────┐
│  PostgreSQL     │  ⚠️ Reads + Writes on same server
│  (Master)       │  ⚠️ Read contention slows writes
└─────────────────┘
```

#### Tier 2 Architecture (Read Replicas):
```
┌───────────────────────────────────────────────────┐
│              SvelteKit Application                │
└────────────────┬──────────────────────────────────┘
                 │
        ┌────────┴────────┐
        │  Query Router   │ (Determines read vs write)
        └────────┬────────┘
                 │
     ┌───────────┴───────────┬───────────────┐
     │                       │               │
     ▼ (Writes)              ▼ (Reads)       ▼ (Reads)
┌──────────────┐    ┌──────────────┐    ┌──────────────┐
│  Master      │───>│  Replica 1   │    │  Replica 2   │
│  Port: 5432  │    │  Port: 5442  │    │  Port: 5443  │
│              │    │              │    │              │
│  Writes only │    │  Reads only  │    │  Reads only  │
│  INSERT      │    │  SELECT      │    │  SELECT      │
│  UPDATE      │    │  (async rep) │    │  (async rep) │
│  DELETE      │    │              │    │              │
└──────────────┘    └──────────────┘    └──────────────┘
       │                   ▲                   ▲
       │ Replication       │ Replication       │
       └───────────────────┴───────────────────┘

Routing Logic:
- INSERT/UPDATE/DELETE → Master
- SELECT → Load balance across Replica 1 & 2
- Replication lag: <100ms (async streaming)
- Failover: Replica promotes to master if master fails
```

---

### **Implementation Steps**

#### **Step 1: Configure PostgreSQL Streaming Replication**

Update `docker-compose.sharded-db.yml`:

```yaml
  # Master Database (Shard 0 example)
  postgres-shard-0-master:
    image: pgvector/pgvector:pg17
    container_name: postgres-shard-0-master
    environment:
      POSTGRES_USER: legal_admin
      POSTGRES_PASSWORD: 123456
      POSTGRES_DB: legal_ai_shard_0
      POSTGRES_INITDB_ARGS: "-c wal_level=replica -c max_wal_senders=5 -c max_replication_slots=5"
    ports:
      - "5433:5432"
    volumes:
      - postgres-shard-0-master-data:/var/lib/postgresql/data
      - ./postgres/replication-setup.sh:/docker-entrypoint-initdb.d/replication-setup.sh
    networks:
      - legal-ai-network

  # Read Replica 1 (Shard 0)
  postgres-shard-0-replica-1:
    image: pgvector/pgvector:pg17
    container_name: postgres-shard-0-replica-1
    environment:
      POSTGRES_USER: legal_admin
      POSTGRES_PASSWORD: 123456
      PGUSER: replicator
      PGPASSWORD: replicator_password
    ports:
      - "5442:5432"
    command: |
      bash -c "
        until pg_basebackup -h postgres-shard-0-master -D /var/lib/postgresql/data -U replicator -v -P -W; do
          echo 'Waiting for master to be ready...'
          sleep 5
        done
        echo 'standby_mode = on' > /var/lib/postgresql/data/recovery.conf
        echo \"primary_conninfo = 'host=postgres-shard-0-master port=5432 user=replicator password=replicator_password'\" >> /var/lib/postgresql/data/recovery.conf
        postgres
      "
    volumes:
      - postgres-shard-0-replica-1-data:/var/lib/postgresql/data
    networks:
      - legal-ai-network
    depends_on:
      - postgres-shard-0-master

  # Read Replica 2 (Shard 0)
  postgres-shard-0-replica-2:
    image: pgvector/pgvector:pg17
    container_name: postgres-shard-0-replica-2
    environment:
      POSTGRES_USER: legal_admin
      POSTGRES_PASSWORD: 123456
      PGUSER: replicator
      PGPASSWORD: replicator_password
    ports:
      - "5443:5432"
    command: |
      bash -c "
        until pg_basebackup -h postgres-shard-0-master -D /var/lib/postgresql/data -U replicator -v -P -W; do
          echo 'Waiting for master to be ready...'
          sleep 5
        done
        echo 'standby_mode = on' > /var/lib/postgresql/data/recovery.conf
        echo \"primary_conninfo = 'host=postgres-shard-0-master port=5432 user=replicator password=replicator_password'\" >> /var/lib/postgresql/data/recovery.conf
        postgres
      "
    volumes:
      - postgres-shard-0-replica-2-data:/var/lib/postgresql/data
    networks:
      - legal-ai-network
    depends_on:
      - postgres-shard-0-master
```

Create `sveltekit-frontend/postgres/replication-setup.sh`:

```bash
#!/bin/bash
set -e

# Create replication user
psql -v ON_ERROR_STOP=1 --username "$POSTGRES_USER" --dbname "$POSTGRES_DB" <<-EOSQL
    CREATE USER replicator WITH REPLICATION ENCRYPTED PASSWORD 'replicator_password';
    GRANT CONNECT ON DATABASE $POSTGRES_DB TO replicator;
EOSQL

# Configure pg_hba.conf for replication
echo "host replication replicator 0.0.0.0/0 md5" >> /var/lib/postgresql/data/pg_hba.conf

# Reload PostgreSQL to apply changes
psql -U "$POSTGRES_USER" -d "$POSTGRES_DB" -c "SELECT pg_reload_conf();"

echo "✅ Replication user created and configured"
```

---

#### **Step 2: Create Read Replica Router**

Create `sveltekit-frontend/src/lib/server/db/replica-router.ts`:

```typescript
/**
 * Read Replica Router
 * Routes SELECT queries to read replicas, writes to master
 */
import postgres from 'postgres';
import type { Sql } from 'postgres';

export interface ReplicaConfig {
  master: {
    host: string;
    port: number;
    database: string;
    username: string;
    password: string;
  };
  replicas: Array<{
    id: number;
    host: string;
    port: number;
    database: string;
    username: string;
    password: string;
    weight: number; // For load balancing
  }>;
}

export class ReplicaRouter {
  private master: Sql;
  private replicas: Sql[] = [];
  private replicaWeights: number[] = [];
  private currentReplicaIndex = 0;
  private config: ReplicaConfig;

  // Metrics
  private metrics = {
    masterQueries: 0,
    replicaQueries: 0,
    replicationLag: 0,
  };

  constructor(config: ReplicaConfig) {
    this.config = config;

    // Initialize master connection
    this.master = postgres({
      host: config.master.host,
      port: config.master.port,
      database: config.master.database,
      username: config.master.username,
      password: config.master.password,
      max: 100,
    });

    // Initialize replica connections
    config.replicas.forEach((replica) => {
      this.replicas.push(
        postgres({
          host: replica.host,
          port: replica.port,
          database: replica.database,
          username: replica.username,
          password: replica.password,
          max: 100,
        })
      );
      this.replicaWeights.push(replica.weight);
    });

    console.log(`✅ Replica Router initialized with ${config.replicas.length} replicas`);

    // Start monitoring replication lag
    this.monitorReplicationLag();
  }

  /**
   * Route query to master (for writes) or replica (for reads)
   */
  route(queryType: 'read' | 'write'): Sql {
    if (queryType === 'write') {
      this.metrics.masterQueries++;
      return this.master;
    } else {
      this.metrics.replicaQueries++;
      return this.getNextReplica();
    }
  }

  /**
   * Get next replica using round-robin load balancing
   */
  private getNextReplica(): Sql {
    const replica = this.replicas[this.currentReplicaIndex];
    this.currentReplicaIndex = (this.currentReplicaIndex + 1) % this.replicas.length;
    return replica;
  }

  /**
   * Get master connection (for writes)
   */
  getMaster(): Sql {
    this.metrics.masterQueries++;
    return this.master;
  }

  /**
   * Get replica connection (for reads)
   */
  getReplica(): Sql {
    this.metrics.replicaQueries++;
    return this.getNextReplica();
  }

  /**
   * Monitor replication lag
   */
  private async monitorReplicationLag(): Promise<void> {
    setInterval(async () => {
      try {
        const [masterLSN] = await this.master`SELECT pg_current_wal_lsn() as lsn`;

        for (const replica of this.replicas) {
          const [replicaLSN] = await replica`SELECT pg_last_wal_replay_lsn() as lsn`;

          // Calculate lag in bytes (simplified)
          const masterLSNParts = masterLSN.lsn.split('/');
          const replicaLSNParts = replicaLSN.lsn.split('/');

          const masterBytes =
            parseInt(masterLSNParts[0], 16) * 0x100000000 + parseInt(masterLSNParts[1], 16);
          const replicaBytes =
            parseInt(replicaLSNParts[0], 16) * 0x100000000 + parseInt(replicaLSNParts[1], 16);

          const lagBytes = masterBytes - replicaBytes;
          this.metrics.replicationLag = Math.max(this.metrics.replicationLag, lagBytes);
        }
      } catch (error) {
        console.error('Failed to monitor replication lag:', error);
      }
    }, 10000); // Check every 10 seconds
  }

  /**
   * Get replication statistics
   */
  async getReplicationStats(): Promise<{
    masterQueries: number;
    replicaQueries: number;
    readWriteRatio: string;
    replicationLag: string;
    replicaStatus: Array<{
      id: number;
      host: string;
      port: number;
      status: 'streaming' | 'disconnected' | 'lag';
      lag: string;
    }>;
  }> {
    const replicaStatus = await Promise.all(
      this.config.replicas.map(async (replicaConfig, idx) => {
        try {
          const replica = this.replicas[idx];
          const [status] = await replica`SELECT pg_is_in_recovery() as in_recovery`;

          return {
            id: replicaConfig.id,
            host: replicaConfig.host,
            port: replicaConfig.port,
            status: status.in_recovery ? 'streaming' : 'disconnected',
            lag: `${(this.metrics.replicationLag / 1024).toFixed(2)} KB`,
          } as const;
        } catch (error) {
          return {
            id: replicaConfig.id,
            host: replicaConfig.host,
            port: replicaConfig.port,
            status: 'disconnected' as const,
            lag: 'N/A',
          };
        }
      })
    );

    const totalQueries = this.metrics.masterQueries + this.metrics.replicaQueries;
    const readWriteRatio =
      totalQueries > 0
        ? `${((this.metrics.replicaQueries / totalQueries) * 100).toFixed(1)}% reads`
        : 'N/A';

    return {
      masterQueries: this.metrics.masterQueries,
      replicaQueries: this.metrics.replicaQueries,
      readWriteRatio,
      replicationLag: `${(this.metrics.replicationLag / 1024).toFixed(2)} KB`,
      replicaStatus,
    };
  }

  /**
   * Close all connections
   */
  async disconnect(): Promise<void> {
    await this.master.end();
    await Promise.all(this.replicas.map((replica) => replica.end()));
  }
}

/**
 * Default replica configuration
 */
export const defaultReplicaConfig: ReplicaConfig = {
  master: {
    host: 'localhost',
    port: 5433,
    database: 'legal_ai_shard_0',
    username: 'legal_admin',
    password: '123456',
  },
  replicas: [
    {
      id: 1,
      host: 'localhost',
      port: 5442,
      database: 'legal_ai_shard_0',
      username: 'legal_admin',
      password: '123456',
      weight: 1,
    },
    {
      id: 2,
      host: 'localhost',
      port: 5443,
      database: 'legal_ai_shard_0',
      username: 'legal_admin',
      password: '123456',
      weight: 1,
    },
  ],
};

/**
 * Singleton instance
 */
let routerInstance: ReplicaRouter | null = null;

export function getReplicaRouter(): ReplicaRouter {
  if (!routerInstance) {
    routerInstance = new ReplicaRouter(defaultReplicaConfig);
  }
  return routerInstance;
}
```

---

#### **Step 3: Update API Routes to Use Read Replicas**

Example: `/api/cases/+server.ts` (read-only endpoint):

```typescript
import { getReplicaRouter } from '$lib/server/db/replica-router';

export const GET: RequestHandler = async () => {
  const router = getReplicaRouter();

  // Route to read replica (not master)
  const replica = router.getReplica();

  const cases = await replica`
    SELECT * FROM cases
    ORDER BY created_at DESC
    LIMIT 100
  `;

  return json({ success: true, cases });
};
```

Example: `/api/cases/[id]/+server.ts` (write endpoint):

```typescript
export const PUT: RequestHandler = async ({ params, request }) => {
  const router = getReplicaRouter();
  const caseId = params.id;
  const updates = await request.json();

  // Route to master (writes must go to master)
  const master = router.getMaster();

  const updated = await master`
    UPDATE cases
    SET ${master(updates)}
    WHERE id = ${caseId}
    RETURNING *
  `;

  return json({ success: true, case: updated[0] });
};
```

---

### **Expected Performance Impact**

**Before (Single Master):**
```
Read throughput:      1,000 queries/sec
Write throughput:     200 writes/sec
Read latency:         50ms (with write contention)
Write latency:        75ms (with read contention)
```

**After (Master + 2 Replicas):**
```
Read throughput:      3,000 queries/sec ✅ (3x improvement)
Write throughput:     500 writes/sec ✅ (2.5x improvement, no read contention)
Read latency:         15ms ✅ (3.3x faster, dedicated replicas)
Write latency:        30ms ✅ (2.5x faster, no read contention)
Replication lag:      <100ms ✅ (acceptable for legal AI)
```

---

## 📊 TIER 2 SUMMARY & DEPLOYMENT ROADMAP

### **Implementation Timeline**

```
Week 1: Foundation
├── Day 1-2: Redis Cluster setup + testing
│   └── Deliverable: 6-node Redis Cluster running
├── Day 3-4: Database sharding + migration
│   └── Deliverable: 3 shards with data migrated
└── Day 5: Connection pooling (PgBouncer)
    └── Deliverable: 500-connection pool operational

Week 2: Read Replicas + Optimization
├── Day 1-2: Read replica setup + replication
│   └── Deliverable: 2 replicas per shard streaming
├── Day 3: Replica router implementation
│   └── Deliverable: Read/write routing working
├── Day 4: Integration testing + benchmarks
│   └── Deliverable: Load tests showing 5-10x improvement
└── Day 5: Monitoring + documentation
    └── Deliverable: Grafana dashboards + runbooks

Week 3: Production Deployment
├── Day 1: Staging deployment + validation
├── Day 2: Blue-green production deployment
├── Day 3: Traffic migration (10% → 50% → 100%)
├── Day 4: Monitor + optimize
└── Day 5: Post-deployment review + documentation
```

---

### **Cost Analysis**

#### **Development Environment (Docker)**
```
Redis Cluster:         6 containers × 512MB = 3GB RAM
Sharded DBs:           4 databases × 2GB = 8GB RAM
Read Replicas:         6 replicas × 2GB = 12GB RAM
PgBouncer:             1 container × 512MB = 0.5GB RAM
Total:                 23.5GB RAM (can run on beefy laptop)
Cost:                  $0 (local development)
```

#### **Production (AWS)**
```
Redis Cluster (ElastiCache):
  3 masters (r7g.large):     $0.226/hour × 3 = $0.678/hour
  3 replicas (r7g.large):    $0.226/hour × 3 = $0.678/hour
  Subtotal:                  ~$1,000/month

PostgreSQL Shards (RDS):
  4 shards (db.r6g.xlarge):  $0.403/hour × 4 = $1.612/hour
  6 replicas (db.r6g.large): $0.201/hour × 6 = $1.206/hour
  Subtotal:                  ~$2,050/month

PgBouncer (EC2):
  1 instance (t3.small):     $0.0208/hour = $15/month

Total Monthly Cost:          ~$3,065/month

Expected Savings:
  - 5-10x capacity increase = can handle 10x users without scaling
  - Reduced need for vertical scaling (expensive)
  - Better resource utilization (fewer overprovisioned instances)

ROI:
  - Current cost for 100 users: ~$2,000/month
  - Tier 2 cost for 1000 users: ~$3,065/month
  - Alternative (vertical scaling): ~$8,000/month
  - Savings: ~$5,000/month (~60% cheaper)
```

#### **Alternative (Self-Hosted on AWS EC2)**
```
Redis Cluster:         6 × t3.medium = $180/month
PostgreSQL Shards:     10 × t3.xlarge = $1,200/month
PgBouncer:             1 × t3.small = $15/month
Total:                 ~$1,395/month (55% cheaper than managed)

Trade-offs:
  ✅ Cheaper
  ❌ Requires DevOps expertise
  ❌ More maintenance overhead
  ❌ No automatic failover (need to build)
```

---

### **Risk Assessment**

#### **Low Risk** 🟢
- ✅ Connection pooling (PgBouncer): Battle-tested, easy rollback
- ✅ Read replicas: Standard PostgreSQL feature, safe

#### **Medium Risk** 🟡
- ⚠️ Redis Cluster: Requires testing failover scenarios
- ⚠️ Database sharding: Data migration can be complex

#### **High Risk** 🔴
- ❌ Cross-shard queries: Performance unpredictable
- ❌ Replication lag: Eventual consistency may surprise users

**Mitigation Strategies:**
1. **Gradual Rollout:** Deploy to staging first, then 10% → 50% → 100% traffic
2. **Feature Flags:** Toggle optimizations on/off without redeployment
3. **Comprehensive Testing:** Load test every optimization before production
4. **Rollback Plan:** Keep old infrastructure running for 1 week after migration
5. **Monitoring:** Set up alerts for replication lag, pool exhaustion, shard imbalance

---

### **Success Metrics**

#### **Performance KPIs**
```
Metric                    Before    After (Goal)   Status
─────────────────────────────────────────────────────────
Concurrent users          100       1000+          🎯
p95 query latency         300ms     <100ms         🎯
Cache hit rate            60%       90%+           🎯
Write throughput          100/s     500/s          🎯
Read throughput           1000/s    3000/s         🎯
Redis availability        95%       99.9%          🎯
DB connection pool        20        500            🎯
Replication lag           N/A       <100ms         🎯
Cost per 1000 users       $8k/mo    $3k/mo         🎯
Deployment time           2 hours   <30 min        🎯
```

#### **Operational KPIs**
```
Metric                    Before    After (Goal)   Status
─────────────────────────────────────────────────────────
Incident response time    30 min    <5 min         🎯
Mean time to recovery     2 hours   <15 min        🎯
Deployment frequency      Weekly    Daily          🎯
Change failure rate       10%       <2%            🎯
Manual interventions/mo   20        <5             🎯
```

---

### **Deployment Checklist**

#### **Pre-Deployment**
- [ ] Run Tier 1 benchmarks and validate 30-40% improvement
- [ ] Set up staging environment identical to production
- [ ] Create rollback runbook
- [ ] Train team on new architecture
- [ ] Set up monitoring dashboards (Grafana)
- [ ] Configure alerts (PagerDuty/Slack)
- [ ] Load test staging environment
- [ ] Document connection strings and credentials

#### **Deployment Day**
- [ ] Deploy Redis Cluster to staging
- [ ] Migrate 10% traffic to Redis Cluster
- [ ] Monitor for 2 hours, check error rates
- [ ] Deploy database shards to staging
- [ ] Run data migration script
- [ ] Verify data integrity across shards
- [ ] Deploy PgBouncer connection pooling
- [ ] Deploy read replicas
- [ ] Configure replica routing
- [ ] Run full integration tests
- [ ] Migrate 50% traffic to new infrastructure
- [ ] Monitor for 24 hours
- [ ] Migrate 100% traffic
- [ ] Disable old infrastructure (keep for 1 week)

#### **Post-Deployment**
- [ ] Monitor performance metrics for 1 week
- [ ] Tune pool sizes based on actual usage
- [ ] Adjust shard distribution if imbalanced
- [ ] Document lessons learned
- [ ] Update runbooks with production experience
- [ ] Remove old infrastructure after 1 week
- [ ] Celebrate 5-10x capacity increase! 🎉

---

## 🎓 LEARNING RESOURCES

### **Redis Cluster**
- [Redis Cluster Tutorial](https://redis.io/docs/management/scaling/)
- [Redis Cluster Spec](https://redis.io/docs/reference/cluster-spec/)
- [ioredis Cluster Mode](https://github.com/redis/ioredis#cluster)

### **PostgreSQL Sharding**
- [PostgreSQL Sharding Strategies](https://www.postgresql.org/docs/current/ddl-partitioning.html)
- [Citus Data Sharding](https://docs.citusdata.com/en/stable/sharding/data_modeling.html)
- [Sharding Best Practices](https://aws.amazon.com/blogs/database/sharding-with-amazon-relational-database-service/)

### **Connection Pooling**
- [PgBouncer Documentation](https://www.pgbouncer.org/usage.html)
- [Connection Pooling Best Practices](https://wiki.postgresql.org/wiki/Number_Of_Database_Connections)

### **PostgreSQL Replication**
- [Streaming Replication](https://www.postgresql.org/docs/current/warm-standby.html#STREAMING-REPLICATION)
- [Replication Slots](https://www.postgresql.org/docs/current/warm-standby.html#STREAMING-REPLICATION-SLOTS)
- [Monitoring Replication](https://www.postgresql.org/docs/current/monitoring-stats.html)

---

## 📞 SUPPORT

### **Common Issues**

#### **Redis Cluster Not Forming**
```bash
# Check cluster status
docker exec -it redis-master-1 redis-cli -a redis -p 7001 cluster info

# If cluster_state:fail, reset and recreate
docker exec -it redis-master-1 redis-cli -a redis -p 7001 CLUSTER RESET HARD
# Then re-run cluster create command
```

#### **Sharding Imbalance**
```bash
# Check shard distribution
npx tsx scripts/check-shard-distribution.ts

# If imbalanced (>40% difference), re-shard:
npx tsx scripts/rebalance-shards.ts
```

#### **Replication Lag High (>1 second)**
```sql
-- Check replication lag on master
SELECT application_name, state, sync_state,
       pg_wal_lsn_diff(pg_current_wal_lsn(), replay_lsn) AS lag_bytes
FROM pg_stat_replication;

-- If lag is high, check network latency and disk I/O on replica
```

---

## ✅ FINAL RECOMMENDATION

**Proceed with Tier 2 IF:**
- ✅ Tier 1 benchmarks show expected 30-40% improvement
- ✅ Current system struggles with >100 concurrent users
- ✅ Planning to scale to 1000+ users in next 3-6 months
- ✅ Have DevOps resources available for 2-3 weeks

**Defer Tier 2 IF:**
- ⏳ Tier 1 not yet validated in production
- ⏳ <100 concurrent users (current capacity sufficient)
- ⏳ No scaling plans for next 6 months
- ⏳ Limited DevOps resources

**Alternative: Tier 2-Lite (2-day implementation):**
1. ✅ Connection pooling with PgBouncer (1 day)
2. ✅ 2 read replicas (no sharding) (1 day)
3. ⏭️ Skip: Redis Cluster (use single Redis with persistence)
4. ⏭️ Skip: Database sharding (vertical scale first)

This gives 3-5x capacity increase with much lower complexity.

---

**Report Generated:** 2025-01-17
**Planning Status:** ✅ Complete
**Ready for Implementation:** ⏳ After Tier 1 validation
**Expected Timeline:** 2-3 weeks
**Expected Impact:** 🎯 5-10x capacity increase

---

**Next Steps:**
1. Run Tier 1 benchmarks to validate implementation
2. If successful, choose Tier 2 or Tier 2-Lite based on scaling needs
3. Set up staging environment for Tier 2 testing
4. Begin with connection pooling (lowest risk, high impact)
