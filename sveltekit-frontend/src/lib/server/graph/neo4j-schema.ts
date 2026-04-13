/**
 * Neo4j Schema Initialization
 *
 * Creates indexes and constraints on first connection.
 * Uses the existing neo4j-driver singleton.
 */
import { getNeo4jDriver } from '$lib/server/neo4j-driver.js';

let initialized = false;

/**
 * Initialize Neo4j schema with constraints and indexes.
 * Safe to call multiple times — only runs once.
 */
export async function initializeNeo4jSchema(): Promise<void> {
	if (initialized) return;

	const driver = getNeo4jDriver();
	const session = driver.session({ database: 'neo4j' });

	const t0 = Date.now();
  console.log('[Neo4j] Schema init starting...');
  try {
    // Node constraints (uniqueness)
    await session.run('CREATE CONSTRAINT IF NOT EXISTS FOR (p:Person) REQUIRE p.id IS UNIQUE');
    await session.run('CREATE CONSTRAINT IF NOT EXISTS FOR (c:Case) REQUIRE c.id IS UNIQUE');
    await session.run('CREATE CONSTRAINT IF NOT EXISTS FOR (e:Evidence) REQUIRE e.id IS UNIQUE');
    await session.run('CREATE CONSTRAINT IF NOT EXISTS FOR (s:Statute) REQUIRE s.code IS UNIQUE');
    await session.run(
      'CREATE CONSTRAINT IF NOT EXISTS FOR (o:Organization) REQUIRE o.id IS UNIQUE'
    );
    await session.run(
      'CREATE CONSTRAINT IF NOT EXISTS FOR (g:GlossaryTerm) REQUIRE g.key IS UNIQUE'
    );
    await session.run(
      'CREATE CONSTRAINT IF NOT EXISTS FOR (f:CodebaseFile) REQUIRE f.id IS UNIQUE'
    );

    // Indexes for search performance
    await session.run('CREATE INDEX IF NOT EXISTS FOR (p:Person) ON (p.name)');
    await session.run('CREATE INDEX IF NOT EXISTS FOR (c:Case) ON (c.title)');
    await session.run('CREATE INDEX IF NOT EXISTS FOR (c:Case) ON (c.caseNumber)');
    await session.run('CREATE INDEX IF NOT EXISTS FOR (e:Evidence) ON (e.title)');
    await session.run('CREATE INDEX IF NOT EXISTS FOR (g:GlossaryTerm) ON (g.term)');
    await session.run('CREATE INDEX IF NOT EXISTS FOR (f:CodebaseFile) ON (f.filePath)');
    await session.run('CREATE INDEX IF NOT EXISTS FOR (f:CodebaseFile) ON (f.cluster)');
    await session.run('CREATE INDEX IF NOT EXISTS FOR (f:CodebaseFile) ON (f.type)');
    await session.run('CREATE INDEX IF NOT EXISTS FOR (f:CodebaseFile) ON (f.nodeLabel)');
    await session.run('CREATE INDEX IF NOT EXISTS FOR (f:CodebaseFile) ON (f.usesNative)');
    await session.run('CREATE INDEX IF NOT EXISTS FOR (f:CodebaseFile) ON (f.hasDynamicImports)');

    initialized = true;
    console.log(`[Neo4j] Schema initialized in ${Date.now() - t0}ms`);
  } catch (err) {
    console.error('[Neo4j] Schema init failed:', err);
  } finally {
    await session.close();
  }
}
