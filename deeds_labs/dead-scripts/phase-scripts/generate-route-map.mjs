#!/usr/bin/env node
/**
 * Route Map Generator - Phase 79 Codebase Scanner
 *
 * Scans src/routes/ recursively, extracts route metadata, and indexes to Qdrant
 * for codebase-aware Phase 79 autonomous code generation.
 *
 * Extracts:
 * - Route path & file location
 * - HTTP methods (GET/POST/PUT/DELETE/PATCH)
 * - Auth requirements (locals.user checks)
 * - Validation schemas (Zod usage)
 * - Redis usage (rate limiting, caching)
 * - Database queries (Drizzle ORM)
 * - Dependencies (imports)
 *
 * Output:
 * - JSON file: knowledge/route-map.json
 * - Qdrant index: codebase_routes collection (768 dims)
 *
 * Usage:
 *   node scripts/generate-route-map.mjs
 *   node scripts/generate-route-map.mjs --skip-index
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const ROUTES_DIR = path.join(__dirname, '../src/routes');
const OUTPUT_FILE = path.join(__dirname, '../knowledge/route-map.json');
const QDRANT_URL = process.env.QDRANT_URL || 'http://localhost:6333';
const COLLECTION_NAME = 'codebase_routes';

// Metadata extraction patterns
const PATTERNS = {
  httpMethods: /export\s+const\s+(GET|POST|PUT|DELETE|PATCH|OPTIONS)\s*[:=]/g,
  auth: /locals\.user|validateSession|lucia\.validateSession/g,
  validation: /z\.|zod\.|\.parse\(|\.safeParse\(/g,
  rateLimit: /rateLimit\(|redis\.(incr|setex|pexpire)/g,
  caching: /redis\.(get|set|del)|cache\./g,
  database: /db\.(select|insert|update|delete)\(|from\(|drizzle/g,
  imports: /import\s+.*?from\s+['"](.+?)['"]/g,
  loadFunction: /export\s+const\s+load\s*[:=]/,
  actions: /export\s+const\s+actions\s*[:=]/,
  schemas: /const\s+(\w+Schema)\s*=/g,
};

// Extract metadata from file content
function extractMetadata(content, filePath, routePath) {
  const metadata = {
    route: routePath,
    file: path.relative(path.join(__dirname, '..'), filePath).replace(/\\/g, '/'),
    type: detectRouteType(path.basename(filePath)),
    methods: [],
    features: {
      auth: false,
      validation: false,
      rateLimit: false,
      caching: false,
      database: false,
      loadFunction: false,
      actions: false,
    },
    imports: [],
    schemas: [],
    dependencies: [],
    lineCount: content.split('\n').length,
  };

  // Extract HTTP methods
  const methodMatches = [...content.matchAll(PATTERNS.httpMethods)];
  metadata.methods = [...new Set(methodMatches.map(m => m[1]))];

  // Detect features
  metadata.features.auth = PATTERNS.auth.test(content);
  metadata.features.validation = PATTERNS.validation.test(content);
  metadata.features.rateLimit = PATTERNS.rateLimit.test(content);
  metadata.features.caching = PATTERNS.caching.test(content);
  metadata.features.database = PATTERNS.database.test(content);
  metadata.features.loadFunction = PATTERNS.loadFunction.test(content);
  metadata.features.actions = PATTERNS.actions.test(content);

  // Extract imports
  const importMatches = [...content.matchAll(PATTERNS.imports)];
  metadata.imports = [...new Set(importMatches.map(m => m[1]))];

  // Detect dependencies
  if (metadata.features.auth) metadata.dependencies.push('lucia-auth');
  if (metadata.features.validation) metadata.dependencies.push('zod');
  if (metadata.features.rateLimit || metadata.features.caching) metadata.dependencies.push('redis');
  if (metadata.features.database) metadata.dependencies.push('drizzle-orm');

  // Extract Zod schemas
  const schemaMatches = [...content.matchAll(PATTERNS.schemas)];
  metadata.schemas = schemaMatches.map(m => m[1]);

  return metadata;
}

// Route type detection
function detectRouteType(filename) {
  if (filename === '+server.ts' || filename === '+server.js') return 'endpoint';
  if (filename === '+page.server.ts' || filename === '+page.server.js') return 'page-server';
  if (filename === '+page.svelte') return 'page';
  if (filename === '+layout.server.ts' || filename === '+layout.server.js') return 'layout-server';
  if (filename === '+layout.svelte') return 'layout';
  return 'unknown';
}

// Scan routes recursively with metadata extraction
function scanRoutes(dir, baseRoute = '') {
  const routes = [];
  const items = fs.readdirSync(dir, { withFileTypes: true });

  for (const item of items) {
    const fullPath = path.join(dir, item.name);

    if (item.isDirectory()) {
      // Skip excluded directories
      if (['.svelte-kit', 'node_modules', 'quarantined-routes', 'src.backup'].includes(item.name)) {
        continue;
      }

      // Handle route parameters [param] and groups (group)
      let routeName = item.name;
      if (routeName.startsWith('(') && routeName.endsWith(')')) {
        routeName = ''; // Route groups don't affect URL
      } else if (routeName.startsWith('[') && routeName.endsWith(']')) {
        // Convert [id] → :id, [...slug] → :slug*
        const param = routeName.slice(1, -1);
        routeName = param.startsWith('...') ? `:${param.slice(3)}*` : `:${param}`;
      }

      const newBaseRoute = routeName ? path.join(baseRoute, routeName) : baseRoute;
      routes.push(...scanRoutes(fullPath, newBaseRoute));
    } else {
      const validFiles = ['+page.svelte', '+server.ts', '+server.js', '+page.server.ts', '+page.server.js', '+layout.server.ts', '+layout.svelte'];

      if (validFiles.includes(item.name)) {
        const routePath = '/' + baseRoute.replace(/\\/g, '/').replace(/\/+/g, '/').replace(/\/$/, '') || '/';
        const content = fs.readFileSync(fullPath, 'utf-8');
        const metadata = extractMetadata(content, fullPath, routePath);
        routes.push(metadata);
      }
    }
  }
  return routes;
}

// Generate embedding for route (integrates with Ollama)
async function generateEmbedding(text) {
  try {
    const response = await fetch('http://localhost:11434/api/embeddings', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: 'embeddinggemma:latest',
        prompt: text
      })
    });

    if (!response.ok) {
      throw new Error(`Ollama embedding failed: ${response.statusText}`);
    }

    const data = await response.json();
    return data.embedding;
  } catch (error) {
    console.warn('⚠️  Ollama embedding unavailable, skipping Qdrant indexing');
    return null;
  }
}

// Index route to Qdrant
async function indexToQdrant(route, embedding) {
  if (!embedding) return false;

  const point = {
    id: `route_${route.file.replace(/[^a-zA-Z0-9]/g, '_')}`,
    vector: embedding,
    payload: {
      source: 'codebase',
      type: 'route',
      route: route.route,
      file: route.file,
      routeType: route.type,
      methods: route.methods,
      features: route.features,
      dependencies: route.dependencies,
      schemas: route.schemas,
      imports: route.imports.slice(0, 20), // Limit payload size
      lineCount: route.lineCount,
      indexed_at: new Date().toISOString(),
    }
  };

  try {
    // Check if collection exists
    const collectionsResponse = await fetch(`${QDRANT_URL}/collections/${COLLECTION_NAME}`);

    if (!collectionsResponse.ok) {
      // Create collection
      await fetch(`${QDRANT_URL}/collections/${COLLECTION_NAME}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          vectors: {
            size: 768, // embeddinggemma dimensions
            distance: 'Cosine'
          }
        })
      });
      console.log(`✅ Created Qdrant collection: ${COLLECTION_NAME}`);
    }

    // Upsert point
    const upsertResponse = await fetch(`${QDRANT_URL}/collections/${COLLECTION_NAME}/points`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        points: [point]
      })
    });

    return upsertResponse.ok;
  } catch (error) {
    console.error(`❌ Qdrant error for ${route.file}:`, error.message);
    return false;
  }
}

// Main execution
async function main() {
  const skipIndex = process.argv.includes('--skip-index');

  console.log('🗺️  Route Map Generator - Phase 79 Codebase Scanner\n');

  // 1. Scan routes
  console.log(`📂 Scanning routes in: ${ROUTES_DIR}`);
  const routes = scanRoutes(ROUTES_DIR);
  console.log(`✅ Found ${routes.length} route files\n`);

  // 2. Save JSON
  const outputDir = path.dirname(OUTPUT_FILE);
  if (!fs.existsSync(outputDir)) {
    fs.mkdirSync(outputDir, { recursive: true });
  }

  const routeMap = {
    generated_at: new Date().toISOString(),
    total_routes: routes.length,
    summary: {
      endpoints: routes.filter(r => r.type === 'endpoint').length,
      pages: routes.filter(r => r.type === 'page-server' || r.type === 'page').length,
      layouts: routes.filter(r => r.type === 'layout-server' || r.type === 'layout').length,
      with_auth: routes.filter(r => r.features.auth).length,
      with_validation: routes.filter(r => r.features.validation).length,
      with_database: routes.filter(r => r.features.database).length,
    },
    routes: routes.sort((a, b) => a.route.localeCompare(b.route))
  };

  fs.writeFileSync(OUTPUT_FILE, JSON.stringify(routeMap, null, 2));
  console.log(`💾 Saved route map: ${OUTPUT_FILE}`);
  console.log(`   ${routeMap.summary.endpoints} endpoints, ${routeMap.summary.pages} pages, ${routeMap.summary.layouts} layouts\n`);

  // 3. Index to Qdrant (unless --skip-index)
  if (!skipIndex) {
    console.log('🔍 Indexing routes to Qdrant...');
    let indexedCount = 0;

    for (const route of routes) {
      // Generate searchable text representation
      const searchText = `
Route: ${route.route}
File: ${route.file}
Type: ${route.type}
Methods: ${route.methods.join(', ')}
Features: ${Object.entries(route.features).filter(([_, v]) => v).map(([k]) => k).join(', ')}
Dependencies: ${route.dependencies.join(', ')}
Schemas: ${route.schemas.join(', ') || 'none'}
      `.trim();

      const embedding = await generateEmbedding(searchText);
      if (embedding) {
        const success = await indexToQdrant(route, embedding);
        if (success) {
          indexedCount++;
          process.stdout.write(`   Indexed: ${route.route.padEnd(40)} (${route.type})\r`);
        }
      }
    }

    console.log(`\n✅ Indexed ${indexedCount}/${routes.length} routes to Qdrant: ${COLLECTION_NAME}\n`);
  }

  // 4. Summary
  console.log('📊 Route Map Summary:');
  console.log('━'.repeat(70));

  const byType = routes.reduce((acc, r) => {
    acc[r.type] = (acc[r.type] || 0) + 1;
    return acc;
  }, {});

  Object.entries(byType).forEach(([type, count]) => {
    console.log(`   ${type.padEnd(20)} ${count.toString().padStart(4)}`);
  });

  console.log('\n📈 Feature Usage:');
  console.log('━'.repeat(70));
  const features = [
    ['Authentication (lucia)', routes.filter(r => r.features.auth).length],
    ['Validation (Zod)', routes.filter(r => r.features.validation).length],
    ['Rate Limiting', routes.filter(r => r.features.rateLimit).length],
    ['Caching (Redis)', routes.filter(r => r.features.caching).length],
    ['Database (Drizzle)', routes.filter(r => r.features.database).length],
    ['Load Functions', routes.filter(r => r.features.loadFunction).length],
    ['Form Actions', routes.filter(r => r.features.actions).length],
  ];

  features.forEach(([name, count]) => {
    const pct = Math.round((count / routes.length) * 100);
    const bar = '█'.repeat(Math.floor(pct / 3));
    console.log(`   ${name.padEnd(25)} ${bar.padEnd(34)} ${count.toString().padStart(3)} (${pct}%)`);
  });

  console.log('\n🎯 Top Routes by Complexity (features used):');
  console.log('━'.repeat(70));
  const complexRoutes = routes
    .map(r => ({
      ...r,
      complexity: Object.values(r.features).filter(Boolean).length
    }))
    .sort((a, b) => b.complexity - a.complexity)
    .slice(0, 5);

  complexRoutes.forEach(r => {
    const featuresUsed = Object.entries(r.features)
      .filter(([_, v]) => v)
      .map(([k]) => k)
      .join(', ');
    console.log(`   ${r.route.padEnd(35)} ${r.complexity} features`);
    console.log(`      └─ ${featuresUsed}`);
  });

  console.log('\n✅ Route map generation complete!');
  console.log('\n💡 Usage in Phase 79:');
  console.log('   - Query: "API endpoint with auth and validation"');
  console.log('   - Retrieves: Actual implemented routes from codebase');
  console.log('   - Context: File paths, schemas, dependencies for generation\n');
}

main().catch(error => {
  console.error('❌ Route map generation failed:', error);
  process.exit(1);
});
