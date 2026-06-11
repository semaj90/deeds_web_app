#!/usr/bin/env node

/**
 * Lane 1: Large JSON Safety Gate
 *
 * Streams a large JSON/NDJSON file, computes metadata (SHA256, size, format, row estimate),
 * extracts a small sample, and writes a manifest.
 *
 * CRITICAL: NEVER call JSON.parse() on the entire file. Use streaming.
 */

import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import readline from 'readline';

async function profileFile(filePath) {
  if (!fs.existsSync(filePath)) {
    throw new Error(`File not found: ${filePath}`);
  }

  const stats = fs.statSync(filePath);
  const sizeBytes = stats.size;

  console.log(`[Safety Gate] Profiling file: ${filePath} (${(sizeBytes / 1024 / 1024).toFixed(2)} MB)`);

  const hash = crypto.createHash('sha256');
  const readStream = fs.createReadStream(filePath);

  // Compute hash concurrently
  readStream.on('data', (chunk) => {
    hash.update(chunk);
  });

  // Count rows/lines and extract sample using readline interface
  const rl = readline.createInterface({
    input: fs.createReadStream(filePath),
    crlfDelay: Infinity,
  });

  let rowCountEstimate = 0;
  const sampleLines = [];
  const maxSampleLines = 5;
  let isNdjson = true;
  let firstChar = '';

  for await (const line of rl) {
    rowCountEstimate++;
    const trimmed = line.trim();
    if (rowCountEstimate === 1) {
      firstChar = trimmed[0];
    }

    if (sampleLines.length < maxSampleLines && trimmed.length > 0) {
      sampleLines.push(trimmed);
    }
  }

  // Detect format: if first char is '[', it's likely a JSON array, else NDJSON
  let format = 'ndjson';
  if (firstChar === '[') {
    format = 'json_array';
    isNdjson = false;
  } else if (firstChar === '{') {
    format = 'ndjson';
    isNdjson = true;
  }

  const sha256 = hash.digest('hex');

  // Ensure directories exist
  const manifestDir = path.resolve('memory/manifests');
  if (!fs.existsSync(manifestDir)) {
    fs.mkdirSync(manifestDir, { recursive: true });
  }

  const samplePath = 'memory/manifests/sample.json';
  const manifestPath = 'memory/manifests/artifact.manifest.json';

  // Write sample file
  let sampleContent = '';
  if (isNdjson) {
    sampleContent = sampleLines.join('\n');
  } else {
    // If it's a JSON array, close the brackets for the sample to make it valid JSON
    sampleContent = '[\n  ' + sampleLines.map(l => l.replace(/^,/, '').trim()).join(',\n  ') + '\n]';
  }
  fs.writeFileSync(path.resolve(samplePath), sampleContent);

  const manifest = {
    artifact_path: path.resolve(filePath),
    sha256,
    size_bytes: sizeBytes,
    format,
    row_count_estimate: rowCountEstimate,
    sample_path: samplePath,
    manifest_path: manifestPath,
  };

  fs.writeFileSync(path.resolve(manifestPath), JSON.stringify(manifest, null, 2));

  console.log(JSON.stringify(manifest, null, 2));
  return manifest;
}

const targetPath = process.argv[2];
if (!targetPath) {
  console.error('Usage: node scripts/atlas/profile-large-json.mjs <file_path>');
  process.exit(1);
}

profileFile(targetPath).catch((err) => {
  console.error('[Safety Gate] Error profiling file:', err.message);
  process.exit(1);
});
