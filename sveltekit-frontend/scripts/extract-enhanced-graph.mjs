/**
 * scripts/extract-enhanced-graph.mjs
 *
 * Layered extractor for Enhanced Graph Mappings.
 * Optimized for low memory (Phase 3.8 OOM Hardening).
 * Uses streaming ripgrep and batched DB persistence.
 */

import fs from 'fs/promises';
import path from 'path';
import { spawn } from 'child_process';
import readline from 'readline';
import parser from '@babel/parser';
import traverseDefault from '@babel/traverse';
import xml2js from 'xml2js';
import { sql } from 'drizzle-orm';

const traverse = traverseDefault.default || traverseDefault;

// Mock NodeFlags if types not available during run
const NodeFlags = {
  HAS_STATIC_IMPORTS: 1,
  HAS_DYNAMIC_IMPORTS: 2,
  SERVER_ONLY: 4,
  CLIENT_SAFE: 8,
  HAS_ROUTE: 16,
  HAS_TEST: 32,
  USES_REDIS: 64,
  USES_QDRANT: 128,
  HAS_SCHEMA: 256,
  HAS_SVG_MAPPING: 512,
};

async function runEnhancedExtractor() {
  console.log('🚀 [Enhanced-Graph-Extractor] Starting layered graph synthesis (OOM-Hardened)...');

  const { db } = await import('../src/lib/server/db/client.js');
  const { enhancedGraphMappings } = await import('../src/lib/server/db/schema/graph-mappings.js');

  const EXTRA_INDEX_DIRS = ['scripts', 'tests', 'e2e', 'documents', 'docs'];
  const SCAN_DIRS = ['src', ...EXTRA_INDEX_DIRS];
  const DB_BATCH_SIZE = parseInt(process.env.GRAPH_BATCH_SIZE || '100', 10);

  const pending = new Map();
  let persisted = 0;

  function mergeMappings(base, patch) {
    return {
      ...base,
      ...patch,
      flags: (base.flags ?? 0) | (patch.flags ?? 0),
      edges: [...(base.edges ?? []), ...(patch.edges ?? [])],
      metadata: { ...(base.metadata ?? {}), ...(patch.metadata ?? {}) },
      scores: { ...(base.scores ?? {}), ...(patch.scores ?? {}) },
      vectors: { ...(base.vectors ?? {}), ...(patch.vectors ?? {}) },
      manifold4: patch.manifold4 ?? base.manifold4,
    };
  }

  function queueMapping(mapping) {
    const existing = pending.get(mapping.id);
    pending.set(mapping.id, existing ? mergeMappings(existing, mapping) : mapping);
  }

  async function flushMappings() {
    if (pending.size === 0) return;

    const batch = Array.from(pending.values()).map((m) => ({
      ...m,
      updatedAt: new Date(),
    }));

    pending.clear();

    await db
      .insert(enhancedGraphMappings)
      .values(batch)
      .onConflictDoUpdate({
        target: [enhancedGraphMappings.id],
        set: {
          kind: sql`COALESCE(EXCLUDED.kind, enhanced_graph_mappings.kind)`,
          label: sql`COALESCE(EXCLUDED.label, enhanced_graph_mappings.label)`,
          path: sql`COALESCE(EXCLUDED.path, enhanced_graph_mappings.path)`,
          summary: sql`COALESCE(EXCLUDED.summary, enhanced_graph_mappings.summary)`,
          edges: sql`COALESCE(enhanced_graph_mappings.edges, '[]'::jsonb) || COALESCE(EXCLUDED.edges, '[]'::jsonb)`,
          scores: sql`COALESCE(enhanced_graph_mappings.scores, '{}'::jsonb) || COALESCE(EXCLUDED.scores, '{}'::jsonb)`,
          flags: sql`COALESCE(enhanced_graph_mappings.flags, 0) | COALESCE(EXCLUDED.flags, 0)`,
          vectors: sql`COALESCE(enhanced_graph_mappings.vectors, '{}'::jsonb) || COALESCE(EXCLUDED.vectors, '{}'::jsonb)`,
          manifold4: sql`COALESCE(EXCLUDED.manifold4, enhanced_graph_mappings.manifold4)`,
          metadata: sql`COALESCE(enhanced_graph_mappings.metadata, '{}'::jsonb) || COALESCE(EXCLUDED.metadata, '{}'::jsonb)`,
          updatedAt: new Date(),
        },
      });

    persisted += batch.length;
  }

  async function* streamFiles(dirs, includeGlobs) {
    const args = ['--files', '--hidden', '--no-messages'];

    for (const dir of dirs) args.push(dir);
    for (const glob of includeGlobs) args.push('-g', glob);
    for (const ignore of ['!node_modules/**', '!.svelte-kit/**', '!dist/**', '!tmp/**']) {
      args.push('-g', ignore);
    }

    const proc = spawn('rg', args, { stdio: ['ignore', 'pipe', 'inherit'] });
    const rl = readline.createInterface({ input: proc.stdout });

    try {
      for await (const line of rl) {
        const file = line.trim();
        if (file) yield file;
      }
    } finally {
      await new Promise((resolve, reject) => {
        proc.on('error', reject);
        proc.on('close', (code) => {
          if (code === 0 || code === 1) resolve();
          else reject(new Error(`rg --files exited with code ${code}`));
        });
      });
    }
  }

  // --- 1. AST Extractor ---
  console.log('🔍 Running AST Extractor (Imports, Exports, Boundaries)...');

  let astProcessed = 0;
  for await (const file of streamFiles(SCAN_DIRS, ['*.ts', '*.js', '*.svelte'])) {
    astProcessed++;
    if (astProcessed % 500 === 0) process.stdout.write(`\r   Processed ${astProcessed} files...`);

    try {
      const content = await fs.readFile(file, 'utf-8');
      let flags = 0;
      const edges = [];

      if (file.endsWith('.svelte')) {
        if (content.includes('import')) flags |= NodeFlags.HAS_STATIC_IMPORTS;
        if (content.includes('await import')) flags |= NodeFlags.HAS_DYNAMIC_IMPORTS;
      } else {
        try {
          const ast = parser.parse(content, {
            sourceType: 'module',
            plugins: ['typescript', 'decorators-legacy', 'classProperties'],
          });

          traverse(ast, {
            ImportDeclaration(p) {
              flags |= NodeFlags.HAS_STATIC_IMPORTS;
              edges.push({
                relation: 'STATIC_IMPORTS',
                targets: [p.node.source.value],
                confidence: 1.0,
                source: 'ast',
              });
            },
            CallExpression(p) {
              if (p.node.callee.type === 'Import') {
                flags |= NodeFlags.HAS_DYNAMIC_IMPORTS;
                if (p.node.arguments[0]?.type === 'StringLiteral') {
                  edges.push({
                    relation: 'DYNAMIC_IMPORTS',
                    targets: [p.node.arguments[0].value],
                    confidence: 1.0,
                    source: 'ast',
                  });
                }
              }
            },
          });
        } catch {
          if (content.includes('import')) flags |= NodeFlags.HAS_STATIC_IMPORTS;
        }
      }

      if (file.includes('.server.') || file.includes('/api/')) flags |= NodeFlags.SERVER_ONLY;
      if (!file.includes('.server.')) flags |= NodeFlags.CLIENT_SAFE;
      if (file.includes('+page') || file.includes('+server')) flags |= NodeFlags.HAS_ROUTE;
      if (file.includes('.test.') || file.includes('.spec.')) flags |= NodeFlags.HAS_TEST;

      queueMapping({
        id: `file:${file}`,
        kind: 'file',
        label: path.basename(file),
        path: file,
        flags,
        edges,
      });
    } catch {}

    if (pending.size >= DB_BATCH_SIZE) {
      await flushMappings();
    }
  }
  console.log(`\n✅ AST pass complete: ${astProcessed} files.`);

  // --- 2. Ripgrep Extractor (Streaming) ---
  console.log('🔍 Running Streaming Ripgrep Extractor...');

  const patterns = [
    { pattern: "redis\\.get\\(['\"]([^'\"]+)['\"]", relation: 'USES_REDIS_KEY', kind: 'redis_key', flag: NodeFlags.USES_REDIS },
    { pattern: "redis\\.set\\(['\"]([^'\"]+)['\"]", relation: 'USES_REDIS_KEY', kind: 'redis_key', flag: NodeFlags.USES_REDIS },
    { pattern: "qdrant\\.search\\(['\"]([^'\"]+)['\"]", relation: 'USES_QDRANT_COLLECTION', kind: 'qdrant_collection', flag: NodeFlags.USES_QDRANT },
    { pattern: "qdrant\\.upsert\\(['\"]([^'\"]+)['\"]", relation: 'USES_QDRANT_COLLECTION', kind: 'qdrant_collection', flag: NodeFlags.USES_QDRANT },
    { pattern: 'ENV\\.([A-Z0-9_]+)', relation: 'USES_ENV_VAR', kind: 'env_var', flag: 0 },
    { pattern: "fetch\\(['\"]\\/api\\/([^'\"]+)['\"]", relation: 'CALLS_API', kind: 'api_path', flag: 0 },
    { pattern: 'TODO:', relation: 'HAS_TODO', kind: 'todo', flag: 0 },
  ];

  for (const { pattern, relation, kind, flag } of patterns) {
    console.log(`   Searching for ${relation}...`);
    const rg = spawn('rg', [pattern, '--json', ...SCAN_DIRS], { stdio: ['ignore', 'pipe', 'inherit'] });
    const rl = readline.createInterface({ input: rg.stdout });

    try {
      for await (const line of rl) {
        try {
          const data = JSON.parse(line);
          if (data.type !== 'match') continue;

          const filePath = data.data.path.text;
          const matchText = data.data.submatches[0].match.text;
          const targetMatch = matchText.match(/['"]([^'"]+)['"]/)?.[1] || matchText;

          queueMapping({
            id: `file:${filePath}`,
            kind: 'file',
            label: path.basename(filePath),
            path: filePath,
            flags: flag,
            edges: [
              {
                relation,
                targets: [`${kind}:${targetMatch}`],
                confidence: 0.8,
                source: 'rg',
              },
            ],
          });

          if (pending.size >= DB_BATCH_SIZE) {
            await flushMappings();
          }
        } catch {}
      }
    } finally {
      await new Promise((resolve, reject) => {
        rg.on('error', reject);
        rg.on('close', (code) => {
          if (code === 0 || code === 1) resolve();
          else reject(new Error(`rg exited with code ${code}`));
        });
      });
    }
  }

  // --- 3. SVG Extractor ---
  console.log('🔍 Running SVG Extractor...');
  const svgParser = new xml2js.Parser();

  for await (const file of streamFiles(['src', 'static'], ['*.svg'])) {
    try {
      const content = await fs.readFile(file, 'utf-8');
      const result = await svgParser.parseStringPromise(content);
      const id = `svg:${path.basename(file)}`;

      const findText = (obj) => {
        const texts = [];
        if (typeof obj !== 'object' || obj === null) return texts;
        for (const key in obj) {
          if (key === 'text' || key === '_') {
            if (typeof obj[key] === 'string') texts.push(obj[key]);
            else if (Array.isArray(obj[key])) texts.push(...obj[key]);
          } else {
            texts.push(...findText(obj[key]));
          }
        }
        return texts;
      };

      const labels = findText(result);
      queueMapping({
        id,
        kind: 'svg',
        label: path.basename(file),
        path: file,
        flags: NodeFlags.HAS_SVG_MAPPING,
        edges: [],
        summary: `SVG Architecture diagram: ${labels.slice(0, 10).join(', ')}`,
        metadata: { labels },
      });
    } catch {}

    if (pending.size >= DB_BATCH_SIZE) {
      await flushMappings();
    }
  }

  // --- 3b. Proto Extractor ---
  console.log('🔍 Running Proto Extractor...');
  for await (const file of streamFiles(['proto', 'src/lib/server/grpc'], ['*.proto'])) {
    try {
      const content = await fs.readFile(file, 'utf-8');
      const services = [...content.matchAll(/service\s+(\w+)/g)].map((m) => m[1]);
      const rpcs = [...content.matchAll(/rpc\s+(\w+)\s*\(/g)].map((m) => m[1]);
      const messages = [...content.matchAll(/message\s+(\w+)/g)].map((m) => m[1]);

      queueMapping({
        id: `proto:${file}`,
        kind: 'proto',
        label: path.basename(file),
        path: file,
        flags: 0,
        edges: [
          ...services.map((service) => ({
            relation: 'DECLARES_SERVICE',
            targets: [`grpc_service:${service}`],
            confidence: 0.9,
            source: 'proto',
          })),
          ...rpcs.map((rpc) => ({
            relation: 'DECLARES_RPC',
            targets: [`grpc_method:${rpc}`],
            confidence: 0.9,
            source: 'proto',
          })),
        ],
        summary: [
          `services: ${services.slice(0, 5).join(', ') || 'none'}`,
          `rpcs: ${rpcs.slice(0, 5).join(', ') || 'none'}`,
          `messages: ${messages.slice(0, 5).join(', ') || 'none'}`,
        ].join(' | '),
        metadata: { services, rpcs, messages },
      });
    } catch {}

    if (pending.size >= DB_BATCH_SIZE) {
      await flushMappings();
    }
  }

  // --- 4. AGENTS.md Extractor ---
  console.log('🔍 Running AGENTS.md Extractor...');
  for await (const file of streamFiles(['.'], ['AGENTS.md'])) {
    try {
      const content = await fs.readFile(file, 'utf-8');
      const dir = path.dirname(file);
      const id = `dir:${dir === '.' ? 'root' : dir}`;

      const features = content.match(/## (Features|Repo at a glance)([\s\S]*?)##/i)?.[2] || '';
      const protocols = content.match(/## (Protocols|Critical conventions)([\s\S]*?)##/i)?.[2] || '';

      const existing = pending.get(id) || {
        id,
        kind: 'directory',
        label: path.basename(dir) || 'root',
        path: dir,
        flags: 0,
        edges: [],
        metadata: {},
      };

      queueMapping({
        ...existing,
        summary: content.split('\n').slice(0, 5).join('\n'),
        metadata: {
          ...existing.metadata,
          agentsContext: true,
          extractedFeatures: features.trim(),
          criticalConventions: protocols.trim(),
        },
      });
    } catch {}

    if (pending.size >= DB_BATCH_SIZE) {
      await flushMappings();
    }
  }

  // --- 5. Persist to DB ---
  console.log('💾 Persisting enhanced mappings to DB...');

  try {
    await flushMappings();
  } catch (dbErr) {
    console.error(`\nDB batch error: ${dbErr.message}`);
  }

  console.log(`\n✅ Persistence complete. ${persisted} rows written.`);
  process.exit(0);
}

runEnhancedExtractor().catch(console.error);
