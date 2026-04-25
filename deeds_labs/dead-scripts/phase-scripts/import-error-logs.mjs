/**
 * Error Log Importer
 *
 * Parses svelte-check output and populates the error_cluster table
 * with categorized error data for the NES Command Center.
 *
 * Usage: npm run import:errors [logfile]
 */

import { readFile } from 'node:fs/promises';
import { dirname, isAbsolute, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import postgres from 'postgres';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Database connection
const connectionString = process.env.DATABASE_URL || 'postgresql://legal_admin:123456@localhost:5432/legal_ai_db';
const sql = postgres(connectionString);

/**
 * Parse error line - supports multiple formats
 *
 * TypeScript format: src/file.ts(45,12): error TS2322: Type 'string' is not assignable to type 'number'.
 * Svelte-check format: src/file.svelte:45:12 Error: Type 'string' is not assignable to type 'number'. (ts)
 */
function parseErrorLine(line) {
  // Try TypeScript format first: filepath(line,col): error TSxxxx: message
  const tsPattern = /^(.+?)\((\d+),(\d+)\):\s+(error|warning)\s+(TS\d+):\s+(.+)$/;
  const tsMatch = line.match(tsPattern);

  if (tsMatch) {
    const [, filepath, lineNum, colNum, severity, errorCode, message] = tsMatch;
    const category = categorizeError(message, 'ts');

    return {
      filepath,
      lineNum: parseInt(lineNum, 10),
      colNum: parseInt(colNum, 10),
      severity: severity.toLowerCase(),
      message,
      tool: 'ts',
      errorCode: errorCode.replace('TS', ''),
      category,
      rawLog: line
    };
  }

  // Try svelte-check format: filepath:line:col Level: message (tool)
  const sveltePattern = /^(.+?):(\d+):(\d+)\s+(Error|Warning|Hint):\s+(.+?)\s+\((\w+)\)$/;
  const svelteMatch = line.match(sveltePattern);

  if (svelteMatch) {
    const [, filepath, lineNum, colNum, severity, message, tool] = svelteMatch;

    // Extract error code from message if present
    let errorCode = null;
    const codeMatch = message.match(/TS(\d+)/i);
    if (codeMatch) {
      errorCode = codeMatch[1];
    }

    const category = categorizeError(message, tool);

    return {
      filepath,
      lineNum: parseInt(lineNum, 10),
      colNum: parseInt(colNum, 10),
      severity: severity.toLowerCase(),
      message,
      tool,
      errorCode,
      category,
      rawLog: line
    };
  }

  // Try svelte-check machine format: TIMESTAMP LEVEL "FILE" LINE:COL "MESSAGE"
  // 1766372799223 ERROR "src\\test-error.svelte" 2:9 "Type 'string' is not assignable to type 'number'."
  const machinePattern = /^\d+\s+(ERROR|WARNING|HINT)\s+"(.+?)"\s+(\d+):(\d+)\s+"(.+)"$/;
  const machineMatch = line.match(machinePattern);

  if (machineMatch) {
    const [, severity, filepathRaw, lineNum, colNum, message] = machineMatch;
    const filepath = filepathRaw.replace(/\\\\/g, '/').replace(/\\/g, '/');

    // Extract error code from message if present
    let errorCode = null;
    const codeMatch = message.match(/TS(\d+)/i);
    if (codeMatch) {
      errorCode = codeMatch[1];
    }

    const category = categorizeError(message, 'svelte-check');

    return {
      filepath,
      lineNum: parseInt(lineNum, 10),
      colNum: parseInt(colNum, 10),
      severity: severity.toLowerCase(),
      message,
      tool: 'svelte-check',
      errorCode,
      category,
      rawLog: line
    };
  }

  return null;
}

/**
 * Categorize error based on message content
 */
function categorizeError(message, tool) {
  const msg = message.toLowerCase();

  if (msg.includes('type') && (msg.includes('not assignable') || msg.includes('incompatible'))) {
    return 'type-mismatch';
  }
  if (msg.includes('cannot find') || msg.includes('does not exist')) {
    return 'missing-import';
  }
  if (msg.includes('property') && msg.includes('does not exist')) {
    return 'missing-property';
  }
  if (msg.includes('unused') || msg.includes('never read')) {
    return 'unused-code';
  }
  if (msg.includes('deprecated')) {
    return 'deprecated';
  }
  if (msg.includes('svelte') && msg.includes('rune')) {
    return 'svelte5-migration';
  }
  if (msg.includes('async') || msg.includes('promise')) {
    return 'async-issue';
  }
  if (msg.includes('null') || msg.includes('undefined')) {
    return 'null-safety';
  }

  return 'other';
}

/**
 * Extract route path from filepath and generate route_id
 * Implements the "non-route bucket" strategy for library/internal files
 */
function extractRouteId(filepath) {
  const p = filepath.replace(/\\/g, '/');

  // Ignore backup files - return null to skip them entirely
  if (p.includes('/.bak/') || p.includes('/ai.bak/') || p.endsWith('.bak') || p.includes('/__bak__/')) {
    return null;
  }

  // Match src/routes/... pattern
  const match = p.match(/src\/routes\/(.+?)\/\+(\w+)\./);
  if (match) {
    let routePath = '/' + match[1];
    routePath = routePath.replace(/\\/g, '/');

    const fileType = match[2]; // page, layout, server
    let kind = 'page';

    if (fileType === 'layout') kind = 'layout';
    else if (fileType === 'server') kind = 'server';
    else if (fileType === 'page') kind = 'page';

    return `${routePath}#${kind}`;
  }

  // Everything else (src/lib/..., src/**, etc.) goes to internal bucket
  return '/__non_route__#internal';
}

/**
 * Generate cluster ID from error characteristics
 * STABLE ACROSS RUNS - does not include line/col/paths
 */
function generateClusterId(tool, errorCode, category, routeId) {
  // Use only stable identifiers: tool, code, category, route
  const code = errorCode || 'NONE';
  const cat = category || 'other';
  const route = routeId || '__non_route__';

  // Create stable cluster ID that doesn't change when code moves
  return `${tool}_${code}_${cat}_${route.replace(/[^a-zA-Z0-9]/g, '_')}`;
}

/**
 * Generate human-readable cluster title from error characteristics
 */
function generateClusterTitle(tool, errorCode, category, message) {
  // TypeScript error code descriptions
  const tsCodeDescriptions = {
    '1005': 'Missing Semicolon',
    '1109': 'Expression Expected',
    '1127': 'Invalid Character',
    '1128': 'Declaration Expected',
    '1131': 'Invalid Property Name',
    '1136': 'Property Assignment Expected',
    '1351': 'Cannot Be Used In Module',
    '1357': 'Module Not Found',
    '1389': 'Constructor Not Callable',
    '1390': 'Invalid Type Arguments',
    '1434': 'Cannot Find Module',
    '1435': 'Unknown File Extension',
    '1442': 'Invalid Import',
    '2304': 'Cannot Find Name',
    '2305': 'Module Has No Export',
    '2307': 'Cannot Find Module',
    '2322': 'Type Assignment Error',
    '2339': 'Property Does Not Exist',
    '2345': 'Argument Type Mismatch',
    '2457': 'Variable Used Before Assigned',
    '2531': 'Object Possibly Null',
    '2571': 'Object Is Possibly Unknown',
    '2769': 'No Overload Matches',
    '7006': 'Parameter Implicitly Has Any',
    '17004': 'Cannot Access This',
  };

  const categoryDescriptions = {
    'type-mismatch': 'Type Mismatch',
    'missing-import': 'Missing Import',
    'missing-property': 'Missing Property',
    'unused-code': 'Unused Code',
    'deprecated': 'Deprecated API',
    'svelte5-migration': 'Svelte 5 Migration',
    'async-issue': 'Async/Promise Issue',
    'null-safety': 'Null Safety Check',
  };

  // Try to get description from code first
  if (errorCode && tsCodeDescriptions[errorCode]) {
    return `TS${errorCode}: ${tsCodeDescriptions[errorCode]}`;
  }

  // Fall back to category description
  if (category && categoryDescriptions[category]) {
    return `${tool.toUpperCase()}: ${categoryDescriptions[category]}`;
  }

  // Extract first meaningful part of message (up to 50 chars)
  const shortMessage = message.substring(0, 50).replace(/\s+/g, ' ').trim();
  return `TS${errorCode || 'ERR'}: ${shortMessage}...`;
}

/**
 * Upsert error cluster into database (adapted for error_cluster singular schema)
 */
async function upsertErrorCluster(cluster) {
  const {
    tool,
    errorCode,
    severity,
    message,
    affectedRoutes,
    occurrenceCount,
    filepath,
    rawLogSnippet,
    routeId
  } = cluster;

  const code = errorCode || 'UNKNOWN';
  const clusterId = generateClusterId(tool, code, cluster.category || 'typing', routeId);

  // Filter out null route IDs (backup files)
  const validRoutes = Array.from(affectedRoutes).filter(r => r !== null);

  // If no valid routes, use internal bucket
  const finalRoutes = validRoutes.length > 0 ? validRoutes : ['/__non_route__#internal'];

  // Pick the first route as the primary route_id for the row
  const primaryRouteId = finalRoutes[0];

  try {
    // Check if cluster already exists
    const existing = await sql`
      SELECT cluster_id FROM error_cluster WHERE cluster_id = ${clusterId}
    `;

    const isUpdate = existing.length > 0;

    // Generate human-readable title
    const title = generateClusterTitle(tool, code, cluster.category, message);

    await sql`
      INSERT INTO error_cluster (
        route_id, tool, code, message, severity, count,
        cluster_id, error_code, category, affected_routes,
        file_path, raw_log_snippet, title,
        first_seen_at, last_seen_at, updated_at
      )
      VALUES (
        ${primaryRouteId},
        ${tool},
        ${code},
        ${message.substring(0, 500)},
        ${severity},
        ${occurrenceCount},
        ${clusterId},
        ${code},
        ${cluster.category || 'typing'},
        ${JSON.stringify(finalRoutes)}::jsonb,
        ${filepath},
        ${rawLogSnippet},
        ${title},
        NOW(),
        NOW(),
        NOW()
      )
      ON CONFLICT (cluster_id) DO UPDATE
      SET count = error_cluster.count + EXCLUDED.count,
          last_seen_at = NOW(),
          updated_at = NOW(),
          file_path = EXCLUDED.file_path,
          raw_log_snippet = EXCLUDED.raw_log_snippet,
          affected_routes = (
            SELECT jsonb_agg(DISTINCT v)
            FROM (
              SELECT jsonb_array_elements_text(
                CASE
                  WHEN jsonb_typeof(error_cluster.affected_routes) = 'array' THEN error_cluster.affected_routes
                  ELSE '[]'::jsonb
                END
              ) AS v
              UNION
              SELECT jsonb_array_elements_text(
                CASE
                  WHEN jsonb_typeof(EXCLUDED.affected_routes) = 'array' THEN EXCLUDED.affected_routes
                  ELSE '[]'::jsonb
                END
              ) AS v
            ) s
          )
    `;

    return {
      action: isUpdate ? 'updated' : 'inserted',
      count: 1,
      skipped: 0
    };
  } catch (err) {
    console.error(`Error inserting cluster ${clusterId}:`, err.message);
    return { action: 'skipped', count: 0, skipped: 1 };
  }
}/**
 * Main function
 */
async function main() {
  const logFile = process.argv[2] || 'svelte-check-latest.txt';

  // Handle absolute paths or relative paths
  let logPath;
  if (isAbsolute(logFile)) {
    logPath = logFile;
  } else {
    logPath = join(process.cwd(), logFile);
  }

  // If not found in current dir (and relative), try parent dir
  if (!isAbsolute(logFile)) {
    try {
      await readFile(logPath, 'utf-8');
    } catch {
      logPath = join(process.cwd(), '..', logFile);
    }
  }

  console.log(`📖 Reading error log: ${logFile}\n`);

  try {
    // Read log file
    const content = await readFile(logPath, 'utf-8');
    const lines = content.split('\n');

    console.log(`Found ${lines.length} lines\n`);

    // Parse errors
    const errors = [];
    for (const line of lines) {
      const parsed = parseErrorLine(line.trim());
      if (parsed) {
        errors.push(parsed);
      }
    }

    console.log(`Parsed ${errors.length} errors\n`);

    if (errors.length === 0) {
      console.log('⚠️  No errors found in log file');
      return;
    }

    // Group errors into clusters
    const clusters = new Map();

    for (const error of errors) {
      // Extract route first so we can use it for clustering
      const routeId = extractRouteId(error.filepath) || '/__non_route__#internal';

      const clusterId = generateClusterId(
        error.tool,
        error.errorCode,
        error.category,
        routeId
      );

      if (!clusters.has(clusterId)) {
        clusters.set(clusterId, {
          clusterId,
          tool: error.tool,
          errorCode: error.errorCode,
          category: error.category,
          severity: error.severity,
          message: error.message,
          filepath: error.filepath,
          rawLogSnippet: error.rawLog,
          routeId,
          affectedRoutes: new Set(),
          occurrenceCount: 0,
          firstSeenAt: new Date().toISOString(),
          lastSeenAt: new Date().toISOString()
        });
      }

      const cluster = clusters.get(clusterId);
      cluster.occurrenceCount++;

      if (routeId) {
        cluster.affectedRoutes.add(routeId);
      }
    }

    console.log(`Grouped into ${clusters.size} error clusters\n`);

    // Import clusters into database
    let insertCount = 0;
    let updateCount = 0;
    let errorCount = 0;
    let skippedCount = 0;

    for (const [clusterId, cluster] of clusters) {
      try {
        // Convert Set to Array for JSON
        cluster.affectedRoutes = Array.from(cluster.affectedRoutes);

        const result = await upsertErrorCluster(cluster);

        if (result.action === 'inserted') {
          console.log(`✅ NEW: ${cluster.tool} - ${cluster.category} (${result.count} routes, ${result.skipped} skipped)`);
          insertCount += result.count;
          skippedCount += result.skipped;
        } else if (result.action === 'skipped') {
          console.log(`⚠️  SKIP: ${cluster.tool} - ${cluster.category} (no valid routes)`);
          skippedCount += result.skipped;
        } else {
          console.log(`🔄 UPD: ${cluster.tool} - ${cluster.category} (${result.count}x)`);
          updateCount++;
        }
      } catch (error) {
        console.error(`❌ ${clusterId}: ${error.message}`);
        errorCount++;
      }
    }

    console.log(`\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);
    console.log(`📊 Summary`);
    console.log(`━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);
    console.log(`📝 Errors Parsed: ${errors.length}`);
    console.log(`🔗 Clusters Created: ${clusters.size}`);
    console.log(`✅ Inserted: ${insertCount}`);
    console.log(`🔄 Updated: ${updateCount}`);
    console.log(`⚠️  Skipped: ${skippedCount} (no matching routes)`);
    console.log(`❌ Errors: ${errorCount}`);
    console.log(`━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n`);

    if (insertCount + updateCount > 0) {
      console.log('🎉 Error clusters imported successfully!');
      console.log('   Navigate to http://localhost:5173/all-routes to see error data\n');
    }

  } catch (error) {
    console.error('❌ Fatal error:', error);
    process.exit(1);
  } finally {
    await sql.end();
  }
}

// Run the importer
main();
