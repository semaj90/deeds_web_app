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
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const NEO4J_URI = process.env.NEO4J_URI || 'neo4j://localhost:7687';
const NEO4J_USER = process.env.NEO4J_USER || 'neo4j';
const NEO4J_PASSWORD = process.env.NEO4J_PASSWORD || 'neo4j123';

async function main() {
  const driver = neo4j.driver(NEO4J_URI, neo4j.auth.basic(NEO4J_USER, NEO4J_PASSWORD));
  const session = driver.session({ defaultAccessMode: neo4j.session.READ });

  console.log('\n📊 Exporting Neo4j Graph to JSON...');
  console.log('='.repeat(70));

  const report = {
    timestamp: new Date().toISOString(),
    source: 'neo4j',
    nodes: [],
    edges: [],
    metadata: {
      node_count: 0,
      edge_count: 0,
      node_types: {},
      relationship_types: {}
    },
    validation_status: 'pending'
  };

  try {
    // Export Packet nodes (identity anchors)
    console.log('\n📦 Exporting Packet nodes...');
    const packetQuery = `
      MATCH (pkt:Packet)
      RETURN
        pkt.packet_key AS packet_key,
        pkt.source_ref AS source_ref,
        pkt.file_path AS file_path,
        pkt.feature_id AS feature_id,
        pkt.som_cluster AS som_cluster,
        pkt.confidence AS confidence,
        properties(pkt) AS all_props
      LIMIT 10000
    `;

    const packetResult = await session.run(packetQuery);
    const packets = packetResult.records.map(record => ({
      id: record.get('packet_key') || `packet:${record.get('source_ref')}`,
      node_type: 'Packet',
      packet_key: record.get('packet_key'),
      source_ref: record.get('source_ref'),
      file_path: record.get('file_path'),
      feature_id: record.get('feature_id'),
      som_cluster: record.get('som_cluster'),
      confidence: record.get('confidence') || 1.0,
      coordinates: { som_x: null, som_y: null, som_cluster: record.get('som_cluster') }
    }));

    report.nodes.push(...packets);
    report.metadata.node_types['Packet'] = packets.length;
    console.log(`   ✅ Exported ${packets.length} Packet nodes`);

    // Export Feature nodes
    console.log('\n📋 Exporting Feature nodes...');
    const featureQuery = `
      MATCH (feat:Feature)
      RETURN
        feat.feature_id AS feature_id,
        feat.feature_label AS feature_label,
        feat.community_id AS community_id,
        feat.domain_class AS domain_class,
        feat.confidence AS confidence
      LIMIT 5000
    `;

    const featureResult = await session.run(featureQuery);
    const features = featureResult.records.map(record => ({
      id: record.get('feature_id'),
      node_type: 'Feature',
      feature_id: record.get('feature_id'),
      feature_label: record.get('feature_label'),
      community_id: record.get('community_id'),
      domain_class: record.get('domain_class'),
      confidence: record.get('confidence') || 1.0
    }));

    report.nodes.push(...features);
    report.metadata.node_types['Feature'] = features.length;
    console.log(`   ✅ Exported ${features.length} Feature nodes`);

    // Export SOMCell nodes (topology anchors)
    console.log('\n🗺️  Exporting SOMCell nodes...');
    const somQuery = `
      MATCH (sc:SOMCell)
      RETURN
        sc.som_cluster AS som_cluster,
        sc.som_x AS som_x,
        sc.som_y AS som_y,
        sc.topology_type AS topology_type,
        sc.density AS density
      LIMIT 500
    `;

    const somResult = await session.run(somQuery);
    const somCells = somResult.records.map(record => ({
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
    }));

    report.nodes.push(...somCells);
    report.metadata.node_types['SOMCell'] = somCells.length;
    console.log(`   ✅ Exported ${somCells.length} SOMCell nodes`);

    // Export edges: USED_CONCEPT (Neo4j extraction)
    console.log('\n🔗 Exporting USED_CONCEPT edges...');
    const usedConceptQuery = `
      MATCH (pkt:Packet)-[r:USED_CONCEPT]->(concept)
      RETURN
        pkt.packet_key AS source_packet,
        concept.name AS target_concept,
        r.frequency AS frequency,
        r.context AS context
      LIMIT 5000
    `;

    const usedConceptResult = await session.run(usedConceptQuery);
    const usedConceptEdges = usedConceptResult.records.map(record => ({
      source: record.get('source_packet'),
      target: record.get('target_concept'),
      relationship: 'USED_CONCEPT',
      weight: record.get('frequency') || 1.0,
      properties: {
        context: record.get('context')
      }
    }));

    report.edges.push(...usedConceptEdges);
    report.metadata.relationship_types['USED_CONCEPT'] = usedConceptEdges.length;
    console.log(`   ✅ Exported ${usedConceptEdges.length} USED_CONCEPT edges`);

    // Export edges: SIMILAR_TOPOLOGY
    console.log('\n🔗 Exporting SIMILAR_TOPOLOGY edges...');
    const topoQuery = `
      MATCH (a:Packet)-[r:SIMILAR_TOPOLOGY]->(b:Packet)
      RETURN
        a.packet_key AS source,
        b.packet_key AS target,
        r.weight AS weight,
        r.deprecated_at AS deprecated_at
      LIMIT 5000
    `;

    const topoResult = await session.run(topoQuery);
    const topoEdges = topoResult.records.map(record => ({
      source: record.get('source'),
      target: record.get('target'),
      relationship: 'SIMILAR_TOPOLOGY',
      weight: record.get('weight') || 1.0,
      deprecated: !!record.get('deprecated_at'),
      properties: {}
    }));

    report.edges.push(...topoEdges);
    report.metadata.relationship_types['SIMILAR_TOPOLOGY'] = topoEdges.length;
    console.log(`   ✅ Exported ${topoEdges.length} SIMILAR_TOPOLOGY edges`);

    // Export edges: IN_SOM (Packet → SOMCell)
    console.log('\n🔗 Exporting IN_SOM edges (topology anchor)...');
    const inSomQuery = `
      MATCH (pkt:Packet)-[r:IN_SOM]->(sc:SOMCell)
      RETURN
        pkt.packet_key AS packet,
        sc.som_cluster AS som_cluster,
        pkt.som_cluster AS bmu_match
      LIMIT 5000
    `;

    const inSomResult = await session.run(inSomQuery);
    const inSomEdges = inSomResult.records.map(record => ({
      source: record.get('packet'),
      target: `som:${record.get('som_cluster')}`,
      relationship: 'IN_SOM',
      weight: record.get('bmu_match') === record.get('som_cluster') ? 1.0 : 0.5,
      properties: {}
    }));

    report.edges.push(...inSomEdges);
    report.metadata.relationship_types['IN_SOM'] = inSomEdges.length;
    console.log(`   ✅ Exported ${inSomEdges.length} IN_SOM edges`);

    // Export edges: ADJACENT_TO (SOMCell topology)
    console.log('\n🔗 Exporting ADJACENT_TO edges (grid topology)...');
    const adjacentQuery = `
      MATCH (s1:SOMCell)-[r:ADJACENT_TO]->(s2:SOMCell)
      RETURN
        s1.som_cluster AS from_cell,
        s2.som_cluster AS to_cell,
        r.distance AS distance
      LIMIT 2000
    `;

    const adjacentResult = await session.run(adjacentQuery);
    const adjacentEdges = adjacentResult.records.map(record => ({
      source: `som:${record.get('from_cell')}`,
      target: `som:${record.get('to_cell')}`,
      relationship: 'ADJACENT_TO',
      weight: 1.0 / (record.get('distance') || 1),
      properties: { distance: record.get('distance') }
    }));

    report.edges.push(...adjacentEdges);
    report.metadata.relationship_types['ADJACENT_TO'] = adjacentEdges.length;
    console.log(`   ✅ Exported ${adjacentEdges.length} ADJACENT_TO edges`);

    // Summary
    report.metadata.node_count = report.nodes.length;
    report.metadata.edge_count = report.edges.length;

    console.log('\n📊 Export Summary:');
    console.log(`   Total nodes: ${report.nodes.length}`);
    console.log(`   Total edges: ${report.edges.length}`);
    console.log(`   Node types: ${JSON.stringify(report.metadata.node_types)}`);
    console.log(`   Edge types: ${JSON.stringify(report.metadata.relationship_types)}`);

    // Write report
    const reportPath = path.resolve(__dirname, '../../docs/reports/neo4j-graph-export.json');
    fs.writeFileSync(reportPath, JSON.stringify(report, null, 2));
    console.log(`\n✅ Export complete: ${reportPath}`);

    return report;
  } catch (error) {
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
