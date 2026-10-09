#!/usr/bin/env node
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { createRequire } from 'node:module';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { decode } from '../../sveltekit-frontend/node_modules/@msgpack/msgpack/dist.esm/index.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const scratchRoot = path.join(root, '.tmp', 'atlas') + path.sep;
const args = process.argv.slice(2);
const outputArgument = args.indexOf('--output');
const defaultName = `atlas-packet-parser-native-proof-v1-${new Date().toISOString().replaceAll(':', '').replaceAll('.', '')}.json`;
const outputPath = path.resolve(root, outputArgument >= 0 ? args[outputArgument + 1] : path.join('.tmp', 'atlas', defaultName));
const hash = (value) => `sha256:${createHash('sha256').update(value).digest('hex')}`;
const canonicalJson = (value) => {
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(',')}]`;
  if (value && typeof value === 'object') {
    return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${canonicalJson(value[key])}`).join(',')}}`;
  }
  return JSON.stringify(value);
};

if (!outputPath.startsWith(scratchRoot)) throw new Error('OUTPUT_MUST_BE_UNDER_TMP_ATLAS');
if (fs.existsSync(outputPath)) throw new Error('REFUSING_TO_OVERWRITE_OUTPUT');

const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'atlas-packet-parser-native-v1-'));
const originalCwd = process.cwd();
let result;

try {
  const inputPath = path.join(tempRoot, 'fixture.ndjson');
  const outputDir = path.join(tempRoot, 'chunks');
  const manifestPath = path.join(tempRoot, 'memory', 'manifests', 'packet-index.json');
  const fixtureRows = [
    { packetKey: 'P-001', label: 'café', revision: 3 },
    { packetKey: 'P-002', label: 'brief', revision: 4 },
  ];
  fs.writeFileSync(inputPath, `${fixtureRows.map((row) => JSON.stringify(row)).join('\n')}\n`, 'utf8');
  process.chdir(tempRoot);

  const require = createRequire(import.meta.url);
  const parserPath = path.join(root, 'crates', 'atlas_packet_parser', 'index.js');
  const parserModule = require(parserPath);
  assert.equal(typeof parserModule.parseLargeJsonToMsgpack, 'function');

  const manifest = JSON.parse(parserModule.parseLargeJsonToMsgpack(inputPath, outputDir, 1));
  const diskManifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
  assert.deepEqual(diskManifest, manifest);
  assert.equal(manifest.total_rows, fixtureRows.length);
  assert.equal(manifest.chunks.length, fixtureRows.length);

  const chunks = manifest.chunks.map((chunk, index) => {
    assert.equal(chunk.row_count, 1);
    assert.equal(path.dirname(path.resolve(chunk.chunk_path)), outputDir);
    const bytes = fs.readFileSync(chunk.chunk_path);
    assert.equal(chunk.byte_size, bytes.length);
    const decodedRows = decode(bytes);
    assert.deepEqual(decodedRows, [fixtureRows[index]]);
    return {
      name: path.basename(chunk.chunk_path),
      rowCount: chunk.row_count,
      byteSize: chunk.byte_size,
      checksum: hash(bytes),
      decodedRows,
    };
  });

  result = {
    schema: 'atlas.packet-parser-native-proof.v1',
    status: 'NATIVE_PACKET_PARSER_FIXTURE_PROVEN',
    canonicalAuthority: false,
    persistentStoresWritten: false,
    tempOnlyParserOutput: true,
    inputChecksum: hash(fs.readFileSync(inputPath)),
    parserEntryChecksum: hash(fs.readFileSync(parserPath)),
    returnedManifestMatchesDisk: true,
    manifestChecksum: hash(Buffer.from(canonicalJson(manifest), 'utf8')),
    rowCount: manifest.total_rows,
    chunkCount: chunks.length,
    chunks,
  };
} finally {
  process.chdir(originalCwd);
  fs.rmSync(tempRoot, { recursive: true, force: true });
}

result.outputPath = path.relative(root, outputPath).replaceAll('\\', '/');
result.checksum = hash(Buffer.from(canonicalJson(result), 'utf8'));
fs.mkdirSync(path.dirname(outputPath), { recursive: true });
fs.writeFileSync(outputPath, `${JSON.stringify(result, null, 2)}\n`, { encoding: 'utf8', flag: 'wx' });
const readback = JSON.parse(fs.readFileSync(outputPath, 'utf8'));
const readbackChecksum = readback.checksum;
delete readback.checksum;
assert.equal(readbackChecksum, hash(Buffer.from(canonicalJson(readback), 'utf8')));
console.log(JSON.stringify({ status: result.status, rowCount: result.rowCount, chunkCount: result.chunkCount, receipt: result.outputPath, checksum: readbackChecksum }));
