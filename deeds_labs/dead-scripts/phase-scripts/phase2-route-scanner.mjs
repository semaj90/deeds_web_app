#!/usr/bin/env node
/**
 * Phase 2: Route Scanner & Database Populator
 *
 * Scans SvelteKit routes directory and populates route_metadata table
 * Enriches with error clusters, health status, and AI analysis
 *
 * Usage:
 *   npm run phase2:scan              # Full scan with DB insert
 *   npm run phase2:scan -- --dry-run # Preview only
 *   npm run phase2:scan -- --verbose # Detailed logging
 */

import dotenv from 'dotenv';
import { readdir } from 'fs/promises';
import { join, relative } from 'path';
import postgres from 'postgres';
import { fileURLToPath } from 'url';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = join(__filename, '../..');

// Configuration
const ROUTES_DIR = join(__dirname, 'src/routes');
const DATABASE_URL = process.env.DATABASE_URL;

if (!DATABASE_URL) {
  console.error('❌ DATABASE_URL environment variable not set');
  process.exit(1);
}

// Parse CLI args
const args = process.argv.slice(2);
const isDryRun = args.includes('--dry-run');
const isVerbose = args.includes('--verbose');

// Initialize database
const sql = postgres(DATABASE_URL, {
  onnotice: () => {},
});

/**
 * @typedef {Object} RouteInfo
 * @property {string} routeId
 * @property {string} path
 * @property {'page'|'api'|'layout'|'error'} kind
 * @property {string} [group]
 * @property {boolean} [hasServerLoad]
 * @property {boolean} [hasClientLoad]
 * @property {boolean} [hasActions]
 * @property {number} fileCount
 */

/**
 * Recursively scan routes directory
 * @param {string} dir
 * @param {string} basePath
 * @returns {Promise<RouteInfo[]>}
 */
async function scanRoutes(dir = ROUTES_DIR, basePath = '') {
  /** @type {RouteInfo[]} */
  const routes = [];

  try {
    const entries = await readdir(dir, { withFileTypes: true });

    for (const entry of entries) {
      const fullPath = join(dir, entry.name);
      const relativePath = relative(ROUTES_DIR, fullPath);

      if (entry.isDirectory()) {
        // Skip special directories
        if (entry.name.startsWith('.') || entry.name === 'node_modules') {
          continue;
        }

        // Extract group from (groupName) syntax
        const groupMatch = entry.name.match(/^\((.+)\)$/);
        const group = groupMatch ? groupMatch[1] : undefined;

        // Recursively scan subdirectories
        const subPath = groupMatch ? basePath : `${basePath}/${entry.name}`;
        const subRoutes = await scanRoutes(fullPath, subPath);
        routes.push(...subRoutes);

      } else if (entry.isFile()) {
        // Analyze route files
        const routePath = basePath || '/';
        const routeId = relativePath.replace(/\\/g, '/');

        // Determine route kind
        /** @type {RouteInfo['kind']} */
        let kind = 'page';
        if (entry.name.includes('+server.')) kind = 'api';
        else if (entry.name.includes('+layout.')) kind = 'layout';
        else if (entry.name.includes('+error.')) kind = 'error';

        // Check for existing route entry
        const existingIndex = routes.findIndex(r => r.path === routePath);

        if (existingIndex >= 0) {
          // Update existing route
          const route = routes[existingIndex];
          route.fileCount++;

          if (entry.name.includes('+page.server.')) route.hasServerLoad = true;
          if (entry.name.includes('+page.ts')) route.hasClientLoad = true;
          if (entry.name.includes('+page.server.ts') && entry.name.includes('actions')) {
            route.hasActions = true;
          }
        } else {
          // Create new route entry
          routes.push({
            routeId,
            path: routePath,
            kind,
            hasServerLoad: entry.name.includes('+page.server.'),
            hasClientLoad: entry.name.includes('+page.ts'),
            hasActions: false,
            fileCount: 1,
          });
        }
      }
    }
  } catch (error) {
    console.error(`❌ Error scanning ${dir}:`, error.message);
  }

  return routes;
}

/**
 * Enrich route with error cluster data
 * @param {RouteInfo} route
 */
async function enrichWithErrors(route) {
  try {
    const errors = await sql`
      SELECT
        COUNT(*) as error_count,
        array_agg(DISTINCT severity) as severities
      FROM error_events
      WHERE route_path = ${route.path}
        AND created_at > NOW() - INTERVAL '7 days'
    `;

    return {
      errorCount: parseInt(errors[0]?.error_count || '0'),
      severities: errors[0]?.severities || [],
    };
  } catch (err) {
    if (isVerbose) {
      console.warn(`   ⚠️ Could not fetch errors for ${route.path}:`, err.message);
    }
    return { errorCount: 0, severities: [] };
  }
}

/**
 * Determine route health status
 * @param {number} errorCount
 * @param {string[]} severities
 * @returns {string}
 */
function calculateStatus(errorCount, severities) {
  if (errorCount === 0) return 'healthy';
  if (severities.includes('error') && errorCount > 5) return 'critical';
  if (severities.includes('error')) return 'degraded';
  if (errorCount > 10) return 'warning';
  return 'healthy';
}

/**
 * Calculate route priority
 * @param {RouteInfo} route
 * @param {number} errorCount
 * @returns {number}
 */
function calculatePriority(route, errorCount) {
  let priority = 50; // Default

  // API routes are higher priority
  if (route.kind === 'api') priority += 20;

  // Routes with errors need attention
  if (errorCount > 0) priority += Math.min(errorCount * 2, 30);

  // Core routes (root, auth, etc.)
  if (route.path === '/' || route.path.includes('auth') || route.path.includes('api')) {
    priority += 10;
  }

  return Math.min(priority, 100);
}

/**
 * Insert or update route in database
 * @param {RouteInfo} route
 * @param {{errorCount: number, severities: string[]}} enrichment
 */
async function upsertRoute(route, enrichment) {
  const status = calculateStatus(enrichment.errorCount, enrichment.severities);
  const priority = calculatePriority(route, enrichment.errorCount);

  const badges = [];
  if (route.hasServerLoad) badges.push('SSR');
  if (route.hasClientLoad) badges.push('CSR');
  if (route.hasActions) badges.push('Actions');
  if (enrichment.errorCount > 0) badges.push(`${enrichment.errorCount} errors`);

  try {
    await sql`
      INSERT INTO route_metadata (
        route_id, path, kind, status, priority, badges
      ) VALUES (
        ${route.routeId},
        ${route.path},
        ${route.kind},
        ${status},
        ${priority},
        ${JSON.stringify(badges)}
      )
      ON CONFLICT (route_id) DO UPDATE SET
        path = EXCLUDED.path,
        kind = EXCLUDED.kind,
        status = EXCLUDED.status,
        priority = EXCLUDED.priority,
        badges = EXCLUDED.badges,
        updated_at = NOW()
    `;

    return true;
  } catch (err) {
    console.error(`❌ Failed to upsert route ${route.path}:`, err.message);
    return false;
  }
}

/**
 * Main scanner function
 */
async function main() {
  console.log('🔍 Phase 2: Route Scanner & Database Populator\n');

  try {
    // Step 1: Scan filesystem
    console.log('📂 Scanning routes directory...');
    const routes = await scanRoutes();
    console.log(`   Found ${routes.length} routes\n`);

    if (routes.length === 0) {
      console.log('⚠️  No routes found. Check ROUTES_DIR configuration.');
      return;
    }

    if (isDryRun) {
      console.log('🔍 DRY RUN: Would populate database with:\n');
      routes.slice(0, 10).forEach(r => {
        console.log(`   ${r.kind.padEnd(8)} ${r.path}`);
      });
      if (routes.length > 10) {
        console.log(`   ... and ${routes.length - 10} more routes`);
      }
      return;
    }

    // Step 2: Enrich with error data
    console.log('🔬 Enriching routes with error data...');
    let successCount = 0;
    let failCount = 0;

    for (let i = 0; i < routes.length; i++) {
      const route = routes[i];

      if (isVerbose) {
        console.log(`   [${i + 1}/${routes.length}] Processing ${route.path}...`);
      }

      const enrichment = await enrichWithErrors(route);
      const success = await upsertRoute(route, enrichment);

      if (success) {
        successCount++;
        if (isVerbose) {
          const status = calculateStatus(enrichment.errorCount, enrichment.severities);
          console.log(`      ✅ ${status} (${enrichment.errorCount} errors)`);
        }
      } else {
        failCount++;
      }
    }

    // Step 3: Summary
    console.log('\n📊 Route Scanner Summary:');
    console.log(`   Total routes scanned: ${routes.length}`);
    console.log(`   Successfully inserted: ${successCount}`);
    if (failCount > 0) {
      console.log(`   Failed: ${failCount}`);
    }

    // Distribution by kind
    const byKind = routes.reduce((acc, r) => {
      acc[r.kind] = (acc[r.kind] || 0) + 1;
      return acc;
    }, {});

    console.log('\n   Route Distribution:');
    Object.entries(byKind).forEach(([kind, count]) => {
      console.log(`   ${kind.padEnd(8)}: ${count}`);
    });

    console.log('\n✅ Phase 2 route scanning completed!');
    console.log('   Next: View enriched data at /all-routes');

  } catch (error) {
    console.error('❌ Route scanner failed:', error);
    process.exit(1);
  } finally {
    await sql.end();
  }
}

main();
