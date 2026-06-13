#!/usr/bin/env node
/**
 * Lane 12.3: Seed Neo4j RPC Graph
 *
 * Purpose:
 * Wire Neo4j relationship edges so the knowledge graph can explain
 * "why is tool X recommended" by tracing SERVICE → METHOD edges
 * and potentially SERVICE → SERVICE import dependencies.
 *
 * Input: docs/reports/grpc-service-packets.jsonl
 *        (49 gRPC service packets from Lane 12.1)
 *
 * Output:
 * - Neo4j nodes: RpcService, RpcMethod (with metadata)
 * - Neo4j edges: SERVICE -[HAS_METHOD]-> METHOD
 * - Report: docs/reports/lane-12-3-neo4j-rpc-graph.json + .md
 *
 * Modes: --dry-run (default), --apply
 * Gates:
 * - ≥49 RpcService nodes
 * - ≥49 RpcMethod nodes
 * - ≥49 HAS_METHOD edges
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import neo4j from 'neo4j-driver';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '../..');
const REPO_ROOT = path.resolve(ROOT, 'sveltekit-frontend');

// ═══════════════════════════════════════════════════════════════════════════
// Configuration
// ═══════════════════════════════════════════════════════════════════════════

const INPUT_FILE = path.join(ROOT, 'docs/reports/grpc-service-packets.jsonl');
const OUTPUT_REPORT = path.join(ROOT, 'docs/reports/lane-12-3-neo4j-rpc-graph.json');
const OUTPUT_MARKDOWN = path.join(ROOT, 'docs/reports/lane-12-3-neo4j-rpc-graph.md');

const NEO4J_URI = 'bolt://localhost:7687';
const NEO4J_USER = 'neo4j';
const NEO4J_PASSWORD = 'neo4j123';

const DOMAIN_CLASS = 'mcp_agents';

// ═══════════════════════════════════════════════════════════════════════════
// Argument parsing
// ═══════════════════════════════════════════════════════════════════════════

const args = process.argv.slice(2);
const isDryRun = !args.includes('--apply');
const isQuiet = args.includes('--quiet');
const isSummary = args.includes('--summary-only');

function log(...msgs) {
  if (!isQuiet) console.log(...msgs);
}

function logHeader(msg) {
  log(`\n${'═'.repeat(70)}`);
  log(`  ${msg}`);
  log('═'.repeat(70));
}

// ═══════════════════════════════════════════════════════════════════════════
// Neo4j Driver
// ═══════════════════════════════════════════════════════════════════════════

async function getNeo4jDriver() {
  try {
    const driver = neo4j.driver(NEO4J_URI, neo4j.auth.basic(NEO4J_USER, NEO4J_PASSWORD), {
      connectionTimeout: 5000,
      maxConnectionPoolSize: 1,
    });

    // Verify connection
    await driver.verifyConnectivity();
    return driver;
  } catch (err) {
    throw new Error(`Neo4j connection failed (${NEO4J_URI}): ${err.message}`);
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// Parse input JSONL
// ═══════════════════════════════════════════════════════════════════════════

function parseJsonlFile(filePath) {
  if (!fs.existsSync(filePath)) {
    throw new Error(`Input file not found: ${filePath}`);
  }

  const lines = fs.readFileSync(filePath, 'utf-8').trim().split('\n');
  const packets = [];

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();
    if (!line) continue;

    try {
      const packet = JSON.parse(line);
      packets.push(packet);
    } catch (err) {
      throw new Error(`Failed to parse JSONL at line ${i + 1}: ${err.message}`);
    }
  }

  return packets;
}

// ═══════════════════════════════════════════════════════════════════════════
// Extract RPC service/method information
// ═══════════════════════════════════════════════════════════════════════════

function extractRpcMetadata(packet) {
  /**
   * Expected packet shape (from Lane 12.1):
   * {
   *   packet_key: "rpc:service:001",
   *   source_ref: "embedding.proto",
   *   service_name: "EmbeddingService",
   *   methods: [
   *     { name: "Embed", input: "EmbedRequest", output: "EmbedResponse" },
   *     { name: "EmbedBatch", input: "EmbedBatchRequest", output: "EmbedBatchResponse" }
   *   ],
   *   qdrant_tags: ["embedding", "inference"],
   *   domain_class: "mcp_agents"
   * }
   */

  const service = {
    name: packet.service_name || '',
    packet_key: packet.packet_key || '',
    source_ref: packet.source_ref || '',
    methods: packet.methods || [],
    tags: packet.qdrant_tags || [],
    domain_class: packet.domain_class || DOMAIN_CLASS,
  };

  if (!service.name) {
    return null; // Skip packets without service_name
  }

  return service;
}

// ═══════════════════════════════════════════════════════════════════════════
// Generate Cypher statements (dry-run mode)
// ═══════════════════════════════════════════════════════════════════════════

function generateCypherStatements(services) {
  const statements = [];
  const uniqueServices = new Set();
  const uniqueMethods = new Set();

  for (const service of services) {
    // Create or match RpcService node
    const serviceKey = `RpcService:${service.name}`;
    if (!uniqueServices.has(serviceKey)) {
      uniqueServices.add(serviceKey);

      statements.push({
        type: 'MERGE_SERVICE',
        cypher: `MERGE (s:RpcService {name: $serviceName})
SET
  s.packet_key = $packetKey,
  s.source_ref = $sourceRef,
  s.domain_class = $domainClass,
  s.tags = $tags,
  s.method_count = $methodCount,
  s.created_at = datetime(),
  s.updated_at = datetime()
RETURN s`,
        params: {
          serviceName: service.name,
          packetKey: service.packet_key,
          sourceRef: service.source_ref,
          domainClass: service.domain_class,
          tags: service.tags,
          methodCount: service.methods.length,
        },
      });
    }

    // Create methods and relationships
    for (const method of service.methods) {
      const methodKey = `RpcMethod:${service.name}.${method.name}`;
      if (!uniqueMethods.has(methodKey)) {
        uniqueMethods.add(methodKey);

        statements.push({
          type: 'MERGE_METHOD',
          cypher: `MERGE (m:RpcMethod {name: $methodName, service: $serviceName})
SET
  m.input_type = $inputType,
  m.output_type = $outputType,
  m.created_at = datetime(),
  m.updated_at = datetime()
RETURN m`,
          params: {
            methodName: method.name,
            serviceName: service.name,
            inputType: method.input || '',
            outputType: method.output || '',
          },
        });

        statements.push({
          type: 'CREATE_HAS_METHOD',
          cypher: `MATCH (s:RpcService {name: $serviceName})
MATCH (m:RpcMethod {name: $methodName, service: $serviceName})
MERGE (s)-[r:HAS_METHOD]->(m)
SET
  r.created_at = datetime(),
  r.updated_at = datetime()
RETURN r`,
          params: {
            serviceName: service.name,
            methodName: method.name,
          },
        });
      }
    }
  }

  return {
    statements,
    stats: {
      service_count: uniqueServices.size,
      method_count: uniqueMethods.size,
      edge_count: statements.filter((s) => s.type === 'CREATE_HAS_METHOD').length,
    },
  };
}

// ═══════════════════════════════════════════════════════════════════════════
// Execute Cypher statements (apply mode)
// ═══════════════════════════════════════════════════════════════════════════

async function executeStatements(driver, statements) {
  const session = driver.session();
  const results = {
    services_created: 0,
    methods_created: 0,
    edges_created: 0,
    errors: [],
  };

  try {
    for (const stmt of statements) {
      try {
        const result = await session.run(stmt.cypher, stmt.params);
        const summary = result.summary.counters;

        if (stmt.type === 'MERGE_SERVICE') {
          results.services_created += summary.nodesCreated + (summary.propertiesSet > 0 ? 0 : 0);
        } else if (stmt.type === 'MERGE_METHOD') {
          results.methods_created += summary.nodesCreated;
        } else if (stmt.type === 'CREATE_HAS_METHOD') {
          results.edges_created += summary.relationshipsCreated;
        }
      } catch (err) {
        results.errors.push({
          statement_type: stmt.type,
          error: err.message,
        });
      }
    }
  } finally {
    await session.close();
  }

  return results;
}

// ═══════════════════════════════════════════════════════════════════════════
// Verification gates
// ═══════════════════════════════════════════════════════════════════════════

async function verifyGraphStructure(driver) {
  const session = driver.session();
  const gates = {
    GATE_SERVICE_COUNT: { threshold: 49, pass: false, actual: 0 },
    GATE_METHOD_COUNT: { threshold: 49, pass: false, actual: 0 },
    GATE_EDGE_COUNT: { threshold: 49, pass: false, actual: 0 },
  };

  try {
    // Count RpcService nodes
    const serviceResult = await session.run('MATCH (s:RpcService) RETURN count(s) AS count');
    gates.GATE_SERVICE_COUNT.actual = serviceResult.records[0].get('count').toNumber();
    gates.GATE_SERVICE_COUNT.pass = gates.GATE_SERVICE_COUNT.actual >= gates.GATE_SERVICE_COUNT.threshold;

    // Count RpcMethod nodes
    const methodResult = await session.run('MATCH (m:RpcMethod) RETURN count(m) AS count');
    gates.GATE_METHOD_COUNT.actual = methodResult.records[0].get('count').toNumber();
    gates.GATE_METHOD_COUNT.pass = gates.GATE_METHOD_COUNT.actual >= gates.GATE_METHOD_COUNT.threshold;

    // Count HAS_METHOD edges
    const edgeResult = await session.run('MATCH ()-[r:HAS_METHOD]->() RETURN count(r) AS count');
    gates.GATE_EDGE_COUNT.actual = edgeResult.records[0].get('count').toNumber();
    gates.GATE_EDGE_COUNT.pass = gates.GATE_EDGE_COUNT.actual >= gates.GATE_EDGE_COUNT.threshold;
  } finally {
    await session.close();
  }

  return gates;
}

// ═══════════════════════════════════════════════════════════════════════════
// Report generation
// ═══════════════════════════════════════════════════════════════════════════

function generateReport(packets, stats, gates) {
  return {
    timestamp: new Date().toISOString(),
    mode: isDryRun ? 'dry-run' : 'apply',
    input_file: INPUT_FILE,
    input_packets: packets.length,
    statistics: stats,
    gates,
    gates_pass: Object.values(gates).every((g) => g.pass),
  };
}

function generateMarkdown(report) {
  const gatesSummary = Object.entries(report.gates)
    .map(([name, gate]) => {
      const status = gate.pass ? '✅' : '❌';
      return `| ${name} | ${gate.threshold} | ${gate.actual} | ${status} |`;
    })
    .join('\n');

  const markdown = `# Lane 12.3: Neo4j RPC Graph — Verification Report

**Generated**: ${report.timestamp}
**Mode**: ${report.mode}
**Input File**: ${report.input_file}
**Input Packets**: ${report.input_packets}

## Statistics

- **RpcService nodes**: ${report.statistics.service_count}
- **RpcMethod nodes**: ${report.statistics.method_count}
- **HAS_METHOD edges**: ${report.statistics.edge_count}

## Verification Gates

| Gate | Threshold | Actual | Status |
|------|-----------|--------|--------|
${gatesSummary}

## Gates Summary

**Overall**: ${report.gates_pass ? '✅ PASS' : '❌ FAIL'}

All verification gates must pass before Lane 12 is considered complete.

## Next Steps

1. Verify gates in Neo4j:
   \`\`\`cypher
   MATCH (s:RpcService)-[r:HAS_METHOD]-(m:RpcMethod)
   RETURN count(DISTINCT s) AS services,
          count(DISTINCT m) AS methods,
          count(r) AS edges
   \`\`\`

2. If all gates pass: Lane 12 is **COMPLETE**
3. If gates fail: Check input file format and re-run with \`--apply\`

## Optional Extension (Lane 12.4 — deferred)

SERVICE → SERVICE import edges for cross-service dependencies.
`;

  return markdown;
}

// ═══════════════════════════════════════════════════════════════════════════
// Main execution
// ═══════════════════════════════════════════════════════════════════════════

async function main() {
  try {
    logHeader('Lane 12.3: Seed Neo4j RPC Graph');

    // ─────────────────────────────────────────────────────────────────────
    // Phase 1: Parse input
    // ─────────────────────────────────────────────────────────────────────
    log(`\n📖 Reading input file: ${INPUT_FILE}`);

    if (!fs.existsSync(INPUT_FILE)) {
      throw new Error(`Input file not found. Expected Lane 12.1/12.2 to generate: ${INPUT_FILE}`);
    }

    const packets = parseJsonlFile(INPUT_FILE);
    log(`✅ Parsed ${packets.length} packets`);

    // ─────────────────────────────────────────────────────────────────────
    // Phase 2: Extract RPC metadata
    // ─────────────────────────────────────────────────────────────────────
    log(`\n🔍 Extracting RPC metadata...`);

    const services = packets
      .map(extractRpcMetadata)
      .filter(Boolean);

    if (services.length === 0) {
      throw new Error('No valid RPC services found in input packets');
    }

    log(`✅ Extracted ${services.length} RPC services`);
    services.forEach((svc) => {
      log(`   - ${svc.name} (${svc.methods.length} methods)`);
    });

    // ─────────────────────────────────────────────────────────────────────
    // Phase 3: Generate Cypher (dry-run always runs)
    // ─────────────────────────────────────────────────────────────────────
    log(`\n🔧 Generating Cypher statements...`);

    const { statements, stats } = generateCypherStatements(services);

    log(`✅ Generated ${statements.length} statements`);
    log(`   - Services: ${stats.service_count}`);
    log(`   - Methods: ${stats.method_count}`);
    log(`   - Edges: ${stats.edge_count}`);

    if (!isSummary && isDryRun) {
      log(`\n📋 Sample Cypher statements (dry-run mode):`);
      statements.slice(0, 3).forEach((stmt, i) => {
        log(`\n   [${i + 1}] ${stmt.type}`);
        log(`   ${stmt.cypher.split('\n')[0].substring(0, 60)}...`);
      });
      log(`\n   ... and ${Math.max(0, statements.length - 3)} more statements`);
    }

    // ─────────────────────────────────────────────────────────────────────
    // Phase 4: Execute (if --apply)
    // ─────────────────────────────────────────────────────────────────────
    let gates = {
      GATE_SERVICE_COUNT: { threshold: 49, pass: false, actual: 0 },
      GATE_METHOD_COUNT: { threshold: 49, pass: false, actual: 0 },
      GATE_EDGE_COUNT: { threshold: 49, pass: false, actual: 0 },
    };

    if (!isDryRun) {
      log(`\n🚀 Applying to Neo4j (${NEO4J_URI})...`);

      const driver = await getNeo4jDriver();
      try {
        const execResults = await executeStatements(driver, statements);
        log(`✅ Execution results:`);
        log(`   - Services created/updated: ${execResults.services_created}`);
        log(`   - Methods created/updated: ${execResults.methods_created}`);
        log(`   - Edges created: ${execResults.edges_created}`);

        if (execResults.errors.length > 0) {
          log(`⚠️  ${execResults.errors.length} error(s) occurred`);
          execResults.errors.forEach((err) => {
            log(`   - ${err.statement_type}: ${err.error}`);
          });
        }

        // ────────────────────────────────────────────────────────────────
        // Phase 5: Verification
        // ────────────────────────────────────────────────────────────────
        log(`\n✅ Verifying graph structure...`);
        gates = await verifyGraphStructure(driver);

        Object.entries(gates).forEach(([name, gate]) => {
          const status = gate.pass ? '✅' : '❌';
          log(`   ${status} ${name}: ${gate.actual}/${gate.threshold}`);
        });
      } finally {
        await driver.close();
      }
    } else {
      // Dry-run: use generation stats as estimate
      gates.GATE_SERVICE_COUNT.actual = stats.service_count;
      gates.GATE_METHOD_COUNT.actual = stats.method_count;
      gates.GATE_EDGE_COUNT.actual = stats.edge_count;
      gates.GATE_SERVICE_COUNT.pass = stats.service_count >= 49;
      gates.GATE_METHOD_COUNT.pass = stats.method_count >= 49;
      gates.GATE_EDGE_COUNT.pass = stats.edge_count >= 49;

      log(`\n(Dry-run mode — gates estimated from generation stats)`);
    }

    // ─────────────────────────────────────────────────────────────────────
    // Phase 6: Generate reports
    // ─────────────────────────────────────────────────────────────────────
    log(`\n📊 Generating reports...`);

    const report = generateReport(packets, stats, gates);
    fs.writeFileSync(OUTPUT_REPORT, JSON.stringify(report, null, 2));
    log(`✅ Report: ${OUTPUT_REPORT}`);

    const markdown = generateMarkdown(report);
    fs.writeFileSync(OUTPUT_MARKDOWN, markdown);
    log(`✅ Markdown: ${OUTPUT_MARKDOWN}`);

    // ─────────────────────────────────────────────────────────────────────
    // Summary
    // ─────────────────────────────────────────────────────────────────────
    logHeader('Lane 12.3 Summary');

    const gatesPass = Object.values(gates).every((g) => g.pass);
    const status = gatesPass ? '✅ PASS' : '❌ FAIL';

    log(`\nOverall Status: ${status}`);
    log(`Mode: ${isDryRun ? 'DRY-RUN (no changes applied)' : 'APPLY (changes committed)'}`);
    log(`Input packets: ${packets.length}`);
    log(`RPC services: ${stats.service_count}`);
    log(`RPC methods: ${stats.method_count}`);
    log(`HAS_METHOD edges: ${stats.edge_count}`);

    log(`\nTo apply changes: npm run atlas:lane-12-3 -- --apply`);
    log(`To verify in Neo4j: npm run neo4j:query -- "MATCH (s:RpcService)-[r:HAS_METHOD]->(m:RpcMethod) RETURN count(r)"`);

    process.exit(gatesPass ? 0 : 1);
  } catch (err) {
    console.error(`\n❌ Error: ${err.message}`);
    process.exit(1);
  }
}

main();
