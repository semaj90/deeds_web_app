#!/usr/bin/env node
/**
 * Phase 89: Code Unit Indexer
 *
 * Indexes code units (routes, components, modules) with:
 * - Stable IDs and rich payloads
 * - Signature embeddings (for similarity)
 * - Context embeddings (for fixes)
 * - Dependency graph edges
 * - Hardcoded value detection
 *
 * Usage:
 *   node scripts/phase89-code-unit-indexer.mjs --index          # Full index
 *   node scripts/phase89-code-unit-indexer.mjs --routes         # Index routes only
 *   node scripts/phase89-code-unit-indexer.mjs --components     # Index components
 *   node scripts/phase89-code-unit-indexer.mjs --modules        # Index modules
 *   node scripts/phase89-code-unit-indexer.mjs --deps           # Build dep graph
 */

import { spawn } from 'child_process';
import { createHash } from 'crypto';
import { existsSync, readFileSync, readdirSync } from 'fs';
import ollama from 'ollama';
import { basename, dirname, extname, join, relative } from 'path';
import pg from 'pg';
import { createClient } from 'redis';

const { Pool } = pg;

// =============================================================================
// Configuration
// =============================================================================
const CONFIG = {
  postgres: {
    host: process.env.PGHOST || 'localhost',
    port: parseInt(process.env.PGPORT || '5434'),
    database: process.env.PGDATABASE || 'legal_ai_db',
    user: process.env.PGUSER || 'legal_admin',
    password: process.env.PGPASSWORD || '123456'
  },
  redis: { url: process.env.REDIS_URL || 'redis://127.0.0.1:6379' },
  qdrant: {
    url: process.env.QDRANT_URL || 'http://127.0.0.1:6333',
    collections: {
      codeUnits: 'phase89_code_units',
      codeChunks: 'phase89_code_chunks',
      errorChunks: 'phase89_error_chunks',
      kbCards: 'phase89_kb_cards'
    }
  },
  ollama: {
    embeddingModel: 'embeddinggemma:latest',
    chatModel: 'gemma3-legal:latest',
    retryCount: 3
  },
  python: process.env.PHASE72_PYTHON ||
          'C:\\Users\\james\\Videos\\deeds-web-app\\.venv\\Scripts\\python.exe'
};

let db, redis;

// =============================================================================
// Database Connections
// =============================================================================
async function connect() {
  console.log('\n🔌 Connecting...');

  try {
    db = new Pool(CONFIG.postgres);
    await db.query('SELECT 1');
    console.log('   ✅ PostgreSQL');
  } catch (e) {
    console.error(`   ❌ PostgreSQL failed: ${e.message}`);
    throw e;
  }

  redis = createClient({ url: CONFIG.redis.url });
  redis.on('error', () => {});
  await redis.connect().catch(() => {});
  if (redis.isOpen) console.log('   ✅ Redis');

  // Ensure Qdrant collections exist
  for (const [name, collection] of Object.entries(CONFIG.qdrant.collections)) {
    try {
      const resp = await fetch(`${CONFIG.qdrant.url}/collections/${collection}`);
      if (!resp.ok) {
        await fetch(`${CONFIG.qdrant.url}/collections/${collection}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            vectors: { size: 768, distance: 'Cosine' }
          })
        });
        console.log(`   ✅ Created ${collection}`);
      }
    } catch (e) {
      console.error(`   ⚠️  Qdrant ${collection} error: ${e.message}`);
    }
  }
  console.log('');
}

// =============================================================================
// CUDA Detection (using correct Python path)
// =============================================================================
async function probeCuda() {
  return new Promise((resolve) => {
    const proc = spawn(CONFIG.python, ['-c', `
import json, torch
try:
    print(json.dumps({
        "ok": True,
        "cuda": torch.cuda.is_available(),
        "name": torch.cuda.get_device_name(0) if torch.cuda.is_available() else None
    }))
except Exception as e:
    print(json.dumps({"ok": False, "error": str(e)}))
`]);

    let output = '';
    proc.stdout.on('data', (d) => output += d.toString());
    proc.on('close', () => {
      try {
        const info = JSON.parse(output.trim());
        if (info.cuda) {
          console.log(`🚀 CUDA: ${info.name}`);
        } else {
          console.log('⚠️  CUDA not available');
        }
        resolve(info);
      } catch {
        console.log('⚠️  Could not detect CUDA');
        resolve({ ok: false, cuda: false });
      }
    });
    proc.on('error', () => resolve({ ok: false, cuda: false }));
  });
}

// =============================================================================
// Code Unit Types
// =============================================================================

/**
 * @typedef {Object} CodeUnit
 * @property {string} unit_id - SHA256 hash of file path
 * @property {string} file_path - Relative path to file
 * @property {'page'|'layout'|'endpoint'|'load'|'action'|'component'|'module'} unit_kind
 * @property {string|null} route_id - SvelteKit route path (for routes)
 * @property {string[]} layout_chain - Parent layouts up to root
 * @property {string[]} imports - Imported modules/components
 * @property {string[]} exports - Exported symbols
 * @property {string[]} feature_tags - Inferred feature tags
 * @property {string[]} hardcoded_flags - Detected hardcoded values
 * @property {Object} props - Props signature (for components)
 * @property {string} signature_text - Structured text for similarity embedding
 * @property {string} context_text - Code snippet for fix context
 */

// =============================================================================
// Route Indexer
// =============================================================================
function discoverRoutes(routesDir = 'src/routes') {
  const routes = [];

  function walkDir(dir, routePath = '') {
    if (!existsSync(dir)) return;

    const entries = readdirSync(dir, { withFileTypes: true });

    for (const entry of entries) {
      const fullPath = join(dir, entry.name);

      if (entry.isDirectory()) {
        // Compute route segment
        let segment = entry.name;

        // SvelteKit group syntax: (app), (admin) - doesn't add to route
        if (segment.startsWith('(') && segment.endsWith(')')) {
          walkDir(fullPath, routePath);
        } else {
          // Dynamic params: [id], [[optional]]
          const newRoutePath = `${routePath}/${segment}`;
          walkDir(fullPath, newRoutePath);
        }
      } else if (entry.isFile()) {
        const ext = extname(entry.name);
        const base = basename(entry.name, ext);

        // Determine unit kind
        let unit_kind = null;
        if (base === '+page' && ext === '.svelte') unit_kind = 'page';
        else if (base === '+page' && ext === '.ts') unit_kind = 'load';
        else if (base === '+page.server' && ext === '.ts') unit_kind = 'load';
        else if (base === '+layout' && ext === '.svelte') unit_kind = 'layout';
        else if (base === '+layout' && ext === '.ts') unit_kind = 'load';
        else if (base === '+server' && ext === '.ts') unit_kind = 'endpoint';
        else if (base === '+page' && ext === '.ts') unit_kind = 'action';

        if (unit_kind) {
          routes.push({
            file_path: relative(process.cwd(), fullPath),
            unit_kind,
            route_id: routePath || '/',
            dir: dirname(fullPath)
          });
        }
      }
    }
  }

  walkDir(routesDir);
  return routes;
}

// =============================================================================
// Component Indexer
// =============================================================================
function discoverComponents(libDir = 'src/lib') {
  const components = [];

  function walkDir(dir) {
    if (!existsSync(dir)) return;

    const entries = readdirSync(dir, { withFileTypes: true });

    for (const entry of entries) {
      const fullPath = join(dir, entry.name);

      if (entry.isDirectory()) {
        if (!['node_modules', '.svelte-kit'].includes(entry.name)) {
          walkDir(fullPath);
        }
      } else if (entry.isFile() && entry.name.endsWith('.svelte')) {
        components.push({
          file_path: relative(process.cwd(), fullPath),
          unit_kind: 'component',
          component_name: basename(entry.name, '.svelte')
        });
      }
    }
  }

  walkDir(libDir);
  return components;
}

// =============================================================================
// Module Indexer
// =============================================================================
function discoverModules(libDir = 'src/lib') {
  const modules = [];

  function walkDir(dir) {
    if (!existsSync(dir)) return;

    const entries = readdirSync(dir, { withFileTypes: true });

    for (const entry of entries) {
      const fullPath = join(dir, entry.name);

      if (entry.isDirectory()) {
        if (!['node_modules', '.svelte-kit'].includes(entry.name)) {
          walkDir(fullPath);
        }
      } else if (entry.isFile()) {
        const ext = extname(entry.name);
        if (['.ts', '.js', '.mjs'].includes(ext) && !entry.name.endsWith('.d.ts')) {
          modules.push({
            file_path: relative(process.cwd(), fullPath),
            unit_kind: 'module',
            module_name: basename(entry.name, ext)
          });
        }
      }
    }
  }

  walkDir(libDir);
  return modules;
}

// =============================================================================
// Code Parser
// =============================================================================
function parseCodeUnit(filePath) {
  const content = readFileSync(filePath, 'utf-8');
  const result = {
    imports: [],
    exports: [],
    props: {},
    hardcoded_flags: [],
    uses: [],
    children: []
  };

  // Extract imports
  const importRegex = /import\s+(?:{([^}]+)}|(\w+))\s+from\s+['"]([^'"]+)['"]/g;
  let match;
  while ((match = importRegex.exec(content)) !== null) {
    const named = match[1]?.split(',').map(s => s.trim()) || [];
    const defaultImport = match[2];
    const source = match[3];

    result.imports.push({
      source,
      named,
      default: defaultImport
    });
  }

  // Extract exports
  const exportRegex = /export\s+(?:const|let|function|class|default)\s+(\w+)/g;
  while ((match = exportRegex.exec(content)) !== null) {
    result.exports.push(match[1]);
  }

  // Detect Svelte 5 runes
  if (content.includes('$state')) result.uses.push('$state');
  if (content.includes('$derived')) result.uses.push('$derived');
  if (content.includes('$effect')) result.uses.push('$effect');
  if (content.includes('$props')) result.uses.push('$props');
  if (content.includes('$bindable')) result.uses.push('$bindable');

  // Detect old Svelte patterns
  if (content.includes('export let ')) result.uses.push('export_let');
  if (content.includes('createEventDispatcher')) result.uses.push('createEventDispatcher');
  if (content.includes('onMount')) result.uses.push('onMount');
  if (content.includes('onDestroy')) result.uses.push('onDestroy');

  // Detect child components (PascalCase tags in Svelte)
  const childRegex = /<([A-Z][A-Za-z0-9]+)/g;
  while ((match = childRegex.exec(content)) !== null) {
    if (!result.children.includes(match[1])) {
      result.children.push(match[1]);
    }
  }

  // Detect hardcoded values
  const hardcodedPatterns = [
    { pattern: /https?:\/\/[^\s'"]+/g, type: 'url' },
    { pattern: /wss?:\/\/[^\s'"]+/g, type: 'websocket' },
    { pattern: /['"]\/api\/[^'"]+['"]/g, type: 'api_path' },
    { pattern: /fetch\s*\(\s*['"]\/[^'"]+['"]/g, type: 'fetch_path' },
    { pattern: /localhost:\d+/g, type: 'localhost' },
    { pattern: /PORT\s*[=:]\s*\d+/g, type: 'port' }
  ];

  for (const { pattern, type } of hardcodedPatterns) {
    const matches = content.match(pattern);
    if (matches) {
      result.hardcoded_flags.push({ type, count: matches.length });
    }
  }

  return result;
}

// =============================================================================
// Migration Flags Detection
// =============================================================================
function detectMigrationFlags(filePath, content) {
  const flags = [];

  // Svelte 4 -> Svelte 5 patterns
  if (content.includes('export let ') && !content.includes('$props')) {
    flags.push('svelte4_props');
  }
  if (content.includes('createEventDispatcher')) {
    flags.push('svelte4_events');
  }
  if (/\$:\s+/.test(content) && !content.includes('$derived')) {
    flags.push('svelte4_reactivity');
  }
  if (content.includes('<script context="module">')) {
    flags.push('svelte4_module_context');
  }

  // Melt-UI -> Bits-UI v2 migration
  if (content.includes('melt-ui')) {
    flags.push('melt_ui_legacy');
  }
  if (content.includes('@melt-ui')) {
    flags.push('melt_ui_imports');
  }

  // Bits-UI patterns
  if (content.includes('bits-ui')) {
    flags.push('bits_ui_v2');
  }

  // UnoCSS detection
  if (content.includes('uno:') || content.includes('class:uno-')) {
    flags.push('unocss_classes');
  }

  // Legal-AI route consolidation patterns
  if (filePath.includes('routes/(app)/cases')) {
    flags.push('route_consolidation_cases');
  }
  if (filePath.includes('routes/(app)/evidence')) {
    flags.push('route_consolidation_evidence');
  }
  if (filePath.includes('routes/(app)/command-center')) {
    flags.push('route_consolidation_command');
  }

  // Modal card patterns
  if (content.includes('Dialog') || content.includes('Modal')) {
    flags.push('modal_card_component');
  }
  if (filePath.includes('modals/') || filePath.includes('dialogs/')) {
    flags.push('modal_card_structure');
  }

  // API v2 patterns
  if (content.includes('/api/v2/')) {
    flags.push('api_v2_endpoint');
  }

  // Legacy patterns to migrate
  if (content.includes('$app/stores') && content.includes('navigating')) {
    flags.push('legacy_navigation_store');
  }
  if (content.includes('invalidateAll')) {
    flags.push('legacy_invalidate_pattern');
  }

  return flags;
}

// =============================================================================
// Feature Tag Inference
// =============================================================================
function inferFeatureTags(filePath) {
  const tags = [];
  const pathLower = filePath.toLowerCase();

  const featurePatterns = [
    { pattern: /admin/, tag: 'admin' },
    { pattern: /cases/, tag: 'cases' },
    { pattern: /evidence/, tag: 'evidence' },
    { pattern: /search/, tag: 'search' },
    { pattern: /command/, tag: 'command' },
    { pattern: /dashboard/, tag: 'dashboard' },
    { pattern: /auth/, tag: 'auth' },
    { pattern: /user/, tag: 'user' },
    { pattern: /settings/, tag: 'settings' },
    { pattern: /api/, tag: 'api' },
    { pattern: /db/, tag: 'database' },
    { pattern: /store/, tag: 'stores' },
    { pattern: /component/, tag: 'ui' },
    { pattern: /modal/, tag: 'modal' },
    { pattern: /form/, tag: 'form' },
    { pattern: /chart/, tag: 'visualization' },
    { pattern: /graph/, tag: 'visualization' }
  ];

  for (const { pattern, tag } of featurePatterns) {
    if (pattern.test(pathLower) && !tags.includes(tag)) {
      tags.push(tag);
    }
  }

  return tags;
}

// =============================================================================
// Layout Chain Resolver
// =============================================================================
function resolveLayoutChain(routeDir) {
  const chain = [];
  let currentDir = routeDir;

  while (currentDir.includes('src/routes')) {
    const layoutPath = join(currentDir, '+layout.svelte');
    if (existsSync(layoutPath)) {
      chain.unshift(relative(process.cwd(), layoutPath));
    }
    currentDir = dirname(currentDir);
  }

  return chain;
}

// =============================================================================
// Signature Text Generator
// =============================================================================
function generateSignatureText(unit) {
  const lines = [];

  lines.push(`KIND: ${unit.unit_kind}`);
  lines.push(`NAME: ${unit.component_name || unit.module_name || basename(unit.file_path)}`);
  lines.push(`FILE: ${unit.file_path}`);

  if (unit.route_id) {
    lines.push(`ROUTE: ${unit.route_id}`);
  }

  if (unit.feature_tags?.length > 0) {
    lines.push(`FEATURE: ${unit.feature_tags.join(', ')}`);
  }

  if (unit.parsed?.uses?.length > 0) {
    lines.push(`USES: ${unit.parsed.uses.join(', ')}`);
  }

  if (unit.parsed?.imports?.length > 0) {
    const importSources = unit.parsed.imports.map(i => i.source).slice(0, 10);
    lines.push(`IMPORTS: ${importSources.join(', ')}`);
  }

  if (unit.parsed?.children?.length > 0) {
    lines.push(`CHILDREN: ${unit.parsed.children.join(', ')}`);
  }

  if (unit.parsed?.exports?.length > 0) {
    lines.push(`EXPORTS: ${unit.parsed.exports.slice(0, 10).join(', ')}`);
  }

  if (unit.parsed?.hardcoded_flags?.length > 0) {
    const flags = unit.parsed.hardcoded_flags.map(f => `${f.type}(${f.count})`);
    lines.push(`HARDCODED: ${flags.join(', ')}`);
  }

  if (unit.layout_chain?.length > 0) {
    lines.push(`LAYOUT_CHAIN: ${unit.layout_chain.length} layouts`);
  }

  if (unit.migration_flags?.length > 0) {
    lines.push(`MIGRATIONS: ${unit.migration_flags.join(', ')}`);
  }

  return lines.join('\n');
}

// =============================================================================
// Context Text Generator (Adaptive Chunks with Validation)
// =============================================================================
function generateContextText(filePath, maxChars = 3000) {
  const content = readFileSync(filePath, 'utf-8');

  // Chunk at reasonable boundaries (prefer under 3k chars for stability)
  if (content.length <= maxChars) {
    return content;
  }

  // Try to chunk at function/component boundaries
  const lines = content.split('\n');
  let accumulated = '';

  for (const line of lines) {
    if ((accumulated + line).length > maxChars) {
      break;
    }
    accumulated += line + '\n';
  }

  return accumulated || content.substring(0, maxChars);
}

// =============================================================================
// Embedding with Cache & Retry + Progress Validation
// =============================================================================
const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));

let embeddingSuccessCount = 0;
let embeddingFailCount = 0;
let lastProgressReport = Date.now();

async function embedText(text, cachePrefix = 'sig', retryCount = CONFIG.ollama.retryCount) {
  if (!text || text.trim().length === 0) return null;

  const hash = createHash('sha256').update(text).digest('hex').slice(0, 16);
  const cacheKey = `emb:${cachePrefix}:${hash}`;

  // Check cache
  if (redis?.isOpen) {
    const cached = await redis.get(cacheKey);
    if (cached) {
      embeddingSuccessCount++;
      reportProgress();
      return JSON.parse(cached);
    }
  }

  // Adaptive truncation based on content type
  // Signatures are usually short, context can be longer
  const maxLength = cachePrefix === 'sig' ? 12000 : 24000;
  const truncatedText = text.length > maxLength ? text.substring(0, maxLength) : text;

  for (let attempt = 1; attempt <= retryCount; attempt++) {
    try {
      const response = await ollama.embed({
        model: CONFIG.ollama.embeddingModel,
        input: truncatedText,
        options: {
          num_ctx: 8192,
          num_thread: 4,
          num_batch: 512  // Add batch size for stability
        }
      });

      const embedding = response.embeddings?.[0] || response.embedding;

      if (embedding && embedding.length === 768) {
        if (redis?.isOpen) {
          await redis.set(cacheKey, JSON.stringify(embedding), { EX: 604800 }); // 7 days
        }

        embeddingSuccessCount++;
        reportProgress();
        return embedding;
      } else {
        throw new Error(`Invalid embedding dimension: ${embedding?.length || 0}`);
      }
    } catch (e) {
      const isLastAttempt = attempt === retryCount;
      const isTimeout = e.message.includes('timeout') || e.code === 'ETIMEDOUT';

      if (isTimeout || e.message.includes('context length')) {
        if (attempt === 1) {
          console.warn(`   ⚠️  ${isTimeout ? 'Timeout' : 'Context error'} on attempt ${attempt}, retrying...`);
        }
      }

      if (isLastAttempt) {
        embeddingFailCount++;
        reportProgress();
        return null;
      }

      // Exponential backoff: 2s, 4s, 8s, 16s, 32s
      const delay = 2000 * Math.pow(2, attempt - 1);
      await sleep(delay);
    }
  }
  return null;
}

function reportProgress() {
  const now = Date.now();
  const total = embeddingSuccessCount + embeddingFailCount;

  // Report every 100 embeddings or every 30 seconds
  if (total % 100 === 0 || (now - lastProgressReport) > 30000) {
    const successRate = total > 0 ? (embeddingSuccessCount / total * 100).toFixed(1) : 0;
    console.log(`   📊 Embeddings: ${embeddingSuccessCount} success, ${embeddingFailCount} failed (${successRate}% success rate)`);
    lastProgressReport = now;
  }
}// =============================================================================
// Index Routes
// =============================================================================
async function indexRoutes() {
  console.log('\n📂 Indexing Routes...\n');

  const routes = discoverRoutes();
  console.log(`   Found ${routes.length} route units\n`);

  const units = [];
  let processed = 0;

  for (const route of routes) {
    try {
      const content = readFileSync(route.file_path, 'utf-8');
      const parsed = parseCodeUnit(route.file_path);
      const featureTags = inferFeatureTags(route.file_path);
      const layoutChain = resolveLayoutChain(route.dir);
      const migrationFlags = detectMigrationFlags(route.file_path, content);

      const unit = {
        unit_id: createHash('sha256').update(route.file_path).digest('hex').slice(0, 32),
        file_path: route.file_path,
        unit_kind: route.unit_kind,
        route_id: route.route_id,
        layout_chain: layoutChain,
        feature_tags: featureTags,
        migration_flags: migrationFlags,
        parsed,
        signature_text: ''
      };

      unit.signature_text = generateSignatureText(unit);
      unit.context_text = generateContextText(route.file_path);

      // Embed signature
      const embedding = await embedText(unit.signature_text, 'route');
      const contextEmbedding = await embedText(unit.context_text, 'ctx');

      if (embedding) {
        units.push({ ...unit, embedding, context_embedding: contextEmbedding });
      }

      processed++;
      if (processed % 20 === 0) {
        process.stdout.write(`\r   ${processed}/${routes.length} routes indexed`);
      }
    } catch (e) {
      // Skip errors
    }
  }

  console.log(`\n   ✅ Indexed ${units.length} route units\n`);
  return units;
}

// =============================================================================
// Index Components
// =============================================================================
async function indexComponents() {
  console.log('\n📦 Indexing Components...\n');

  const components = discoverComponents();
  console.log(`   Found ${components.length} components\n`);

  const units = [];
  let processed = 0;

  for (const component of components) {
    try {
      const content = readFileSync(component.file_path, 'utf-8');
      const parsed = parseCodeUnit(component.file_path);
      const featureTags = inferFeatureTags(component.file_path);
      const migrationFlags = detectMigrationFlags(component.file_path, content);

      const unit = {
        unit_id: createHash('sha256').update(component.file_path).digest('hex').slice(0, 32),
        file_path: component.file_path,
        unit_kind: 'component',
        component_name: component.component_name,
        feature_tags: featureTags,
        migration_flags: migrationFlags,
        parsed,
        signature_text: ''
      };

      unit.signature_text = generateSignatureText(unit);
      unit.context_text = generateContextText(component.file_path);

      const embedding = await embedText(unit.signature_text, 'comp');
      const contextEmbedding = await embedText(unit.context_text, 'ctx');

      if (embedding) {
        units.push({ ...unit, embedding, context_embedding: contextEmbedding });
      }

      processed++;
      if (processed % 50 === 0) {
        process.stdout.write(`\r   ${processed}/${components.length} components indexed`);
      }
    } catch (e) {
      // Skip errors
    }
  }

  console.log(`\n   ✅ Indexed ${units.length} components\n`);
  return units;
}

// =============================================================================
// Index Modules
// =============================================================================
async function indexModules() {
  console.log('\n📚 Indexing Modules...\n');

  const modules = discoverModules();
  console.log(`   Found ${modules.length} modules\n`);

  const units = [];
  let processed = 0;

  for (const mod of modules) {
    try {
      const content = readFileSync(mod.file_path, 'utf-8');
      const parsed = parseCodeUnit(mod.file_path);
      const featureTags = inferFeatureTags(mod.file_path);
      const migrationFlags = detectMigrationFlags(mod.file_path, content);

      const unit = {
        unit_id: createHash('sha256').update(mod.file_path).digest('hex').slice(0, 32),
        file_path: mod.file_path,
        unit_kind: 'module',
        module_name: mod.module_name,
        feature_tags: featureTags,
        migration_flags: migrationFlags,
        parsed,
        signature_text: ''
      };

      unit.signature_text = generateSignatureText(unit);
      unit.context_text = generateContextText(mod.file_path);

      const embedding = await embedText(unit.signature_text, 'mod');
      const contextEmbedding = await embedText(unit.context_text, 'ctx');

      if (embedding) {
        units.push({ ...unit, embedding, context_embedding: contextEmbedding });
      }

      processed++;
      if (processed % 50 === 0) {
        process.stdout.write(`\r   ${processed}/${modules.length} modules indexed`);
      }
    } catch (e) {
      // Skip errors
    }
  }

  console.log(`\n   ✅ Indexed ${units.length} modules\n`);
  return units;
}

// =============================================================================
// Build Dependency Graph
// =============================================================================
async function buildDependencyGraph(units) {
  console.log('\n🔗 Building Dependency Graph...\n');

  const edges = [];
  const unitByPath = new Map();

  // Build lookup
  for (const unit of units) {
    unitByPath.set(unit.file_path, unit);
  }

  for (const unit of units) {
    if (!unit.parsed?.imports) continue;

    for (const imp of unit.parsed.imports) {
      // Resolve import path
      let resolvedPath = imp.source;

      // Handle aliases
      if (resolvedPath.startsWith('$lib/')) {
        resolvedPath = resolvedPath.replace('$lib/', 'src/lib/');
      }

      // Find target unit
      for (const [path, targetUnit] of unitByPath) {
        if (path.includes(resolvedPath.replace(/\.[^.]+$/, ''))) {
          edges.push({
            from_id: unit.unit_id,
            to_id: targetUnit.unit_id,
            kind: 'imports',
            from_path: unit.file_path,
            to_path: targetUnit.file_path
          });
          break;
        }
      }
    }
  }

  console.log(`   ✅ Found ${edges.length} dependency edges\n`);

  // Store in PostgreSQL
  if (edges.length > 0) {
    try {
      await db.query('DELETE FROM phase89_import_edges');

      for (const edge of edges) {
        await db.query(`
          INSERT INTO phase89_import_edges (from_file, to_file, kind)
          VALUES ($1, $2, $3)
          ON CONFLICT (from_file, to_file, kind) DO NOTHING
        `, [edge.from_path, edge.to_path, edge.kind]);
      }

      console.log(`   ✅ Stored ${edges.length} edges in PostgreSQL\n`);
    } catch (e) {
      console.warn(`   ⚠️  Failed to store edges: ${e.message}`);
    }
  }

  return edges;
}

// =============================================================================
// Store in PostgreSQL
// =============================================================================
async function storeInPostgres(units) {
  console.log('\n🐘 Storing in PostgreSQL...\n');

  for (const unit of units) {
    try {
      const content = readFileSync(unit.file_path, 'utf-8');
      const contentHash = createHash('sha256').update(content).digest('hex');

      await db.query(`
        INSERT INTO phase89_unit_index (
          unit_id, file_path, route_id, unit_kind, feature_tags,
          content_hash, signature_text, context_text, updated_at
        )
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, NOW())
        ON CONFLICT (unit_id) DO UPDATE SET
          route_id = EXCLUDED.route_id,
          unit_kind = EXCLUDED.unit_kind,
          feature_tags = EXCLUDED.feature_tags,
          content_hash = EXCLUDED.content_hash,
          signature_text = EXCLUDED.signature_text,
          context_text = EXCLUDED.context_text,
          updated_at = NOW()
      `, [
        unit.unit_id,
        unit.file_path,
        unit.route_id || null,
        unit.unit_kind,
        unit.feature_tags || [],
        contentHash,
        unit.signature_text,
        unit.context_text
      ]);
    } catch (e) {
      console.warn(`   ⚠️  Failed to store ${unit.file_path}: ${e.message}`);
    }
  }

  console.log(`   ✅ Stored ${units.length} units in PostgreSQL\n`);
}

// =============================================================================
// Upload to Qdrant
// =============================================================================
async function uploadToQdrant(units) {
  console.log('\n⬆️  Uploading to Qdrant...\n');

  const unitCollection = CONFIG.qdrant.collections.codeUnits;
  const chunkCollection = CONFIG.qdrant.collections.codeChunks;

  const unitPoints = [];
  const chunkPoints = [];

  for (const unit of units) {
    if (unit.embedding) {
      unitPoints.push({
        id: unit.unit_id,
        vector: unit.embedding,
        payload: {
          file_path: unit.file_path,
          unit_kind: unit.unit_kind,
          route_id: unit.route_id || null,
          feature_tags: unit.feature_tags || [],
          migration_flags: unit.migration_flags || [],
          signature_text: unit.signature_text.substring(0, 1000),
          indexed_at: new Date().toISOString(),
          // Enhanced metadata for filtering
          needs_svelte5_migration: (unit.migration_flags || []).some(f => f.startsWith('svelte4_')),
          needs_bits_ui_migration: (unit.migration_flags || []).includes('melt_ui_legacy'),
          is_modal_card: (unit.migration_flags || []).some(f => f.includes('modal_card')),
          is_route_consolidated: (unit.migration_flags || []).some(f => f.startsWith('route_consolidation_'))
        }
      });
    }

    if (unit.context_embedding) {
      chunkPoints.push({
        id: createHash('sha256').update(unit.context_text).digest('hex').slice(0, 32),
        vector: unit.context_embedding,
        payload: {
          unit_id: unit.unit_id,
          file_path: unit.file_path,
          context_text: unit.context_text,
          indexed_at: new Date().toISOString()
        }
      });
    }
  }

  // Upload Unit Points
  if (unitPoints.length > 0) {
    for (let i = 0; i < unitPoints.length; i += 100) {
      const batch = unitPoints.slice(i, i + 100);
      await fetch(`${CONFIG.qdrant.url}/collections/${unitCollection}/points`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ points: batch })
      });
    }
    console.log(`   ✅ Uploaded ${unitPoints.length} units to ${unitCollection}`);
  }

  // Upload Chunk Points
  if (chunkPoints.length > 0) {
    for (let i = 0; i < chunkPoints.length; i += 100) {
      const batch = chunkPoints.slice(i, i + 100);
      await fetch(`${CONFIG.qdrant.url}/collections/${chunkCollection}/points`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ points: batch })
      });
    }
    console.log(`   ✅ Uploaded ${chunkPoints.length} chunks to ${chunkCollection}`);
  }

  console.log('');
}

// =============================================================================
// Main
// =============================================================================
async function main() {
  console.log('\n🚀 Phase 89: Code Unit Indexer\n');
  console.log('═'.repeat(60));

  const args = process.argv.slice(2);
  const isRescue = args.includes('--rescue');
  // Filter out flags to find the command
  const command = args.find(a => a.startsWith('--') && a !== '--rescue') || '--index';

  if (isRescue) {
    console.log('   🚑 Rescue Mode Enabled: Increased retries (5) and timeout tolerance');
    CONFIG.ollama.retryCount = 5;
  }

  try {
    await connect();
    await probeCuda();

    let allUnits = [];

    switch (command) {
      case '--routes':
        allUnits = await indexRoutes();
        break;

      case '--components':
        allUnits = await indexComponents();
        break;

      case '--modules':
        allUnits = await indexModules();
        break;

      case '--deps':
        const stored = await db.query('SELECT * FROM phase89_import_edges LIMIT 100');
        console.log(`   Found ${stored.rows.length} existing edges`);
        break;

      case '--index':
      default:
        const routes = await indexRoutes();
        const components = await indexComponents();
        const modules = await indexModules();

        allUnits = [...routes, ...components, ...modules];

        await buildDependencyGraph(allUnits);
        await storeInPostgres(allUnits);
        break;
    }

    if (allUnits.length > 0) {
      await uploadToQdrant(allUnits);
    }

    // Summary
    console.log('\n' + '═'.repeat(60));
    console.log('✅ Code Unit Indexing Complete!\n');
    console.log('📊 Summary:');
    console.log(`   Total units indexed: ${allUnits.length}`);
    if (isRescue) {
        console.log(`   Mode: Rescue (Retries: ${CONFIG.ollama.retryCount})`);
    }
    console.log(`   Qdrant collection: ${CONFIG.qdrant.collections.codeUnits}`);
    console.log(`   Redis cache: emb:route:*, emb:comp:*, emb:mod:*`);
    console.log('\n');

  } catch (error) {
    console.error('\n❌ Error:', error.message);
  } finally {
    await db?.end();
    await redis?.quit();
  }
}

// Handle EPIPE
process.stdout.on('error', (err) => {
  if (err?.code === 'EPIPE') process.exit(0);
  throw err;
});

main();
