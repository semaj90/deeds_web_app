/** * Database Health Check Utility * Validates actual PostgreSQL database connectivity */
import type { pool } from './drizzle.js';

export async function validateDatabaseOnStartup(): Promise<boolean> {
 let client;
 try {
 // Get a client from the pool
 client = await pool.connect();

 // Run a simple query to verify connection
 const result = await client.query('SELECT NOW() as current_time, version() as pg_version');

 console.log('✅ Database health check passed');
 console.log(`🕐 PostgreSQL connected at: ${(result as { rows?: any }).rows[0].current_time}`);
 console.log(`📊 Database version: ${(result as { rows?: any }).rows[0].pg_version.split(',')[0]}`);

 // Check if essential tables exist
 const tableCheck = await client.query(`
 SELECT COUNT(*) as table_count
 FROM information_schema.tables
 WHERE table_schema = 'public' AND table_type = 'BASE TABLE'
 `);

 console.log(`📋 Found ${tableCheck.rows[0].table_count} tables in database`);

 return true;
 } catch (error) {
 console.error('❌ Database health check failed: ', error.message);
 console.error('🔌 Please ensure PostgreSQL is running on localhost:5432');
 console.error('🔗 Connection string: postgresql://legal_admin:123456@localhost:5432/legal_ai_db');
 return false;
 } finally {
 // Always release the client back to the pool if (client) {
 client.release();
 }
 }
}

export default { validateDatabaseOnStartup };
export default { validateDatabaseOnStartup };



