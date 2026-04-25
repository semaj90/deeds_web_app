import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { Pool } from 'pg';
import { drizzle } from 'drizzle-orm/node-postgres';
import * as schema from './schema';
import {
  getRouteMetadata,
  getAllRouteMetadata,
  createRouteMetadata,
  updateRouteMetadata,
  archiveRouteMetadata,
  getErrorClusters,
  getErrorClusterCount,
  createErrorCluster,
  resolveErrorCluster,
  getHealthEvents,
  getLatestHealthEvent,
  createHealthEvent,
  getErrorBrainAnalyses,
  createErrorBrainAnalysis,
  updateErrorBrainAnalysis,
  getErrorBrainPatches,
  createErrorBrainPatch,
  updateErrorBrainPatchVerification,
  getPatchSuccessRate,
  getInteractionLogs,
  createInteractionLog,
  calculateRouteHealth,
  getRouteStats,
} from './queries';

// ─────────────────────────────────────────────────────────
// Test Database Setup
// ─────────────────────────────────────────────────────────

let testPool: Pool;
let testDb: ReturnType<typeof drizzle>;

beforeAll(async () => {
  // Use test database
  testPool = new Pool({
    host: process.env.TEST_DB_HOST || 'localhost',
    port: parseInt(process.env.TEST_DB_PORT || '5432'),
    database: process.env.TEST_DB_NAME || 'legal_ai_test',
    user: process.env.TEST_DB_USER || 'postgres',
    password: process.env.TEST_DB_PASSWORD || 'postgres',
  });

  testDb = drizzle(testPool, { schema });

  // Create tables
  await testDb.execute(`
    CREATE TABLE IF NOT EXISTS route_metadata (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      route_id VARCHAR(255) UNIQUE NOT NULL,
      path VARCHAR(255) NOT NULL,
      kind VARCHAR(50) NOT NULL,
      "group" VARCHAR(100),
      status VARCHAR(50) NOT NULL DEFAULT 'healthy',
      priority INT DEFAULT 50,
      badges JSONB DEFAULT '[]'::jsonb,
      created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
      archived_at TIMESTAMP WITH TIME ZONE
    );

    CREATE TABLE IF NOT EXISTS error_cluster (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      route_id VARCHAR(255) NOT NULL,
      tool VARCHAR(100) NOT NULL,
      code VARCHAR(100) NOT NULL,
      message TEXT NOT NULL,
      severity VARCHAR(50) NOT NULL,
      count INT DEFAULT 1,
      file_path VARCHAR(255),
      raw_log_snippet TEXT,
      created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
      resolved_at TIMESTAMP WITH TIME ZONE,
      FOREIGN KEY (route_id) REFERENCES route_metadata(route_id)
    );

    CREATE TABLE IF NOT EXISTS route_health_event (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      route_id VARCHAR(255) NOT NULL,
      old_status VARCHAR(50),
      new_status VARCHAR(50) NOT NULL,
      reason VARCHAR(255),
      created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (route_id) REFERENCES route_metadata(route_id)
    );

    CREATE TABLE IF NOT EXISTS error_brain_analysis (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      route_id VARCHAR(255) NOT NULL,
      suggestions JSONB NOT NULL,
      selected_suggestion_index INT,
      phase VARCHAR(50),
      error_message TEXT,
      created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
      completed_at TIMESTAMP WITH TIME ZONE,
      FOREIGN KEY (route_id) REFERENCES route_metadata(route_id)
    );

    CREATE TABLE IF NOT EXISTS error_brain_patch (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      analysis_id UUID NOT NULL,
      route_id VARCHAR(255) NOT NULL,
      patch_content TEXT NOT NULL,
      applied_at TIMESTAMP WITH TIME ZONE,
      verification_status VARCHAR(50),
      verification_timestamp TIMESTAMP WITH TIME ZONE,
      verification_message TEXT,
      created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (analysis_id) REFERENCES error_brain_analysis(id),
      FOREIGN KEY (route_id) REFERENCES route_metadata(route_id)
    );

    CREATE TABLE IF NOT EXISTS route_interaction_log (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      route_id VARCHAR(255) NOT NULL,
      user_id VARCHAR(255),
      interaction_type VARCHAR(50) NOT NULL,
      metadata JSONB,
      created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (route_id) REFERENCES route_metadata(route_id)
    );
  `);
});

afterAll(async () => {
  // Drop test tables
  await testDb.execute(`
    DROP TABLE IF EXISTS route_interaction_log;
    DROP TABLE IF EXISTS error_brain_patch;
    DROP TABLE IF EXISTS error_brain_analysis;
    DROP TABLE IF EXISTS route_health_event;
    DROP TABLE IF EXISTS error_cluster;
    DROP TABLE IF EXISTS route_metadata;
  `);

  await testPool.end();
});

beforeEach(async () => {
  // Clean up tables before each test
  await testDb.execute('TRUNCATE TABLE route_interaction_log CASCADE');
  await testDb.execute('TRUNCATE TABLE error_brain_patch CASCADE');
  await testDb.execute('TRUNCATE TABLE error_brain_analysis CASCADE');
  await testDb.execute('TRUNCATE TABLE route_health_event CASCADE');
  await testDb.execute('TRUNCATE TABLE error_cluster CASCADE');
  await testDb.execute('TRUNCATE TABLE route_metadata CASCADE');
});

// ─────────────────────────────────────────────────────────
// Route Metadata Tests
// ─────────────────────────────────────────────────────────

describe('Route Metadata Queries', () => {
  it('should create route metadata', async () => {
    const metadata = await createRouteMetadata({
      routeId: '/cases/[id]/overview',
      path: '/cases/[id]/overview',
      kind: 'page',
      group: '(app)',
      status: 'healthy',
    });

    expect(metadata).toBeDefined();
    expect(metadata.routeId).toBe('/cases/[id]/overview');
    expect(metadata.status).toBe('healthy');
  });

  it('should get route metadata by ID', async () => {
    await createRouteMetadata({
      routeId: '/test-route',
      path: '/test-route',
      kind: 'page',
    });

    const metadata = await getRouteMetadata('/test-route');
    expect(metadata).toBeDefined();
    expect(metadata?.routeId).toBe('/test-route');
  });

  it('should update route metadata', async () => {
    await createRouteMetadata({
      routeId: '/test-route',
      path: '/test-route',
      kind: 'page',
      status: 'healthy',
    });

    const updated = await updateRouteMetadata('/test-route', {
      status: 'broken',
    });

    expect(updated?.status).toBe('broken');
  });

  it('should archive route metadata', async () => {
    await createRouteMetadata({
      routeId: '/test-route',
      path: '/test-route',
      kind: 'page',
    });

    const archived = await archiveRouteMetadata('/test-route');
    expect(archived?.archivedAt).toBeDefined();
  });

  it('should get all non-archived routes', async () => {
    await createRouteMetadata({
      routeId: '/route-1',
      path: '/route-1',
      kind: 'page',
    });

    await createRouteMetadata({
      routeId: '/route-2',
      path: '/route-2',
      kind: 'page',
    });

    await archiveRouteMetadata('/route-2');

    const routes = await getAllRouteMetadata(false);
    expect(routes).toHaveLength(1);
    expect(routes[0].routeId).toBe('/route-1');
  });
});

// ─────────────────────────────────────────────────────────
// Error Cluster Tests
// ─────────────────────────────────────────────────────────

describe('Error Cluster Queries', () => {
  beforeEach(async () => {
    await createRouteMetadata({
      routeId: '/test-route',
      path: '/test-route',
      kind: 'page',
    });
  });

  it('should create error cluster', async () => {
    const cluster = await createErrorCluster({
      routeId: '/test-route',
      tool: 'tsc',
      code: 'TS2345',
      message: 'Argument of type X is not assignable to parameter of type Y',
      severity: 'error',
    });

    expect(cluster).toBeDefined();
    expect(cluster.severity).toBe('error');
  });

  it('should get error clusters for route', async () => {
    await createErrorCluster({
      routeId: '/test-route',
      tool: 'tsc',
      code: 'TS2345',
      message: 'Type error',
      severity: 'error',
    });

    await createErrorCluster({
      routeId: '/test-route',
      tool: 'svelte-check',
      code: 'import-type',
      message: 'Import error',
      severity: 'warning',
    });

    const clusters = await getErrorClusters('/test-route');
    expect(clusters).toHaveLength(2);
    // Should be ordered by severity (error first)
    expect(clusters[0].severity).toBe('error');
  });

  it('should count unresolved error clusters', async () => {
    await createErrorCluster({
      routeId: '/test-route',
      tool: 'tsc',
      code: 'TS2345',
      message: 'Type error',
      severity: 'error',
    });

    const count = await getErrorClusterCount('/test-route', false);
    expect(count).toBe(1);
  });

  it('should resolve error cluster', async () => {
    const cluster = await createErrorCluster({
      routeId: '/test-route',
      tool: 'tsc',
      code: 'TS2345',
      message: 'Type error',
      severity: 'error',
    });

    const resolved = await resolveErrorCluster(cluster.id);
    expect(resolved?.resolvedAt).toBeDefined();
  });
});

// ─────────────────────────────────────────────────────────
// Route Health Tests
// ─────────────────────────────────────────────────────────

describe('Route Health Queries', () => {
  beforeEach(async () => {
    await createRouteMetadata({
      routeId: '/test-route',
      path: '/test-route',
      kind: 'page',
    });
  });

  it('should create health event', async () => {
    const event = await createHealthEvent({
      routeId: '/test-route',
      oldStatus: 'healthy',
      newStatus: 'broken',
      reason: 'error_cluster_created',
    });

    expect(event).toBeDefined();
    expect(event.newStatus).toBe('broken');
  });

  it('should get latest health event', async () => {
    await createHealthEvent({
      routeId: '/test-route',
      oldStatus: 'healthy',
      newStatus: 'flaky',
    });

    await createHealthEvent({
      routeId: '/test-route',
      oldStatus: 'flaky',
      newStatus: 'broken',
    });

    const latest = await getLatestHealthEvent('/test-route');
    expect(latest?.newStatus).toBe('broken');
  });
});

// ─────────────────────────────────────────────────────────
// Interaction Log Tests
// ─────────────────────────────────────────────────────────

describe('Interaction Log Queries', () => {
  beforeEach(async () => {
    await createRouteMetadata({
      routeId: '/test-route',
      path: '/test-route',
      kind: 'page',
    });
  });

  it('should create interaction log', async () => {
    const log = await createInteractionLog({
      routeId: '/test-route',
      interactionType: 'view',
      userId: 'user-123',
    });

    expect(log).toBeDefined();
    expect(log.interactionType).toBe('view');
  });

  it('should get interaction logs', async () => {
    await createInteractionLog({
      routeId: '/test-route',
      interactionType: 'view',
    });

    await createInteractionLog({
      routeId: '/test-route',
      interactionType: 'navigate',
    });

    const logs = await getInteractionLogs('/test-route');
    expect(logs).toHaveLength(2);
  });
});

// ─────────────────────────────────────────────────────────
// Utility Tests
// ─────────────────────────────────────────────────────────

describe('Utility Queries', () => {
  beforeEach(async () => {
    await createRouteMetadata({
      routeId: '/test-route',
      path: '/test-route',
      kind: 'page',
    });
  });

  it('should calculate route health as healthy', async () => {
    const health = await calculateRouteHealth('/test-route');
    expect(health).toBe('healthy');
  });

  it('should calculate route health as broken', async () => {
    await createErrorCluster({
      routeId: '/test-route',
      tool: 'tsc',
      code: 'TS2345',
      message: 'Type error',
      severity: 'error',
    });

    const health = await calculateRouteHealth('/test-route');
    expect(health).toBe('broken');
  });

  it('should calculate route health as flaky', async () => {
    await createErrorCluster({
      routeId: '/test-route',
      tool: 'tsc',
      code: 'TS2345',
      message: 'Type warning',
      severity: 'warning',
    });

    const health = await calculateRouteHealth('/test-route');
    expect(health).toBe('flaky');
  });

  it('should get route stats', async () => {
    await createErrorCluster({
      routeId: '/test-route',
      tool: 'tsc',
      code: 'TS2345',
      message: 'Type error',
      severity: 'error',
    });

    const stats = await getRouteStats('/test-route');
    expect(stats.errorCount).toBe(1);
    expect(stats.warningCount).toBe(0);
  });
});
