/**
 * Database Setup Script for Unified Vector Systems
 * Ensures all required tables, indexes, and extensions are properly configured
 */
import { sql } from 'drizzle-orm';
import { db } from './unified-client.js';
import type { DrizzleTypes } from '$lib/types/enhanced-svelte5-types';

export interface DatabaseSetupResult {
    success: boolean;
	steps: Array<{ step: string;
	success: boolean; error?: string }>;
    timestamp: string;
}

export async function setupDatabase(): Promise<DatabaseSetupResult> {
    console.log('🚀 Setting up database for Unified Vector Systems...');
    const steps: DatabaseSetupResult['steps'] = [];

    try {
        // Step 1: Enable required extensions
        console.log('Step 1: PostgreSQL extensions...');
        try {
            await db.execute(sql`CREATE EXTENSION IF NOT EXISTS "uuid-ossp"`);
            await db.execute(sql`CREATE EXTENSION IF NOT EXISTS "pgcrypto"`);
            await db.execute(sql`CREATE EXTENSION IF NOT EXISTS "vector"`);
            steps.push({ step: 'Enable extensions', success: true });
        } catch (error: any) {
            steps.push({ step: 'Enable extensions', success: false, error: error.message });
        }

        // Step 2: Create core tables
        console.log('Step 2: Core tables...');
        try {
            await db.execute(sql`
                CREATE TABLE IF NOT EXISTS embedding_cache (
                    id TEXT PRIMARY KEY DEFAULT gen_random_uuid(),
                    text_hash TEXT UNIQUE NOT NULL,
                    embedding vector(768) NOT NULL,
                    model TEXT NOT NULL DEFAULT 'nomic-embed-text',
                    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                    access_count INTEGER DEFAULT 1
                )
            `);
            steps.push({ step: 'Create vector tables', success: true });
        } catch (error: any) {
            steps.push({ step: 'Create vector tables', success: false, error: error.message });
        }

        return {
            success: steps.every(s => s.success),
            steps,
            timestamp: new Date().toISOString()
        };
    } catch (error: any) {
        console.error('❌ Database setup failed:', error);
        return {
            success: false,
            steps: [...steps, { step: 'Overall setup', success: false, error: error.message }],
            timestamp: new Date().toISOString()
        };
    }
}

export async function checkDatabaseHealth(): Promise<any> {
    try {
        await db.execute(sql`SELECT 1`);
        return { connected: true };
    } catch {
        return { connected: false };
    }
}

export async function getDatabaseStats(): Promise<any> {
    return { status: 'unknown' };
}
