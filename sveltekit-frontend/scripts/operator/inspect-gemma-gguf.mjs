#!/usr/bin/env node
/**
 * inspect-gemma-gguf.mjs
 *
 * Lightweight GGUF inspector for the Gemma runtime artifact. Prints a small
 * header summary plus path/size/hash metadata so launcher and model-selection
 * issues can be debugged without starting llama-server.
 */

import { createHash } from 'node:crypto';
import { mkdir, readFile } from 'node:fs/promises';
import { existsSync, readdirSync, statSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { parseArgs } from 'node:util';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '../..');

const SEARCH_DIRS = [
  process.env.GGUF_MODEL_DIR,
  process.env.GEMMA_MODEL_DIR,
  'C:\Users\james\Desktop\models',
  'C:\Users\james\Desktop\llama-server-cuda\models',
  path.join(ROOT, 'models'),
].filter(Boolean);

function clampPath(inputPath) {
  if (!inputPath) return null;
  const absolute = path.isAbsolute(inputPath) ? inputPath : path.resolve(ROOT, inputPath);
  return existsSync(absolute) ? absolute : null;
}

function findGemmaGguf() {
  const directCandidates = [
    process.env.GEMMA4_GGUF_PATH,
    process.env.LLAMA_MODEL_PATH,
    process.env.GGUF_MODEL_PATH,
  ];
  for (const candidate of directCandidates) {
    const resolved = clampPath(candidate);
    if (resolved) return resolved;
  }

  for (const dir of SEARCH_DIRS) {
    if (!dir || !existsSync(dir)) continue;
    const entries = readdirSync(dir);
    for (const entry of entries) {
      const lower = entry.toLowerCase();
      if (!lower.endsWith('.gguf')) continue;
      if (!lower.includes('gemma')) continue;
      const fullPath = path.join(dir, entry);
      if (existsSync(fullPath)) return fullPath;
    }
  }

  return null;
}

function sha256(buffer) {
  return createHash('sha256').update(buffer).digest('hex');
}

function inspectHeader(buffer) {
  const magic = buffer.toString('utf8', 0, 4);
  const version = buffer.length >= 8 ? buffer.readUInt32LE(4) : null;
  const tensorCount = buffer.length >= 16 ? Number(buffer.readBigUInt64LE(8)) : null;
  const metadataCount = buffer.length >= 24 ? Number(buffer.readBigUInt64LE(16)) : null;
  return { magic, version, tensorCount, metadataCount };
}

function formatBytes(bytes) {
  if (!Number.isFinite(bytes)) return 'unknown';
  const units = ['B', 'KB', 'MB', 'GB', 'TB'];
  let size = bytes;
  let index = 0;
  while (size >= 1024 && index < units.length - 1) {
    size /= 1024;
    index += 1;
  }
  return `${size.toFixed(index === 0 ? 0 : 2)} ${units[index]}`;
}

async function inspectGgufModel(modelPath) {
  const resolvedPath = clampPath(modelPath);
  if (!resolvedPath) {
    throw new Error(`Model not found: ${modelPath ?? '(unset)'}`);
  }

  const buffer = await readFile(resolvedPath);
  const header = inspectHeader(buffer);
  const stat = statSync(resolvedPath);
  const fileName = path.basename(resolvedPath);
  const lower = fileName.toLowerCase();

  return {
    path: resolvedPath,
    fileName,
    sizeBytes: stat.size,
    sizeHuman: formatBytes(stat.size),
    sha256: sha256(buffer),
    header,
    modelHints: {
      isGemma: lower.includes('gemma'),
      looksLegal: lower.includes('legal'),
      looksMerged: lower.includes('merged'),
      looksLora: lower.includes('lora') || lower.includes('adapter'),
    },
  };
}

async function main() {
  const { values: flags } = parseArgs({
    options: {
      path: { type: 'string' },
      json: { type: 'boolean', default: false },
      list: { type: 'boolean', default: false },
    },
    strict: false,
  });

  if (flags.list) {
    const candidates = [];
    for (const dir of SEARCH_DIRS) {
      if (!dir || !existsSync(dir)) continue;
      for (const entry of readdirSync(dir)) {
        if (entry.toLowerCase().endsWith('.gguf')) candidates.push(path.join(dir, entry));
      }
    }
    if (flags.json) {
      console.log(JSON.stringify({ candidates }, null, 2));
    } else {
      console.log('[gemma:inspect] GGUF candidates:');
      for (const candidate of candidates) console.log(`  - ${candidate}`);
    }
    return;
  }

  const modelPath = flags.path ?? findGemmaGguf();
  if (!modelPath) {
    console.error('[gemma:inspect] No GGUF model path found. Pass --path or set GEMMA4_GGUF_PATH.');
    process.exit(1);
  }

  const result = await inspectGgufModel(modelPath);

  if (flags.json) {
    console.log(JSON.stringify(result, null, 2));
    return;
  }

  console.log(`[gemma:inspect] path: ${result.path}`);
  console.log(`[gemma:inspect] size: ${result.sizeHuman} (${result.sizeBytes} bytes)`);
  console.log(`[gemma:inspect] sha256: ${result.sha256}`);
  console.log(`[gemma:inspect] magic/version: ${result.header.magic} / ${result.header.version ?? 'unknown'}`);
  console.log(`[gemma:inspect] tensors/metadata: ${result.header.tensorCount ?? 'unknown'} / ${result.header.metadataCount ?? 'unknown'}`);
  console.log(`[gemma:inspect] hints: ${Object.entries(result.modelHints).filter(([, value]) => value).map(([key]) => key).join(', ') || 'none'}`);
}

const isDirectRun = process.argv[1]
  ? fileURLToPath(import.meta.url) === path.resolve(process.argv[1])
  : false;

if (isDirectRun) {
  main().catch((error) => {
    console.error(`[gemma:inspect] ${error instanceof Error ? error.message : String(error)}`);
    process.exit(1);
  });
}