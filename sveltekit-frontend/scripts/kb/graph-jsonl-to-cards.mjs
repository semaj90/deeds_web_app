#!/usr/bin/env node
import { createReadStream, existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join, dirname, resolve, isAbsolute, posix } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';
import { createInterface } from 'node:readline';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, '..', '..');
const OUT_DIR = join(ROOT, 'memory', 'kb', 'notecards');
const DEFAULT_JSONL = join(ROOT, 'memory', 'graph', 'codebase-graph.jsonl');
const FALLBACK_JSON = join(ROOT, 'docs', 'graph', 'codebase-graph.json');
const OUTPUT_CARDS = join(OUT_DIR, 'graph_file_cards.jsonl');
const OUTPUT_REPORT = join(OUT_DIR, 'graph_file_cards.report.json');
const OUTPUT_INVALID = join(OUT_DIR, 'graph_file_cards.invalid.jsonl');

const TAG_BOOSTS = new Set(['auth', 'db', 'qdrant', 'redis', 'llm', 'ace', 'mcp', 'zod', 'evidence', 'reconstruction', 'cache']);

function parseArgs(argv) {
  const args = { input: null };
  for (let i = 0; i < argv.length; i += 1) {
    const token = argv[i];
    if (token === '--input') {
      args.input = argv[i + 1] ?? null;
      i += 1;
      continue;
    }
    if (token.startsWith('--input=')) {
      args.input = token.slice('--input='.length) || null;
    }
  }
  return args;
}

function existsPath(filePath) {
  return !!filePath && existsSync(filePath);
}

function resolveInputPath(explicitInput) {
  // Priority: --input flag > KB_GRAPH_JSONL_INPUT env var > default JSONL > fallback JSON
  // Env var added so PowerShell/npm don't have to forward `-- --input` (which often drops args).
  const envInput = process.env.KB_GRAPH_JSONL_INPUT?.trim() || null;
  const candidate = explicitInput || envInput;

  if (candidate) {
    const resolved = isAbsolute(candidate) ? candidate : resolve(ROOT, candidate);
    if (!existsPath(resolved)) {
      throw new Error(`Input file not found: ${resolved}`);
    }
    return { path: resolved, format: resolved.endsWith('.jsonl') ? 'jsonl' : 'json' };
  }

  if (existsPath(DEFAULT_JSONL)) {
    return { path: DEFAULT_JSONL, format: 'jsonl' };
  }

  if (existsPath(FALLBACK_JSON)) {
    return { path: FALLBACK_JSON, format: 'json' };
  }

  throw new Error([
    `No graph input found.`,
    `Expected default: ${DEFAULT_JSONL}`,
    `Fallback: ${FALLBACK_JSON}`,
    `Or provide: node scripts/kb/graph-jsonl-to-cards.mjs --input path/to/graph.jsonl`,
    `Or set: $env:KB_GRAPH_JSONL_INPUT="path/to/graph.jsonl"`,
  ].join('\n'));
}

function toPosixPath(value) {
  return String(value).replace(/\\/g, '/');
}

function cleanList(values, limit = 12) {
  return [...new Set((Array.isArray(values) ? values : []).map((value) => String(value).trim()).filter(Boolean))].slice(0, limit);
}

function fileHash(payload) {
  return createHash('sha1').update(payload).digest('hex').slice(0, 12);
}

function deriveHash(record, sourcePath) {
  if (typeof record?.hash === 'string' && record.hash.trim()) {
    return record.hash.trim().slice(0, 12);
  }

  if (typeof record?.stable_key === 'string') {
    const match = record.stable_key.match(/^[^:]+:([a-f0-9]{8,64}):/i);
    if (match) return match[1].slice(0, 12);
  }

  const seed = JSON.stringify({
    sourcePath,
    kind: record?.kind ?? '',
    zone: record?.zone ?? '',
    lineCount: record?.lineCount ?? record?.line_count ?? record?.line_count ?? 0,
    fanIn: record?.fanIn ?? record?.fan_in ?? record?.directFanIn ?? 0,
    fanOut: record?.fanOut ?? record?.fan_out ?? record?.directFanOut ?? 0,
    summary: record?.summary ?? '',
    tags: cleanList(record?.tags, 64),
    exports: cleanList(record?.exports, 64),
  });

  return fileHash(seed);
}

function deriveSourcePath(record) {
  const raw = record?.source_path ?? record?.file_path ?? record?.filePath ?? record?.rel ?? record?.path ?? '';
  return String(raw).trim();
}

function inferZone(record, sourcePath) {
  if (typeof record?.zone === 'string' && record.zone.trim()) return record.zone.trim();

  const path = sourcePath.toLowerCase();
  if (path.includes('/server/') || path.includes('.server.') || path.includes('/api/')) return 'server';
  if (path.includes('/client/') || path.includes('.client.') || path.includes('/components/')) return 'client';
  if (path.includes('/routes/')) {
    if (path.includes('/+server.')) return 'server';
    if (path.includes('/+page.svelte') || path.includes('/+page.ts') || path.includes('/+layout.svelte')) return 'client';
    return 'route';
  }
  if (path.includes('types') || path.endsWith('.d.ts')) return 'types';
  return 'shared';
}

function inferKind(record, sourcePath) {
  if (typeof record?.kind === 'string' && record.kind.trim()) return record.kind.trim();

  const path = sourcePath.toLowerCase();
  if (record?.isRoute || path.includes('/routes/') || Array.isArray(record?.routeHandlers) && record.routeHandlers.length > 0) return 'route';
  if (path.includes('hooks.server') || path.includes('hooks.client')) return 'hooks';
  if (path.includes('/components/') || path.endsWith('.svelte')) return 'component';
  if (path.includes('/stores/') || path.includes('store')) return 'store';
  if (path.includes('/db/')) return 'db';
  if (path.includes('/ai/')) return 'ai';
  if (path.includes('/cache/')) return 'cache';
  if (path.includes('/server/')) return 'server';
  return 'module';
}

function inferTags(record, sourcePath, kind, zone) {
  const baseTags = cleanList(record?.tags, 12).map((tag) => tag.toLowerCase());
  const source = sourcePath.toLowerCase();
  const extras = [];

  if (kind) extras.push(kind.toLowerCase());
  if (zone) extras.push(zone.toLowerCase());
  if (source.includes('auth')) extras.push('auth');
  if (source.includes('zod')) extras.push('zod');
  if (source.includes('redis')) extras.push('redis');
  if (source.includes('qdrant')) extras.push('qdrant');
  if (source.includes('llm') || source.includes('gemma') || source.includes('qwen')) extras.push('llm');
  if (source.includes('cache')) extras.push('cache');
  if (source.includes('evidence')) extras.push('evidence');
  if (source.includes('recon')) extras.push('reconstruction');
  if (source.includes('mcp')) extras.push('mcp');
  if (source.includes('ace')) extras.push('ace');
  if (source.includes('db')) extras.push('db');

  return [...new Set([...baseTags, ...extras])].slice(0, 12);
}

function inferFanIn(record) {
  const value = record?.fanIn ?? record?.fan_in ?? record?.directFanIn ?? 0;
  return Number.isFinite(Number(value)) ? Number(value) : 0;
}

function inferFanOut(record) {
  const value = record?.fanOut ?? record?.fan_out ?? record?.directFanOut ?? 0;
  return Number.isFinite(Number(value)) ? Number(value) : 0;
}

function inferLineCount(record) {
  const value = record?.lineCount ?? record?.line_count ?? 0;
  return Number.isFinite(Number(value)) ? Number(value) : 0;
}

function normalizeNeighborSpec(spec, sourcePath) {
  if (typeof spec !== 'string') return null;
  const trimmed = spec.trim();
  if (!trimmed) return null;
  if (trimmed.startsWith('node:')) return null;
  if (trimmed.startsWith('http://') || trimmed.startsWith('https://')) return null;

  if (trimmed.startsWith('$lib/')) return toPosixPath(`src/lib/${trimmed.slice('$lib/'.length)}`);
  if (trimmed.startsWith('$app/')) return trimmed;
  if (trimmed.startsWith('$env/')) return trimmed;
  if (trimmed.startsWith('src/')) return toPosixPath(trimmed);
  if (trimmed.startsWith('.')) {
    const base = posix.dirname(toPosixPath(sourcePath));
    return toPosixPath(posix.normalize(posix.join(base, trimmed))).replace(/^\.\//, '');
  }
  if (trimmed.includes('/')) return toPosixPath(trimmed);
  return null;
}

function collectNeighbors(record, sourcePath) {
  const candidates = [
    ...(Array.isArray(record?.imports) ? record.imports : []),
    ...(Array.isArray(record?.dynImports) ? record.dynImports : []),
    ...(Array.isArray(record?.reExports) ? record.reExports : []),
    ...(Array.isArray(record?.components) ? record.components : []),
  ];

  return [...new Set(candidates.map((item) => normalizeNeighborSpec(item, sourcePath)).filter(Boolean))].slice(0, 8);
}

function buildSearchText(card) {
  const summary = card.summary ? `summary=${card.summary}` : '';
  return [
    card.title,
    card.kind,
    card.domain,
    card.zone,
    `tags=${card.tags.join(' ')}`,
    `exports=${card.exports.join(' ')}`,
    `deg ${card.fan_in}/${card.fan_out}`,
    `risk ${card.risk_score.toFixed(3)}`,
    summary,
  ].filter(Boolean).join(' | ');
}

function buildContextText(card) {
  const lines = [
    `NODE ${card.title}`,
    `domain=${card.domain} kind=${card.kind} zone=${card.zone} risk=${card.risk_score.toFixed(3)} lines=${card.line_count}`,
    `source_id=${card.source_id}`,
    `source_hash=${card.source_hash}`,
    `tags=${card.tags.join(',') || 'none'}`,
    `exports=${card.exports.join(',') || 'none'}`,
    `guards auth=${card.has_auth ? 'true' : 'false'} zod=${card.has_zod ? 'true' : 'false'}`,
    `fan=in:${card.fan_in} out:${card.fan_out}`,
    `neighbors=${card.graph_neighbors.slice(0, 8).join(', ') || 'none'}`,
  ];

  if (card.summary) lines.push(`summary=${card.summary}`);
  return lines.join('\n');
}

function computeRiskScore(record, sourcePath, kind, zone, tags, fanIn, fanOut, lineCount) {
  const source = sourcePath.toLowerCase();
  const tagSet = new Set(tags.map((tag) => tag.toLowerCase()));

  let score = 0;
  if (record?.hasAuth || source.includes('auth') || tagSet.has('auth')) score += 0.22;
  if (record?.hasZod || source.includes('zod') || tagSet.has('zod')) score += 0.12;
  if (record?.ssrUnsafe) score += 0.18;
  if (zone === 'server') score += 0.06;
  if (kind === 'route') score += 0.08;
  if (kind === 'hooks') score += 0.12;
  if (tagSet.has('db') || source.includes('/db/')) score += 0.08;
  if (tagSet.has('redis') || source.includes('redis')) score += 0.06;
  if (tagSet.has('qdrant') || source.includes('qdrant')) score += 0.06;
  if (tagSet.has('llm') || source.includes('llm') || source.includes('gemma') || source.includes('qwen')) score += 0.05;
  if (tagSet.has('cache') || source.includes('cache')) score += 0.05;
  if (tagSet.has('evidence')) score += 0.04;
  if (tagSet.has('reconstruction')) score += 0.04;

  score += Math.min(lineCount / 1200, 1) * 0.16;
  score += Math.min((fanIn + fanOut) / 40, 1) * 0.14;
  if (fanOut >= 20) score += 0.08;
  if (fanIn >= 20) score += 0.06;
  if (record?.hasPairedTest) score -= 0.04;
  if (record?.summary && String(record.summary).trim()) score += 0.01;

  return Math.max(0, Math.min(1, Number(score.toFixed(3))));
}

function readJsonl(filePath) {
  return new Promise((resolvePromise, rejectPromise) => {
    const records = [];
    let lineNumber = 0;
    const rl = createInterface({
      input: createReadStream(filePath, { encoding: 'utf8' }),
      crlfDelay: Infinity,
    });

    rl.on('line', (line) => {
      lineNumber += 1;
      const trimmed = line.trim();
      if (!trimmed) return;
      try {
        records.push(JSON.parse(trimmed));
      } catch (error) {
        records.push({ __invalidJson: true, __lineNumber: lineNumber, __error: error.message, __raw: trimmed });
      }
    });

    rl.on('close', () => resolvePromise(records));
    rl.on('error', rejectPromise);
  });
}

function normalizeJsonPayload(payload) {
  if (Array.isArray(payload)) return payload;
  if (payload && typeof payload === 'object') {
    if (Array.isArray(payload.files)) return payload.files;
    if (Array.isArray(payload.nodes)) return payload.nodes;
  }
  return [];
}

function formatInvalid(record, reasons, sourcePath = '') {
  return {
    reason: reasons.join('; '),
    source_path: sourcePath,
    stable_key: record?.stable_key ?? null,
    kind: record?.kind ?? null,
    zone: record?.zone ?? null,
    line_count: record?.lineCount ?? record?.line_count ?? null,
  };
}

function minifyRankCard(card) {
  return {
    card_id: card.card_id,
    source_id: card.source_id,
    source_path: card.source_path,
    score: card.rank_score,
    risk_score: card.risk_score,
    line_count: card.line_count,
    fan_in: card.fan_in,
    fan_out: card.fan_out,
    tag_boost: card.rank_metrics.tag_boost,
    summary_presence: card.rank_metrics.summary_presence,
    kind: card.kind,
    zone: card.zone,
    tags: card.tags,
    exports: card.exports,
    graph_neighbors: card.graph_neighbors,
  };
}

function scoreCards(cards) {
  const maxLineCount = Math.max(1, ...cards.map((card) => card.line_count || 0));
  const maxDegree = Math.max(1, ...cards.map((card) => (card.fan_in || 0) + (card.fan_out || 0)));

  return cards
    .map((card) => {
      const normalizedLineCount = Math.min(1, (card.line_count || 0) / maxLineCount);
      const normalizedDegree = Math.min(1, ((card.fan_in || 0) + (card.fan_out || 0)) / maxDegree);
      const boostedTagCount = card.tags.filter((tag) => TAG_BOOSTS.has(tag.toLowerCase())).length;
      const tagBoost = Math.min(1, boostedTagCount / 4);
      const summaryPresence = card.summary ? 1 : 0;
      const rankScore = Number((0.35 * card.risk_score + 0.20 * normalizedLineCount + 0.20 * normalizedDegree + 0.15 * tagBoost + 0.10 * summaryPresence).toFixed(4));
      return {
        ...card,
        rank_score: rankScore,
        rank_metrics: {
          normalized_line_count: Number(normalizedLineCount.toFixed(4)),
          normalized_degree: Number(normalizedDegree.toFixed(4)),
          tag_boost: Number(tagBoost.toFixed(4)),
          summary_presence: summaryPresence,
        },
      };
    })
    .sort((left, right) => right.rank_score - left.rank_score || right.risk_score - left.risk_score || left.source_path.localeCompare(right.source_path));
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const { path: inputPath, format } = resolveInputPath(args.input);

  mkdirSync(OUT_DIR, { recursive: true });

  const rawRecords = format === 'jsonl'
    ? await readJsonl(inputPath)
    : normalizeJsonPayload(JSON.parse(readFileSync(inputPath, 'utf8')));

  const cards = [];
  const invalid = [];
  const seen = new Set();
  let duplicateCount = 0;

  for (const record of rawRecords) {
    if (!record || record.__invalidJson) {
      invalid.push(formatInvalid(record, [`invalid json: ${record?.__error ?? 'unknown error'}`]));
      continue;
    }

    const sourcePath = toPosixPath(deriveSourcePath(record));
    const reasons = [];
    if (!sourcePath) reasons.push('missing source_path');

    const kind = inferKind(record, sourcePath);
    const zone = inferZone(record, sourcePath);
    const tags = inferTags(record, sourcePath, kind, zone);
    const exports = cleanList(record?.exports, 12);
    const neighbors = collectNeighbors(record, sourcePath);
    const lineCount = inferLineCount(record);
    const fanIn = inferFanIn(record);
    const fanOut = inferFanOut(record);
    const hash = deriveHash(record, sourcePath);
    const riskScore = computeRiskScore(record, sourcePath, kind, zone, tags, fanIn, fanOut, lineCount);
    const summary = typeof record?.summary === 'string' ? record.summary.trim() : '';
    const title = sourcePath || record?.summary?.trim?.() || 'codebase-node';
    const sourceId = sourcePath || title;
    const confidence = summary && tags.length > 0 ? 'high' : summary ? 'medium' : 'low';

    const card = {
      card_id: `card:codebase:${sourceId}:${hash}`,
      domain: 'codebase',
      source_id: sourceId,
      source_path: sourcePath || undefined,
      source_hash: hash,
      title,
      kind,
      tags,
      summary,
      search_text: '',
      context_text: '',
      citations: [],
      evidence_ids: [],
      graph_neighbors: neighbors,
      neighbors,
      confidence,
      status: 'active',
      updated_at: new Date().toISOString(),
      zone,
      hash,
      line_count: lineCount,
      fan_in: fanIn,
      fan_out: fanOut,
      exports,
      risk_score: riskScore,
      has_auth: !!record?.hasAuth,
      has_zod: !!record?.hasZod,
    };

    card.search_text = buildSearchText(card);
    card.context_text = buildContextText(card);

    if (!card.source_path) reasons.push('missing source_path');
    if (!card.search_text.trim()) reasons.push('missing search_text');
    if (!card.context_text.trim()) reasons.push('missing context_text');

    if (seen.has(card.card_id)) {
      reasons.push('duplicate card_id');
      duplicateCount += 1;
    }

    if (reasons.length > 0) {
      invalid.push(formatInvalid(record, reasons, sourcePath));
      continue;
    }

    seen.add(card.card_id);
    cards.push(card);
  }

  const rankedPreview = scoreCards(cards);
  const report = {
    generated_at: new Date().toISOString(),
    input_path: inputPath,
    source_format: format,
    parsed: rawRecords.length,
    emitted: cards.length,
    invalid: invalid.length,
    duplicate_count: duplicateCount,
    duplicates: duplicateCount,
    output_files: {
      cards: OUTPUT_CARDS,
      report: OUTPUT_REPORT,
      invalid: OUTPUT_INVALID,
    },
    top_20_ranked_cards: rankedPreview.slice(0, 20).map(minifyRankCard),
  };

  writeFileSync(OUTPUT_CARDS, `${cards.map((card) => JSON.stringify(card)).join('\n')}${cards.length ? '\n' : ''}`);
  writeFileSync(OUTPUT_INVALID, `${invalid.map((row) => JSON.stringify(row)).join('\n')}${invalid.length ? '\n' : ''}`);
  writeFileSync(OUTPUT_REPORT, `${JSON.stringify(report, null, 2)}\n`);

  console.log(`[kb] input: ${inputPath}`);
  console.log(`[kb] parsed=${report.parsed} emitted=${report.emitted} invalid=${report.invalid} duplicates=${report.duplicate_count}`);
  console.log(`[kb] wrote ${OUTPUT_CARDS}`);
  console.log(`[kb] wrote ${OUTPUT_REPORT}`);
  console.log(`[kb] wrote ${OUTPUT_INVALID}`);

  if (invalid.length > 0) {
    console.log(`[kb] invalid rows captured: ${invalid.length}`);
  }

  // N3: top-card CLI summary — surface what `top_20_ranked_cards` already contains
  // in report.json so operators don't need to open the file.
  const topN = Math.min(10, rankedPreview.length);
  if (topN > 0) {
    console.log(`[kb] top-${topN} ranked cards (preview):`);
    for (let i = 0; i < topN; i += 1) {
      const c = rankedPreview[i];
      const path = (c.source_path ?? c.source_id ?? '?').toString().split('/').slice(-2).join('/');
      const tags = Array.isArray(c.tags) && c.tags.length ? `  [${c.tags.slice(0, 3).join(',')}]` : '';
      console.log(`[kb]   ${String(i + 1).padStart(2, ' ')}. ${c.rank_score.toFixed(4)}  ${path}${tags}`);
    }
  }
}

main().catch((error) => {
  console.error(`[kb] ${error.message}`);
  process.exitCode = 1;
});
