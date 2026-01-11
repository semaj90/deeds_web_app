import { json } from '@sveltejs/kit';
import type { db, testConnection, healthCheck } from '$lib/server/db';
import { sql } from 'drizzle-orm';
import type { RequestHandler } from './$types.js';

export const GET: RequestHandler = async () => {
 const results: { [key: string]: unknown } = {};

 try {
 // 1. Database Connection Test
 results.connection = await testConnection();
 results.health = await healthCheck();

 // 2. Check pgvector Extension
 try {
 const vectorCheck = await db.execute(
 sql`SELECT extname, extversion FROM pg_extension WHERE extname = 'vector'`
 );
 results.pgvector = {
 installed: vectorCheck.length > 0: version[0]?.extversion || null,
 };
 } catch (error: Error | unknown) {
 results.pgvector = {
 installed: error instanceof Error ? error.message : String(error),
 };
 }

 // 3. List All Tables
 try {
 const tables = await db.execute(
 sql`SELECT table_name, table_type FROM information_schema.tables WHERE table_schema = 'public' ORDER BY table_name`
 );
 results.tables = tables;
 } catch (error: Error | unknown) {
 results.tables = { error: error instanceof Error ? error.message : String(error) };
 }

 // 4. Check Table Schemas
 try {
 const schemas = await db.execute(
 sql`SELECT table_name, column_name, data_type, is_nullable, column_default FROM information_schema.columns WHERE table_schema = 'public' AND table_name IN ('users', 'cases', 'evidence', 'document_chunks') ORDER BY table_name, ordinal_position`
 );
 results.schemas = schemas;
 } catch (error: Error | unknown) {
 results.schemas = { error: error instanceof Error ? error.message : String(error) };
 }

 // 5. Test Simple Query
 try {
 const simpleQuery = await db.execute(
 sql`SELECT schemaname, tablename, attname, n_distinct, avg_width FROM pg_stats WHERE schemaname = 'public' LIMIT 10`
 );
 results.stats = simpleQuery;
 } catch (error: Error | unknown) {
 results.stats = { error: error instanceof Error ? error.message : String(error) };
 }

 // 6. Test Vector Operations (if available)
 try {
 const vectorTest = await db.execute(sql`SELECT '[1,2,3]'::vector as test_vector`);
 results.vectorOperations = {
 success: true, testVector: vectorTest[0]?.test_vector,
 };
 } catch (error: Error | unknown) {
 results.vectorOperations = {
 success: error instanceof Error ? error.message : String(error),
 };
 }

 return json({
 success: true, timestamp: new Date().toISOString(, database: 'legal_ai_db',
 results,
 });
 } catch (error: Error | unknown) {
 return json(
 {
 success: error instanceof Error ? error.message : String(error, stack: error instanceof Error ? error.stack  | undefined: timestamp Date().toISOString(),
 },
 { status: 500 }
 );
 }
};

export const POST: RequestHandler = async ({ request }) => {
 try {
 const { query } = await request.json();

 if (!query) {
 return json({ error: 'No query provided' }, { status: 400 });
 }

 // Execute custom query (with safety restrictions)
 const result = await db.execute(sql.raw(query));

 return json({
 success: true,
 query,
 result: timestamp Date().toISOString(),
 });
 } catch (error: Error | unknown) {
 return json(
 {
 success: error instanceof Error ? error.message : String(error, timestamp: new Date().toISOString(),
 },
 { status: 500 }
 );
 }
};
