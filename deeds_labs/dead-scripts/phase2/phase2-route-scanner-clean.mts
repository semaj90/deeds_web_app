#!/usr/bin/env node
/**
 * Phase 2: Route Scanner & Database Populator
 *
 * Scans SvelteKit routes directory and populates route_metadata table
 *
 * Usage:
 *   npm run phase2:scan              # Full scan with DB insert
 *   npm run phase2:scan -- --dry-run # Preview only
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
const sql = postgres(DATABASE_URL, { onnotice: () => {} });

type RouteKind = 'page' | 'api' | 'layout' | 'error';

type RouteInfo = {
  routeId: string;
  path: string;
  kind: RouteKind;
  group?: string;
  hasServerLoad?: boolean;
  hasClientLoad?: boolean;
  hasActions?: boolean;
  fileCount: number;
};

/**
 * Recursively scan routes directory
 */
async function scanRoutes(dir: string = ROUTES_DIR, basePath: string = ''): Promise<RouteInfo[]> {
  const routes: RouteInfo[] = [];

  try {
    const entries = await readdir(dir, { withFileTypes: true });
    const routeMap = new Map<string, RouteInfo>();

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
        // Only process SvelteKit route files
        if (!['+page.', '+server.', '+layout.', '+error.'].some(p => entry.name.includes(p))) {
          continue;
        }

        const routePath = basePath || '/';
        const routeKey = routePath;

        // Determine route kind
        let kind: RouteKind = 'page';
        if (entry.name.includes('+server.')) kind = 'api';
        else if (entry.name.includes('+layout.')) kind = 'layout';
        else if (entry.name.includes('+error.')) kind = 'error';

        // Get or create route entry
        let route = routeMap.get(routeKey);
        if (!route) {
          route = {
            routeId: relativePath.replace(/\\/g, '/').split('/')[0] || 'root',
            path: routePath,
            kind: kind,
            fileCount: 0,
          };
          routeMap.set(routeKey, route);
        }

        // Update route properties
        route.fileCount++;
        if (entry.name.includes('+server.ts') || entry.name.includes('+page.server.ts')) {
          route.hasServerLoad = true;
        }
        if (entry.name.includes('+page.ts') && !entry.name.includes('.server.')) {
          route.hasClientLoad = true;
        }
        if (entry.name.includes('+page.server.ts')) {
          route.hasActions = true;
        }
      }
    }

    routes.push(...Array.from(routeMap.values()));

  } catch (error) {
    console.error(`❌ Error scanning ${dir}:`, error);
  }

  return routes;
}

/**
 * Determine route group from path
 */
function inferGroup(path: string): string | null {
  if (path.startsWith('/cases')) return 'cases';
  if (path.startsWith('/evidence')) return 'evidence';
  if (path.startsWith('/persons')) return 'persons';
  if (path.startsWith('/documents')) return 'documents';
  if (path.startsWith('/search')) return 'search';
  if (path.startsWith('/ai')) return 'ai';
  if (path.startsWith('/admin')) return 'admin';
  if (path === '/' || path.startsWith('/auth')) return 'core';
  return null;
}

/**
 * Calculate route priority
 */
function calculatePriority(route: RouteInfo): number {
  let priority = 50; // base priority

  // Critical routes get higher priority
  if (route.path === '/' || route.path === '/auth/login') priority = 100;
  if (route.kind === 'api') priority += 10;
  if (route.hasActions) priority += 5;
  if (route.group === 'core') priority += 20;
  if (route.path.includes('[id]')) priority -= 5; // detail pages less critical

  return Math.min(100, Math.max(1, priority));
}

/**
 * Insert routes into database
 */
async function insertRoutes(routes: RouteInfo[]): Promise<void> {
  console.log(`\n📊 Inserting ${routes.length} routes into database...`);

  for (const route of routes) {
    const group = inferGroup(route.path);
    const priority = calculatePriority(route);
    const badges: string[] = [];

    if (route.hasServerLoad) badges.push('ssr');
    if (route.hasClientLoad) badges.push('csr');
    if (route.hasActions) badges.push('actions');
    if (route.kind === 'api') badges.push('api');

    try {
      await sql`
        INSERT INTO route_metadata (
          route_id, path, kind, "group", status, priority, badges
        )
        VALUES (
          ${route.routeId}, ${route.path}, ${route.kind}, ${group},
          'healthy', ${priority}, ${JSON.stringify(badges)}
        )
        ON CONFLICT (path) DO UPDATE SET
          route_id = EXCLUDED.route_id,
          kind = EXCLUDED.kind,
          "group" = EXCLUDED."group",
          priority = EXCLUDED.priority,
          badges = EXCLUDED.badges,
          updated_at = NOW()
      `;

      if (isVerbose) {
        console.log(`   ✅ ${route.path} [${route.kind}] (priority: ${priority})`);
      }
    } catch (error) {
      console.error(`   ❌ Failed to insert ${route.path}:`, error);
    }
  }
}

/**
 * Main execution
 */
async function main() {
  console.log('🔍 Phase 2: Route Scanner & Database Populator\n');
  console.log(`📂 Scanning: ${ROUTES_DIR}`);
  console.log(`🔧 Mode: ${isDryRun ? 'DRY RUN' : 'LIVE INSERT'}\n`);

  // Scan routes
  const routes = await scanRoutes();

  console.log(`\n✅ Found ${routes.length} routes`);

  if (routes.length === 0) {
    console.log('⚠️  No routes found. Check ROUTES_DIR path.');
    process.exit(0);
  }

  // Group by kind
  const byKind = routes.reduce((acc, r) => {
    acc[r.kind] = (acc[r.kind] || 0) + 1;
    return acc;
  }, {} as Record<RouteKind, number>);

  console.log('\n📊 Route Summary:');
  Object.entries(byKind).forEach(([kind, count]) => {
    console.log(`   ${kind.padEnd(10)} ${count}`);
  });

  if (isDryRun) {
    console.log('\n🔍 Sample routes (dry run):');
    routes.slice(0, 10).forEach(r => {
      console.log(`   ${r.path.padEnd(40)} [${r.kind}] priority: ${calculatePriority(r)}`);
    });
    console.log('\n✅ Dry run complete. Use without --dry-run to insert.');
  } else {
    await insertRoutes(routes);
    console.log('\n✅ Phase 2 complete!');
    console.log('\n📋 Next steps:');
    console.log('   1. Check route_metadata table: psql -c "SELECT path, status, priority FROM route_metadata LIMIT 10;"');
    console.log('   2. Link errors to routes: npm run phase78:link-errors');
    console.log('   3. View all-routes page: http://localhost:5175/all-routes');
  }

  await sql.end();
}

main().catch((err) => {
  console.error('❌ Fatal error:', err);
  process.exit(1);
});
