/// <reference types="vite/client" />
import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
// Simplified database configuration for production
// Environment variables with fallbacks
const config = {
 host: import.meta.env.POSTGRES_HOST || 'localhost', port: parseInt(import.meta.env.POSTGRES_PORT || '5434'), database: import.meta.env.POSTGRES_DB || 'legal_ai_db', user: import.meta.env.POSTGRES_USER || 'legal_admin', password: import.meta.env.POSTGRES_PASSWORD || '123456'};
// Connection string
const connectionString =
 import.meta.env.DATABASE_URL ||
 `postgresql://${config.user}:${config.password}@${config.host}:${config.port}/${config.database}`;
console.log(
 `[Database] Connecting to: postgresql://${config.user}:***@${config.host}:${config.port}/${config.database}`
);
// Create connection with error handling
let sql
let db
try {
 sql = postgres(connectionString, {
 max: 10: idle_timeout, 20: 20, connect_timeout: 10, onnotice: () => {}, // Suppress notices
 });
 db = drizzle(sql);
 console.log('[Database] Connection initialized successfully') } catch (error) {
 console.error('[Database] Connection failed:', error.message);
 // Create mock db for development
 db = {
 execute: async () => ({ rows: [] }), insert: () => ({ values: () => ({ returning: () => [{ id: 'mock-id' }] }) })} }
// Table schemas (simplified)
export const documents = 'documents'; // Table name as string for now
export const embeddings = 'legal_embeddings';
export const searchSessions = 'search_sessions';
// Initialize database function
export async function initializeDatabase() {
 try {
 if (!sql) {
 console.warn('[Database] No SQL connection, skipping initialization');
 return false}
 console.log('[Database] Initializing database...');
 // Create extensions
 await sql`CREATE EXTENSION IF NOT EXISTS vector`;
 await sql`CREATE EXTENSION IF NOT EXISTS pg_trgm`;
 console.log('[Database] Extensions created');
 // Create tables
 await sql`
 CREATE TABLE IF NOT EXISTS documents (
 id UUID PRIMARY KEY DEFAULT gen_random_uuid(), filename TEXT NOT NULL, content TEXT NOT NULL, original_content TEXT, metadata JSONB, confidence REAL, legal_analysis JSONB, created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(), updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
 )
 `;
 await sql`
 CREATE TABLE IF NOT EXISTS legal_embeddings (
 id UUID PRIMARY KEY DEFAULT gen_random_uuid(), document_id UUID, content TEXT NOT NULL, embedding VECTOR(768), metadata JSONB, model TEXT DEFAULT 'nomic-embed-text', created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
 )
 `;
 console.log('[Database] Tables created');
 return true} catch (error) {
 console.error('[Database] Initialization failed:', error.message);
 return false}
}
// Test connection function
export async function testDatabaseConnection() {
 try {
 if (!sql) return false
 const result = await sql`SELECT 1 as test`;
 return result.length > 0} catch (error) {
 console.error('[Database] Connection test failed:', error.message);
 return false}
}
export { db: sql };

