import fs from 'fs';
import path from 'path';
import { execSync } from 'child_process';
import pg from 'pg';
import dotenv from 'dotenv';
import crypto from 'crypto';


dotenv.config();

const rootDir = process.cwd().replace(/\\/g, '/');

// Folders to scan
const scanDirs = [
  path.join(rootDir, 'sveltekit-frontend', 'src'),
  path.join(rootDir, 'simd-bridge'),
  path.join(rootDir, 'services'),
  path.join(rootDir, 'scripts')
].map(p => p.replace(/\\/g, '/'));

const skipFolders = new Set([
  'node_modules', '.git', '.cache', '.svelte-kit', '.venv', '.vs', 'vendor', 'backups', 'minio-data', '.tmp', 'playwright-report'
]);

const allowedExts = new Set(['.ts', '.js', '.svelte', '.py', '.cc', '.cpp', '.h', '.hpp']);

const protocolPatterns = [
  { protocol: 'http', regex: /\bhttps?:\/\/[a-zA-Z0-9_\-\.:]+/gi },
  { protocol: 'http2', regex: /\bhttp2:\/\/[a-zA-Z0-9_\-\.:]+/gi },
  { protocol: 'http3', regex: /\bhttp3:\/\/[a-zA-Z0-9_\-\.:]+/gi },
  { protocol: 'docker', regex: /\bdocker:\/\/[a-zA-Z0-9_\-\.:]+/gi },
  { protocol: 'stdio', regex: /\bstdio:\/\/[a-zA-Z0-9_\-\.:]+/gi },
  { protocol: 'ws', regex: /\bwss?:\/\/[a-zA-Z0-9_\-\.:]+/gi },
  { protocol: 'redis', regex: /\bredis:\/\/[a-zA-Z0-9_\-\.:]+/gi },
  { protocol: 'amqp', regex: /\bamqps?:\/\/[a-zA-Z0-9_\-\.:]+/gi }
];

function detectProtocols(content) {
  const protocols = new Set();
  const contentLower = content.toLowerCase();

  for (const pat of protocolPatterns) {
    if (pat.regex.test(content)) {
      protocols.add(pat.protocol);
    }
  }

  if (contentLower.includes('amqp://') || contentLower.includes('amqplib')) protocols.add('amqp');
  if (contentLower.includes('redis://') || contentLower.includes('ioredis')) protocols.add('redis');
  if (contentLower.includes('ws://') || contentLower.includes('wss://') || contentLower.includes('websocket')) protocols.add('ws');
  if (contentLower.includes('docker://') || contentLower.includes('docker.sock')) protocols.add('docker');
  if (contentLower.includes('stdio://') || contentLower.includes('process.stdin') || contentLower.includes('process.stdout')) protocols.add('stdio');
  if (contentLower.includes('http2://')) protocols.add('http2');
  if (contentLower.includes('http3://')) protocols.add('http3');

  return Array.from(protocols);
}

function detectNestedUrls(filePath, content) {
  const urls = new Set();
  
  const routesIndex = filePath.indexOf('/src/routes/');
  if (routesIndex !== -1) {
    let routePart = filePath.slice(routesIndex + '/src/routes/'.length);
    const lastSlash = routePart.lastIndexOf('/');
    if (lastSlash !== -1) {
      routePart = routePart.slice(0, lastSlash);
    } else {
      routePart = '';
    }
    const routePath = '/' + routePart;
    urls.add(routePath);
  }

  const endpointRegex = /['"](\/(?:api|routes|evidence|auth|kb|admin)[a-zA-Z0-9_\-\.\/]+)['"]/g;
  let match;
  while ((match = endpointRegex.exec(content)) !== null) {
    urls.add(match[1]);
  }

  return Array.from(urls);
}

function extractExportsRegex(filePath, content) {
  const exports = new Set();
  const ext = path.extname(filePath).toLowerCase();

  if (ext === '.ts' || ext === '.js' || ext === '.svelte') {
    const exportRegex = /export\s+(?:async\s+)?(?:function|class|const|let|var|type|interface)\s+([a-zA-Z0-9_\$]+)/g;
    let match;
    while ((match = exportRegex.exec(content)) !== null) {
      exports.add(match[1]);
    }
  } else if (ext === '.py') {
    const pyRegex = /^\s*(?:def|class)\s+([a-zA-Z0-9_]+)/gm;
    let match;
    while ((match = pyRegex.exec(content)) !== null) {
      exports.add(match[1]);
    }
  } else if (ext === '.cc' || ext === '.cpp' || ext === '.h' || ext === '.hpp') {
    const cppRegex = /^\s*(?:class|struct|namespace|void|int|double|float|bool|std::string)\s+([a-zA-Z0-9_]+)\s*(?:[:{]|\()/gm;
    let match;
    while ((match = cppRegex.exec(content)) !== null) {
      if (!/^(class|struct|namespace|void|int|double|float|bool|if|for|while|switch)$/.test(match[1])) {
        exports.add(match[1]);
      }
    }
  }

  return Array.from(exports);
}

function getLibraryFunctions(filePath, content) {
  return extractExportsRegex(filePath, content);
}

function getFeatureSubgraphs(filePath, content) {
  const subgraphs = new Set();
  const contentLower = content.toLowerCase();
  const pathLower = filePath.toLowerCase();

  if (contentLower.includes('drizzle') || contentLower.includes('postgres') || contentLower.includes('pgtable') || pathLower.includes('/db/') || pathLower.includes('/schema')) {
    subgraphs.add('db-drizzle-postgres');
  }

  if (contentLower.includes('cuda') || contentLower.includes('torch') || contentLower.includes('libtorch') || contentLower.includes('gemma') || contentLower.includes('bifrost') || pathLower.includes('cuda') || pathLower.includes('bifrost') || pathLower.includes('simd-bridge')) {
    subgraphs.add('ml-inference-cuda');
  }

  if (contentLower.includes('svelte') || contentLower.includes('runes') || pathLower.includes('/src/routes') || pathLower.includes('.svelte')) {
    subgraphs.add('web-svelte-frontend');
  }

  if (contentLower.includes('qdrant') || contentLower.includes('neo4j') || contentLower.includes('couchdb') || contentLower.includes('duckdb') || contentLower.includes('vector') || pathLower.includes('qdrant') || pathLower.includes('neo4j')) {
    subgraphs.add('rag-vector-search');
  }

  if (contentLower.includes('redis') || contentLower.includes('cache') || pathLower.includes('redis') || pathLower.includes('cache')) {
    subgraphs.add('caching-redis');
  }

  if (contentLower.includes('docker') || contentLower.includes('compose') || contentLower.includes('rabbitmq') || contentLower.includes('nginx') || pathLower.includes('docker') || pathLower.includes('nginx')) {
    subgraphs.add('infra-devops');
  }

  if (subgraphs.size === 0) {
    subgraphs.add('uncategorized');
  }

  return Array.from(subgraphs);
}

// Find source files
const sourceFiles = [];
function findSourceFiles(dir) {
  try {
    const items = fs.readdirSync(dir, { withFileTypes: true });
    for (const item of items) {
      const fullPath = path.join(dir, item.name).replace(/\\/g, '/');
      if (item.isDirectory()) {
        if (!skipFolders.has(item.name)) {
          findSourceFiles(fullPath);
        }
      } else if (item.isFile()) {
        const ext = path.extname(item.name).toLowerCase();
        if (allowedExts.has(ext)) {
          sourceFiles.push(fullPath);
        }
      }
    }
  } catch (err) {
    console.error(`Error walking ${dir}: ${err.message}`);
  }
}

for (const dir of scanDirs) {
  if (fs.existsSync(dir)) {
    findSourceFiles(dir);
  }
}
console.log(`Discovered ${sourceFiles.length} source files to scan.`);

function getProgrammingLanguage(filePath) {
  const ext = path.extname(filePath).toLowerCase();
  const map = {
    '.ts': 'typescript',
    '.js': 'javascript',
    '.mjs': 'javascript',
    '.mts': 'javascript',
    '.svelte': 'svelte',
    '.sql': 'sql',
    '.py': 'python',
    '.ps1': 'powershell',
    '.md': 'markdown',
    '.json': 'json',
    '.yml': 'yaml',
    '.yaml': 'yaml'
  };
  return map[ext] || 'unknown';
}

function getRouteKind(relativePath) {
  const lower = relativePath.toLowerCase();
  if (lower.includes('/src/routes/')) {
    if (lower.includes('+page') || lower.includes('+server') || lower.includes('+layout')) {
      if (lower.includes('/api/')) return 'api-route';
      return 'sveltekit-route';
    }
  }
  if (lower.includes('src/lib/server/')) return 'server-module';
  if (lower.startsWith('scripts/')) return 'script';
  if (lower.includes('.test.ts') || lower.includes('.spec.ts') || lower.startsWith('tests/')) return 'test';
  if (lower.endsWith('.md') || lower.endsWith('.txt')) return 'doc';
  return 'unknown';
}

function getSvelteKitRoute(relativePath) {
  const idx = relativePath.indexOf('/src/routes/');
  if (idx === -1) return null;
  let part = relativePath.slice(idx + '/src/routes/'.length);
  const lastSlash = part.lastIndexOf('/');
  if (lastSlash !== -1) {
    part = part.slice(0, lastSlash);
  } else {
    part = '';
  }
  return '/' + part;
}

function getRecommendation(relativePath, content) {
  const lower = relativePath.toLowerCase();
  let status = 'ready';
  let nextAction = 'None';
  let priority = 'P3';

  if (content.includes('TODO:') || content.includes('FIXME:')) {
    status = 'degraded';
    nextAction = 'Resolve remaining TODOs';
    priority = 'P2';
  } else if (lower.includes('test') || lower.includes('demo')) {
    status = 'test-only';
    nextAction = 'Run and verify tests';
    priority = 'P3';
  } else if (content.includes('placeholder') || content.includes('stub')) {
    status = 'stub';
    nextAction = 'Implement full logic';
    priority = 'P1';
  }

  return { productionStatus: status, nextAction, priority };
}

// Save to Postgres
async function scanAndSave() {
  const dbUrl = process.env.DATABASE_URL;
  if (!dbUrl) {
    console.error("❌ DATABASE_URL is not set. Exiting.");
    process.exit(1);
  }

  console.log("💾 Connecting to Postgres...");
  const pool = new pg.Pool({ connectionString: dbUrl });
  
  const sanitize = (str) => typeof str === 'string' ? str.replace(/\0/g, '') : str;

  try {
    console.log("Starting feature scan...");
    let processed = 0;

    const query = `
      INSERT INTO feature_index_entries (
        stable_key, path, programming_language, feature_family, labels,
        protocol_detected, route_kind, sveltekit_route, owning_library,
        exported_symbols, imported_symbols, ast_relations, cache_signals,
        recommendation, metadata
      ) VALUES (
        $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15
      )
      ON CONFLICT (stable_key) DO UPDATE SET
        path = EXCLUDED.path,
        programming_language = EXCLUDED.programming_language,
        feature_family = EXCLUDED.feature_family,
        labels = EXCLUDED.labels,
        protocol_detected = EXCLUDED.protocol_detected,
        route_kind = EXCLUDED.route_kind,
        sveltekit_route = EXCLUDED.sveltekit_route,
        owning_library = EXCLUDED.owning_library,
        exported_symbols = EXCLUDED.exported_symbols,
        imported_symbols = EXCLUDED.imported_symbols,
        ast_relations = EXCLUDED.ast_relations,
        cache_signals = EXCLUDED.cache_signals,
        recommendation = EXCLUDED.recommendation,
        metadata = EXCLUDED.metadata,
        updated_at = NOW();
    `;

    for (const filePath of sourceFiles) {
      const relativePath = path.relative(rootDir, filePath).replace(/\\/g, '/');
      const content = fs.readFileSync(filePath, 'utf-8');

      const stableKey = crypto.createHash('sha256').update(relativePath).digest('hex');
      const programmingLanguage = getProgrammingLanguage(filePath);
      const featureSubgraphs = getFeatureSubgraphs(filePath, content);
      const featureFamily = featureSubgraphs[0] || 'uncategorized';
      
      const protocols = detectProtocols(content);
      const nestedUrls = detectNestedUrls(filePath, content);
      const libraryFunctions = getLibraryFunctions(filePath, content);
      
      const routeKind = getRouteKind(relativePath);
      const svelteKitRoute = getSvelteKitRoute(relativePath);
      
      const recommendation = getRecommendation(relativePath, content);

      const metadata = {
        size: fs.statSync(filePath).size,
        extension: path.extname(filePath).toLowerCase()
      };

      await pool.query(query, [
        sanitize(stableKey),
        sanitize(relativePath),
        sanitize(programmingLanguage),
        sanitize(featureFamily),
        sanitize(JSON.stringify(featureSubgraphs)), // labels / feature_subgraphs
        sanitize(JSON.stringify(protocols)), // protocol_detected
        sanitize(routeKind),
        svelteKitRoute ? sanitize(svelteKitRoute) : null,
        'deeds', // owning_library
        sanitize(JSON.stringify(libraryFunctions)), // exported_symbols
        sanitize(JSON.stringify([])), // imported_symbols
        sanitize(JSON.stringify([])), // ast_relations
        sanitize(JSON.stringify({})), // cache_signals
        sanitize(JSON.stringify(recommendation)),
        sanitize(JSON.stringify(metadata))
      ]);

      processed++;
      if (processed % 100 === 0) {
        console.log(`Processed ${processed}/${sourceFiles.length} files...`);
      }
    }

    console.log(`✅ Feature scan complete. Upserted ${processed} entries.`);
  } catch (err) {
    console.error("❌ Feature scan failed:", err);
  } finally {
    await pool.end();
  }
}

scanAndSave();
