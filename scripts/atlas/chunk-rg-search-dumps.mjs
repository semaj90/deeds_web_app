#!/usr/bin/env node

import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import readline from 'node:readline';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, '../..');

const INPUTS = [
  path.join(REPO_ROOT, 'docs', 'reports', 'rg_turbovec.txt'),
  path.join(REPO_ROOT, 'docs', 'reports', 'rg_napi.txt'),
];
const OUT_DIR = path.join(REPO_ROOT, '.tmp', 'rg-search-dump-packets');
const REPORT_JSON = path.join(REPO_ROOT, 'docs', 'reports', 'rg-search-dump-index-report.json');
const REPORT_MD = path.join(REPO_ROOT, 'docs', 'reports', 'rg-search-dump-index-report.md');

const MAX_LINES_PER_PACKET = Number.parseInt(process.env.RG_DUMP_MAX_LINES_PER_PACKET || '250', 10);
const MAX_PACKETS = Number.parseInt(process.argv.find((arg) => arg.startsWith('--max-packets='))?.split('=')[1] || '0', 10);
const DRY_RUN = process.argv.includes('--dry-run');
const INPUT_FILTER = process.argv.find((arg) => arg.startsWith('--input='))?.split('=')[1] ?? null;

function sha256(text) {
  return crypto.createHash('sha256').update(String(text ?? '')).digest('hex');
}

function shortHash(text, len = 16) {
  return sha256(text).slice(0, len);
}

function normalizePath(value) {
  let normalized = String(value ?? '').trim().replace(/\\/g, '/');
  normalized = normalized.replace(/^[.]\//, '').replace(/^\/+/, '');
  return normalized;
}

function classifyFeature(filePath, text) {
  const haystack = `${filePath} ${text}`.toLowerCase();
  if (haystack.includes('simdjson') || haystack.includes('jsonparse') || haystack.includes('json parse')) return 'simdjson_json_parse';
  if (haystack.includes('tensorrt') || haystack.includes('libtorch') || haystack.includes('cuda') || haystack.includes('napi')) return 'native_bridge_cuda';
  if (haystack.includes('qdrant') || haystack.includes('pgvector') || haystack.includes('hnsw') || haystack.includes('vector')) return 'vector_search';
  if (haystack.includes('parent atlas') || haystack.includes('atlas')) return 'parent_atlas_index';
  if (haystack.includes('turbovec')) return 'turbovec_search';
  if (haystack.includes('neo4j') || haystack.includes('graph')) return 'graph_topology';
  if (haystack.includes('redis') || haystack.includes('bitfrost') || haystack.includes('cache')) return 'durable_cache';
  return 'rg_search_dump';
}

function buildSummary(lines) {
  const samples = lines.slice(0, 3).map((line) => line.text.trim()).filter(Boolean);
  return samples.join(' ').replace(/\s+/g, ' ').slice(0, 500);
}

function parseHitLine(line) {
  const match = line.match(/^(.*?):(\d+):(.*)$/);
  if (!match) return null;
  return {
    filePath: normalizePath(match[1]),
    lineNumber: Number(match[2]),
    text: match[3].trim(),
  };
}

function packetIdFor(packet) {
  return sha256([
    packet.inputLane,
    packet.title_id,
    packet.feature_id,
    packet.sourceRef,
    packet.chunkIndex,
    packet.lineCount,
  ].join('|'));
}

async function streamLines(filePath, onLine) {
  const input = fs.createReadStream(filePath, { encoding: 'utf16le' });
  const rl = readline.createInterface({ input, crlfDelay: Infinity });
  for await (const line of rl) {
    await onLine(line);
  }
}

async function main() {
  const inputs = INPUT_FILTER ? INPUTS.filter((input) => normalizePath(input).includes(INPUT_FILTER)) : INPUTS.slice();
  await fs.promises.mkdir(OUT_DIR, { recursive: true });
  const packetJsonlPath = path.join(OUT_DIR, 'rg-search-dump-packets.jsonl');
  const packetStream = DRY_RUN ? null : fs.createWriteStream(packetJsonlPath, { encoding: 'utf8' });

  const stats = {
    generatedAt: new Date().toISOString(),
    inputs: [],
    totalLines: 0,
    parsedHits: 0,
    packets: 0,
    dryRun: DRY_RUN,
    maxLinesPerPacket: MAX_LINES_PER_PACKET,
    maxPackets: MAX_PACKETS,
  };

  const writePacket = (packet) => {
    stats.packets += 1;
    if (packetStream) packetStream.write(`${JSON.stringify(packet)}\n`);
  };

  for (const inputPath of inputs) {
    const inputName = path.basename(inputPath);
    const lane = inputName.includes('turbovec') ? 'rg_turbovec' : 'rg_napi';
    const inputStat = {
      file: normalizePath(path.relative(REPO_ROOT, inputPath)),
      lane,
      lines: 0,
      hits: 0,
      packets: 0,
    };

    let activeSource = null;
    let activeLines = [];
    let chunkIndex = 0;

    const flush = () => {
      if (!activeLines.length || !activeSource) return;
      const first = activeLines[0];
      const last = activeLines[activeLines.length - 1];
      const sourceRefs = [...new Set([
        `${first.filePath}#L${first.lineNumber}`,
        `${last.filePath}#L${last.lineNumber}`,
        first.filePath,
      ])];
      const featureKey = classifyFeature(activeSource, activeLines.map((line) => line.text).join(' '));
      const feature_id = `feature:${featureKey}:${shortHash(`${lane}|${activeSource}|${chunkIndex}`, 12)}`;
      const title = path.basename(activeSource) || activeSource;
      const title_id = shortHash(`${title}|${activeSource}`, 12);
      const summary = buildSummary(activeLines);
      const packet = {
        packet_id: packetIdFor({
          inputLane: lane,
          title_id,
          feature_id,
          sourceRef: `${activeSource}#L${first.lineNumber}`,
          chunkIndex,
          lineCount: activeLines.length,
        }),
        inputLane: lane,
        inputFile: normalizePath(path.relative(REPO_ROOT, inputPath)),
        title,
        title_id,
        feature_id,
        featureKey,
        sourceRef: `${activeSource}#L${first.lineNumber}`,
        sourceRefs,
        summary,
        chunkIndex,
        lineCount: activeLines.length,
        lineRange: {
          start: first.lineNumber,
          end: last.lineNumber,
        },
        hits: activeLines.slice(0, 20),
        generatedAt: stats.generatedAt,
      };
      writePacket(packet);
      inputStat.packets += 1;
      chunkIndex += 1;
      activeLines = [];
      if (MAX_PACKETS > 0 && stats.packets >= MAX_PACKETS) {
        throw new Error(`Reached max packets limit: ${MAX_PACKETS}`);
      }
    };

    try {
      await streamLines(inputPath, async (line) => {
        stats.totalLines += 1;
        inputStat.lines += 1;
        if (!line.trim()) return;
        const hit = parseHitLine(line);
        if (!hit) return;
        stats.parsedHits += 1;
        inputStat.hits += 1;
        if (activeSource && hit.filePath !== activeSource && activeLines.length) {
          flush();
        }
        activeSource = hit.filePath;
        activeLines.push(hit);
        if (activeLines.length >= MAX_LINES_PER_PACKET) {
          flush();
        }
      });
      flush();
    } catch (err) {
      if (String(err?.message ?? '').includes('Reached max packets limit')) {
        inputStat.stoppedEarly = true;
      } else {
        inputStat.error = String(err?.message ?? err);
      }
    }

    stats.inputs.push(inputStat);
  }

  if (packetStream) packetStream.end();

  const report = {
    generatedAt: stats.generatedAt,
    inputs: stats.inputs,
    summary: {
      totalLines: stats.totalLines,
      parsedHits: stats.parsedHits,
      packets: stats.packets,
      dryRun: stats.dryRun,
      maxLinesPerPacket: stats.maxLinesPerPacket,
      maxPackets: stats.maxPackets,
    },
    note: 'Large ripgrep dumps are chunked into parent-atlas-ready packets keyed by title_id, feature_id, and sourceRef. The raw .txt dumps remain generated evidence, not the indexed working artifact.',
  };

  await fs.promises.writeFile(REPORT_JSON, `${JSON.stringify(report, null, 2)}\n`, 'utf8');
  const md = [
    '# RG Search Dump Index Report',
    '',
    `Generated: ${report.generatedAt}`,
    `Total lines: ${report.summary.totalLines}`,
    `Parsed hits: ${report.summary.parsedHits}`,
    `Packets: ${report.summary.packets}`,
    `Dry run: ${report.summary.dryRun}`,
    `Max lines per packet: ${report.summary.maxLinesPerPacket}`,
    '',
    '## Inputs',
    ...report.inputs.map((input) => `- ${input.file} (${input.lane}) lines=${input.lines} hits=${input.hits} packets=${input.packets}${input.stoppedEarly ? ' stoppedEarly=true' : ''}${input.error ? ` error=${input.error}` : ''}`),
    '',
    '## Note',
    report.note,
    '',
  ].join('\n');
  await fs.promises.writeFile(REPORT_MD, md, 'utf8');

  console.log(`Wrote ${REPORT_JSON}`);
  console.log(`Wrote ${REPORT_MD}`);
  console.log(`Packets: ${report.summary.packets}`);
  console.log(`Parsed hits: ${report.summary.parsedHits}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
