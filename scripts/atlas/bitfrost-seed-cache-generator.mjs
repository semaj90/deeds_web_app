#!/usr/bin/env node

/**
 * BitFrost Seed Cache Generator
 *
 * Purpose: Pre-populate Redis with "guess summaries" for common patterns
 * before full Gemma4 pass completes, reducing UI latency.
 *
 * Strategy:
 *   1. Parse codebase-graph.json from graphify startup
 *   2. For each packet: infer file type, directory category, exports
 *   3. Generate seed summary using heuristics
 *   4. Write to Redis with _seed suffix (TTL: 1 hour)
 *   5. Log coverage stats (seed vs real vs cache)
 *
 * Usage:
 *   npm run bitfrost:seed:generate
 *   npm run bitfrost:seed:generate -- --dry-run
 *   npm run bitfrost:seed:generate -- --ttl 3600
 */

import Redis from 'ioredis';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '../..');

// Parse CLI arguments
const isDryRun = process.argv.includes('--dry-run');
const ttlArg = process.argv.find(arg => arg.startsWith('--ttl='));
const ttl = ttlArg ? parseInt(ttlArg.split('=')[1]) : 3600; // 1 hour default

const redis = new Redis({
  host: process.env.REDIS_HOST || 'localhost',
  port: parseInt(process.env.REDIS_PORT || '6379'),
  password: process.env.REDIS_PASSWORD || 'redis',
  lazyConnect: true,
  enableOfflineQueue: false,
  retryStrategy: () => null
});

// ════════════════════════════════════════════════════════════════════════════════
// SEED SUMMARY GENERATORS
// ════════════════════════════════════════════════════════════════════════════════

function getFileTypeCategory(filePath) {
  if (filePath.endsWith('.svelte')) return 'Svelte component';
  if (filePath.endsWith('.ts') || filePath.endsWith('.tsx')) return 'TypeScript module';
  if (filePath.endsWith('.js') || filePath.endsWith('.mjs')) return 'JavaScript module';
  if (filePath.endsWith('.sql')) return 'SQL migration';
  if (filePath.endsWith('.json')) return 'JSON configuration';
  if (filePath.endsWith('.md')) return 'Markdown documentation';
  if (filePath.endsWith('.css')) return 'CSS stylesheet';
  return 'Code module';
}

function getDirectoryContext(sourceRef) {
  if (sourceRef.includes('/server/')) return 'Server-side logic';
  if (sourceRef.includes('/routes/')) return 'SvelteKit route';
  if (sourceRef.includes('/api/')) return 'API endpoint';
  if (sourceRef.includes('/lib/')) return 'Library module';
  if (sourceRef.includes('/components/')) return 'UI component';
  if (sourceRef.includes('/stores/')) return 'State management';
  if (sourceRef.includes('/machines/')) return 'XState machine';
  if (sourceRef.includes('/scripts/')) return 'Build or utility script';
  if (sourceRef.includes('/tests/')) return 'Test suite';
  if (sourceRef.includes('/drizzle/')) return 'Database migration';
  return 'Codebase module';
}

function inferExports(filePath) {
  // Heuristic: common export patterns by file location
  const fileName = path.basename(filePath, path.extname(filePath));

  if (filePath.includes('/components/')) {
    return [
      `<${fileName} /> component`,
      'props interface',
      'slots'
    ];
  }

  if (filePath.includes('/stores/')) {
    return [
      `${fileName} store`,
      'subscribe() method',
      'set() / update() actions'
    ];
  }

  if (filePath.includes('/machines/')) {
    return [
      `${fileName} state machine`,
      'XState config',
      'actor definitions'
    ];
  }

  if (filePath.includes('/lib/server/')) {
    return [
      `${fileName}() function`,
      'async handlers',
      'database queries'
    ];
  }

  return [
    `${fileName} module`,
    'exports',
    'utilities'
  ];
}

function inferTags(featureId, sourceRef) {
  const tags = [];

  // Feature-based tags
  if (featureId) {
    const [domain, aspect] = featureId.split('.', 2);
    if (domain) tags.push(domain);
    if (aspect) tags.push(aspect);
  }

  // Path-based tags
  if (sourceRef.includes('auth')) tags.push('authentication');
  if (sourceRef.includes('db') || sourceRef.includes('database')) tags.push('database');
  if (sourceRef.includes('cache')) tags.push('caching');
  if (sourceRef.includes('ai') || sourceRef.includes('llm')) tags.push('ai');
  if (sourceRef.includes('gpu') || sourceRef.includes('cuda')) tags.push('gpu');
  if (sourceRef.includes('qdrant')) tags.push('vector-search');
  if (sourceRef.includes('neo4j') || sourceRef.includes('graph')) tags.push('graph');
  if (sourceRef.includes('api')) tags.push('api');
  if (sourceRef.includes('ui') || sourceRef.includes('component')) tags.push('ui');

  return [...new Set(tags)].slice(0, 5); // Deduplicate, max 5 tags
}

/**
 * Generate seed summary (low confidence, heuristic-based)
 */
function generateSeedSummary(packet) {
  const fileType = getFileTypeCategory(packet.source_ref);
  const dirContext = getDirectoryContext(packet.source_ref);
  const exports = inferExports(packet.source_ref).slice(0, 3).join(', ');
  const tags = inferTags(packet.feature_id, packet.source_ref).join(', ');

  return {
    content: `${fileType} at ${packet.source_ref}. Part of: ${dirContext}. Exports: ${exports}. ${tags ? `Tags: ${tags}.` : ''}`,
    model: 'seed-heuristic',
    backend: 'heuristic',
    cachedAt: new Date().toISOString(),
    confidence: 0.3,
    is_seed: true,
    tags: inferTags(packet.feature_id, packet.source_ref)
  };
}

// ════════════════════════════════════════════════════════════════════════════════
// MAIN SEED CACHE POPULATION
// ════════════════════════════════════════════════════════════════════════════════

async function generateSeedCache() {
  console.log('[BitFrost Seed Cache] Starting seed generation...');
  console.log(`[BitFrost Seed Cache] TTL=${ttl}s, Dry-run=${isDryRun}`);

  try {
    // 1. Load packets from graphify output
    const graphPath = path.join(ROOT, 'sveltekit-frontend/docs/graph/codebase-graph.json');
    if (!fs.existsSync(graphPath)) {
      console.warn(`[BitFrost Seed Cache] ⚠️  ${graphPath} not found. Run 'graphify:daily' first.`);
      return;
    }

    const graph = JSON.parse(fs.readFileSync(graphPath, 'utf-8'));
    const packets = graph.packets || [];

    console.log(`[BitFrost Seed Cache] 📦 Loaded ${packets.length} packets from graphify`);

    if (packets.length === 0) {
      console.warn('[BitFrost Seed Cache] ⚠️  No packets to seed');
      return;
    }

    // 2. Connect Redis if not dry-run
    if (!isDryRun) {
      await redis.connect();
      console.log('[BitFrost Seed Cache] ✅ Redis connected');
    }

    // 3. Generate seeds and write to cache
    let seedCount = 0;
    let skippedCount = 0;
    const pipeline = !isDryRun ? redis.pipeline() : null;

    for (const packet of packets) {
      if (!packet.packet_key || !packet.source_ref) {
        skippedCount++;
        continue;
      }

      const seedSummary = generateSeedSummary(packet);
      const cacheKey = `bifrost:summary:${packet.packet_key}:_seed`;

      if (isDryRun) {
        console.log(`[DRY] ${cacheKey} → "${seedSummary.content.substring(0, 60)}..."`);
        seedCount++;
      } else {
        if (pipeline) {
          pipeline.set(cacheKey, JSON.stringify(seedSummary), 'EX', ttl);
        }
        seedCount++;

        // Also cache feature tags
        if (packet.feature_id && pipeline) {
          const featureKey = `bifrost:feature:${packet.feature_id}:_seed`;
          pipeline.set(
            featureKey,
            JSON.stringify({ tags: seedSummary.tags, confidence: 0.3, is_seed: true }),
            'EX',
            ttl
          );
        }
      }

      // Log progress every 100 packets
      if (seedCount % 100 === 0) {
        console.log(`[BitFrost Seed Cache] ⏳ Seeded ${seedCount} packets...`);
      }
    }

    // 4. Execute pipeline
    if (!isDryRun && pipeline) {
      await pipeline.exec();
      console.log(`[BitFrost Seed Cache] ✅ Seeded ${seedCount} packets in Redis`);
    } else if (isDryRun) {
      console.log(`[BitFrost Seed Cache] [DRY] Would seed ${seedCount} packets`);
    }

    console.log(`[BitFrost Seed Cache] 📊 Stats:`);
    console.log(`     Seeded: ${seedCount}`);
    console.log(`     Skipped: ${skippedCount}`);
    console.log(`     Coverage: ${((seedCount / (seedCount + skippedCount)) * 100).toFixed(1)}%`);
    console.log(`[BitFrost Seed Cache] ✅ Complete`);

  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error('[BitFrost Seed Cache] Error:', message);
    process.exit(1);
  } finally {
    if (redis && redis.isOpen) await redis.quit();
  }
}

generateSeedCache();
