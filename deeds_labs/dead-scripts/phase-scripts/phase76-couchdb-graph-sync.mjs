#!/usr/bin/env node
/**
 * Phase 76: CouchDB Graph Sync
 *
 * Syncs AST graph analysis to CouchDB for Phase 66-78 integration
 *
 * Usage:
 *   node scripts/phase76-couchdb-graph-sync.mjs [options]
 *
 * Options:
 *   --couchdb-url <url>    CouchDB URL (default: http://localhost:5984)
 *   --db-name <name>       Database name (default: ast-graph-analysis)
 *   --create-db            Create database if it doesn't exist
 *   --json-path <path>     Path to JSON graph data (default: reports/phase76-ast-graph-recommendations.json)
 *   --batch-size <size>    Batch size for bulk inserts (default: 50)
 *   --verbose              Enable verbose logging
 */

import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT_DIR = path.resolve(__dirname, '..');

// ANSI color codes
const colors = {
  reset: '\x1b[0m',
  red: '\x1b[31m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  cyan: '\x1b[36m',
  dim: '\x1b[2m',
};

function log(message, color = 'reset') {
  console.log(`${colors[color]}${message}${colors.reset}`);
}

/**
 * CouchDB API Client
 */
class CouchDBClient {
  constructor(url, dbName) {
    this.url = url;
    this.dbName = dbName;
    this.dbUrl = `${url}/${dbName}`;
  }

  async request(path, options = {}) {
    const url = `${this.url}${path}`;
    const response = await fetch(url, {
      ...options,
      headers: {
        'Content-Type': 'application/json',
        ...options.headers,
      },
    });

    if (!response.ok && response.status !== 404) {
      throw new Error(`CouchDB request failed: ${response.status} ${response.statusText}`);
    }

    return response;
  }

  async createDatabase() {
    try {
      const response = await this.request(`/${this.dbName}`, { method: 'PUT' });
      return response.ok;
    } catch (error) {
      return false;
    }
  }

  async databaseExists() {
    try {
      const response = await this.request(`/${this.dbName}`);
      return response.ok;
    } catch (error) {
      return false;
    }
  }

  async bulkInsert(documents) {
    const response = await this.request(`/${this.dbName}/_bulk_docs`, {
      method: 'POST',
      body: JSON.stringify({ docs: documents }),
    });

    return response.json();
  }

  async getDocument(id) {
    try {
      const response = await this.request(`/${this.dbName}/${id}`);
      if (response.ok) {
        return response.json();
      }
      return null;
    } catch (error) {
      return null;
    }
  }

  async updateDocument(doc) {
    const existing = await this.getDocument(doc._id);
    if (existing) {
      doc._rev = existing._rev;
    }

    const response = await this.request(`/${this.dbName}/${doc._id}`, {
      method: 'PUT',
      body: JSON.stringify(doc),
    });

    return response.json();
  }

  async createView(designDoc, viewName, mapFunction, reduceFunction = null) {
    const doc = {
      _id: `_design/${designDoc}`,
      views: {
        [viewName]: {
          map: mapFunction.toString(),
          ...(reduceFunction && { reduce: reduceFunction.toString() }),
        },
      },
    };

    return this.updateDocument(doc);
  }
}

/**
 * Create Phase 66-78 integration views
 */
async function createIntegrationViews(client) {
  log('\n📊 Creating CouchDB views for Phase 66-78 integration...', 'yellow');

  // View 1: Components by migration priority
  await client.createView(
    'phase76',
    'by_priority',
    function (doc) {
      if (doc.type === 'component' && doc.phase66_78) {
        emit(doc.phase66_78.priority, {
          path: doc.path,
          status: doc.migration.status,
          complexity: doc.migration.complexity,
          errors: doc.errors.length,
        });
      }
    }
  );
  log('   ✓ Created view: by_priority', 'green');

  // View 2: Components by migration status
  await client.createView(
    'phase76',
    'by_status',
    function (doc) {
      if (doc.type === 'component' && doc.migration) {
        emit(doc.migration.status, {
          path: doc.path,
          priority: doc.phase66_78.priority,
          svelte4Score: doc.migration.svelte4Score,
        });
      }
    }
  );
  log('   ✓ Created view: by_status', 'green');

  // View 3: AST errors by component
  await client.createView(
    'phase76',
    'errors_by_component',
    function (doc) {
      if (doc.type === 'component' && doc.errors.length > 0) {
        doc.errors.forEach(function (error) {
          emit(doc.path, {
            line: error.line,
            message: error.message,
            severity: error.severity,
          });
        });
      }
    },
    function (keys, values, rereduce) {
      return sum(values);
    }
  );
  log('   ✓ Created view: errors_by_component', 'green');

  // View 4: Migration recommendations
  await client.createView(
    'phase76',
    'recommendations',
    function (doc) {
      if (doc.type === 'component' && doc.phase66_78.recommendations) {
        doc.phase66_78.recommendations.forEach(function (rec) {
          emit([rec.priority, doc.path], {
            type: rec.type,
            pattern: rec.pattern,
            description: rec.description,
            action: rec.action,
          });
        });
      }
    }
  );
  log('   ✓ Created view: recommendations', 'green');

  // View 5: Effort estimation
  await client.createView(
    'phase76',
    'effort_estimate',
    function (doc) {
      if (doc.type === 'component' && doc.phase66_78.estimatedEffort) {
        emit(doc.migration.complexity, {
          path: doc.path,
          hours: doc.phase66_78.estimatedEffort.hours,
          humanReadable: doc.phase66_78.estimatedEffort.humanReadable,
        });
      }
    },
    function (keys, values, rereduce) {
      if (rereduce) {
        return sum(values);
      } else {
        return sum(values.map(function (v) { return v.hours; }));
      }
    }
  );
  log('   ✓ Created view: effort_estimate', 'green');
}

/**
 * Main execution
 */
async function main() {
  const args = process.argv.slice(2);
  const options = {
    couchdbUrl: process.env.COUCHDB_URL || 'http://localhost:5984',
    dbName: 'ast-graph-analysis',
    createDb: false,
    jsonPath: 'reports/phase76-ast-graph-recommendations.json',
    batchSize: 50,
    verbose: false,
  };

  // Parse command-line arguments
  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--couchdb-url' && args[i + 1]) {
      options.couchdbUrl = args[++i];
    } else if (args[i] === '--db-name' && args[i + 1]) {
      options.dbName = args[++i];
    } else if (args[i] === '--create-db') {
      options.createDb = true;
    } else if (args[i] === '--json-path' && args[i + 1]) {
      options.jsonPath = args[++i];
    } else if (args[i] === '--batch-size' && args[i + 1]) {
      options.batchSize = parseInt(args[++i]);
    } else if (args[i] === '--verbose') {
      options.verbose = true;
    }
  }

  log('\n🗄️  Phase 76: CouchDB Graph Sync\n', 'cyan');
  log('━'.repeat(60), 'dim');

  // Initialize CouchDB client
  const client = new CouchDBClient(options.couchdbUrl, options.dbName);

  // Check database existence
  log('\n🔍 Checking CouchDB connection...', 'yellow');
  const exists = await client.databaseExists();

  if (!exists) {
    if (options.createDb) {
      log('   ⚙️  Creating database...', 'yellow');
      const created = await client.createDatabase();
      if (created) {
        log('   ✓ Database created successfully', 'green');
      } else {
        throw new Error('Failed to create database');
      }
    } else {
      throw new Error(`Database "${options.dbName}" does not exist. Use --create-db to create it.`);
    }
  } else {
    log('   ✓ Connected to CouchDB', 'green');
  }

  // Read JSON graph data
  log('\n📖 Reading graph data...', 'yellow');
  const jsonPath = path.resolve(ROOT_DIR, options.jsonPath);
  const jsonContent = await fs.readFile(jsonPath, 'utf-8');
  const graphData = JSON.parse(jsonContent);

  const documents = graphData.graphDocuments || [];
  log(`   ✓ Loaded ${documents.length} graph documents`, 'green');

  // Bulk insert in batches
  log('\n💾 Syncing to CouchDB...', 'yellow');
  let synced = 0;

  for (let i = 0; i < documents.length; i += options.batchSize) {
    const batch = documents.slice(i, i + options.batchSize);
    const results = await client.bulkInsert(batch);

    const successful = results.filter((r) => r.ok).length;
    synced += successful;

    if (options.verbose) {
      log(`   📦 Batch ${Math.floor(i / options.batchSize) + 1}: ${successful}/${batch.length} documents synced`, 'dim');
    }
  }

  log(`   ✓ Synced ${synced}/${documents.length} documents`, 'green');

  // Create integration views
  await createIntegrationViews(client);

  // Create summary document
  log('\n📊 Creating summary document...', 'yellow');
  const summaryDoc = {
    _id: 'summary:latest',
    type: 'summary',
    timestamp: graphData.timestamp,
    summary: graphData.summary,
    storeAudit: graphData.storeAudit,
    phase66_78: {
      totalComponents: graphData.summary.totalComponents,
      astErrors: graphData.summary.astErrors,
      migrationRelatedErrors: graphData.summary.migrationRelatedErrors,
      viewsCreated: [
        'by_priority',
        'by_status',
        'errors_by_component',
        'recommendations',
        'effort_estimate',
      ],
    },
  };

  await client.updateDocument(summaryDoc);
  log('   ✓ Summary document created', 'green');

  // Final summary
  log('\n━'.repeat(60), 'dim');
  log('\n✅ Phase 76: CouchDB Graph Sync Complete\n', 'green');
  log(`📊 Sync Summary:`, 'cyan');
  log(`   • Database: ${options.dbName}`, 'reset');
  log(`   • Documents synced: ${synced}`, 'reset');
  log(`   • Views created: 5`, 'reset');
  log(`   • CouchDB URL: ${options.couchdbUrl}/${options.dbName}`, 'reset');

  log(`\n🔍 Query Examples:`, 'cyan');
  log(`   • High priority: ${options.couchdbUrl}/${options.dbName}/_design/phase76/_view/by_priority?descending=true&limit=10`, 'dim');
  log(`   • Svelte 4 components: ${options.couchdbUrl}/${options.dbName}/_design/phase76/_view/by_status?key="svelte4"`, 'dim');
  log(`   • All recommendations: ${options.couchdbUrl}/${options.dbName}/_design/phase76/_view/recommendations`, 'dim');
  log(`   • Summary: ${options.couchdbUrl}/${options.dbName}/summary:latest\n`, 'dim');
}

main().catch((error) => {
  log(`\n❌ Error: ${error.message}`, 'red');
  if (error.stack) {
    log(error.stack, 'dim');
  }
  process.exit(1);
});
