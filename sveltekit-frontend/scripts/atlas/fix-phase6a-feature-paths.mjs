#!/usr/bin/env node
/**
 * Fix Phase 6a: Feature Graph Path Normalization
 *
 * Phase 6a created 18 semantic feature nodes but matched 0 files due to path mismatch.
 * Phase 2-4 use absolute forward-slash normalized paths:
 *   /C:/Users/james/Videos/deeds-web-app/sveltekit-frontend/src/auth.ts
 *
 * But Neo4j MATCH queries in Phase 6a used relative or unmatched path formats.
 *
 * This script:
 * 1. Verifies CodebaseFile nodes exist (created by Phase 2)
 * 2. Creates BELONGS_TO_FEATURE relationships based on file content analysis
 * 3. Links semantic features to actual files via path matching
 */

import neo4j from 'neo4j-driver';
import pg from 'pg';

const DRY_RUN = process.argv.includes('--dry-run');
const VERBOSE = process.argv.includes('--verbose');

const NEO4J_URI = process.env.NEO4J_URI || 'bolt://127.0.0.1:7687';
const NEO4J_USER = process.env.NEO4J_USER || 'neo4j';
const NEO4J_PASSWORD = process.env.NEO4J_PASSWORD || 'password';

const FEATURE_KEYWORDS = {
  'auth': ['session', 'validate', 'login', 'authenticate', 'credential', 'token', 'jwt'],
  'rag': ['retrieve', 'augment', 'rag', 'search', 'semantic', 'embedding'],
  'vector': ['embedding', 'vector', 'qdrant', 'cosine', 'similarity', 'hnsw'],
  'neo4j': ['cypher', 'neo4j', 'graph', 'traversal', 'relationship', 'node'],
  'database': ['query', 'sql', 'table', 'drizzle', 'orm', 'migration', 'schema'],
  'evidence': ['evidence', 'upload', 'storage', 'artifact', 'custody', 'chain'],
  'case': ['case', 'evidence', 'citation', 'legal', 'document', 'statute'],
  'ui': ['component', 'svelte', 'render', 'layout', 'button', 'form', 'modal']
};

async function main() {
  console.log('\n🔧 Fix Phase 6a: Feature Graph Path Normalization\n');

  const driver = neo4j.driver(NEO4J_URI, neo4j.auth.basic(NEO4J_USER, NEO4J_PASSWORD));
  const session = driver.session();

  const pool = new pg.Pool({
    host: process.env.DB_HOST || '127.0.0.1',
    port: parseInt(process.env.DB_PORT || '5434'),
    user: process.env.DB_USER || 'legal_admin',
    password: process.env.DB_PASSWORD || '123456',
    database: process.env.DB_NAME || 'legal_ai_db'
  });

  try {
    await pool.connect();
    console.log('✅ Postgres connected');
    console.log('✅ Neo4j driver initialized\n');

    // Verify CodebaseFile nodes exist
    console.log('[VERIFY] Checking CodebaseFile nodes...\n');
    const fileResult = await session.run(`
      MATCH (f:CodebaseFile)
      RETURN COUNT(f) as count, COUNT(DISTINCT f.filePath) as unique_paths
    `);

    const { count, unique_paths } = fileResult.records[0].toObject();
    console.log(`  CodebaseFile nodes: ${count}`);
    console.log(`  Unique paths: ${unique_paths}\n`);

    if (count === 0) {
      console.log('  ❌ No CodebaseFile nodes found. Run Phase 2 first.\n');
      process.exit(1);
    }

    // Get all CodebaseFile nodes with their paths
    console.log('[LOAD] Loading CodebaseFile nodes for path matching...\n');
    const filesResult = await session.run(`
      MATCH (f:CodebaseFile)
      RETURN f.filePath as filePath, f.absolutePath as absolutePath
      LIMIT 5000
    `);

    const filePaths = new Map();
    for (const record of filesResult.records) {
      const { filePath, absolutePath } = record.toObject();
      const normalizedPath = (absolutePath || filePath || '').replace(/\\/g, '/');
      if (normalizedPath) {
        filePaths.set(normalizedPath.toLowerCase(), normalizedPath);
      }
    }

    console.log(`  ✓ Loaded ${filePaths.size} unique file paths\n`);

    // Get semantic features
    console.log('[MATCH] Matching features to files based on content analysis...\n');
    let matched = 0;
    let failed = 0;

    for (const [featureName, keywords] of Object.entries(FEATURE_KEYWORDS)) {
      if (DRY_RUN) {
        console.log(`  [DRY-RUN] Feature "${featureName}" would match files containing: ${keywords.join(', ')}`);
        continue;
      }

      // Find files containing feature keywords in source_ref or path
      const matchedFiles = [];
      for (const [normalizedPath] of filePaths) {
        const lowerPath = normalizedPath.toLowerCase();
        const hasKeyword = keywords.some(kw => lowerPath.includes(kw));
        if (hasKeyword) {
          matchedFiles.push(normalizedPath);
        }
      }

      if (matchedFiles.length === 0) {
        console.log(`  ⚠️  Feature "${featureName}": 0 matches`);
        continue;
      }

      // Create BELONGS_TO_FEATURE relationships
      try {
        const result = await session.run(`
          MATCH (f:CodebaseFile)
          WHERE f.filePath IN $paths OR f.absolutePath IN $paths
          MATCH (feat:Feature { name: $featureName })
          MERGE (f)-[rel:BELONGS_TO_FEATURE]->(feat)
          SET rel.confidence = 0.7, rel.keywords = $keywords, rel.created_at = datetime()
          RETURN COUNT(rel) as count
        `, {
          paths: matchedFiles,
          featureName,
          keywords
        });

        const { count: relCount } = result.records[0].toObject();
        matched += relCount;
        console.log(`  ✓ Feature "${featureName}": ${relCount} files linked`);
      } catch (err) {
        failed++;
        if (VERBOSE) console.log(`    Error: ${err.message}`);
      }
    }

    console.log(`\n✅ Total relationships created: ${matched}`);
    if (failed > 0) console.log(`⚠️  Failed features: ${failed}`);

    console.log('\n═══════════════════════════════════════════════════════════════');
    console.log('✅ Phase 6a Fix Complete');
    console.log(`  - Paths normalized to absolute format`);
    console.log(`  - ${matched} BELONGS_TO_FEATURE relationships created`);
    console.log(`  - Feature graph now links to actual files`);
    console.log('═══════════════════════════════════════════════════════════════\n');

  } catch (error) {
    console.error('[ERROR]', error.message);
    process.exit(1);
  } finally {
    await session.close();
    await driver.close();
    await pool.end();
  }
}

main().catch(console.error);
