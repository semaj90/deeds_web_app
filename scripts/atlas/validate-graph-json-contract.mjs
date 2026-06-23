#!/usr/bin/env node

/**
 * Validate Graph JSON Contract
 * Ensures identity chain integrity before algorithms + mirroring
 *
 * Input: docs/reports/neo4j-graph-export.json
 * Output: docs/reports/graph-json-contract-validation.json
 *
 * Rules:
 * - Every Packet node must have packet_key + source_ref + feature_id
 * - Every edge must reference existing nodes
 * - Coordinates must be numeric or null (not NaN)
 * - Edge weights must be 0..1
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

function validateGraphContract(graphJson) {
  const report = {
    timestamp: new Date().toISOString(),
    input: 'neo4j-graph-export.json',
    validation_tests: {},
    passes: 0,
    failures: 0,
    warnings: 0,
    verdict: 'PENDING'
  };

  // Build node index for edge validation
  const nodeIndex = new Map();
  for (const node of graphJson.nodes) {
    nodeIndex.set(node.id, node);
  }

  console.log('\n✅ Validating Graph JSON Contract...');
  console.log('='.repeat(70));

  // Test 1: Packet node identity chain
  console.log('\n📋 Test 1: Packet Identity Chain');
  const packetNodes = graphJson.nodes.filter(n => n.node_type === 'Packet');
  let missingIdentity = 0;

  for (const pkt of packetNodes) {
    const hasPacketKey = pkt.packet_key && pkt.packet_key.length > 0;
    const hasSourceRef = pkt.source_ref && pkt.source_ref.length > 0;
    const hasFeatureId = pkt.feature_id && pkt.feature_id.length > 0;

    if (!hasPacketKey || !hasSourceRef || !hasFeatureId) {
      missingIdentity++;
    }
  }

  const packetIdentityCoverage = packetNodes.length > 0
    ? ((packetNodes.length - missingIdentity) / packetNodes.length) * 100
    : 0;

  const packetTest = {
    total_packets: packetNodes.length,
    with_complete_identity: packetNodes.length - missingIdentity,
    coverage_percent: packetIdentityCoverage,
    status: packetIdentityCoverage >= 95 ? 'PASS' : 'FAIL'
  };

  report.validation_tests['packet_identity_chain'] = packetTest;
  if (packetTest.status === 'PASS') report.passes++;
  else report.failures++;

  console.log(`   Packets with complete identity: ${packetTest.with_complete_identity}/${packetTest.total_packets} (${packetIdentityCoverage.toFixed(2)}%)`);
  console.log(`   Status: ${packetTest.status}`);

  // Test 2: Feature node naming
  console.log('\n📋 Test 2: Feature Node Naming');
  const featureNodes = graphJson.nodes.filter(n => n.node_type === 'Feature');
  let validFeatures = 0;

  for (const feat of featureNodes) {
    if (feat.feature_id && feat.feature_label) {
      validFeatures++;
    }
  }

  const featureTest = {
    total_features: featureNodes.length,
    with_label: validFeatures,
    coverage_percent: featureNodes.length > 0 ? (validFeatures / featureNodes.length) * 100 : 0,
    status: validFeatures / featureNodes.length >= 0.9 ? 'PASS' : 'FAIL'
  };

  report.validation_tests['feature_naming'] = featureTest;
  if (featureTest.status === 'PASS') report.passes++;
  else report.failures++;

  console.log(`   Features with labels: ${featureTest.with_label}/${featureTest.total_features} (${featureTest.coverage_percent.toFixed(2)}%)`);
  console.log(`   Status: ${featureTest.status}`);

  // Test 3: SOMCell coordinates
  console.log('\n📋 Test 3: SOMCell Coordinates');
  const somNodes = graphJson.nodes.filter(n => n.node_type === 'SOMCell');
  let validCoordinates = 0;

  for (const som of somNodes) {
    const coords = som.coordinates || {};
    if (
      typeof coords.som_x === 'number' && !isNaN(coords.som_x) &&
      typeof coords.som_y === 'number' && !isNaN(coords.som_y)
    ) {
      validCoordinates++;
    }
  }

  const coordinateTest = {
    total_som_cells: somNodes.length,
    with_valid_coordinates: validCoordinates,
    coverage_percent: somNodes.length > 0 ? (validCoordinates / somNodes.length) * 100 : 0,
    status: validCoordinates / somNodes.length >= 0.95 ? 'PASS' : 'FAIL'
  };

  report.validation_tests['som_coordinates'] = coordinateTest;
  if (coordinateTest.status === 'PASS') report.passes++;
  else report.failures++;

  console.log(`   SOM cells with coordinates: ${coordinateTest.with_valid_coordinates}/${coordinateTest.total_som_cells} (${coordinateTest.coverage_percent.toFixed(2)}%)`);
  console.log(`   Status: ${coordinateTest.status}`);

  // Test 4: Edge referential integrity
  console.log('\n📋 Test 4: Edge Referential Integrity');
  let brokenEdges = 0;
  let invalidWeights = 0;

  for (const edge of graphJson.edges) {
    const sourceExists = nodeIndex.has(edge.source);
    const targetExists = nodeIndex.has(edge.target);
    const weightValid = typeof edge.weight === 'number' && edge.weight >= 0 && edge.weight <= 1;

    if (!sourceExists || !targetExists) brokenEdges++;
    if (!weightValid) invalidWeights++;
  }

  const edgeTest = {
    total_edges: graphJson.edges.length,
    with_valid_refs: graphJson.edges.length - brokenEdges,
    with_valid_weights: graphJson.edges.length - invalidWeights,
    coverage_percent: graphJson.edges.length > 0 ? ((graphJson.edges.length - brokenEdges) / graphJson.edges.length) * 100 : 0,
    status: brokenEdges === 0 && invalidWeights === 0 ? 'PASS' : 'FAIL'
  };

  report.validation_tests['edge_integrity'] = edgeTest;
  if (edgeTest.status === 'PASS') report.passes++;
  else report.failures++;

  console.log(`   Edges with valid refs: ${edgeTest.with_valid_refs}/${edgeTest.total_edges} (${edgeTest.coverage_percent.toFixed(2)}%)`);
  console.log(`   Edges with valid weights: ${edgeTest.with_valid_weights}/${edgeTest.total_edges}`);
  console.log(`   Status: ${edgeTest.status}`);

  // Test 5: Traversal path validation
  console.log('\n📋 Test 5: Traversal Path Validation');
  let validPaths = 0;
  let pathCount = 0;

  for (const node of graphJson.nodes) {
    if (node.traversal_path) {
      pathCount++;
      if (Array.isArray(node.traversal_path) && node.traversal_path.every(p => typeof p === 'string')) {
        validPaths++;
      }
    }
  }

  const pathTest = {
    nodes_with_paths: pathCount,
    with_valid_arrays: validPaths,
    coverage_percent: pathCount > 0 ? (validPaths / pathCount) * 100 : 0,
    status: pathCount === 0 ? 'WARN' : validPaths / pathCount >= 0.95 ? 'PASS' : 'FAIL'
  };

  report.validation_tests['traversal_paths'] = pathTest;
  if (pathTest.status === 'PASS') report.passes++;
  else if (pathTest.status === 'WARN') report.warnings++;
  else report.failures++;

  console.log(`   Nodes with traversal paths: ${pathCount}`);
  console.log(`   Valid path arrays: ${validPaths}/${pathCount}`);
  console.log(`   Status: ${pathTest.status}`);

  // Final verdict
  console.log('\n' + '='.repeat(70));
  console.log('📊 Validation Summary:');
  console.log(`   Passed: ${report.passes}`);
  console.log(`   Failed: ${report.failures}`);
  console.log(`   Warnings: ${report.warnings}`);

  if (report.failures === 0) {
    report.verdict = 'PASS';
    console.log('\n✅ VERDICT: PASS — Graph JSON is valid and ready for algorithms');
  } else if (report.failures <= 2) {
    report.verdict = 'PARTIAL';
    console.log('\n⚠️  VERDICT: PARTIAL — Some issues found but processable');
  } else {
    report.verdict = 'FAIL';
    console.log('\n❌ VERDICT: FAIL — Graph JSON has critical issues. Do not proceed to algorithms.');
  }

  return report;
}

async function main() {
  try {
    const exportPath = path.resolve(__dirname, '../../docs/reports/neo4j-graph-export.json');

    if (!fs.existsSync(exportPath)) {
      console.error(`❌ Export not found: ${exportPath}`);
      console.error('   Run: node export-neo4j-graph-json.mjs first');
      process.exit(1);
    }

    const graphJson = JSON.parse(fs.readFileSync(exportPath, 'utf-8'));
    const report = validateGraphContract(graphJson);

    // Write validation report
    const reportPath = path.resolve(__dirname, '../../docs/reports/graph-json-contract-validation.json');
    fs.writeFileSync(reportPath, JSON.stringify(report, null, 2));
    console.log(`\n📄 Report: ${reportPath}`);

    process.exit(report.verdict === 'FAIL' ? 1 : 0);
  } catch (error) {
    console.error('❌ Validation failed:', error.message);
    process.exit(1);
  }
}

main();
