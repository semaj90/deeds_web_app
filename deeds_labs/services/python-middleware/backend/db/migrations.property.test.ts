/**
 * Property-Based Tests for Database Migrations
 *
 * Tests Property 15: Migration Table Creation
 * Validates: Requirements 6.1
 *
 * Uses fast-check to validate migration behavior with randomized inputs.
 */

import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import * as fc from 'fast-check';
import { Pool } from 'pg';
import { drizzle } from 'drizzle-orm/node-postgres';
import * as schema from './schema';

// ─────────────────────────────────────────────────────────
// Test Database Setup
// ─────────────────────────────────────────────────────────

let testPool: Pool;
let testDb: ReturnType<typeof drizzle>;

const REQUIRED_TABLES = [
  'route_metadata',
  'error_cluster',
  'route_health_event',
  'error_brain_analysis',
  'error_brain_patch',
  'route_interaction_log',
  'error_cluster_archive',
  'route_interaction_log_archive',
  'route_health_event_archive'
];

const REQUIRED_INDEXES = [
  'idx_route_id_unique',
  'idx_status',
  'idx_archived_at',
  'idx_error_route_id',
  'idx_error_severity',
  'idx_error_created_at',
  'idx_error_resolved_at',
  'idx_health_route_id',
  'idx_health_created_at',
  'idx_analysis_route_id',
  'idx_analysis_created_at',
  'idx_patch_analysis_id',
  'idx_patch_route_id',
  'idx_patch_verification_status',
  'idx_interaction_route_id',
  'idx_interaction_user_id',
  'idx_interaction_created_at'
];

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
});

afterAll(async () => {
  await testPool.end();
});

// ─────────────────────────────────────────────────────────
// Property 15: Migration Table Creation
// Validates: Requirements 6.1
// ─────────────────────────────────────────────────────────

describe('Property 15: Migration Table Creation', () => {
  /**
   * Property: For any application startup, running migrations should create
   * all required tables (route_metadata, error_cluster, route_health_event,
   * error_brain_analysis, error_brain_patch, route_interaction_log).
   */
  it('should have all required tables after migration', async () => {
    // Query information_schema for existing tables
    const result = await testPool.query(`
      SELECT table_name
      FROM information_schema.tables
      WHERE table_schema = 'public'
      AND table_type = 'BASE TABLE'
    `);

    const existingTables = result.rows.map(row => row.table_name);

    // Verify all required tables exist
    for (const table of REQUIRED_TABLES) {
      expect(existingTables).toContain(table);
    }
  });

  /**
   * Property: For any table creation, appropriate indexes should be created
   * on route_id, timestamp, status, and tool columns.
   */
  it('should have all required indexes after migration', async () => {
    // Query pg_indexes for existing indexes
    const result = await testPool.query(`
      SELECT indexname
      FROM pg_indexes
      WHERE schemaname = 'public'
    `);

    const existingIndexes = result.rows.map(row => row.indexname);

    // Verify all required indexes exist
    for (const index of REQUIRED_INDEXES) {
      expect(existingIndexes).toContain(index);
    }
  });

  /**
   * Property: For any route_metadata table, it should have the correct columns
   * with proper data types.
   */
  it('should have correct columns in route_metadata table', async () => {
    const result = await testPool.query(`
      SELECT column_name, data_type, is_nullable
      FROM information_schema.columns
      WHERE table_name = 'route_metadata'
      ORDER BY ordinal_position
    `);

    const columns = result.rows.reduce((acc, row) => {
      acc[row.column_name] = { type: row.data_type, nullable: row.is_nullable };
      return acc;
    }, {} as Record<string, { type: string; nullable: string }>);

    // Verify required columns exist
    expect(columns['id']).toBeDefined();
    expect(columns['route_id']).toBeDefined();
    expect(columns['path']).toBeDefined();
    expect(columns['kind']).toBeDefined();
    expect(columns['status']).toBeDefined();
    expect(columns['created_at']).toBeDefined();
    expect(columns['updated_at']).toBeDefined();
    expect(columns['archived_at']).toBeDefined();

    // Verify non-nullable columns
    expect(columns['route_id'].nullable).toBe('NO');
    expect(columns['path'].nullable).toBe('NO');
    expect(columns['kind'].nullable).toBe('NO');
    expect(columns['status'].nullable).toBe('NO');
  });

  /**
   * Property: For any error_cluster table, it should have foreign key
   * referencing route_metadata.
   */
  it('should have foreign key constraints on error_cluster', async () => {
    const result = await testPool.query(`
      SELECT
        tc.constraint_name,
        tc.table_name,
        kcu.column_name,
        ccu.table_name AS foreign_table_name,
        ccu.column_name AS foreign_column_name
      FROM information_schema.table_constraints AS tc
      JOIN information_schema.key_column_usage AS kcu
        ON tc.constraint_name = kcu.constraint_name
      JOIN information_schema.constraint_column_usage AS ccu
        ON ccu.constraint_name = tc.constraint_name
      WHERE tc.constraint_type = 'FOREIGN KEY'
        AND tc.table_name = 'error_cluster'
    `);

    // Verify foreign key to route_metadata exists
    const fkToRouteMetadata = result.rows.find(
      row => row.foreign_table_name === 'route_metadata'
    );
    expect(fkToRouteMetadata).toBeDefined();
    expect(fkToRouteMetadata?.column_name).toBe('route_id');
  });

  /**
   * Property: For any timestamp stored in the database, it should be in
   * UTC timezone (timestamp with time zone).
   */
  it('should use timestamp with time zone for all timestamp columns', async () => {
    const tables = ['route_metadata', 'error_cluster', 'route_health_event',
                    'error_brain_analysis', 'error_brain_patch', 'route_interaction_log'];

    for (const table of tables) {
      const result = await testPool.query(`
        SELECT column_name, data_type
        FROM information_schema.columns
        WHERE table_name = $1
        AND column_name LIKE '%_at' OR column_name LIKE '%timestamp%'
      `, [table]);

      for (const row of result.rows) {
        if (row.column_name.includes('_at') || row.column_name.includes('timestamp')) {
          expect(row.data_type).toBe('timestamp with time zone');
        }
      }
    }
  });
});

// ─────────────────────────────────────────────────────────
// Property 16: Index Creation
// Validates: Requirements 6.2
// ─────────────────────────────────────────────────────────

describe('Property 16: Index Creation', () => {
  /**
   * Property: For any table creation, appropriate indexes should be created
   * on route_id, timestamp, status, and tool columns.
   */
  it('should have indexes on route_id columns', async () => {
    const result = await testPool.query(`
      SELECT indexname, tablename
      FROM pg_indexes
      WHERE schemaname = 'public'
      AND indexdef LIKE '%route_id%'
    `);

    // Should have route_id indexes on multiple tables
    expect(result.rows.length).toBeGreaterThanOrEqual(5);
  });

  it('should have indexes on timestamp columns', async () => {
    const result = await testPool.query(`
      SELECT indexname, tablename
      FROM pg_indexes
      WHERE schemaname = 'public'
      AND (indexdef LIKE '%created_at%' OR indexdef LIKE '%archived_at%')
    `);

    // Should have timestamp indexes
    expect(result.rows.length).toBeGreaterThanOrEqual(3);
  });

  it('should have indexes on status columns', async () => {
    const result = await testPool.query(`
      SELECT indexname, tablename
      FROM pg_indexes
      WHERE schemaname = 'public'
      AND (indexdef LIKE '%status%' OR indexdef LIKE '%severity%')
    `);

    // Should have status/severity indexes
    expect(result.rows.length).toBeGreaterThanOrEqual(2);
  });
});

// ─────────────────────────────────────────────────────────
// Property 18: Referential Integrity
// Validates: Requirements 6.4
// ─────────────────────────────────────────────────────────

describe('Property 18: Referential Integrity', () => {
  /**
   * Property: For any error_cluster, route_health_event, or other record
   * referencing a route, the referenced route_id must exist in route_metadata.
   */
  it('should enforce referential integrity on error_cluster', async () => {
    // Try to insert error_cluster with non-existent route_id
    await expect(
      testPool.query(`
        INSERT INTO error_cluster (route_id, tool, code, message, severity)
        VALUES ('non-existent-route', 'tsc', 'TS2345', 'Test error', 'error')
      `)
    ).rejects.toThrow();
  });

  it('should enforce referential integrity on route_health_event', async () => {
    // Try to insert route_health_event with non-existent route_id
    await expect(
      testPool.query(`
        INSERT INTO route_health_event (route_id, new_status)
        VALUES ('non-existent-route', 'broken')
      `)
    ).rejects.toThrow();
  });

  it('should enforce referential integrity on route_interaction_log', async () => {
    // Try to insert route_interaction_log with non-existent route_id
    await expect(
      testPool.query(`
        INSERT INTO route_interaction_log (route_id, interaction_type)
        VALUES ('non-existent-route', 'view')
      `)
    ).rejects.toThrow();
  });
});

// ─────────────────────────────────────────────────────────
// Property-Based Tests with fast-check
// ─────────────────────────────────────────────────────────

describe('Property-Based Migration Tests', () => {
  /**
   * Property: For any valid route_id string, creating a route_metadata record
   * should succeed and be retrievable.
   */
  it('should create route_metadata for any valid route_id', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.string({ minLength: 1, maxLength: 200 }).filter(s => !s.includes('\0')),
        async (routeId) => {
          // Clean up any existing record
          await testPool.query('DELETE FROM route_metadata WHERE route_id = $1', [routeId]);

          // Insert new record
          const insertResult = await testPool.query(`
            INSERT INTO route_metadata (route_id, path, kind, status)
            VALUES ($1, $1, 'page', 'healthy')
            RETURNING *
          `, [routeId]);

          expect(insertResult.rows.length).toBe(1);
          expect(insertResult.rows[0].route_id).toBe(routeId);

          // Retrieve and verify
          const selectResult = await testPool.query(
            'SELECT * FROM route_metadata WHERE route_id = $1',
            [routeId]
          );

          expect(selectResult.rows.length).toBe(1);
          expect(selectResult.rows[0].route_id).toBe(routeId);

          // Clean up
          await testPool.query('DELETE FROM route_metadata WHERE route_id = $1', [routeId]);
        }
      ),
      { numRuns: 100 }
    );
  });

  /**
   * Property: For any valid severity value, creating an error_cluster should
   * store the correct severity.
   */
  it('should store correct severity for error_cluster', async () => {
    // Create a test route first
    const testRouteId = `test-route-${Date.now()}`;
    await testPool.query(`
      INSERT INTO route_metadata (route_id, path, kind, status)
      VALUES ($1, $1, 'page', 'healthy')
    `, [testRouteId]);

    try {
      await fc.assert(
        fc.asyncProperty(
          fc.constantFrom('error', 'warning', 'info'),
          async (severity) => {
            const insertResult = await testPool.query(`
              INSERT INTO error_cluster (route_id, tool, code, message, severity)
              VALUES ($1, 'tsc', 'TS2345', 'Test error', $2)
              RETURNING *
            `, [testRouteId, severity]);

            expect(insertResult.rows[0].severity).toBe(severity);

            // Clean up
            await testPool.query('DELETE FROM error_cluster WHERE id = $1', [insertResult.rows[0].id]);
          }
        ),
        { numRuns: 100 }
      );
    } finally {
      // Clean up test route
      await testPool.query('DELETE FROM route_metadata WHERE route_id = $1', [testRouteId]);
    }
  });

  /**
   * Property: For any valid interaction_type, creating an interaction_log
   * should store the correct type.
   */
  it('should store correct interaction_type for route_interaction_log', async () => {
    // Create a test route first
    const testRouteId = `test-route-${Date.now()}`;
    await testPool.query(`
      INSERT INTO route_metadata (route_id, path, kind, status)
      VALUES ($1, $1, 'page', 'healthy')
    `, [testRouteId]);

    try {
      await fc.assert(
        fc.asyncProperty(
          fc.constantFrom('view', 'navigate', 'analyze', 'patch_apply'),
          async (interactionType) => {
            const insertResult = await testPool.query(`
              INSERT INTO route_interaction_log (route_id, interaction_type)
              VALUES ($1, $2)
              RETURNING *
            `, [testRouteId, interactionType]);

            expect(insertResult.rows[0].interaction_type).toBe(interactionType);

            // Clean up
            await testPool.query('DELETE FROM route_interaction_log WHERE id = $1', [insertResult.rows[0].id]);
          }
        ),
        { numRuns: 100 }
      );
    } finally {
      // Clean up test route
      await testPool.query('DELETE FROM route_metadata WHERE route_id = $1', [testRouteId]);
    }
  });
});
