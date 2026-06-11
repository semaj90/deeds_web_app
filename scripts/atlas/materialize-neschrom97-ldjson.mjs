#!/usr/bin/env node
/**
 * materialize-neschrom97-ldjson.mjs
 *
 * Deterministic LD-JSON materializer for NESCHROM97 card store.
 * Converts neschrom97/cards/*.json into newline-delimited JSON.
 * Enriches records with feature_id and feature_label from docs/reports/neschrom97-card-registry.json.
 *
 * Usage:
 *   node scripts/atlas/materialize-neschrom97-ldjson.mjs [--apply] [--verbose]
 */

import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '../..');

const CARDS_DIR = path.join(ROOT, 'neschrom97', 'cards');
const REGISTRY_PATH = path.join(ROOT, 'docs', 'reports', 'neschrom97-card-registry.json');
const OUTPUT_NDJSON = path.join(ROOT, 'neschrom97', 'packets', 'cards.ndjson');
const OUTPUT_MANIFEST = path.join(ROOT, 'neschrom97', 'packets', 'cards.ndjson.manifest.json');

const args = process.argv.slice(2);
const APPLY = args.includes('--apply');
const VERBOSE = args.includes('--verbose');

function normalizeSourceRef(value) {
  return String(value ?? '').trim().replace(/\\/g, '/').replace(/^file:/, '').replace(/^\.?\//, '').replace(/^sveltekit-frontend\//, '');
}

function directoryPathFromSourceRef(sourceRef) {
  const norm = normalizeSourceRef(sourceRef);
  if (!norm) return null;
  const dir = path.posix.dirname(norm);
  return dir === '.' ? null : dir;
}

function computeSha256(content) {
  return crypto.createHash('sha256').update(content).digest('hex');
}

async function main() {
  console.log(`[NESCHROM97 Materializer] Starting (mode=${APPLY ? 'apply' : 'dry-run'})`);

  if (!fs.existsSync(CARDS_DIR)) {
    console.error(`[Error] Cards directory not found: ${CARDS_DIR}`);
    process.exit(1);
  }

  // Load registry mappings
  let registryMap = new Map();
  if (fs.existsSync(REGISTRY_PATH)) {
    try {
      const registryData = JSON.parse(fs.readFileSync(REGISTRY_PATH, 'utf8'));
      if (Array.isArray(registryData.registry)) {
        for (const entry of registryData.registry) {
          if (entry.card_id) {
            registryMap.set(entry.card_id, entry);
          }
        }
        console.log(`[Registry] Loaded ${registryMap.size} mappings from ${path.relative(ROOT, REGISTRY_PATH)}`);
      }
    } catch (err) {
      console.warn(`[Registry] Failed to parse registry: ${err.message}`);
    }
  } else {
    console.warn(`[Registry] Registry file not found: ${REGISTRY_PATH}. Proceeding without registry enrichment.`);
  }

  const files = fs.readdirSync(CARDS_DIR)
    .filter(f => f.endsWith('.json') && f !== 'index.json')
    .sort(); // deterministic order by filename

  console.log(`[Cards] Found ${files.length} card files`);

  const records = [];
  let invalidRows = 0;
  let missingRegistryRowCount = 0;
  let missingSourceRefCount = 0;
  let missingFeatureIdCount = 0;
  let missingFeatureLabelCount = 0;

  for (const file of files) {
    const filePath = path.join(CARDS_DIR, file);
    try {
      const raw = JSON.parse(fs.readFileSync(filePath, 'utf8'));
      const id = raw.id ?? file.replace(/\.json$/, '');
      const source = raw.source ?? raw.source_ref ?? raw.path ?? raw.file_path;
      const sourceRef = normalizeSourceRef(source);
      
      if (!sourceRef) {
        missingSourceRefCount++;
      }

      // Lookup in registry for enrichment
      const reg = registryMap.get(id);
      if (!reg) {
        missingRegistryRowCount++;
      }

      const featureId = reg?.feature_id ?? raw.feature_id ?? raw.featureId ?? null;
      const featureLabel = reg?.title ?? raw.title ?? raw.feature_label ?? raw.featureLabel ?? null;

      if (!featureId) missingFeatureIdCount++;
      if (!featureLabel) missingFeatureLabelCount++;

      const packetKey = (reg?.packet_keys && reg.packet_keys[0]) ?? `nes:${sourceRef}`;

      const normalizedRecord = {
        packet_key: packetKey,
        source_ref: sourceRef,
        directory_path: directoryPathFromSourceRef(sourceRef),
        feature_id: featureId,
        feature_label: featureLabel,
        som_cluster: raw.som_cluster ?? raw.somCluster ?? null,
        gpu_cluster: raw.gpuCluster ?? raw.gpu_cluster ?? null,
        tags: [...new Set([
          ...(raw.tags || []),
          ...(reg?.tags || [])
        ])].filter(Boolean),
        record_hash: '' // to be populated
      };

      // Compute deterministic record hash (excluding record_hash field itself)
      const hashContent = JSON.stringify({
        packet_key: normalizedRecord.packet_key,
        source_ref: normalizedRecord.source_ref,
        directory_path: normalizedRecord.directory_path,
        feature_id: normalizedRecord.feature_id,
        feature_label: normalizedRecord.feature_label,
        som_cluster: normalizedRecord.som_cluster,
        gpu_cluster: normalizedRecord.gpu_cluster,
        tags: normalizedRecord.tags
      });
      normalizedRecord.record_hash = computeSha256(hashContent);

      records.push(normalizedRecord);
    } catch (err) {
      invalidRows++;
      if (VERBOSE) {
        console.warn(`[skip] Failed to parse ${file}: ${err.message}`);
      }
    }
  }

  // Deterministic order: packet_key asc, source_ref asc
  records.sort((a, b) => a.packet_key.localeCompare(b.packet_key) || a.source_ref.localeCompare(b.source_ref));

  const ndjsonText = records.map(r => JSON.stringify(r)).join('\n') + '\n';
  const sha = computeSha256(ndjsonText);

  const manifest = {
    schema: "neschrom97_cards_ldjson_manifest.v1",
    generatedAt: new Date().toISOString(),
    mode: APPLY ? "apply" : "dry-run",
    appRoot: ROOT.replace(/\\/g, '/'),
    inputDir: "neschrom97/cards",
    registryPath: "docs/reports/neschrom97-card-registry.json",
    outputNdjson: "neschrom97/packets/cards.ndjson",
    outputManifest: "neschrom97/packets/cards.ndjson.manifest.json",
    totalInputFiles: files.length,
    selectedInputFiles: files.length,
    registryRows: registryMap.size,
    records: records.length,
    invalidRows,
    missingRegistryRowCount,
    missingSourceRefCount,
    missingFeatureIdCount,
    missingFeatureLabelCount,
    outputSha256: sha,
    deterministicOrder: "id asc / filename asc",
    ldJsonPipelineCompatibility: {
      newlineOffsets: true,
      escapeBitmap: true,
      quoteBitmap: true,
      stringBitmap: true,
      leveledStructuralBitmap: true,
      jsonPathBytecode: true,
      gpuInterpreterCandidate: true
    }
  };

  if (APPLY) {
    fs.mkdirSync(path.dirname(OUTPUT_NDJSON), { recursive: true });
    fs.writeFileSync(OUTPUT_NDJSON, ndjsonText, 'utf8');
    fs.writeFileSync(OUTPUT_MANIFEST, JSON.stringify(manifest, null, 2) + '\n', 'utf8');
    console.log(`[Apply] Wrote ${records.length} records to ${path.relative(ROOT, OUTPUT_NDJSON)}`);
    console.log(`[Apply] Wrote manifest to ${path.relative(ROOT, OUTPUT_MANIFEST)}`);
  } else {
    console.log(`[Dry-Run] Would write ${records.length} records to ${path.relative(ROOT, OUTPUT_NDJSON)}`);
    console.log(`[Dry-Run] Manifest preview:`, JSON.stringify(manifest, null, 2));
  }
}

main().catch(err => {
  console.error(`[Error] Fatal: ${err.message}`);
  process.exit(1);
});
