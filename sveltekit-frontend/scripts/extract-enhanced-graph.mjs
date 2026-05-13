/**
 * scripts/extract-enhanced-graph.mjs
 * 
 * Layered extractor for Enhanced Graph Mappings.
 * Combines AST, rg/awk, SVG, and Proto parsing.
 */

import fs from 'fs/promises';
import path from 'path';
import { glob } from 'glob';
import { execSync } from 'child_process';
import parser from '@babel/parser';
import traverseDefault from '@babel/traverse';
const traverse = traverseDefault.default || traverseDefault;
import xml2js from 'xml2js';
import protoLoader from '@grpc/proto-loader';
import { sql } from 'drizzle-orm';


async function runEnhancedExtractor() {
  console.log('🚀 [Enhanced-Graph-Extractor] Starting layered graph synthesis...');

  // Late imports for DB and Types
  const { db } = await import('../src/lib/server/db/client.js');
  const { enhancedGraphMappings } = await import('../src/lib/server/db/schema/graph-mappings.js');
  const { NodeFlags } = await import('../src/lib/server/types/graph-mapping.js');

  const mappings = new Map();

  // --- 1. AST Extractor (TypeScript/JavaScript) ---
  console.log('🔍 Running AST Extractor (Imports, Exports, Boundaries)...');
  const EXTRA_INDEX_DIRS = ['scripts', 'tests', 'e2e', 'documents', 'docs'];
  const codeFiles = await glob('{src,' + EXTRA_INDEX_DIRS.join(',') + '}/**/*.{ts,js,svelte}', { 
    ignore: ['node_modules/**', 'dist/**', '.svelte-kit/**', 'tmp/**'] 
  });

  
  for (const file of codeFiles) {
    try {
      const content = await fs.readFile(file, 'utf-8');
      let flags = 0;
      const edges = [];

      if (file.endsWith('.svelte')) {
        // Simple regex for svelte since babel might struggle with .svelte files directly
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
                source: 'ast'
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
                    source: 'ast'
                  });
                }
              }
            }
          });
        } catch (astErr) {
          // If AST fails, fallback to regex for basic flags
          if (content.includes('import')) flags |= NodeFlags.HAS_STATIC_IMPORTS;
        }
      }

      if (file.includes('.server.') || file.includes('/api/')) flags |= NodeFlags.SERVER_ONLY;
      if (!file.includes('.server.')) flags |= NodeFlags.CLIENT_SAFE;
      if (file.includes('+page') || file.includes('+server')) flags |= NodeFlags.HAS_ROUTE;
      if (file.includes('.test.') || file.includes('.spec.')) flags |= NodeFlags.HAS_TEST;

      mappings.set(`file:${file}`, {
        id: `file:${file}`,
        kind: 'file',
        label: path.basename(file),
        path: file,
        flags,
        edges
      });
    } catch (err) {
      // console.warn(`Could not process ${file}: ${err.message}`);
    }
  }

  // --- 2. Ripgrep Extractor (Redis, Qdrant, Protos) ---
  console.log('🔍 Running Ripgrep Extractor (Redis keys, Qdrant collections)...');
  
  const rgExtract = (pattern, relation, kind) => {
    try {
      const dirs = ['src', ...EXTRA_INDEX_DIRS].join(' ');
      const output = execSync(`rg "${pattern}" --json ${dirs}`, { encoding: 'utf-8' });

      const lines = output.split('\n').filter(Boolean);
      for (const line of lines) {
        const data = JSON.parse(line);
        if (data.type === 'match') {
          const file = data.data.path.text;
          const match = data.data.submatches[0].match.text;
          const target = match.match(/['"]([^'"]+)['"]/)?.[1] || match;
          
          const mapping = mappings.get(`file:${file}`);
          if (mapping) {
            mapping.edges.push({
              relation,
              targets: [`${kind}:${target}`],
              confidence: 0.8,
              source: 'rg'
            });
            if (kind === 'redis_key') mapping.flags |= NodeFlags.USES_REDIS;
            if (kind === 'qdrant_collection') mapping.flags |= NodeFlags.USES_QDRANT;
          }
        }
      }
    } catch (err) { /* ignore rg errors */ }
  };

  rgExtract("redis\\.get\\(['\"]([^'\"]+)['\"]", 'USES_REDIS_KEY', 'redis_key');
  rgExtract("redis\\.set\\(['\"]([^'\"]+)['\"]", 'USES_REDIS_KEY', 'redis_key');
  rgExtract("qdrant\\.search\\(['\"]([^'\"]+)['\"]", 'USES_QDRANT_COLLECTION', 'qdrant_collection');
  rgExtract("qdrant\\.upsert\\(['\"]([^'\"]+)['\"]", 'USES_QDRANT_COLLECTION', 'qdrant_collection');
  rgExtract("ENV\\.([A-Z0-9_]+)", 'USES_ENV_VAR', 'env_var');
  rgExtract("fetch\\(['\"]\\/api\\/([^'\"]+)['\"]", 'CALLS_API', 'api_path');
  rgExtract("TODO:", 'HAS_TODO', 'todo');

  // --- 3. Proto Extractor (Services and Methods) ---
  console.log('🔍 Running Proto Extractor (gRPC Services)...');
  const protoFiles = await glob('**/*.proto', { ignore: ['node_modules/**'] });

  /*
  for (const file of protoFiles) {
    try {
      const packageDefinition = await protoLoader.load(file, {
        keepCase: true,
        longs: String,
        enums: String,
        defaults: true,
        oneofs: true
      }).catch(err => {
        // console.warn(`   [SKIP] Proto ${file}: ${err.message}`);
        return null;
      });
      
      if (!packageDefinition) continue;
      
      const id = `proto:${path.basename(file)}`;
      const edges = [];
      
      for (const [key, value] of Object.entries(packageDefinition)) {
        if (value.format === 'Protocol Buffer Service Descriptor') {
          const serviceName = key.split('.').pop();
          edges.push({
            relation: 'EXPORTS',
            targets: [`grpc_service:${serviceName}`],
            confidence: 1.0,
            source: 'proto'
          });
          
          for (const [methodName, methodValue] of Object.entries(value)) {
            if (typeof methodValue === 'object' && methodValue.path) {
              edges.push({
                relation: 'EXPORTS',
                targets: [`grpc_method:${methodName}`],
                confidence: 1.0,
                source: 'proto'
              });
            }
          }
        }
      }

      mappings.set(id, {
        id,
        kind: 'proto',
        label: path.basename(file),
        path: file,
        flags: NodeFlags.HAS_SCHEMA,
        edges,
        summary: `gRPC Protocol definition: ${path.basename(file)}`
      });
    } catch (err) {}
  }
  */

  // --- 4. SVG Extractor (Nodes and Connections) ---
  console.log('🔍 Running SVG Extractor (Architecture Nodes)...');
  const svgFiles = await glob('{src,static}/**/*.svg');
  const svgParser = new xml2js.Parser();

  for (const file of svgFiles) {
    try {
      const content = await fs.readFile(file, 'utf-8');
      const result = await svgParser.parseStringPromise(content);
      
      const id = `svg:${path.basename(file)}`;
      const edges = [];
      
      // Simple XML traversal to find text labels
      const findText = (obj) => {
        let texts = [];
        if (typeof obj !== 'object') return texts;
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
      
      mappings.set(id, {
        id,
        kind: 'svg',
        label: path.basename(file),
        path: file,
        flags: NodeFlags.HAS_SVG_MAPPING,
        edges,
        summary: `SVG Architecture diagram containing: ${labels.slice(0, 10).join(', ')}`,
        metadata: { labels }
      });
    } catch (err) {}
  }

  // --- 4. Persist to DB ---
  console.log(`💾 Persisting ${mappings.size} enhanced mappings to DB (batching)...`);
  
  const allMappings = Array.from(mappings.values());
  const BATCH_SIZE = 100;

  for (let i = 0; i < allMappings.length; i += BATCH_SIZE) {
    const batch = allMappings.slice(i, i + BATCH_SIZE).map(m => ({
      ...m,
      updatedAt: new Date()
    }));

    try {
      await db.insert(enhancedGraphMappings)
        .values(batch)
        .onConflictDoUpdate({
          target: [enhancedGraphMappings.id],
          set: {
            label: sql`EXCLUDED.label`,
            edges: sql`EXCLUDED.edges`,
            flags: sql`EXCLUDED.flags`,
            summary: sql`EXCLUDED.summary`,
            updatedAt: new Date()
          }
        });
      process.stdout.write(`\r   Persisted ${Math.min(i + BATCH_SIZE, allMappings.length)} / ${allMappings.length}...`);
    } catch (dbErr) {
      console.error(`\nDB Batch Error at index ${i}: ${dbErr.message}`);
    }
  }
  console.log('\n');


  console.log('🎉 Enhanced Graph Extraction completed successfully.');
  process.exit(0);
}

runEnhancedExtractor().catch(console.error);
