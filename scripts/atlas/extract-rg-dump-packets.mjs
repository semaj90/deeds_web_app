/**
 * extract-rg-dump-packets.mjs
 *
 * Streams the two large UTF-16 LE rg dump files (rg_turbovec.txt, rg_napi.txt),
 * filters to meaningful session note sources, and produces structured JSON packets
 * aligned to the parent atlas: sourceRef, featureId, title_id, path_mapping, hits.
 *
 * Also scans docs/ .md/.txt session notes directly for feature/todo extraction.
 *
 * Output: docs/packets/rg-knowledge-packets.ndjson (one packet per source file)
 *         docs/packets/rg-toc.json (table of contents / index)
 *         docs/packets/session-features.ndjson (feature/todo items from session notes)
 *
 * Usage:
 *   node scripts/atlas/extract-rg-dump-packets.mjs [--dry-run] [--limit=N] [--verbose]
 *
 * Flags:
 *   --dry-run   Parse only, write nothing
 *   --limit=N   Stop after N source-file packets
 *   --verbose   Log every source file as processed
 */

import fs from 'fs';
import path from 'path';
import readline from 'readline';
import crypto from 'crypto';
import { pipeline } from 'stream/promises';
import { Transform } from 'stream';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '../..');
const REPORTS_DIR = path.join(ROOT, 'docs', 'reports');
const PACKETS_DIR = path.join(ROOT, 'docs', 'packets');
const DOCS_DIR = path.join(ROOT, 'docs');

const DRY_RUN = process.argv.includes('--dry-run');
const VERBOSE = process.argv.includes('--verbose');
const LIMIT_ARG = process.argv.find(a => a.startsWith('--limit='));
const LIMIT = LIMIT_ARG ? parseInt(LIMIT_ARG.split('=')[1], 10) : Infinity;

// --- Source classification patterns ---
// Session notes: NNN_26.txt, NNN_26_nextsteps.txt, 3_NN_26.txt etc.
const SESSION_NOTE_RE = /(?:^|[/\\])(\d{2,3}_26[^/\\]*\.txt|3_\d{2}_26[^/\\]*\.txt|3_\d{1,2}_26[^/\\]*\.txt)$/i;

// Feature keywords that indicate a task/feature reference in rg hits
const FEATURE_KEYWORDS = [
  'turbovec', 'turbo-vec', 'turboquant', 'turbo quant',
  'napi', 'n-api', 'native addon', 'tensorrt_bridge',
  'vlm', 'vision', 'gemma4', 'llama-server',
  'qdrant', 'neo4j', 'redis', 'pgvector',
  'karpathy', 'pagerank', 'som', 'hypergraph',
  'ace', 'kag', 'rag', 'dag',
  'mcp', 'fastmcp', 'trace-mcp',
  'bifrost', 'turboquant',
  'evidence', 'case', 'citation',
  'atlas', 'kanban', 'task',
  'drizzle', 'schema', 'migration',
  'svelte', 'sveltekit', 'vite',
  'simd', 'cuda', 'gpu', 'libtorch',
  'embedding', 'embeddinggemma',
  'engram', 'memory', 'cache',
];

// Noise file patterns to skip (svelte-check logs, build artifacts)
const NOISE_SOURCE_RE = /(?:
  svelte-check|
  node_modules|
  \.svelte-kit|
  dist\/|
  build\/|
  \.cache\/|
  \.venv|
  __pycache__|
  \.pyc$|
  lock\.json|
  package-lock
)/xi;

// Feature ID derivation from file path / content
function deriveFeatureId(sourcePath) {
  const base = path.basename(sourcePath, path.extname(sourcePath)).toLowerCase();
  // Map known session note prefixes to feature areas
  const num = parseInt(base.match(/^(\d+)/)?.[1] ?? '0', 10);
  if (num >= 315 && num <= 325) return 'feat:auth-drizzle-evidence-pipeline';
  if (num >= 326 && num <= 335) return 'feat:rag-kag-dag-retrieval';
  if (num >= 336 && num <= 345) return 'feat:gpu-karpathy-hypergraph';
  if (num >= 346 && num <= 360) return 'feat:vlm-lane-turboquant';
  if (num >= 361 && num <= 380) return 'feat:atlas-kanban-phase102';
  if (base.includes('nextsteps')) return 'feat:roadmap-nextsteps';
  if (base.includes('rag') || base.includes('kag')) return 'feat:rag-kag-dag-retrieval';
  if (base.includes('extract')) return 'feat:codebase-extractor';
  return `feat:session-${base}`;
}

// Extract feature/todo items from a session note line
function extractFeatureItems(lines) {
  const items = [];
  const todoRe = /^\s*[-*]\s+(?:\*\*)?(.{10,200})(?:\*\*)?$/;
  const headerRe = /^#{1,4}\s+(.{5,100})$/;
  const featureRe = new RegExp(FEATURE_KEYWORDS.join('|'), 'i');

  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed) continue;

    // TODO/task bullet points
    const todoMatch = trimmed.match(todoRe);
    if (todoMatch && featureRe.test(trimmed)) {
      items.push({ type: 'task', text: todoMatch[1].replace(/\*\*/g, '').trim() });
      continue;
    }

    // Section headers referencing features
    const headerMatch = trimmed.match(headerRe);
    if (headerMatch && featureRe.test(trimmed)) {
      items.push({ type: 'feature', text: headerMatch[1].trim() });
    }
  }

  return items;
}

// Build parent atlas path mapping
function buildPathMapping(sourcePath) {
  const normalized = sourcePath.replace(/\\/g, '/');
  const base = path.basename(sourcePath);
  return {
    source_path: normalized,
    base_name: base,
    category: SESSION_NOTE_RE.test(sourcePath) ? 'session_note'
      : normalized.includes('docs/') ? 'documentation'
      : normalized.includes('src/') ? 'source_code'
      : normalized.includes('scripts/') ? 'script'
      : 'other',
    atlas_tier: SESSION_NOTE_RE.test(sourcePath) ? 'T3-session' : 'T2-docs',
  };
}

// --- Streaming UTF-16 LE reader for rg dumps ---
async function* streamRgDumpLines(filePath) {
  const fileStream = fs.createReadStream(filePath);
  const rl = readline.createInterface({
    input: fileStream,
    // Node readline handles BOM stripping when encoding is known
    // but the file is UTF-16 LE — we need to handle this ourselves
    crlfDelay: Infinity,
  });

  // For UTF-16 LE files, we need a different approach
  // Read using a custom Transform that decodes UTF-16 LE
  fileStream.destroy();
  rl.close();

  // Use PowerShell for UTF-16 LE reading in chunks
  // We'll use a Node.js approach: read raw buffer and decode
  const CHUNK = 64 * 1024 * 1024; // 64MB chunks
  const fd = fs.openSync(filePath, 'r');
  const stat = fs.statSync(filePath);
  const fileSize = stat.size;

  let offset = 0;
  let remainder = Buffer.alloc(0);

  // Skip UTF-16 LE BOM (FF FE) if present
  const bom = Buffer.alloc(2);
  fs.readSync(fd, bom, 0, 2, 0);
  if (bom[0] === 0xFF && bom[1] === 0xFE) {
    offset = 2;
  }

  while (offset < fileSize) {
    const readSize = Math.min(CHUNK, fileSize - offset);
    const buf = Buffer.alloc(readSize);
    const bytesRead = fs.readSync(fd, buf, 0, readSize, offset);
    offset += bytesRead;

    // Combine with remainder from previous chunk
    const combined = Buffer.concat([remainder, buf.subarray(0, bytesRead)]);

    // Decode UTF-16 LE — must be even number of bytes
    const evenLen = combined.length - (combined.length % 2);
    const text = combined.subarray(0, evenLen).toString('utf16le');
    remainder = combined.subarray(evenLen);

    // Split into lines and yield
    const lines = text.split(/\r?\n/);

    // Last line may be incomplete — hold it for next chunk
    for (let i = 0; i < lines.length - 1; i++) {
      yield lines[i];
    }

    // Re-encode the partial last line back to UTF-16 LE for remainder handling
    const partial = lines[lines.length - 1];
    if (partial) {
      const partialBuf = Buffer.from(partial, 'utf16le');
      remainder = Buffer.concat([remainder, partialBuf]);
    }
  }

  fs.closeSync(fd);
}

// Parse rg dump format: "<path>:<line>:<content>"
function parseRgLine(line) {
  // rg output format: "path:linenum:content" or "path:linenum:colnum:content"
  const match = line.match(/^(.+?):(\d+)(?::\d+)?:(.*)$/);
  if (!match) return null;
  return {
    sourcePath: match[1].replace(/^\.[\\/]/, ''),
    lineNum: parseInt(match[2], 10),
    content: match[3],
  };
}

// --- Main packet accumulator ---
async function processRgDump(dumpFile, dumpLabel, packetAccumulator) {
  console.log(`[extract] Processing ${dumpLabel} (${(fs.statSync(dumpFile).size / 1e9).toFixed(2)} GB)...`);

  let lineCount = 0;
  let packetCount = 0;
  let skippedNoise = 0;

  for await (const line of streamRgDumpLines(dumpFile)) {
    lineCount++;
    if (lineCount % 500000 === 0) {
      process.stdout.write(`\r[${dumpLabel}] ${(lineCount / 1e6).toFixed(1)}M lines, ${packetCount} packets...`);
    }

    if (!line.trim()) continue;

    const parsed = parseRgLine(line);
    if (!parsed) continue;

    const { sourcePath, lineNum, content } = parsed;

    // Skip noise sources
    if (NOISE_SOURCE_RE.test(sourcePath)) {
      skippedNoise++;
      continue;
    }

    // Only keep session notes and docs/
    const isSessionNote = SESSION_NOTE_RE.test(sourcePath);
    const isDoc = sourcePath.includes('docs/') || sourcePath.includes('next_steps/');
    if (!isSessionNote && !isDoc) continue;

    // Add to accumulator
    if (!packetAccumulator.has(sourcePath)) {
      if (packetCount >= LIMIT) continue;
      packetCount++;
      packetAccumulator.set(sourcePath, {
        packet_id: crypto.createHash('sha1').update(sourcePath).digest('hex').slice(0, 12),
        sourceRef: sourcePath,
        featureId: deriveFeatureId(sourcePath),
        title_id: path.basename(sourcePath, path.extname(sourcePath)),
        path_mapping: buildPathMapping(sourcePath),
        dump_source: dumpLabel,
        hits: [],
        feature_items: [],
        generated_at: new Date().toISOString(),
      });
      if (VERBOSE) console.log(`\n[extract] New packet: ${sourcePath}`);
    }

    const packet = packetAccumulator.get(sourcePath);
    // Keep max 200 hits per source to bound memory
    if (packet.hits.length < 200) {
      packet.hits.push({ lineNum, content: content.trim().slice(0, 500) });
    }
  }

  process.stdout.write(`\r[${dumpLabel}] Done — ${(lineCount / 1e6).toFixed(1)}M lines, ${packetCount} new packets, ${skippedNoise} noise lines skipped\n`);
}

// --- Scan docs/ session notes directly ---
async function scanSessionNotes(outStream) {
  console.log('[extract] Scanning session notes in docs/ directly...');

  const docsFiles = fs.readdirSync(DOCS_DIR).filter(f => /\.(txt|md)$/.test(f));
  const reportsFiles = fs.existsSync(REPORTS_DIR)
    ? fs.readdirSync(REPORTS_DIR).filter(f => /\.txt$/.test(f) && !f.startsWith('rg_'))
    : [];

  const allFiles = [
    ...docsFiles.map(f => path.join(DOCS_DIR, f)),
    ...reportsFiles.map(f => path.join(REPORTS_DIR, f)),
  ];

  let featureCount = 0;
  for (const filePath of allFiles) {
    try {
      const content = fs.readFileSync(filePath, 'utf8');
      const lines = content.split(/\r?\n/);
      const items = extractFeatureItems(lines);

      if (items.length === 0) continue;

      const packet = {
        packet_id: crypto.createHash('sha1').update(filePath).digest('hex').slice(0, 12),
        sourceRef: path.relative(ROOT, filePath).replace(/\\/g, '/'),
        featureId: deriveFeatureId(filePath),
        title_id: path.basename(filePath, path.extname(filePath)),
        path_mapping: buildPathMapping(filePath),
        items,
        line_count: lines.length,
        generated_at: new Date().toISOString(),
      };

      if (!DRY_RUN) {
        outStream.write(JSON.stringify(packet) + '\n');
      }
      featureCount += items.length;
      if (VERBOSE) console.log(`  [session] ${packet.sourceRef}: ${items.length} items`);
    } catch {
      // skip unreadable
    }
  }

  console.log(`[extract] Session notes: ${allFiles.length} files, ${featureCount} feature items`);
}

// --- TOC builder ---
function buildToc(packets) {
  const byFeature = {};
  for (const p of packets.values()) {
    if (!byFeature[p.featureId]) {
      byFeature[p.featureId] = {
        featureId: p.featureId,
        sources: [],
        total_hits: 0,
      };
    }
    byFeature[p.featureId].sources.push({
      packet_id: p.packet_id,
      sourceRef: p.sourceRef,
      title_id: p.title_id,
      hit_count: p.hits.length,
      category: p.path_mapping.category,
      dump_source: p.dump_source,
    });
    byFeature[p.featureId].total_hits += p.hits.length;
  }

  return {
    generated_at: new Date().toISOString(),
    total_packets: packets.size,
    feature_groups: Object.values(byFeature).sort((a, b) => b.total_hits - a.total_hits),
  };
}

// --- Main ---
async function main() {
  console.log('[extract] RG Dump Packet Extractor');
  console.log(`[extract] DRY_RUN=${DRY_RUN}, LIMIT=${LIMIT}, VERBOSE=${VERBOSE}`);
  console.log(`[extract] Output: ${PACKETS_DIR}`);

  if (!DRY_RUN) {
    fs.mkdirSync(PACKETS_DIR, { recursive: true });
  }

  const packets = new Map(); // sourcePath → packet

  // Process both dumps
  const turboVecPath = path.join(REPORTS_DIR, 'rg_turbovec.txt');
  const napiPath = path.join(REPORTS_DIR, 'rg_napi.txt');

  if (fs.existsSync(turboVecPath)) {
    await processRgDump(turboVecPath, 'rg_turbovec', packets);
  } else {
    console.warn('[extract] rg_turbovec.txt not found, skipping');
  }

  if (fs.existsSync(napiPath)) {
    await processRgDump(napiPath, 'rg_napi', packets);
  } else {
    console.warn('[extract] rg_napi.txt not found, skipping');
  }

  // Write NDJSON packet file
  const packetPath = path.join(PACKETS_DIR, 'rg-knowledge-packets.ndjson');
  const tocPath = path.join(PACKETS_DIR, 'rg-toc.json');
  const sessionPath = path.join(PACKETS_DIR, 'session-features.ndjson');

  if (!DRY_RUN) {
    const packetOut = fs.createWriteStream(packetPath, { encoding: 'utf8' });
    let written = 0;
    for (const packet of packets.values()) {
      packetOut.write(JSON.stringify(packet) + '\n');
      written++;
    }
    packetOut.end();
    console.log(`[extract] Wrote ${written} packets → ${packetPath}`);

    // Write TOC
    const toc = buildToc(packets);
    fs.writeFileSync(tocPath, JSON.stringify(toc, null, 2), 'utf8');
    console.log(`[extract] Wrote TOC (${toc.feature_groups.length} feature groups) → ${tocPath}`);

    // Scan session notes directly
    const sessionOut = fs.createWriteStream(sessionPath, { encoding: 'utf8' });
    await scanSessionNotes(sessionOut);
    sessionOut.end();
    console.log(`[extract] Wrote session features → ${sessionPath}`);
  } else {
    console.log(`[DRY-RUN] Would write ${packets.size} packets to ${packetPath}`);
    const toc = buildToc(packets);
    console.log(`[DRY-RUN] TOC would have ${toc.feature_groups.length} feature groups`);
    for (const g of toc.feature_groups.slice(0, 10)) {
      console.log(`  ${g.featureId}: ${g.sources.length} sources, ${g.total_hits} hits`);
    }
  }

  console.log('[extract] Done.');
}

main().catch(err => {
  console.error('[extract] FATAL:', err);
  process.exit(1);
});
