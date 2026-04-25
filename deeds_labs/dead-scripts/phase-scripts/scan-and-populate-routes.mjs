/**
 * Route Scanner and Database Populator
 *
 * Scans the sveltekit-frontend/src/routes directory and populates
 * the route_metadata table with discovered routes.
 *
 * Usage: node scripts/scan-and-populate-routes.mjs
 */

import { readdir } from 'node:fs/promises';
import { join, relative, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { dirname } from 'node:path';
import postgres from 'postgres';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const ROUTES_DIR = join(__dirname, '..', 'src', 'routes');

// Database connection
const connectionString = process.env.DATABASE_URL || 'postgresql://legal_admin:123456@localhost:5432/legal_ai_db';
const sql = postgres(connectionString);

/**
 * Recursively scan directory for route files
 */
async function scanDirectory(dir, routes = []) {
  const entries = await readdir(dir, { withFileTypes: true });

  for (const entry of entries) {
    const fullPath = join(dir, entry.name);

    if (entry.isDirectory()) {
      // Skip node_modules, .svelte-kit, etc.
      if (entry.name.startsWith('.') || entry.name === 'node_modules') {
        continue;
      }
      await scanDirectory(fullPath, routes);
    } else if (entry.isFile()) {
      // Only process SvelteKit route files
      if (
        entry.name === '+page.svelte' ||
        entry.name === '+page.ts' ||
        entry.name === '+page.js' ||
        entry.name === '+page.server.ts' ||
        entry.name === '+page.server.js' ||
        entry.name === '+layout.svelte' ||
        entry.name === '+layout.ts' ||
        entry.name === '+layout.js' ||
        entry.name === '+layout.server.ts' ||
        entry.name === '+layout.server.js' ||
        entry.name === '+server.ts' ||
        entry.name === '+server.js'
      ) {
        routes.push({ path: fullPath, file: entry.name });
      }
    }
  }

  return routes;
}

/**
 * Convert file path to route path
 */
function filePathToRoutePath(filePath) {
  // Get relative path from routes directory
  const relativePath = relative(ROUTES_DIR, dirname(filePath));

  // Convert to URL path
  let routePath = '/' + relativePath.split(sep).join('/');

  // Clean up
  routePath = routePath.replace(/\/\//g, '/');
  if (routePath === '/') routePath = '/';

  return routePath;
}

/**
 * Determine route kind from filename
 */
function getRouteKind(filename) {
  if (filename.startsWith('+page')) return 'page';
  if (filename.startsWith('+layout')) return 'layout';
  if (filename.startsWith('+server')) return 'server';
  return 'endpoint';
}

/**
 * Extract group from route path
 */
function extractGroup(routePath) {
  const groupMatch = routePath.match(/\/\(([^)]+)\)/);
  return groupMatch ? `(${groupMatch[1]})` : null;
}

/**
 * Generate route ID from path
 */
function generateRouteId(routePath, kind) {
  return `${routePath}#${kind}`;
}

/**
 * Upsert route metadata into database
 */
async function upsertRouteMetadata(metadata) {
  const { routeId, path, kind, group, status, priority, badges } = metadata;

  // Check if route exists
  const existing = await sql`
    SELECT id FROM route_metadata
    WHERE route_id = ${routeId} AND archived_at IS NULL
    LIMIT 1
  `;

  if (existing.length > 0) {
    // Update existing
    await sql`
      UPDATE route_metadata
      SET
        path = ${path},
        kind = ${kind},
        "group" = ${group},
        status = ${status},
        priority = ${priority},
        badges = ${badges ? JSON.stringify(badges) : null}::jsonb,
        updated_at = CURRENT_TIMESTAMP
      WHERE route_id = ${routeId}
    `;
  } else {
    // Insert new
    await sql`
      INSERT INTO route_metadata (route_id, path, kind, "group", status, priority, badges)
      VALUES (${routeId}, ${path}, ${kind}, ${group}, ${status}, ${priority}, ${badges ? JSON.stringify(badges) : null}::jsonb)
    `;
  }
}

/**
 * Main function
 */
async function main() {
  console.log('🔍 Scanning routes directory...\n');

  try {
    // Scan for route files
    const routeFiles = await scanDirectory(ROUTES_DIR);
    console.log(`Found ${routeFiles.length} route files\n`);

    // Group by route path
    const routesByPath = new Map();
    for (const { path: filePath, file } of routeFiles) {
      const routePath = filePathToRoutePath(filePath);
      const kind = getRouteKind(file);
      const key = `${routePath}#${kind}`;

      if (!routesByPath.has(key)) {
        routesByPath.set(key, {
          routePath,
          kind,
          files: []
        });
      }
      routesByPath.get(key).files.push(file);
    }

    console.log(`Discovered ${routesByPath.size} unique routes\n`);

    // Populate database
    let successCount = 0;
    let errorCount = 0;

    for (const [key, { routePath, kind, files }] of routesByPath) {
      try {
        const routeId = generateRouteId(routePath, kind);
        const group = extractGroup(routePath);

        // Determine priority based on route characteristics
        let priority = 50; // default
        if (routePath === '/') priority = 100;
        else if (routePath.includes('(app)')) priority = 80;
        else if (routePath.includes('api')) priority = 30;

        // Determine badges
        const badges = [];
        if (routePath.includes('ai')) badges.push('ai');
        if (routePath.includes('yorha')) badges.push('yorha');
        if (kind === 'server') badges.push('api');

        const metadata = {
          routeId,
          path: routePath,
          kind,
          group,
          status: 'healthy',
          priority,
          badges: badges.length > 0 ? badges : null,
        };

        await upsertRouteMetadata(metadata);

        console.log(`✅ ${routePath} (${kind})`);
        successCount++;
      } catch (error) {
        console.error(`❌ ${routePath} (${kind}): ${error.message}`);
        errorCount++;
      }
    }

    console.log(`\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);
    console.log(`📊 Summary`);
    console.log(`━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);
    console.log(`✅ Success: ${successCount}`);
    console.log(`❌ Errors: ${errorCount}`);
    console.log(`📁 Total: ${routesByPath.size}`);
    console.log(`━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n`);

    if (successCount > 0) {
      console.log('🎉 Route metadata populated successfully!');
      console.log('   Navigate to http://localhost:5173/all-routes to see enriched data\n');
    }

  } catch (error) {
    console.error('❌ Fatal error:', error);
    process.exit(1);
  } finally {
    // Close database connection
    await sql.end();
  }
}

// Run the scanner
main();
