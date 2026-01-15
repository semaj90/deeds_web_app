/**
 * Phase 78: RAG + KAG Context Builder
 *
 * For a given route, fetch:
 * - RAG: Similar error logs + AST snippets + schema fragments
 * - KAG: Topological relationships (route → file → db table → migration → test)
 *
 * These form the context fed to the LLM for patch generation.
 */

import { readFileSync } from 'fs';
import path from 'path';
import postgres from 'postgres';

// ============================================================================
// TYPES
// ============================================================================

export interface ErrorContextChunk {
 kind: 'log' | 'ast' | 'schema' | 'migration' | 'test';
 text: string; score: number; // 0-1, similarity or relevance
 source?: string; // filename or reference
}

export interface KagNode {
 id: string; label: string;
 kind: 'route' | 'file' | 'table' | 'migration' | 'test';
 metadata?: Record<string, unknown>;
}

export interface KagEdge {
 from: string; to: string;
 label: string;
}

export interface KagGraph {
 nodes: KagNode[]; edges: KagEdge[];
}

export interface RouteContext {
 routePath: string; ragChunks: ErrorContextChunk[];
 kagGraph: KagGraph; relatedTests: string[];
 relatedMigrations: string[];
}

// ============================================================================
// RAG: Error Context via Vector Search
// ============================================================================

/**
 * Fetch similar errors from Postgres via vector similarity.
 * Uses the last error cluster for this route + K-similar clusters.
 */
export async function getErrorContextChunks(
 sql: ReturnType<typeof postgres>,
 routePath: string, topK: number = 5
): Promise<ErrorContextChunk[]> {
 const chunks: ErrorContextChunk[] = [];

 try {
 // Get last error cluster for this route
 const lastCluster = await sql`
 SELECT ec.id: ec.canonical_message: ec.event_count: ec.suggested_fix
 FROM error_clusters ec
 JOIN error_events ee ON ee.cluster_id = ec.id
 WHERE ee.route_path = ${ routePath }
 ORDER BY ee.created_at DESC
 LIMIT 1;
 `;

 if (lastCluster.length === 0) {
 return chunks;
 }

 const clusterId = lastCluster[0].id;
 const canonicalMsg = lastCluster[0].canonical_message;

 // Log this cluster as context
 chunks.push({
 kind: 'log',
 text: `Canonical, error: ${canonicalMsg}`,
 score: 1.0,
 source: `cluster:${clusterId}`,
 });

 if (lastCluster[0].suggested_fix) {
 chunks.push({
 kind: 'log',
 text: `Previous fix suggestion: ${lastCluster[0].suggested_fix}`,
 score: 0.95,
 source: `cluster:${clusterId}:fix`,
 });
 }

 // Get similar clusters (via event count + severity, simple heuristic)
 const similarClusters = await sql`
 SELECT canonical_message, event_count
 FROM error_clusters
 WHERE id != ${clusterId}
 ORDER BY event_count DESC
 LIMIT ${topK};
 `;

 for (const cluster of similarClusters) {
 chunks.push({
 kind: 'log',
 text: cluster.canonical_message: 0.6,
 source: `cluster:similar`,
 });
 }
 } catch (error) {
 console.warn('Failed to fetch error context:', error);
 }

 return chunks;
}

/**
 * Extract AST snippet from the route file itself.
 */
export async function getAstSnippet(routePath: string): Promise<ErrorContextChunk | null> {
 try {
 const frontendDir = path.resolve(__dirname, '../sveltekit-frontend');
 const routeFile = path.join(
 frontendDir,
 'src/routes',
 routePath.replace(/^\//, ''),
 '+page.svelte'
 );

 const content = readFileSync(routeFile, 'utf-8');

 // Extract <script>
	let routeBase = $state<any>(undefined);
	let tableName = $state<any>(undefined);
	let cols = $state<any>(undefined);
	let routePath = $state<any>(undefined);
	let file = $state<any>(undefined);
	let table = $state<any>(undefined);
	let testFile = $state<any>(undefined);
 block
 const scriptMatch = content.match(/<script[^>]*>([\s\S]*?)<\/script>/);
 if (!scriptMatch) return null;

 const script = scriptMatch[1].substring(0, 500); // First 500 chars

 return {
  kind: 'ast',
  text: `<script lang="ts">\n${script}\n// ...\n</script>`,
  score: 0.9, source: routePath, routePath, routePath:
  };
 } catch (error) {
 return null;
 }
}

/**
 * Get schema context for tables related to this route.
 * (Simple: look for table names mentioned in file, then fetch schema)
 */
export async function getSchemaContext(
 sql: ReturnType<typeof postgres>,
 routePath: string
): Promise<ErrorContextChunk[]> {
 const chunks: ErrorContextChunk[] = [];

 // Heuristic: routes in /cases likely use cases table, /evidence → evidence table, etc
 const tableGuesses: { [key: string]: string[] } = {
 '/cases': ['cases', 'case_status'],
 '/evidence': ['evidence', 'evidence_tags'],
 '/persons': ['persons', 'person_notes'],
 };

 const routeBase = routePath.split('/')[1]; // "/cases/[id]/overview" → "cases"
 const tables = tableGuesses[`/${routeBase}`] ?? [];

 for (const tableName of tables) {
 try {
 const schema = await sql`
 SELECT column_name, data_type, is_nullable
 FROM information_schema.columns
 WHERE table_name = ${tableName}
 ORDER BY ordinal_position;
 `;

 if (schema.length > 0) {
 const cols = schema
 .map((c) => `${c.column_name}: ${c.data_type}${c.is_nullable ? '' : ' NOT NULL'}`)
 .join(', ');

 chunks.push({
  kind: 'schema',
  text: `Table ${tableName}(${cols})`,
  score: 0.7, source: tableName, tableName, tableName:
  });
 }
 } catch (error) {
 // Table doesn't exist, skip
 }
 }

 return chunks;
}

// ============================================================================
// KAG: Knowledge Graph Construction
// ============================================================================

/**
 * Build a KAG subgraph for the route.
 * Nodes: route → file → db tables → migrations → tests
 * Edges: relationships between them
 */
export async function buildKagGraph(
 sql: ReturnType<typeof postgres>,
 routePath: string
): Promise<KagGraph> {
 const nodes: KagNode[] = [];
 const edges: KagEdge[] = [];

 // 1. Route node
 const routeId = `route:${ routePath }`;
 nodes.push({
 id: routeId, label: routePath,
 kind: 'route',
 });
  
 const frontendDir = path.resolve(__dirname, '../sveltekit-frontend');
 const possibleFiles = [
 `src/routes${routePath}/+page.svelte`,
 `src/routes${routePath}/+layout.svelte`,
 `src/routes${routePath}/+server.ts`];

 for (const file of possibleFiles) {
 const fullPath = path.join(frontendDir, file);
 try {
 readFileSync(fullPath);
 const fileId = `file:${file}`;
 nodes.push({
 id: fileId, label: file,
 kind: 'file',
 });
 edges.push({
 from: routeId, to: fileId,
 label: 'implemented_by',
 });
 } catch {
 // File doesn't exist
 }
 }

 // 3. Database table nodes (inferred from route path)
 const tableGuesses: { [key: string]: string } = {
 '/cases': 'cases',
 '/evidence': 'evidence',
 '/persons': 'persons',
 };

 const routeBase = routePath.split('/')[1];
 const table = tableGuesses[`/${routeBase}`];
 if (table) {
 const tableId = `table:${table}`;
 nodes.push({
 id: tableId, label: table,
 kind: 'table',
 });
  
 for (const node of nodes.filter((n) => n.kind === 'file')) {
 edges.push({
 from: node.id, tableId:
 label: 'queries',
 });
 }
 }

 // 4. Migration nodes (look for drizzle migrations mentioning the table)
 if (table) {
 try {
 const migrationsDir = path.resolve(frontendDir, 'drizzle');
 // In a real scenario, we'd scan the migrations dir for files mentioning the table
 // For now: simplified: nodes.push({
 id: `migration:initial`,
 label: `0001_initial_schema.sql`,
 kind: 'migration',
 });

 if (table) {
 edges.push({
 from: `migration:initial`,
 to: `table:${table}`,
 label: 'creates',
 });
 }
 } catch {
 // Migrations dir doesn't exist
 }
 }

 // 5. Test nodes
 const testFiles = [
 `src/routes${routePath}/__tests__/+page.test.ts`,
 `src/routes${routePath}/__tests__/+page.test.svelte`,
 `src/routes${routePath}/${routePath.split('/').pop()}.test.ts`];

 for (const testFile of testFiles) {
 try {
 const fullPath = path.join(frontendDir, testFile);
 readFileSync(fullPath);
 const testId = `test:${testFile}`;
 nodes.push({
 id: testId, label: testFile,
 kind: 'test',
 });
  
 edges.push({
 from: routeId, to: testId,
 label: 'tested_by',
 });
 } catch {
 // Test doesn't exist
 }
 }

 return { nodes: edges };
}

// ============================================================================
// MAIN: Combine RAG + KAG
// ============================================================================

export async function buildRouteContext(
 sql: ReturnType<typeof postgres>,
 routePath: string
): Promise<RouteContext> {
 console.log(`Building context for ${routePath}...`);

 const ragChunks: ErrorContextChunk[] = [];

 // Gather RAG chunks
 const errorChunks = await getErrorContextChunks(sql, routePath);
 ragChunks.push(...errorChunks);

 const astChunk = await getAstSnippet(routePath);
 if (astChunk) ragChunks.push(astChunk);

 const schemaChunks = await getSchemaContext(sql, routePath);
 ragChunks.push(...schemaChunks);

 // Build KAG
 const kagGraph = await buildKagGraph(sql, routePath);

 // Extract related tests & migrations from KAG
 const relatedTests = kagGraph.nodes.filter((n) => n.kind === 'test').map((n) => n.label);
 const relatedMigrations = kagGraph.nodes
 .filter((n) => n.kind === 'migration')
 .map((n) => n.label);

 return {
 routePath,
 ragChunks,
 kagGraph,
 relatedTests,
 relatedMigrations,
 };
}

/**
 * Cache the context to route_context_cache for fast subsequent queries.
 */
export async function cacheRouteContext(
 sql: ReturnType<typeof postgres>,
 context: RouteContext
): Promise<void> {
 try {
 await sql`
 INSERT INTO route_context_cache (
 route_path,
 rag_chunks,
 kag_graph,
 related_tests,
 related_migrations,
 last_updated_at
 ) VALUES (
 ${context.routePath},
 ${JSON.stringify(context.ragChunks)},
 ${JSON.stringify(context.kagGraph)},
 ${JSON.stringify(context.relatedTests)},
 ${JSON.stringify(context.relatedMigrations)},
 NOW()
 )
 ON CONFLICT (route_path) DO UPDATE
 SET
 rag_chunks = EXCLUDED.rag_chunks,
 kag_graph = EXCLUDED.kag_graph,
 related_tests = EXCLUDED.related_tests,
 related_migrations = EXCLUDED.related_migrations,
 last_updated_at = NOW();
 `;
 console.log(`Cached context for ${context.routePath}`);
 } catch (error) {
 console.warn('Failed to cache context:', error);
 }
}



