#!/usr/bin/env node
/**
 * scripts/atlas/graphrag-kmeans-communities.mjs
 *
 * Scans the sveltekit-frontend/src directory, parses import dependencies,
 * builds a directed import graph, and executes the native compiled Rust
 * graph-engine NAPI-RS bridge to detect structural module communities.
 *
 * Usage:
 *   node scripts/atlas/graphrag-kmeans-communities.mjs
 */

import { resolve, join, relative } from 'node:path';
import { readdir, readFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { createRequire } from 'node:module';
import fs from 'node:fs';
import pg from 'pg';

const require = createRequire(import.meta.url);
const graphEngine = require('../../simd-bridge/rust/graph-engine/index.js');

const REPO_ROOT = resolve(process.cwd());
const SRC_DIR = join(REPO_ROOT, 'sveltekit-frontend/src');

async function getFiles(dir) {
  const dirents = await readdir(dir, { withFileTypes: true });
  const files = await Promise.all(dirents.map((dirent) => {
    const res = join(dir, dirent.name);
    return dirent.isDirectory() ? getFiles(res) : res;
  }));
  return Array.prototype.concat(...files);
}

// Simple regex to parse imports from JS/TS/Svelte files
function parseImports(content) {
  const imports = [];
  const regex = /from\s+['"]([^'"]+)['"]/g;
  let match;
  while ((match = regex.exec(content)) !== null) {
    imports.push(match[1]);
  }
  
  // also handle direct imports like import '...'
  const directRegex = /import\s+['"]([^'"]+)['"]/g;
  while ((match = directRegex.exec(content)) !== null) {
    imports.push(match[1]);
  }
  return [...new Set(imports)];
}

function resolveImport(fromFile, importPath) {
  if (importPath.startsWith('$lib/')) {
    return join(SRC_DIR, 'lib', importPath.slice(5));
  }
  if (importPath.startsWith('.') || importPath.startsWith('/')) {
    const dir = fromFile.split(/[\\/]/).slice(0, -1).join('/');
    return join(dir, importPath);
  }
  return null; // External npm package
}

async function run() {
  console.log('── Building Codebase Import Graph ──────────────────');
  if (!existsSync(SRC_DIR)) {
    console.error(`Source directory not found: ${SRC_DIR}`);
    process.exit(1);
  }

  const allFiles = (await getFiles(SRC_DIR)).filter(f => f.endsWith('.ts') || f.endsWith('.js') || f.endsWith('.svelte'));
  console.log(`📂 Found ${allFiles.length} source files in sveltekit-frontend/src`);

  const nodeIds = [];
  const edgesFrom = [];
  const edgesTo = [];

  const fileMap = new Map();
  for (const file of allFiles) {
    const relativePath = relative(REPO_ROOT, file).replace(/\\/g, '/');
    nodeIds.push(relativePath);
    fileMap.set(relativePath, file);
  }

  for (const relativePath of nodeIds) {
    try {
      const fullPath = fileMap.get(relativePath);
      const content = await readFile(fullPath, 'utf8');
      const imports = parseImports(content);

      for (const imp of imports) {
        const resolvedFull = resolveImport(fullPath, imp);
        if (resolvedFull) {
          // Find standard extension match
          let matchedRelative = null;
          const candidates = [
            resolvedFull,
            resolvedFull + '.ts',
            resolvedFull + '.js',
            resolvedFull + '.svelte',
            join(resolvedFull, 'index.ts'),
            join(resolvedFull, 'index.js')
          ];

          for (const cand of candidates) {
            const relCand = relative(REPO_ROOT, cand).replace(/\\/g, '/');
            if (fileMap.has(relCand)) {
              matchedRelative = relCand;
              break;
            }
          }

          if (matchedRelative) {
            edgesFrom.push(relativePath);
            edgesTo.push(matchedRelative);
          }
        }
      }
    } catch (err) {
      // Skip file read errors gracefully
    }
  }

  console.log(`🔗 Graph constructed: ${nodeIds.length} nodes, ${edgesFrom.length} edges`);
  console.log('── Executing Native Rust Community Detection ────────');

  const t0 = Date.now();
  const communities = graphEngine.detectCommunitiesRust(nodeIds, edgesFrom, edgesTo, 20);
  const ms = Date.now() - t0;

  console.log(`⚡ Rust Community Detection completed in ${ms}ms`);
  console.log(`👥 Found ${communities.length} distinct structural communities`);
  console.log('────────────────────────────────────────────────────');

  // Display top 8 communities
  for (const comm of communities.slice(0, 8)) {
    console.log(`\n📦 Community #${comm.communityId} (Size: ${comm.size} files)`);
    // Print first 5 members
    for (const member of comm.nodeIds.slice(0, 5)) {
      console.log(`   - ${member}`);
    }
    if (comm.size > 5) {
      console.log(`   ... and ${comm.size - 5} more files.`);
    }
  }

  // Load environment and persist to database
  console.log('\n── Writing communities to codebase_files ────────────');

  function loadEnv(filePath) {
    if (!existsSync(filePath)) return {};
    const env = {};
    for (const line of fs.readFileSync(filePath, 'utf8').split(/\r?\n/)) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith('#')) continue;
      const idx = trimmed.indexOf('=');
      if (idx === -1) continue;
      const key = trimmed.slice(0, idx).trim();
      let value = trimmed.slice(idx + 1).trim();
      if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
        value = value.slice(1, -1);
      }
      env[key] = value;
    }
    return env;
  }

  const ROOT = resolve(process.cwd());
  const env = {
    ...loadEnv(join(ROOT, '.env')),
    ...loadEnv(join(ROOT, 'sveltekit-frontend', '.env')),
    ...process.env,
  };

  const DATABASE_URL = env.DATABASE_URL || env.ADMIN_DATABASE_URL || 'postgresql://legal_admin:123456@127.0.0.1:5434/legal_ai_db';
  const pool = new pg.Pool({ connectionString: DATABASE_URL });

  try {
    // Map relative paths to file_path column in codebase_files
    const updates = [];
    for (const comm of communities) {
      for (const nodeId of comm.nodeIds) {
        updates.push({
          filePath: nodeId,
          communityId: comm.communityId,
        });
      }
    }

    console.log(`Writing ${updates.length} community assignments...`);

    // Batch update
    const BATCH_SIZE = 500;
    for (let i = 0; i < updates.length; i += BATCH_SIZE) {
      const batch = updates.slice(i, i + BATCH_SIZE);
      const values = batch.map((u, idx) => `($${idx * 2 + 1}, $${idx * 2 + 2})`).join(',');
      const params = [];
      for (const u of batch) {
        params.push(u.filePath);
        params.push(u.communityId);
      }

      await pool.query(
        `INSERT INTO codebase_files (file_path, community_id)
         VALUES ${values}
         ON CONFLICT (file_path) DO UPDATE SET
           community_id = EXCLUDED.community_id`,
        params
      );
    }

    console.log(`✓ Persisted ${updates.length} communities to codebase_files`);
  } catch (err) {
    console.error('❌ Database write failed:', err.message);
    process.exit(1);
  } finally {
    await pool.end();
  }
}

run().catch(console.error);
