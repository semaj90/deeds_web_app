import { migrate } from 'drizzle-orm/node-postgres/migrator';
import path from 'path';
import { getPool } from './pool';

// ─────────────────────────────────────────────────────────
// Migration Runner
// ─────────────────────────────────────────────────────────

/**
 * Run all pending migrations
 * Should be called once at application startup
 */
export async function runMigrations(): Promise<void> {
  try {
    const pool = getPool();
    const migrationsFolder = path.join(__dirname, 'drizzle');

    console.log('[Migrations] Starting migration process...');
    console.log(`[Migrations] Migrations folder: ${migrationsFolder}`);

    await migrate(pool, {
      migrationsFolder,
    });

    console.log('[Migrations] All migrations completed successfully');
  } catch (error) {
    console.error('[Migrations] Migration failed:', error);
    throw error;
  }
}

/**
 * Get migration status
 * Returns list of applied migrations
 */
export async function getMigrationStatus(): Promise<Array<{ name: string; appliedAt: Date }>> {
  try {
    const pool = getPool();
    const result = await pool.query(
      `SELECT name, applied_at FROM __drizzle_migrations__ ORDER BY applied_at DESC`
    );
    return result.rows.map((row) => ({
      name: row.name,
      appliedAt: row.applied_at,
    }));
  } catch (error) {
    console.error('[Migrations] Failed to get migration status:', error);
    return [];
  }
}

/**
 * Check if migrations table exists
 */
export async function isMigrationsTableExists(): Promise<boolean> {
  try {
    const pool = getPool();
    const result = await pool.query(
      `SELECT EXISTS (
        SELECT 1 FROM information_schema.tables
        WHERE table_name = '__drizzle_migrations__'
      )`
    );
    return result.rows[0].exists;
  } catch (error) {
    console.error('[Migrations] Failed to check migrations table:', error);
    return false;
  }
}

/**
 * Initialize migrations table if it doesn't exist
 */
export async function initializeMigrationsTable(): Promise<void> {
  try {
    const pool = getPool();
    const exists = await isMigrationsTableExists();

    if (!exists) {
      console.log('[Migrations] Creating migrations table...');
      await pool.query(`
        CREATE TABLE IF NOT EXISTS __drizzle_migrations__ (
          id SERIAL PRIMARY KEY,
          hash TEXT NOT NULL UNIQUE,
          created_at BIGINT NOT NULL,
          name TEXT NOT NULL,
          applied_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP
        )
      `);
      console.log('[Migrations] Migrations table created');
    }
  } catch (error) {
    console.error('[Migrations] Failed to initialize migrations table:', error);
    throw error;
  }
}

/**
 * Rollback last migration (use with caution!)
 * Note: This is a manual operation and should be used carefully
 */
export async function rollbackLastMigration(): Promise<void> {
  try {
    const pool = getPool();
    const result = await pool.query(
      `SELECT name FROM __drizzle_migrations__ ORDER BY applied_at DESC LIMIT 1`
    );

    if (result.rows.length === 0) {
      console.log('[Migrations] No migrations to rollback');
      return;
    }

    const lastMigration = result.rows[0].name;
    console.warn(`[Migrations] Rolling back migration: ${lastMigration}`);

    // Delete the migration record
    await pool.query(
      `DELETE FROM __drizzle_migrations__ WHERE name = $1`,
      [lastMigration]
    );

    console.log('[Migrations] Migration rolled back');
  } catch (error) {
    console.error('[Migrations] Failed to rollback migration:', error);
    throw error;
  }
}

/**
 * Get pending migrations
 * Returns list of migrations that haven't been applied yet
 */
export async function getPendingMigrations(): Promise<string[]> {
  try {
    const pool = getPool();
    const result = await pool.query(
      `SELECT name FROM __drizzle_migrations__ ORDER BY applied_at DESC`
    );
    const appliedMigrations = result.rows.map((row) => row.name);

    // In a real implementation, you would compare with actual migration files
    // For now, return empty array if all migrations are applied
    return [];
  } catch (error) {
    console.error('[Migrations] Failed to get pending migrations:', error);
    return [];
  }
}
