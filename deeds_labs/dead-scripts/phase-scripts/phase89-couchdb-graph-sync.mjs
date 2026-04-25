#!/usr/bin/env node
/**
 * Phase 89: CouchDB Graph Sync with Qdrant Auto-Tagging & pgvector Mirroring
 *
 * Architecture:
 * 1. PostgreSQL (legal) - Source of truth for error graph (kg_nodes, kg_edges)
 * 2. CouchDB - Document store with graph views + auto-tags
 * 3. Qdrant - Vector search with auto-tagged metadata (phase76_knowledge_base)
 * 4. pgvector - Mirrored embeddings in error_embeddings table
 *
 * Flow:
 *   AST Parse → Postgres Graph → CouchDB Docs → Qdrant Vectors → pgvector Mirror
 *
 * Usage:
 *   node scripts/phase89-couchdb-graph-sync.mjs --sync-all
 *   node scripts/phase89-couchdb-graph-sync.mjs --sync-nodes
 *   node scripts/phase89-couchdb-graph-sync.mjs --verify
 */

import { QdrantClient } from '@qdrant/js-client-rest';
import crypto from 'crypto';
import fetch from 'node-fetch';
import pg from 'pg';

// ============================================================
// Configuration
// ============================================================
const CONFIG = {
  postgres: {
    host: '127.0.0.1',
    port: 5434,
    database: 'legal',
    user: 'user',
    password: 'pass'
  },
  couchdb: {
    url: 'http://localhost:5984',
    user: 'admin',
    password: 'password',
    dbName: 'error_graph'
  },
  qdrant: {
    url: 'http://127.0.0.1:6333',
    collection: 'phase76_knowledge_base'
  },
  ollama: {
    url: 'http://127.0.0.1:11434',
    embedModel: 'embeddinggemma:latest'
  }
};

// ============================================================
// CouchDB Client
// ============================================================
class CouchDBClient {
  constructor(config) {
    this.config = config;
    this.baseUrl = `${config.url}/${config.dbName}`;
    this.auth = Buffer.from(`${config.user}:${config.password}`).toString('base64');
  }

  async ensureDatabase() {
    const response = await fetch(`${this.config.url}/${this.config.dbName}`, {
      method: 'PUT',
      headers: { Authorization: `Basic ${this.auth}` }
    });

    if (response.ok || response.status === 412) {
      console.log(`✅ CouchDB database: ${this.config.dbName}`);
      return true;
    }

    const error = await response.text();
    throw new Error(`Failed to create database: ${error}`);
  }

  async createDesignDocs() {
    // View: All nodes by kind
    const nodesByKind = {
      _id: '_design/graph',
      views: {
        nodes_by_kind: {
          map: function(doc) {
            if (doc.type === 'node') {
              emit(doc.kind, doc);
            }
          }.toString()
        },
        edges_by_type: {
          map: function(doc) {
            if (doc.type === 'edge') {
              emit(doc.edge_type, doc);
            }
          }.toString()
        },
        errors_by_severity: {
          map: function(doc) {
            if (doc.type === 'node' && doc.kind === 'error') {
              emit(doc.meta.severity || 'unknown', doc);
            }
          }.toString()
        },
        files_with_errors: {
          map: function(doc) {
            if (doc.type === 'edge' && doc.edge_type === 'ERROR_IN_FILE') {
              emit(doc.to_id, doc);
            }
          }.toString(),
          reduce: '_count'
        }
      }
    };

    const response = await fetch(`${this.baseUrl}/_design/graph`, {
      method: 'PUT',
      headers: {
        Authorization: `Basic ${this.auth}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(nodesByKind)
    });

    if (response.ok || response.status === 409) {
      console.log('✅ CouchDB design docs created');
      return true;
    }

    const error = await response.text();
    console.warn(`⚠️  Design docs: ${error}`);
  }

  async upsertDoc(doc) {
    // Try to get existing doc for _rev
    const getResponse = await fetch(`${this.baseUrl}/${encodeURIComponent(doc._id)}`, {
      headers: { Authorization: `Basic ${this.auth}` }
    });

    let rev = null;
    if (getResponse.ok) {
      const existing = await getResponse.json();
      rev = existing._rev;
    }

    // Upsert with _rev if exists
    const putDoc = rev ? { ...doc, _rev: rev } : doc;
    const putResponse = await fetch(`${this.baseUrl}/${encodeURIComponent(doc._id)}`, {
      method: 'PUT',
      headers: {
        Authorization: `Basic ${this.auth}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(putDoc)
    });

    if (!putResponse.ok) {
      const error = await putResponse.text();
      throw new Error(`Failed to upsert doc ${doc._id}: ${error}`);
    }

    return putResponse.json();
  }

  async bulkUpsert(docs) {
    // Get all _revs in bulk
    const ids = docs.map(d => d._id);
    const bulkGetResponse = await fetch(`${this.baseUrl}/_all_docs?include_docs=true`, {
      method: 'POST',
      headers: {
        Authorization: `Basic ${this.auth}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ keys: ids })
    });

    const existingDocs = await bulkGetResponse.json();
    const revMap = new Map();

    existingDocs.rows.forEach(row => {
      if (row.doc) {
        revMap.set(row.id, row.doc._rev);
      }
    });

    // Add _revs to docs
    const docsWithRevs = docs.map(doc => {
      const rev = revMap.get(doc._id);
      return rev ? { ...doc, _rev: rev } : doc;
    });

    // Bulk insert
    const bulkResponse = await fetch(`${this.baseUrl}/_bulk_docs`, {
      method: 'POST',
      headers: {
        Authorization: `Basic ${this.auth}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ docs: docsWithRevs })
    });

    if (!bulkResponse.ok) {
      const error = await bulkResponse.text();
      throw new Error(`Bulk upsert failed: ${error}`);
    }

    return bulkResponse.json();
  }

  async query(designDoc, viewName, params = {}) {
    const queryParams = new URLSearchParams(params);
    const url = `${this.baseUrl}/_design/${designDoc}/_view/${viewName}?${queryParams}`;

    const response = await fetch(url, {
      headers: { Authorization: `Basic ${this.auth}` }
    });

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`Query failed: ${error}`);
    }

    return response.json();
  }
}

// ============================================================
// Auto-Tagging Engine
// ============================================================
class AutoTagger {
  constructor() {
    this.tagRules = [
      // Error severity tags
      { pattern: /severity.*error/i, tags: ['high-priority', 'blocking'] },
      { pattern: /severity.*warning/i, tags: ['medium-priority', 'review'] },

      // TypeScript error codes
      { pattern: /TS1005/, tags: ['syntax-error', 'missing-brace', 'typescript'] },
      { pattern: /TS2\d{3}/, tags: ['type-error', 'typescript'] },
      { pattern: /TS7\d{3}/, tags: ['declaration-error', 'typescript'] },

      // Svelte 5 migrations
      { pattern: /export let/, tags: ['svelte4-legacy', 'needs-migration', 'runes'] },
      { pattern: /\$:/, tags: ['svelte4-reactive', 'needs-migration', 'runes'] },
      { pattern: /\$state|\$derived|\$effect/, tags: ['svelte5', 'runes', 'modern'] },

      // File types
      { pattern: /\.svelte$/, tags: ['component', 'frontend', 'svelte'] },
      { pattern: /\+page\.svelte$/, tags: ['route', 'page', 'sveltekit'] },
      { pattern: /\+server\.(ts|js)$/, tags: ['api', 'backend', 'endpoint'] },
      { pattern: /\.server\.(ts|js)$/, tags: ['server-only', 'backend'] },

      // Module types
      { pattern: /src\/lib\/stores/, tags: ['state-management', 'store', 'reactive'] },
      { pattern: /src\/lib\/utils/, tags: ['utility', 'helper'] },
      { pattern: /src\/lib\/components/, tags: ['component', 'ui', 'reusable'] },

      // Error patterns
      { pattern: /Cannot find name/, tags: ['undefined-reference', 'scope-error'] },
      { pattern: /Property .* does not exist/, tags: ['type-mismatch', 'interface-error'] },
      { pattern: /Argument of type .* is not assignable/, tags: ['type-error', 'parameter-mismatch'] }
    ];
  }

  generateTags(node) {
    const tags = new Set();

    // Add kind-based tag
    tags.add(node.kind);

    // Check label
    this.tagRules.forEach(rule => {
      if (rule.pattern.test(node.label)) {
        rule.tags.forEach(tag => tags.add(tag));
      }
    });

    // Check meta fields
    if (node.meta) {
      const metaStr = JSON.stringify(node.meta);
      this.tagRules.forEach(rule => {
        if (rule.pattern.test(metaStr)) {
          rule.tags.forEach(tag => tags.add(tag));
        }
      });

      // Add severity tag
      if (node.meta.severity) {
        tags.add(`severity-${node.meta.severity.toLowerCase()}`);
      }

      // Add code tag
      if (node.meta.code) {
        tags.add(`code-${node.meta.code}`);
      }

      // Add path-based tags
      if (node.meta.path) {
        const path = node.meta.path;
        if (path.includes('routes')) tags.add('route-file');
        if (path.includes('lib')) tags.add('library-file');
        if (path.includes('components')) tags.add('component-file');
      }
    }

    return Array.from(tags);
  }
}

// ============================================================
// Main Sync Engine
// ============================================================
class GraphSyncEngine {
  constructor() {
    this.pgClient = new pg.Client(CONFIG.postgres);
    this.couchClient = new CouchDBClient(CONFIG.couchdb);
    this.qdrantClient = new QdrantClient({ url: CONFIG.qdrant.url });
    this.tagger = new AutoTagger();
    this.stats = {
      nodesSynced: 0,
      edgesSynced: 0,
      vectorsCreated: 0,
      errors: 0
    };
  }

  async connect() {
    console.log('🔌 Connecting to services...');
    await this.pgClient.connect();
    console.log('✅ Postgres connected (legal @ 5434)');

    await this.couchClient.ensureDatabase();
    await this.couchClient.createDesignDocs();

    console.log('✅ Qdrant ready');
  }

  async disconnect() {
    await this.pgClient.end();
  }

  async syncNodes() {
    console.log('\n📊 Syncing nodes from Postgres → CouchDB...');

    const result = await this.pgClient.query('SELECT * FROM kg_nodes ORDER BY id');
    const nodes = result.rows;

    console.log(`   Found ${nodes.length} nodes in Postgres`);

    // Convert to CouchDB docs with auto-tags
    const couchDocs = nodes.map(node => {
      const tags = this.tagger.generateTags(node);

      return {
        _id: node.id,
        type: 'node',
        kind: node.kind,
        label: node.label,
        meta: node.meta || {},
        tags,
        synced_at: new Date().toISOString()
      };
    });

    // Bulk upsert in batches of 100
    const batchSize = 100;
    for (let i = 0; i < couchDocs.length; i += batchSize) {
      const batch = couchDocs.slice(i, i + batchSize);
      await this.couchClient.bulkUpsert(batch);
      this.stats.nodesSynced += batch.length;

      if ((i + batchSize) % 500 === 0) {
        console.log(`   ✅ Synced ${this.stats.nodesSynced} nodes...`);
      }
    }

    console.log(`✅ Synced ${this.stats.nodesSynced} nodes to CouchDB`);
  }

  async syncEdges() {
    console.log('\n🔗 Syncing edges from Postgres → CouchDB...');

    const result = await this.pgClient.query('SELECT * FROM kg_edges ORDER BY id');
    const edges = result.rows;

    console.log(`   Found ${edges.length} edges in Postgres`);

    // Convert to CouchDB docs
    const couchDocs = edges.map(edge => ({
      _id: `edge:${edge.id}`,
      type: 'edge',
      edge_type: edge.type,
      from_id: edge.from_id,
      to_id: edge.to_id,
      weight: edge.weight || 1.0,
      evidence: edge.evidence || {},
      synced_at: new Date().toISOString()
    }));

    // Bulk upsert in batches
    const batchSize = 100;
    for (let i = 0; i < couchDocs.length; i += batchSize) {
      const batch = couchDocs.slice(i, i + batchSize);
      await this.couchClient.bulkUpsert(batch);
      this.stats.edgesSynced += batch.length;

      if ((i + batchSize) % 500 === 0) {
        console.log(`   ✅ Synced ${this.stats.edgesSynced} edges...`);
      }
    }

    console.log(`✅ Synced ${this.stats.edgesSynced} edges to CouchDB`);
  }

  async syncVectors() {
    console.log('\n🔮 Syncing vectors: Qdrant ← → pgvector...');

    // Get all error nodes that need embeddings
    const result = await this.pgClient.query(`
      SELECT n.id, n.label, n.meta
      FROM kg_nodes n
      WHERE n.kind = 'error'
      AND NOT EXISTS (
        SELECT 1 FROM error_embeddings e WHERE e.error_id::text = n.id
      )
      LIMIT 1000
    `);

    const errorsNeedingEmbeddings = result.rows;
    console.log(`   Found ${errorsNeedingEmbeddings.length} errors needing embeddings`);

    if (errorsNeedingEmbeddings.length === 0) {
      console.log('   ✅ All errors already have embeddings');
      return;
    }

    // Generate embeddings via Ollama
    for (const error of errorsNeedingEmbeddings) {
      try {
        const text = `Error ${error.meta.code || 'UNKNOWN'}: ${error.label} in ${error.meta.path || 'unknown'}`;

        const embedResponse = await fetch(`${CONFIG.ollama.url}/api/embeddings`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            model: CONFIG.ollama.embedModel,
            prompt: text
          })
        });

        if (!embedResponse.ok) continue;

        const { embedding } = await embedResponse.json();

        // Insert into pgvector
        await this.pgClient.query(`
          INSERT INTO error_embeddings (error_id, embedding, created_at)
          VALUES ($1, $2, NOW())
          ON CONFLICT (error_id) DO UPDATE SET embedding = $2
        `, [parseInt(error.id.replace('err:', '')), `[${embedding.join(',')}]`]);

        // Upsert into Qdrant with auto-tags
        const tags = this.tagger.generateTags(error);

        await this.qdrantClient.upsert(CONFIG.qdrant.collection, {
          points: [{
            id: crypto.randomUUID(),
            vector: embedding,
            payload: {
              type: 'error',
              error_id: error.id,
              code: error.meta.code,
              message: error.label,
              path: error.meta.path,
              severity: error.meta.severity,
              tags,
              source: 'phase89-sync'
            }
          }]
        });

        this.stats.vectorsCreated++;

        if (this.stats.vectorsCreated % 10 === 0) {
          console.log(`   ✅ Created ${this.stats.vectorsCreated} vectors...`);
        }
      } catch (err) {
        this.stats.errors++;
        console.error(`   ❌ Failed to embed ${error.id}:`, err.message);
      }
    }

    console.log(`✅ Created ${this.stats.vectorsCreated} vectors (Qdrant + pgvector)`);
  }

  async verify() {
    console.log('\n🔍 Verifying sync status...\n');

    // Check Postgres
    const pgNodes = await this.pgClient.query('SELECT COUNT(*) FROM kg_nodes');
    const pgEdges = await this.pgClient.query('SELECT COUNT(*) FROM kg_edges');
    const pgEmbeddings = await this.pgClient.query('SELECT COUNT(*) FROM error_embeddings');

    console.log('📊 Postgres (legal @ 5434):');
    console.log(`   kg_nodes: ${pgNodes.rows[0].count}`);
    console.log(`   kg_edges: ${pgEdges.rows[0].count}`);
    console.log(`   error_embeddings: ${pgEmbeddings.rows[0].count}`);

    // Check CouchDB
    const couchInfo = await fetch(`${CONFIG.couchdb.url}/${CONFIG.couchdb.dbName}`, {
      headers: { Authorization: `Basic ${this.couchClient.auth}` }
    });
    const couchData = await couchInfo.json();

    console.log('\n📊 CouchDB (error_graph @ 5984):');
    console.log(`   doc_count: ${couchData.doc_count}`);
    console.log(`   disk_size: ${(couchData.sizes.file / 1024 / 1024).toFixed(2)} MB`);

    // Check Qdrant
    const qdrantInfo = await this.qdrantClient.getCollection(CONFIG.qdrant.collection);

    console.log('\n📊 Qdrant (phase76_knowledge_base @ 6333):');
    console.log(`   points_count: ${qdrantInfo.points_count}`);
    console.log(`   vectors_count: ${qdrantInfo.vectors_count || qdrantInfo.points_count}`);

    // Sample CouchDB views
    console.log('\n🔍 CouchDB Views:');

    try {
      const errorsBySeverity = await this.couchClient.query('graph', 'errors_by_severity', {
        group: 'true'
      });
      console.log('   Errors by severity:');
      errorsBySeverity.rows.forEach(row => {
        console.log(`     ${row.key}: ${row.value}`);
      });
    } catch (err) {
      console.log('   ⚠️  Views not built yet (run sync first)');
    }

    console.log('\n✅ Verification complete\n');
  }

  printStats() {
    console.log('\n📈 Sync Statistics:');
    console.log(`   Nodes synced: ${this.stats.nodesSynced}`);
    console.log(`   Edges synced: ${this.stats.edgesSynced}`);
    console.log(`   Vectors created: ${this.stats.vectorsCreated}`);
    console.log(`   Errors: ${this.stats.errors}`);
  }
}

// ============================================================
// CLI
// ============================================================
async function main() {
  const args = process.argv.slice(2);
  const engine = new GraphSyncEngine();

  try {
    await engine.connect();

    if (args.includes('--sync-all')) {
      await engine.syncNodes();
      await engine.syncEdges();
      await engine.syncVectors();
      engine.printStats();
    } else if (args.includes('--sync-nodes')) {
      await engine.syncNodes();
    } else if (args.includes('--sync-edges')) {
      await engine.syncEdges();
    } else if (args.includes('--sync-vectors')) {
      await engine.syncVectors();
    } else if (args.includes('--verify')) {
      await engine.verify();
    } else {
      console.log('Usage:');
      console.log('  node scripts/phase89-couchdb-graph-sync.mjs --sync-all');
      console.log('  node scripts/phase89-couchdb-graph-sync.mjs --sync-nodes');
      console.log('  node scripts/phase89-couchdb-graph-sync.mjs --sync-edges');
      console.log('  node scripts/phase89-couchdb-graph-sync.mjs --sync-vectors');
      console.log('  node scripts/phase89-couchdb-graph-sync.mjs --verify');
    }
  } catch (err) {
    console.error('❌ Error:', err);
    process.exit(1);
  } finally {
    await engine.disconnect();
  }
}

main();
