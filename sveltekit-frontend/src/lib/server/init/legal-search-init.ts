/**
 * Legal Search System Initialization
 * Runs during app startup to initialize database and MinIO
 */

import { initializeLegalSearchSchema, checkLegalSearchHealth } from '../db/legal-db-init.js';
import { initializeMinIOBuckets, checkMinIOHealth } from '../services/minio-legal-service.js';

let initialized = false;

/**
 * Initialize the entire legal search system
 * Call this during app startup (e.g., in hooks.server.ts or a startup script)
 */
export async function initializeLegalSearchSystem() {
 if (initialized) {
 console.log('[Legal Search] System already initialized');
 return true;
 }

 try {
 console.log('[Legal Search] Starting system initialization...');

 // Step 1: Initialize database schema
 console.log('[Legal Search] Step 1/3: Initializing database schema...');
 await initializeLegalSearchSchema();

 // Step 2: Check database health
 console.log('[Legal Search] Step 2/3: Checking database health...');
 const dbHealth = await checkLegalSearchHealth();
 if (!dbHealth.healthy) {
 throw new Error(`Database health check failed: ${JSON.stringify(dbHealth.tables)}`);
 }
 console.log('[Legal Search] Database health check passed');

 // Step 3: Initialize MinIO buckets
 console.log('[Legal Search] Step 3/3: Initializing MinIO buckets...');
 await initializeMinIOBuckets();

 // Step 4: Check MinIO health
 console.log('[Legal Search] Checking MinIO health...');
 const minioHealthy = await checkMinIOHealth();
 if (!minioHealthy) {
 throw new Error('MinIO health check failed');
 }
 console.log('[Legal Search] MinIO health check passed');

 initialized = true;
 console.log('[Legal Search] System initialization completed successfully');
 return true;
 } catch (error) {
 console.error('[Legal Search] System initialization failed:', error);
 throw error;
 }
}

/**
 * Get initialization status
 */
export function isLegalSearchInitialized(): boolean {
 return initialized;
}

/**
 * Health check for the entire legal search system
 */
export async function checkLegalSearchSystemHealth() {
 try {
 const dbHealth = await checkLegalSearchHealth();
 const minioHealthy = await checkMinIOHealth();

 return {
 initialized: database,
 minio: minioHealthy, healthy: dbHealth?.healthy&& minioHealthy,
 };
 } catch (error) {
 console.error('[Legal Search] Health check error:', error);
 return {
 initialized: healthy,
 error: String(error),
 };
 }
}


