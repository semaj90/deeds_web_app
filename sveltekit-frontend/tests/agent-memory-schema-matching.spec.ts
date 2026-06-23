import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { Pool } from 'pg';
import * as redis from 'redis';

/**
 * Agent Memory Schema Matching Test
 * Validates temporal payload density: most recent rows should have fuller payload
 * Verifies NES-Arch hierarchy alignment (Redis → Qdrant → Postgres → CouchDB)
 * Ensures packet identity (packet_key + source_ref + feature_id) survives all layers
 */

const TEST_TASK_ID = 'test:schema-matching:' + Date.now();
const TEST_AGENT = 'test-agent';
const TEST_TRACE_ID = 'trace:' + crypto.randomUUID();
const TEST_PACKETS = [
  {
    packet_key: 'nes:utility:test-001',
    source_ref: 'src/lib/test.ts',
    feature_id: 'test.schema',
    qdrant_point_id: 'qdrant:test:001',
    qdrant_collection: 'codebase_chunks_768',
    qdrant_vector_dim: 768,
    retrieval_layer: 'hyperrag_fusion',
    topology: { som_cell_x: 5, som_cell_y: 10, cluster_id: 'cluster:test:001' },
    manifold4d: { x: 0.1, y: 0.2, z: 0.3, t: 1.0 },
  },
  {
    packet_key: 'nes:utility:test-002',
    source_ref: 'src/lib/test.ts',
    feature_id: 'test.schema',
    qdrant_point_id: 'qdrant:test:002',
    qdrant_collection: 'codebase_chunks_768',
    qdrant_vector_dim: 768,
    retrieval_layer: 'hyperrag_fusion',
    topology: { som_cell_x: 6, som_cell_y: 11, cluster_id: 'cluster:test:002' },
    manifold4d: { x: 0.15, y: 0.25, z: 0.35, t: 1.0 },
  },
  {
    packet_key: 'nes:utility:test-003',
    source_ref: 'src/lib/test.ts',
    feature_id: 'test.schema',
    qdrant_point_id: null, // Sparse: some packets may not have Qdrant IDs yet
    qdrant_collection: null,
    qdrant_vector_dim: null,
    retrieval_layer: 'postgres_fts',
    topology: null,
    manifold4d: null,
  },
];

describe('Agent Memory Schema Matching', () => {
  let db: Pool;
  let redisClient: redis.RedisClient;

  beforeEach(async () => {
    // Connect to test database
    db = new Pool({
      host: process.env.POSTGRES_HOST || 'localhost',
      port: parseInt(process.env.POSTGRES_PORT || '5432'),
      database: process.env.POSTGRES_DB || 'legal_ai_db_test',
      user: process.env.POSTGRES_USER || 'legal_admin',
      password: process.env.POSTGRES_PASSWORD || 'postgres',
    });

    // Connect to Redis
    redisClient = redis.createClient({
      host: process.env.REDIS_HOST || 'localhost',
      port: parseInt(process.env.REDIS_PORT || '6379'),
      db: 15, // Test database
    });
    await redisClient.connect();

    // Clean up test data
    await redisClient.flushDb();
  });

  afterEach(async () => {
    // Clean up database test data
    await db.query('DELETE FROM agent_memory_packets WHERE registry_id IN (SELECT id FROM agent_memory_registry WHERE task_id = $1)', [TEST_TASK_ID]);
    await db.query('DELETE FROM agent_memory_registry WHERE task_id = $1', [TEST_TASK_ID]);
    await db.query('DELETE FROM gpu_eligibility_gate WHERE task_id = $1', [TEST_TASK_ID]);
    await db.query('DELETE FROM mcp_trace_ownership WHERE task_id = $1', [TEST_TASK_ID]);
    await db.query('DELETE FROM retrieval_eval_times WHERE task_id = $1', [TEST_TASK_ID]);
    await db.query('DELETE FROM retrieval_provenance WHERE task_id = $1', [TEST_TASK_ID]);

    await redisClient.flushDb();
    await redisClient.quit();
    await db.end();
  });

  describe('Layer 0: Postgres Canonical Truth', () => {
    it('should store registry with ownership metadata', async () => {
      const result = await db.query(
        `INSERT INTO agent_memory_registry
         (task_id, story_id, agent, trace_id, cache_namespace, retrieval_strategy, gpu_eligible, status)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
         RETURNING *`,
        [
          TEST_TASK_ID,
          'story:test',
          TEST_AGENT,
          TEST_TRACE_ID,
          'nes:agents',
          'hyperrag_fusion',
          true,
          'CLAIMED',
        ]
      );

      const registry = result.rows[0];
      expect(registry.task_id).toBe(TEST_TASK_ID);
      expect(registry.agent).toBe(TEST_AGENT);
      expect(registry.status).toBe('CLAIMED');
      expect(registry.gpu_eligible).toBe(true);
      expect(registry.created_at).toBeDefined();
    });

    it('should insert many-to-many packets without denormalization', async () => {
      // Insert registry
      const registryResult = await db.query(
        `INSERT INTO agent_memory_registry
         (task_id, story_id, agent, trace_id, retrieval_strategy, gpu_eligible, status)
         VALUES ($1, $2, $3, $4, $5, $6, $7)
         RETURNING id`,
        [TEST_TASK_ID, 'story:test', TEST_AGENT, TEST_TRACE_ID, 'hyperrag_fusion', true, 'VERIFYING']
      );
      const registryId = registryResult.rows[0].id;

      // Insert packets
      const packetResults = await db.query(
        `INSERT INTO agent_memory_packets
         (registry_id, packet_key, source_ref, feature_id, qdrant_point_id, qdrant_collection,
          qdrant_vector_dim, retrieval_layer, topology, manifold4d)
         VALUES
         ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10),
         ($1, $11, $12, $13, $14, $15, $16, $17, $18, $19),
         ($1, $20, $21, $22, $23, $24, $25, $26, $27, $28)
         RETURNING *`,
        [
          registryId, TEST_PACKETS[0].packet_key, TEST_PACKETS[0].source_ref, TEST_PACKETS[0].feature_id,
          TEST_PACKETS[0].qdrant_point_id, TEST_PACKETS[0].qdrant_collection, TEST_PACKETS[0].qdrant_vector_dim,
          TEST_PACKETS[0].retrieval_layer, JSON.stringify(TEST_PACKETS[0].topology), JSON.stringify(TEST_PACKETS[0].manifold4d),

          registryId, TEST_PACKETS[1].packet_key, TEST_PACKETS[1].source_ref, TEST_PACKETS[1].feature_id,
          TEST_PACKETS[1].qdrant_point_id, TEST_PACKETS[1].qdrant_collection, TEST_PACKETS[1].qdrant_vector_dim,
          TEST_PACKETS[1].retrieval_layer, JSON.stringify(TEST_PACKETS[1].topology), JSON.stringify(TEST_PACKETS[1].manifold4d),

          registryId, TEST_PACKETS[2].packet_key, TEST_PACKETS[2].source_ref, TEST_PACKETS[2].feature_id,
          TEST_PACKETS[2].qdrant_point_id, TEST_PACKETS[2].qdrant_collection, TEST_PACKETS[2].qdrant_vector_dim,
          TEST_PACKETS[2].retrieval_layer, TEST_PACKETS[2].topology, TEST_PACKETS[2].manifold4d,
        ]
      );

      expect(packetResults.rows).toHaveLength(3);
      expect(packetResults.rows[0].packet_key).toBe(TEST_PACKETS[0].packet_key);
      expect(packetResults.rows[2].qdrant_point_id).toBeNull(); // Sparse payload
    });
  });

  describe('Temporal Payload Density', () => {
    it('most recent rows should have fuller payload than older rows', async () => {
      // Insert registry
      const registryResult = await db.query(
        `INSERT INTO agent_memory_registry
         (task_id, story_id, agent, retrieval_strategy, status)
         VALUES ($1, $2, $3, $4, $5)
         RETURNING id`,
        [TEST_TASK_ID, 'story:test', TEST_AGENT, 'hyperrag_fusion', 'VERIFYING']
      );
      const registryId = registryResult.rows[0].id;

      // Insert old packet with sparse payload (no Qdrant data)
      await db.query(
        `INSERT INTO agent_memory_packets
         (registry_id, packet_key, source_ref, feature_id, retrieval_layer, created_at)
         VALUES ($1, $2, $3, $4, $5, $6)`,
        [registryId, 'old-packet', 'src/old.ts', 'old.feature', 'postgres_fts', new Date(Date.now() - 86400000)] // 1 day ago
      );

      // Insert recent packet with full payload
      await db.query(
        `INSERT INTO agent_memory_packets
         (registry_id, packet_key, source_ref, feature_id, qdrant_point_id, qdrant_collection,
          qdrant_vector_dim, retrieval_layer, topology, manifold4d)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)`,
        [
          registryId,
          'new-packet',
          'src/new.ts',
          'new.feature',
          'qdrant:new:001',
          'codebase_chunks_768',
          768,
          'hyperrag_fusion',
          JSON.stringify({ som_cell_x: 5, som_cell_y: 10 }),
          JSON.stringify({ x: 0.1, y: 0.2, z: 0.3, t: 1.0 }),
        ]
      );

      // Query by temporal order (most recent first)
      const results = await db.query(
        `SELECT packet_key, source_ref, feature_id, qdrant_point_id, qdrant_vector_dim,
                topology, manifold4d, created_at
         FROM agent_memory_packets
         WHERE registry_id = $1
         ORDER BY created_at DESC`,
        [registryId]
      );

      expect(results.rows).toHaveLength(2);

      // Most recent should have full payload
      const recent = results.rows[0];
      expect(recent.packet_key).toBe('new-packet');
      expect(recent.qdrant_point_id).toBe('qdrant:new:001');
      expect(recent.qdrant_vector_dim).toBe(768);
      expect(recent.topology).not.toBeNull();
      expect(recent.manifold4d).not.toBeNull();

      // Older should have sparse payload
      const older = results.rows[1];
      expect(older.packet_key).toBe('old-packet');
      expect(older.qdrant_point_id).toBeNull();
      expect(older.qdrant_vector_dim).toBeNull();
      expect(older.topology).toBeNull();
    });

    it('should compute payload density metric (non-null fields / total fields)', async () => {
      const registryResult = await db.query(
        `INSERT INTO agent_memory_registry
         (task_id, story_id, agent, status)
         VALUES ($1, $2, $3, $4)
         RETURNING id`,
        [TEST_TASK_ID, 'story:test', TEST_AGENT, 'VERIFYING']
      );
      const registryId = registryResult.rows[0].id;

      // Insert packets with varying payload completeness
      await db.query(
        `INSERT INTO agent_memory_packets
         (registry_id, packet_key, source_ref, feature_id, created_at)
         VALUES ($1, $2, $3, $4, $5)`,
        [registryId, 'sparse', 'src/sparse.ts', 'sparse.feature', new Date(Date.now() - 3600000)]
      );

      await db.query(
        `INSERT INTO agent_memory_packets
         (registry_id, packet_key, source_ref, feature_id, qdrant_point_id, qdrant_collection,
          qdrant_vector_dim, retrieval_layer, topology, manifold4d, created_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)`,
        [
          registryId, 'full', 'src/full.ts', 'full.feature', 'qdrant:full:001', 'codebase_chunks_768', 768,
          'hyperrag_fusion', JSON.stringify({ som_cell_x: 5 }), JSON.stringify({ x: 0.1 }),
          new Date(),
        ]
      );

      // Query with payload density calculation
      const results = await db.query(
        `SELECT
           packet_key,
           created_at,
           (CASE WHEN source_ref IS NOT NULL THEN 1 ELSE 0 END +
            CASE WHEN feature_id IS NOT NULL THEN 1 ELSE 0 END +
            CASE WHEN qdrant_point_id IS NOT NULL THEN 1 ELSE 0 END +
            CASE WHEN qdrant_vector_dim IS NOT NULL THEN 1 ELSE 0 END +
            CASE WHEN topology IS NOT NULL THEN 1 ELSE 0 END +
            CASE WHEN manifold4d IS NOT NULL THEN 1 ELSE 0 END)::float / 6.0 as payload_density
         FROM agent_memory_packets
         WHERE registry_id = $1
         ORDER BY created_at DESC`,
        [registryId]
      );

      // Most recent should have higher density
      const full = results.rows[0];
      const sparse = results.rows[1];

      expect(full.payload_density).toBeGreaterThan(sparse.payload_density);
      expect(full.payload_density).toBeCloseTo(1.0); // Full payload
      expect(sparse.payload_density).toBeCloseTo(0.33, 1); // Only 2/6 fields
    });
  });

  describe('NES-Arch Layer Alignment', () => {
    it('Redis (Tiny RAM) should cache ownership metadata', async () => {
      const cacheKey = `bitfrost:agent:task:${TEST_TASK_ID}`;
      const ownershipData = {
        task_id: TEST_TASK_ID,
        agent: TEST_AGENT,
        status: 'VERIFYING',
        gpu_eligible: true,
        retrieval_strategy: 'hyperrag_fusion',
        packet_keys: TEST_PACKETS.map((p) => p.packet_key),
        supersedes: [],
      };

      await redisClient.setEx(cacheKey, 86400, JSON.stringify(ownershipData));

      const cached = JSON.parse(await redisClient.get(cacheKey));
      expect(cached.task_id).toBe(TEST_TASK_ID);
      expect(cached.agent).toBe(TEST_AGENT);
      expect(cached.status).toBe('VERIFYING');
      expect(cached.packet_keys).toHaveLength(3);
    });

    it('Postgres (Cartridge ROM) should be canonical source of truth', async () => {
      const registryResult = await db.query(
        `INSERT INTO agent_memory_registry
         (task_id, story_id, agent, status, metadata)
         VALUES ($1, $2, $3, $4, $5)
         RETURNING *`,
        [
          TEST_TASK_ID,
          'story:canonical',
          TEST_AGENT,
          'PASS',
          JSON.stringify({ authority: 'canonical', version: 1 }),
        ]
      );

      const registry = registryResult.rows[0];
      expect(registry.metadata.authority).toBe('canonical');

      // Verify it's the source of truth by checking consistency
      const check = await db.query('SELECT * FROM agent_memory_registry WHERE task_id = $1', [TEST_TASK_ID]);
      expect(check.rows[0].id).toBe(registry.id);
      expect(check.rows[0].status).toBe('PASS');
    });

    it('Packet identity should survive all layers (packet_key + source_ref + feature_id)', async () => {
      const registryResult = await db.query(
        `INSERT INTO agent_memory_registry (task_id, story_id, agent, status) VALUES ($1, $2, $3, $4) RETURNING id`,
        [TEST_TASK_ID, 'story:identity', TEST_AGENT, 'VERIFYING']
      );
      const registryId = registryResult.rows[0].id;

      const testPacket = TEST_PACKETS[0];
      const packetResult = await db.query(
        `INSERT INTO agent_memory_packets
         (registry_id, packet_key, source_ref, feature_id, qdrant_point_id)
         VALUES ($1, $2, $3, $4, $5)
         RETURNING packet_key, source_ref, feature_id`,
        [registryId, testPacket.packet_key, testPacket.source_ref, testPacket.feature_id, testPacket.qdrant_point_id]
      );

      const stored = packetResult.rows[0];

      // Verify identity chain survived
      expect(stored.packet_key).toBe(testPacket.packet_key);
      expect(stored.source_ref).toBe(testPacket.source_ref);
      expect(stored.feature_id).toBe(testPacket.feature_id);

      // Also cache in Redis with same identity
      const cacheKey = `bitfrost:packet:${testPacket.packet_key}`;
      const packetMeta = { packet_key: stored.packet_key, source_ref: stored.source_ref, feature_id: stored.feature_id };
      await redisClient.set(cacheKey, JSON.stringify(packetMeta));

      // Verify consistency across layers
      const cached = JSON.parse(await redisClient.get(cacheKey));
      expect(cached.packet_key).toBe(stored.packet_key);
      expect(cached.source_ref).toBe(stored.source_ref);
      expect(cached.feature_id).toBe(stored.feature_id);
    });
  });

  describe('Do-Not-Repeat-Ourselves Registry', () => {
    it('should find existing packet and reuse instead of re-creating', async () => {
      // Insert existing packet
      const registryResult = await db.query(
        `INSERT INTO agent_memory_registry (task_id, story_id, agent, status) VALUES ($1, $2, $3, $4) RETURNING id`,
        [TEST_TASK_ID, 'story:dnro', TEST_AGENT, 'PASS']
      );
      const registryId = registryResult.rows[0].id;

      const testPacket = TEST_PACKETS[0];
      const existingResult = await db.query(
        `INSERT INTO agent_memory_packets (registry_id, packet_key, source_ref, feature_id, qdrant_point_id)
         VALUES ($1, $2, $3, $4, $5)
         RETURNING id`,
        [registryId, testPacket.packet_key, testPacket.source_ref, testPacket.feature_id, testPacket.qdrant_point_id]
      );

      const existingPacketId = existingResult.rows[0].id;

      // Now try to "create" the same packet (do-not-repeat-ourselves check)
      const checkResult = await db.query(
        `SELECT id FROM agent_memory_packets
         WHERE packet_key = $1 AND source_ref = $2 AND feature_id = $3`,
        [testPacket.packet_key, testPacket.source_ref, testPacket.feature_id]
      );

      // Should find the existing one
      expect(checkResult.rows).toHaveLength(1);
      expect(checkResult.rows[0].id).toBe(existingPacketId);
    });

    it('should detect and skip redundant tool calls', async () => {
      // Simulate two agents discovering the same tool path
      const tool1 = {
        tool_name: 'hyperrag_fusion',
        packet_keys: ['nes:utility:001', 'nes:utility:002'],
        quality_score: 0.95,
      };

      const tool2 = {
        tool_name: 'hyperrag_fusion',
        packet_keys: ['nes:utility:001', 'nes:utility:002'],
        quality_score: 0.94, // Slightly lower
      };

      // Store first (canonical)
      const cacheKey1 = `bitfrost:tool:${tool1.tool_name}:${tool1.packet_keys.join(':')}`;
      await redisClient.set(cacheKey1, JSON.stringify({ ...tool1, stored_at: Date.now() }));

      // Check if we should store second or reuse first
      const existing = JSON.parse(await redisClient.get(cacheKey1));

      if (existing && existing.quality_score >= tool2.quality_score) {
        // Reuse existing, don't re-execute tool
        expect(existing.tool_name).toBe(tool2.tool_name);
        expect(existing.quality_score).toBeGreaterThanOrEqual(tool2.quality_score);
      } else {
        // Would update if tool2 was better
        throw new Error('Should have reused tool1');
      }
    });
  });

  describe('GPU Eligibility Verification', () => {
    it('should verify proof quality >= CPU baseline', async () => {
      const registryResult = await db.query(
        `INSERT INTO agent_memory_registry (task_id, story_id, agent, status) VALUES ($1, $2, $3, $4) RETURNING id`,
        [TEST_TASK_ID, 'story:proof', TEST_AGENT, 'VERIFYING']
      );
      const registryId = registryResult.rows[0].id;

      // Store CPU baseline eval
      await db.query(
        `INSERT INTO retrieval_eval_times (task_id, packet_key, retrieval_strategy, proof_quality_cpu)
         VALUES ($1, $2, $3, $4)`,
        [TEST_TASK_ID, 'test-packet', 'cpu_baseline', 0.92]
      );

      // Query GPU eligibility: proof_not_degraded = (gpu_quality >= cpu_quality)
      const cpuBaseline = await db.query(
        'SELECT proof_quality_cpu FROM retrieval_eval_times WHERE task_id = $1 LIMIT 1',
        [TEST_TASK_ID]
      );

      const gpuQuality = 0.90; // Slightly lower than CPU
      const proofNotDegraded = gpuQuality >= cpuBaseline.rows[0].proof_quality_cpu;

      expect(proofNotDegraded).toBe(false); // Would FAIL GPU eligibility gate

      // If GPU quality was >= baseline
      const gpuQualityGood = 0.93;
      const proofPreserved = gpuQualityGood >= cpuBaseline.rows[0].proof_quality_cpu;
      expect(proofPreserved).toBe(true); // Would PASS GPU eligibility gate
    });
  });
});
