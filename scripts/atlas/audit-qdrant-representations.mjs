#!/usr/bin/env node
/**
 * Audit Qdrant Collections and Classify Representations
 *
 * Connects to Qdrant, lists all collections, measures vector dimensions,
 * and classifies each collection against known representations.
 *
 * Output: audit report with provenance assessment for each collection
 */

import fs from 'fs';
import path from 'path';

const QDRANT_URL = process.env.QDRANT_URL || 'http://127.0.0.1:6333';

// Known representations (from atlas_representations registry)
const KNOWN_REPRESENTATIONS = {
  embeddinggemma_300m_768_native_ollama_v1: {
    modelId: 'embeddinggemma',
    outputDimensions: 768,
    dimensionMethod: 'NATIVE',
    normalization: 'L2',
    runtime: 'ollama_cpu',
    status: 'ACTIVE',
  },
  embeddinggemma_300m_384_custom_onnx_v1: {
    modelId: 'embeddinggemma',
    outputDimensions: 384,
    dimensionMethod: 'UNKNOWN',
    normalization: 'L2',
    runtime: 'onnx_cuda',
    status: 'DEPRECATED',
  },
  embeddinggemma_300m_512_mrl_ollama_v1: {
    modelId: 'embeddinggemma',
    outputDimensions: 512,
    dimensionMethod: 'MRL_TRUNCATE',
    normalization: 'L2',
    runtime: 'ollama_cpu',
    status: 'CANDIDATE',
  },
};

async function listCollections() {
  console.log('[audit] Connecting to Qdrant...');
  try {
    const response = await fetch(`${QDRANT_URL}/collections`, {
      method: 'GET',
      headers: { 'Content-Type': 'application/json' },
    });

    if (!response.ok) {
      console.error(`[audit] Failed to list collections: HTTP ${response.status}`);
      process.exit(1);
    }

    const data = await response.json();
    return data.result?.collections || [];
  } catch (error) {
    console.error('[audit] Error connecting to Qdrant:', error);
    process.exit(1);
  }
}

async function inspectCollection(collectionName) {
  try {
    const response = await fetch(`${QDRANT_URL}/collections/${collectionName}`, {
      method: 'GET',
      headers: { 'Content-Type': 'application/json' },
    });

    if (!response.ok) {
      return null;
    }

    return await response.json();
  } catch (error) {
    console.error(`[audit] Error inspecting ${collectionName}:`, error);
    return null;
  }
}

function classifyCollection(collectionName, collectionInfo) {
  const name = collectionName.toLowerCase();
  const config = collectionInfo?.result?.config;
  // Qdrant exposes collection vector settings under config.params.vectors.
  // Keep the fallback for older/API-compatible response shapes.
  const vectorsConfig = config?.params?.vectors ?? config?.vectors;

  // Extract vector dimensions from config
  let vectorDimensions = null;
  if (vectorsConfig?.size) {
    vectorDimensions = vectorsConfig.size;
  } else if (vectorsConfig && typeof vectorsConfig === 'object') {
    // Named-vector collections store size on each named vector.
    const sizes = Object.values(vectorsConfig)
      .map((vector) => vector?.size)
      .filter((size) => Number.isInteger(size));
    if (sizes.length > 0 && sizes.every((size) => size === sizes[0])) {
      vectorDimensions = sizes[0];
    }
  }

  // Named vectors?
  let namedVectors = null;
  if (vectorsConfig && typeof vectorsConfig === 'object' && !vectorsConfig.size) {
    namedVectors = Object.keys(vectorsConfig);
  }

  // Classify based on name and dimensions
  let classification = 'UNCLASSIFIED';
  let representationId = 'unknown';
  let confidence = 0;
  let notes = [];

  if (name.includes('codebase_chunks_768')) {
    classification = 'CANDIDATE_768';
    representationId = 'embeddinggemma_300m_768_native_ollama_v1';
    confidence = 0.7;
    notes.push('Name suggests 768-dim, consistent with native EmbeddingGemma');
  } else if (name.includes('codebase_chunks_384')) {
    classification = 'CUSTOM_384_DEPRECATED';
    representationId = 'embeddinggemma_300m_384_custom_onnx_v1';
    confidence = 0.8;
    notes.push('Name explicitly claims 384-dim (custom projection)');
    notes.push('Status: DEPRECATED - do not use for new collections');
  } else if (name.includes('768') && vectorDimensions === 768) {
    classification = 'LIKELY_768';
    representationId = 'embeddinggemma_300m_768_native_ollama_v1';
    confidence = 0.9;
    notes.push('Name and actual dimensions confirm 768-dim');
  } else if (name.includes('384') && vectorDimensions === 384) {
    classification = 'CUSTOM_384_CONFIRMED';
    representationId = 'embeddinggemma_300m_384_custom_onnx_v1';
    confidence = 0.95;
    notes.push('Name and actual dimensions confirm 384-dim (custom)');
  }

  // Verify against known representations
  if (representationId !== 'unknown' && KNOWN_REPRESENTATIONS[representationId]) {
    const known = KNOWN_REPRESENTATIONS[representationId];
    if (vectorDimensions && vectorDimensions !== known.outputDimensions) {
      notes.push(`⚠️  DIMENSION MISMATCH: dimensions say ${vectorDimensions}, representation registry says ${known.outputDimensions}`);
      confidence = Math.max(0, confidence - 0.2);
    }
  }

  return {
    collectionName,
    vectorDimensions,
    namedVectors,
    classification,
    representationId,
    confidence,
    notes,
    pointCount: collectionInfo?.result?.points_count ?? 0,
  };
}

async function main() {
  const timestamp = new Date().toISOString();
  const results = [];

  console.log(`[audit] Starting Qdrant representation audit at ${timestamp}`);
  console.log(`[audit] Qdrant URL: ${QDRANT_URL}`);
  console.log('');

  // List all collections
  const collections = await listCollections();
  console.log(`[audit] Found ${collections.length} collections`);
  console.log('');

  // Inspect each collection
  for (const collection of collections) {
    const collName = collection.name || collection;
    process.stdout.write(`[audit] Inspecting ${collName}... `);

    const collInfo = await inspectCollection(collName);
    const classification = classifyCollection(collName, collInfo);

    console.log(`${classification.classification} (${classification.vectorDimensions}d, ${classification.pointCount} points)`);

    results.push(classification);
  }

  console.log('');
  console.log('[audit] Audit complete. Summary:');
  console.log('');

  // Group by classification
  const byClassification = {};
  for (const result of results) {
    if (!byClassification[result.classification]) {
      byClassification[result.classification] = [];
    }
    byClassification[result.classification].push(result);
  }

  for (const [classification, items] of Object.entries(byClassification)) {
    console.log(`${classification}:`);
    for (const item of items) {
      console.log(`  - ${item.collectionName} (${item.vectorDimensions}d, ${item.pointCount} points)`);
      if (item.representationId !== 'unknown') {
        console.log(`    → Representation: ${item.representationId} (confidence: ${(item.confidence * 100).toFixed(0)}%)`);
      }
      for (const note of item.notes) {
        console.log(`    → ${note}`);
      }
    }
    console.log('');
  }

  // Write detailed report
  const reportPath = path.resolve('./docs/reports/qdrant-representation-audit.json');
  fs.mkdirSync(path.dirname(reportPath), { recursive: true });
  fs.writeFileSync(
    reportPath,
    JSON.stringify(
      {
        timestamp,
        qdrantUrl: QDRANT_URL,
        totalCollections: results.length,
        byClassification,
        recommendations: generateRecommendations(results),
        results,
      },
      null,
      2,
    ),
  );

  console.log(`[audit] Full report written to ${reportPath}`);
}

function generateRecommendations(results) {
  const recommendations = [];

  // Check for 384-dim collections
  const custom384 = results.filter((r) => r.classification.includes('384'));
  if (custom384.length > 0) {
    recommendations.push({
      severity: 'HIGH',
      issue: 'Deprecated 384-dim custom projection in use',
      affected: custom384.map((r) => r.collectionName),
      action: 'Migrate to canonical 768-dim (native EmbeddingGemma) or explicitly register 384 projection in atlas_representations',
      timeline: 'Before Phase 110 production deployment',
    });
  }

  // Check for unclassified
  const unclassified = results.filter((r) => r.classification === 'UNCLASSIFIED');
  if (unclassified.length > 0) {
    recommendations.push({
      severity: 'MEDIUM',
      issue: 'Unclassified collections',
      affected: unclassified.map((r) => r.collectionName),
      action: 'Inspect these collections manually and update atlas_representations registry with provenance',
      timeline: 'Within 1 week',
    });
  }

  // Check for dimension mismatches
  const mismatches = results.filter((r) => r.notes.some((n) => n.includes('MISMATCH')));
  if (mismatches.length > 0) {
    recommendations.push({
      severity: 'CRITICAL',
      issue: 'Collection dimension mismatch with representation registry',
      affected: mismatches.map((r) => r.collectionName),
      action: 'Verify actual collection dimensions and update atlas_representations registry',
      timeline: 'Before next production deployment',
    });
  }

  return recommendations;
}

main().catch((error) => {
  console.error('[audit] Fatal error:', error);
  process.exit(1);
});
