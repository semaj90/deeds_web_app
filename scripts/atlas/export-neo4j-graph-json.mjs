#!/usr/bin/env node

/**
 * Export Neo4j Graph to JSON Contract
 * Extracts nodes and edges for validation + algorithm application
 *
 * Output: docs/reports/neo4j-graph-export.json
 * Schema: {nodes: [{packet_key, feature_id, source_ref, community_id, coordinates}], edges: [...]}
 */

import neo4j from 'neo4j-driver';
import fs from 'fs';
import path from 'path';
import { randomUUID, createHash } from 'node:crypto';
import { fileURLToPath } from 'url';
import { forEachNeo4jKeysetPageV2 } from './lib/neo4j-keyset-pages-v2.mjs';
import { createJsonArrayWriterV1, writeJsonObjectWithArrayFilesV1 } from './lib/stream-json-arrays-v1.mjs';
import { loadRepoEnv } from './connection-config.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const ENV = loadRepoEnv();
const NEO4J_URI = ENV.NEO4J_URI || 'neo4j://127.0.0.1:7687';
const NEO4J_USER = ENV.NEO4J_USER;
const NEO4J_PASSWORD = ENV.NEO4J_PASSWORD;
const PAGE_SIZE = Number.parseInt(ENV.ATLAS_NEO4J_EXPORT_PAGE_SIZE ?? '1000', 10);
const MAX_EXPORT_ROWS = Number.parseInt(ENV.ATLAS_NEO4J_EXPORT_MAX_ROWS ?? '1000000', 10);

async function main() {
  if (!NEO4J_USER || !NEO4J_PASSWORD) throw new Error('NEO4J_CREDENTIALS_REQUIRED');
  if (!Number.isSafeInteger(PAGE_SIZE) || PAGE_SIZE < 1 || !Number.isSafeInteger(MAX_EXPORT_ROWS) || MAX_EXPORT_ROWS < PAGE_SIZE) {
    throw new Error('NEO4J_EXPORT_BOUNDS_INVALID');
  }
  const driver = neo4j.driver(NEO4J_URI, neo4j.auth.basic(NEO4J_USER, NEO4J_PASSWORD));
  const session = driver.session({ defaultAccessMode: neo4j.session.READ });
  const transaction = session.beginTransaction({ timeout: 60 * 60 * 1000 });
  const runPaged = async (query, onRecord) => forEachNeo4jKeysetPageV2({
      pageSize: PAGE_SIZE,
      maxRows: MAX_EXPORT_ROWS,
      runPage: async ({ after, pageSize }) => {
        const result = await transaction.run(query, { after, pageSize: neo4j.int(pageSize) });
        return result.records.map((record) => ({ cursor: record.get('__cursor'), record }));
      },
      onRecord: async ({ record }) => {
        if (onRecord) await onRecord(record);
      },
    });

  console.log('\n📊 Exporting Neo4j Graph to JSON...');
  console.log('='.repeat(70));

  const report = {
    source: 'neo4j',
    metadata: {
      node_count: 0,
      edge_count: 0,
      node_types: {},
      relationship_types: {},
      dropped_unresolved_endpoints: {},
      endpoint_diagnostics: {},
      exportCoverage: {
        schema: 'atlas.neo4j-export-coverage.v2',
        status: 'PARTIAL',
        readConsistency: {
          strategy: 'SINGLE_READ_TRANSACTION_FOR_PAGED_EXPORT_AND_CENSUS',
          status: 'NOT_PROVEN',
          reason: 'One transaction scopes the reads, but the exporter does not establish or attest a stable Neo4j snapshot across pages.',
        },
        reasons: ['EXPORT_SCOPE_COVERS_SELECTED_CLASSES_ONLY', 'SOURCE_REVISION_AUTHORITY_NOT_ESTABLISHED'],
        sourceRevision: null,
        workspaceRevision: null,
        selectionChecksum: null,
        executionId: null,
        thresholdsPassed: false,
        nodeClasses: {},
        relationshipTypes: {},
        coverageThresholds: [],
      },
    },
    validation_status: 'pending'
  };

  const outputRoot = path.resolve(__dirname, '../../.tmp/atlas');
  const runId = `${new Date().toISOString().replace(/[:.]/g, '-')}-${randomUUID()}`;
  const runDirectory = path.join(outputRoot, 'neo4j-graph-export-v2', runId);
  const nodesPath = path.join(runDirectory, 'nodes.json');
  const edgesPath = path.join(runDirectory, 'edges.json');
  const nodeIds = new Set();
  let nodesWriter;
  let edgesWriter;
  let transactionCommitted = false;
  const nodeStats = new Map();
  const relationshipStats = new Map();
  const revisionCounts = {};
  const statsFor = (map, key) => {
    if (!map.has(key)) map.set(key, { considered: 0, exported: 0, excluded: 0, unresolved: 0 });
    return map.get(key);
  };
  const writeNode = async (node, nodeClass, properties = {}) => {
    const stats = statsFor(nodeStats, nodeClass);
    stats.considered += 1;
    const sourceRevision = properties.source_revision ?? properties.sourceRevision;
    const workspaceRevision = properties.workspace_revision ?? properties.workspaceRevision;
    revisionCounts[nodeClass] ??= { sourceRevisionPresent: 0, workspaceRevisionPresent: 0, bothRevisionsPresent: 0 };
    if (sourceRevision !== null && sourceRevision !== undefined && sourceRevision !== '') revisionCounts[nodeClass].sourceRevisionPresent += 1;
    if (workspaceRevision !== null && workspaceRevision !== undefined && workspaceRevision !== '') revisionCounts[nodeClass].workspaceRevisionPresent += 1;
    if (sourceRevision !== null && sourceRevision !== undefined && sourceRevision !== '' && workspaceRevision !== null && workspaceRevision !== undefined && workspaceRevision !== '') revisionCounts[nodeClass].bothRevisionsPresent += 1;
    if (typeof node.id !== 'string' || node.id.length === 0) {
      stats.excluded += 1;
      report.metadata.endpoint_diagnostics[`${nodeClass}_MISSING_ID`] = (report.metadata.endpoint_diagnostics[`${nodeClass}_MISSING_ID`] ?? 0) + 1;
      return;
    }
    if (nodeIds.has(node.id)) {
      stats.unresolved += 1;
      report.metadata.endpoint_diagnostics[`${nodeClass}_DUPLICATE_ID`] = (report.metadata.endpoint_diagnostics[`${nodeClass}_DUPLICATE_ID`] ?? 0) + 1;
      return;
    }
    nodeIds.add(node.id);
    await nodesWriter.append(node);
    stats.exported += 1;
    report.metadata.node_types[nodeClass] = stats.exported;
  };
  const writeEdge = async (edge, sourceClass, targetClass) => {
    const stats = statsFor(relationshipStats, edge.relationship);
    stats.considered += 1;
    if (typeof edge.source !== 'string' || typeof edge.target !== 'string' || !nodeIds.has(edge.source) || !nodeIds.has(edge.target)) {
      stats.unresolved += 1;
      report.metadata.dropped_unresolved_endpoints[edge.relationship] = (report.metadata.dropped_unresolved_endpoints[edge.relationship] ?? 0) + 1;
      const key = `UNRESOLVED_ENDPOINT:${edge.relationship}:${sourceClass}->${targetClass}`;
      report.metadata.endpoint_diagnostics[key] = (report.metadata.endpoint_diagnostics[key] ?? 0) + 1;
      return;
    }
    await edgesWriter.append(edge);
    stats.exported += 1;
    report.metadata.relationship_types[edge.relationship] = stats.exported;
  };

  try {
    fs.mkdirSync(runDirectory, { recursive: false });
    nodesWriter = await createJsonArrayWriterV1(nodesPath);
    edgesWriter = await createJsonArrayWriterV1(edgesPath);
    // Export Packet nodes (identity anchors)
    console.log('\n📦 Exporting Packet nodes...');
    const packetQuery = `
      MATCH (pkt:Packet)
      WHERE $after IS NULL OR elementId(pkt) > $after
      RETURN
        elementId(pkt) AS __cursor,
        pkt.packet_key AS packet_key,
        pkt.source_ref AS source_ref,
        pkt.file_path AS file_path,
        pkt.feature_id AS feature_id,
        pkt.som_cluster AS som_cluster,
        pkt.confidence AS confidence,
        properties(pkt) AS all_props
      ORDER BY __cursor
      LIMIT $pageSize
    `;

    await runPaged(packetQuery, async (record) => writeNode({
      id: record.get('packet_key'),
      node_type: 'Packet',
      packet_key: record.get('packet_key'),
      source_ref: record.get('source_ref'),
      file_path: record.get('file_path'),
      feature_id: record.get('feature_id'),
      som_cluster: record.get('som_cluster'),
      confidence: record.get('confidence') || 1.0,
      coordinates: { som_x: null, som_y: null, som_cluster: record.get('som_cluster') }
    }, 'Packet', record.get('all_props')));
    report.metadata.packets_excluded_missing_packet_key = nodeStats.get('Packet')?.excluded ?? 0;
    console.log(`   ✅ Exported ${nodeStats.get('Packet')?.exported ?? 0} Packet nodes`);

    // Export Feature nodes
    console.log('\n📋 Exporting Feature nodes...');
    const featureQuery = `
      MATCH (feat:Feature)
      WHERE $after IS NULL OR elementId(feat) > $after
      RETURN
        elementId(feat) AS __cursor,
        feat.feature_id AS feature_id,
        feat.feature_label AS feature_label,
        feat.community_id AS community_id,
        feat.domain_class AS domain_class,
        feat.confidence AS confidence,
        properties(feat) AS all_props
      ORDER BY __cursor
      LIMIT $pageSize
    `;

    await runPaged(featureQuery, async (record) => writeNode({
      id: record.get('feature_id'),
      node_type: 'Feature',
      feature_id: record.get('feature_id'),
      feature_label: record.get('feature_label'),
      community_id: record.get('community_id'),
      domain_class: record.get('domain_class'),
      confidence: record.get('confidence') || 1.0
    }, 'Feature', record.get('all_props')));
    console.log(`   ✅ Exported ${nodeStats.get('Feature')?.exported ?? 0} Feature nodes`);

    // Export SOMCell nodes (topology anchors)
    console.log('\n🗺️  Exporting SOMCell nodes...');
    const somQuery = `
      MATCH (sc:SOMCell)
      WHERE $after IS NULL OR elementId(sc) > $after
      RETURN
        elementId(sc) AS __cursor,
        sc.som_cluster AS som_cluster,
        sc.som_x AS som_x,
        sc.som_y AS som_y,
        sc.topology_type AS topology_type,
        sc.density AS density,
        properties(sc) AS all_props
      ORDER BY __cursor
      LIMIT $pageSize
    `;

    await runPaged(somQuery, async (record) => writeNode({
      id: `som:${record.get('som_cluster')}`,
      node_type: 'SOMCell',
      som_cluster: record.get('som_cluster'),
      coordinates: {
        som_x: record.get('som_x'),
        som_y: record.get('som_y'),
        som_cluster: record.get('som_cluster')
      },
      topology_type: record.get('topology_type'),
      density: record.get('density') || 0
    }, 'SOMCell', record.get('all_props')));
    console.log(`   ✅ Exported ${nodeStats.get('SOMCell')?.exported ?? 0} SOMCell nodes`);

    const conceptQuery = `
      MATCH (concept:Concept)
      WHERE $after IS NULL OR elementId(concept) > $after
      RETURN elementId(concept) AS __cursor, concept.name AS concept_name, properties(concept) AS all_props
      ORDER BY __cursor
      LIMIT $pageSize
    `;
    await runPaged(conceptQuery, async (record) => writeNode({
      id: record.get('concept_name'),
      node_type: 'Concept',
      concept_name: record.get('concept_name')
    }, 'Concept', record.get('all_props')));

    // Export edges: USED_CONCEPT (Neo4j extraction)
    console.log('\n🔗 Exporting USED_CONCEPT edges...');
    const usedConceptQuery = `
      MATCH (pkt:Packet)-[r:USED_CONCEPT]->(concept)
      WHERE $after IS NULL OR elementId(r) > $after
      RETURN
        elementId(r) AS __cursor,
        pkt.packet_key AS source_packet,
        concept.name AS target_concept,
        r.frequency AS frequency,
        r.context AS context
      ORDER BY __cursor
      LIMIT $pageSize
    `;

    await runPaged(usedConceptQuery, async (record) => writeEdge({
      source: record.get('source_packet'),
      target: record.get('target_concept'),
      relationship: 'USED_CONCEPT',
      weight: record.get('frequency') || 1.0,
      properties: {
        context: record.get('context')
      }
    }, 'Packet', 'Concept'));
    console.log(`   ✅ Exported ${relationshipStats.get('USED_CONCEPT')?.exported ?? 0} USED_CONCEPT edges`);

    // Export edges: SIMILAR_TOPOLOGY
    console.log('\n🔗 Exporting SIMILAR_TOPOLOGY edges...');
    const topoQuery = `
      MATCH (a:Packet)-[r:SIMILAR_TOPOLOGY]->(b:Packet)
      WHERE $after IS NULL OR elementId(r) > $after
      RETURN
        elementId(r) AS __cursor,
        a.packet_key AS source,
        b.packet_key AS target,
        r.weight AS weight,
        r.deprecated_at AS deprecated_at
      ORDER BY __cursor
      LIMIT $pageSize
    `;

    await runPaged(topoQuery, async (record) => writeEdge({
      source: record.get('source'),
      target: record.get('target'),
      relationship: 'SIMILAR_TOPOLOGY',
      weight: record.get('weight') || 1.0,
      deprecated: !!record.get('deprecated_at'),
      properties: {}
    }, 'Packet', 'Packet'));
    console.log(`   ✅ Exported ${relationshipStats.get('SIMILAR_TOPOLOGY')?.exported ?? 0} SIMILAR_TOPOLOGY edges`);

    // Export edges: IN_SOM (Packet → SOMCell)
    console.log('\n🔗 Exporting IN_SOM edges (topology anchor)...');
    const inSomQuery = `
      MATCH (pkt:Packet)-[r:IN_SOM]->(sc:SOMCell)
      WHERE $after IS NULL OR elementId(r) > $after
      RETURN
        elementId(r) AS __cursor,
        pkt.packet_key AS packet,
        sc.som_cluster AS som_cluster,
        pkt.som_cluster AS bmu_match
      ORDER BY __cursor
      LIMIT $pageSize
    `;

    await runPaged(inSomQuery, async (record) => writeEdge({
      source: record.get('packet'),
      target: `som:${record.get('som_cluster')}`,
      relationship: 'IN_SOM',
      weight: record.get('bmu_match') === record.get('som_cluster') ? 1.0 : 0.5,
      properties: {}
    }, 'Packet', 'SOMCell'));
    console.log(`   ✅ Exported ${relationshipStats.get('IN_SOM')?.exported ?? 0} IN_SOM edges`);

    // Export edges: ADJACENT_TO (SOMCell topology)
    console.log('\n🔗 Exporting ADJACENT_TO edges (grid topology)...');
    const adjacentQuery = `
      MATCH (s1:SOMCell)-[r:ADJACENT_TO]->(s2:SOMCell)
      WHERE $after IS NULL OR elementId(r) > $after
      RETURN
        elementId(r) AS __cursor,
        s1.som_cluster AS from_cell,
        s2.som_cluster AS to_cell,
        r.distance AS distance
      ORDER BY __cursor
      LIMIT $pageSize
    `;

    await runPaged(adjacentQuery, async (record) => writeEdge({
      source: `som:${record.get('from_cell')}`,
      target: `som:${record.get('to_cell')}`,
      relationship: 'ADJACENT_TO',
      weight: 1.0 / (record.get('distance') || 1),
      properties: { distance: record.get('distance') }
    }, 'SOMCell', 'SOMCell'));
    console.log(`   ✅ Exported ${relationshipStats.get('ADJACENT_TO')?.exported ?? 0} ADJACENT_TO edges`);
    const [nodeCensus, relationshipCensus] = await Promise.all([
      transaction.run('MATCH (n) RETURN count(*) AS count'),
      transaction.run('MATCH (source)-[r]->(target) RETURN type(r) AS type, labels(source) AS sourceLabels, labels(target) AS targetLabels, count(*) AS count ORDER BY type, sourceLabels, targetLabels'),
    ]);
    report.metadata.exportCoverage.sourceGraphCensus = {
      nodes: neo4j.isInt(nodeCensus.records[0].get('count')) ? nodeCensus.records[0].get('count').toNumber() : Number(nodeCensus.records[0].get('count')),
      relationshipEndpoints: relationshipCensus.records.map((record) => ({
        type: record.get('type'),
        sourceLabels: [...record.get('sourceLabels')].sort(),
        targetLabels: [...record.get('targetLabels')].sort(),
        count: neo4j.isInt(record.get('count')) ? record.get('count').toNumber() : Number(record.get('count')),
      })),
      authority: 'CENSUS_ONLY_NOT_SOURCE_REVISION_PROOF',
    };
    await transaction.commit();
    transactionCommitted = true;
    await nodesWriter.close();
    await edgesWriter.close();

    report.metadata.node_count = [...nodeStats.values()].reduce((total, item) => total + item.exported, 0);
    report.metadata.edge_count = [...relationshipStats.values()].reduce((total, item) => total + item.exported, 0);
    report.metadata.exportCoverage.nodeClasses = Object.fromEntries(nodeStats);
    report.metadata.exportCoverage.relationshipTypes = Object.fromEntries(relationshipStats);
    report.metadata.exportCoverage.revisionCounts = revisionCounts;
    report.metadata.exportCoverage.referentialIntegrity = [...relationshipStats.values()].every((item) => item.unresolved === 0)
      ? 'PASS_FOR_EXPORTED_RELATIONSHIPS'
      : 'FAIL';
    report.metadata.exportCoverage.graphCoverage = 'PARTIAL_SELECTED_CLASSES_AND_RELATIONSHIPS';
    report.metadata.exportCoverage.canonicalLineage = 'NOT_PROVEN';

    console.log('\n📊 Export Summary:');
    console.log(`   Total nodes: ${report.metadata.node_count}`);
    console.log(`   Total edges: ${report.metadata.edge_count}`);
    console.log(`   Node types: ${JSON.stringify(report.metadata.node_types)}`);
    console.log(`   Edge types: ${JSON.stringify(report.metadata.relationship_types)}`);

    // Write report. Default is a new isolated artifact under .tmp/atlas so historical exports
    // in docs/reports are never overwritten; pass --out=<path under .tmp/atlas> to choose another.
    const outArg = process.argv.find(arg => arg.startsWith('--out='));
    const defaultOut = `graph-export-${new Date().toISOString().replace(/[:.]/g, '-')}-${randomUUID()}.json`;
    const outputBase = path.resolve(__dirname, '../../.tmp/atlas');
    const reportPath = path.resolve(outputBase, outArg ? outArg.slice('--out='.length) : defaultOut);
    const relativeOutput = path.relative(outputBase, reportPath);
    if (relativeOutput === '' || relativeOutput.startsWith('..') || path.isAbsolute(relativeOutput)) {
      throw new Error('EXPORT_OUTPUT_MUST_STAY_UNDER_TMP_ATLAS');
    }
    fs.mkdirSync(path.dirname(reportPath), { recursive: true });
    await writeJsonObjectWithArrayFilesV1({
      outputPath: reportPath,
      properties: report,
      arrays: [{ key: 'nodes', filePath: nodesPath }, { key: 'edges', filePath: edgesPath }],
    });
    const outputHash = createHash('sha256');
    for await (const chunk of fs.createReadStream(reportPath)) outputHash.update(chunk);
    const receipt = {
      schema: 'NEO4J_GRAPH_EXPORT_COVERAGE_V2',
      runId,
      status: 'PARTIAL',
      sourceGraphTotals: {
        nodesInDatabase: report.metadata.exportCoverage.sourceGraphCensus.nodes,
        relationshipsInDatabase: report.metadata.exportCoverage.sourceGraphCensus.relationshipEndpoints.reduce((sum, row) => sum + row.count, 0),
        exportedClassNodesConsidered: [...nodeStats.values()].reduce((total, item) => total + item.considered, 0),
        selectedRelationshipRowsConsidered: [...relationshipStats.values()].reduce((total, item) => total + item.considered, 0),
      },
      sourceRelationshipEndpointClasses: report.metadata.exportCoverage.sourceGraphCensus.relationshipEndpoints,
      readConsistency: report.metadata.exportCoverage.readConsistency,
      nodeClasses: Object.fromEntries(nodeStats),
      relationshipTypes: Object.fromEntries(relationshipStats),
      revisionCounts,
      diagnostics: report.metadata.endpoint_diagnostics,
      gates: {
        GRAPH_EXPORT_REFERENTIAL_INTEGRITY: report.metadata.exportCoverage.referentialIntegrity,
        GRAPH_EXPORT_COVERAGE: 'PARTIAL',
        GRAPH_CANONICAL_LINEAGE: 'NOT_PROVEN',
      },
      outputPath: path.relative(outputBase, reportPath).replaceAll('\\', '/'),
      outputSha256: `sha256:${outputHash.digest('hex')}`,
      sourceRevision: null,
      workspaceRevision: null,
      executionId: null,
      canonicalAuthority: false,
      writesPerformed: false,
    };
    receipt.receiptSha256 = `sha256:${createHash('sha256').update(JSON.stringify(receipt)).digest('hex')}`;
    const receiptArg = process.argv.find(arg => arg.startsWith('--receipt='));
    const receiptPath = receiptArg
      ? path.resolve(outputRoot, receiptArg.slice('--receipt='.length))
      : path.join(runDirectory, `coverage-receipt-${runId}.json`);
    const relativeReceipt = path.relative(outputRoot, receiptPath);
    if (relativeReceipt === '' || relativeReceipt.startsWith('..') || path.isAbsolute(relativeReceipt)) {
      throw new Error('EXPORT_RECEIPT_MUST_STAY_UNDER_TMP_ATLAS');
    }
    fs.mkdirSync(path.dirname(receiptPath), { recursive: true });
    const receiptPartialPath = `${receiptPath}.${randomUUID()}.partial`;
    fs.writeFileSync(receiptPartialPath, `${JSON.stringify(receipt, null, 2)}\n`, { flag: 'wx' });
    fs.linkSync(receiptPartialPath, receiptPath);
    fs.unlinkSync(receiptPartialPath);
    console.log(`\n✅ Export complete: ${reportPath}`);
    console.log(`   Coverage receipt: ${receiptPath}`);

    return report;
  } catch (error) {
    if (!transactionCommitted) await transaction.rollback().catch(() => {});
    nodesWriter?.abort(error);
    edgesWriter?.abort(error);
    console.error('\n❌ Export failed:', error.message);
    report.validation_status = 'failed';
    report.error = error.message;
    throw error;
  } finally {
    await session.close();
    await driver.close();
  }
}

main().catch(err => {
  console.error('Fatal:', err);
  process.exit(1);
});
