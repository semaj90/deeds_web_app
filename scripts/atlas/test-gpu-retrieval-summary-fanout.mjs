#!/usr/bin/env node
/**
 * Bounded fan-out proof for GPU retrieval summary envelopes.
 *
 * Reads .tmp/gpu-retrieval-summary-envelopes.ndjson and proves the next
 * derived surfaces can be produced without mutating canonical packet identity:
 *   envelope -> AST/regex structural pass -> LangExtract -> ACE envelope
 *   -> Gemma4 bounded summary -> KMeans/SOM seed rows.
 */
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { loadRepoEnv, REPO_ROOT } from './connection-config.mjs';

const argv = new Map();
for (const arg of process.argv.slice(2)) {
  const match = arg.match(/^--([^=]+)=(.*)$/);
  if (match) argv.set(match[1], match[2]);
  else if (arg.startsWith('--')) argv.set(arg.slice(2), 'true');
}

const env = loadRepoEnv();
const INPUT = path.resolve(REPO_ROOT, String(argv.get('input') ?? '.tmp/gpu-retrieval-summary-envelopes.ndjson'));
const LIMIT = Number(argv.get('limit') ?? 6);
const LANGEXTRACT_URL = String(argv.get('langextract-url') ?? env.LANGEXTRACT_URL ?? 'http://127.0.0.1:8096').replace(/\/+$/, '');
const GEMMA4_URL = String(argv.get('gemma4-url') ?? env.GEMMA4_URL ?? env.LLAMA_SERVER_URL ?? 'http://127.0.0.1:8090').replace(/\/+$/, '');
const OUT_ACE = path.resolve(REPO_ROOT, String(argv.get('ace-out') ?? '.tmp/ace-envelope-from-gpu-retrieval.ndjson'));
const OUT_SEEDS = path.resolve(REPO_ROOT, String(argv.get('seeds-out') ?? '.tmp/kmeans-som-feature-seeds.ndjson'));
const OUT_JSON = path.resolve(REPO_ROOT, String(argv.get('report') ?? 'docs/reports/gpu-retrieval-summary-fanout-proof.json'));
const OUT_MD = path.resolve(REPO_ROOT, String(argv.get('report-md') ?? 'docs/reports/gpu-retrieval-summary-fanout-proof.md'));
const CANONICAL_SYMBOL_INDEX = path.resolve(REPO_ROOT, 'sveltekit-frontend/memory/index/symbols.jsonl');

function nowIso() {
  return new Date().toISOString();
}

function hash(value, len = 16) {
  return crypto.createHash('sha256').update(String(value)).digest('hex').slice(0, len);
}

function writeJson(filePath, value) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, JSON.stringify(value, null, 2) + '\n', 'utf8');
}

function writeJsonl(filePath, rows) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, rows.map((row) => JSON.stringify(row)).join('\n') + (rows.length ? '\n' : ''), 'utf8');
}

function readNdjson(filePath) {
  if (!fs.existsSync(filePath)) return [];
  return fs.readFileSync(filePath, 'utf8')
    .split(/\r?\n/)
    .filter((line) => line.trim())
    .map((line) => JSON.parse(line));
}

let canonicalSymbols = null;
function loadCanonicalSymbols() {
  if (canonicalSymbols) return canonicalSymbols;
  canonicalSymbols = new Map();
  if (!fs.existsSync(CANONICAL_SYMBOL_INDEX)) return canonicalSymbols;
  for (const line of fs.readFileSync(CANONICAL_SYMBOL_INDEX, 'utf8').split(/\r?\n/)) {
    if (!line.trim()) continue;
    try {
      const row = JSON.parse(line);
      const file = normalizeRef(row.file);
      if (!file) continue;
      if (!canonicalSymbols.has(file)) canonicalSymbols.set(file, []);
      canonicalSymbols.get(file).push(row);
    } catch {
      // Keep the verifier tolerant of one bad JSONL row.
    }
  }
  return canonicalSymbols;
}

function normalizeRef(ref) {
  return String(ref ?? '').replace(/\\/g, '/').replace(/^\/+/, '').trim();
}

function repoFile(ref) {
  const normalized = normalizeRef(ref);
  const resolved = path.resolve(REPO_ROOT, normalized);
  if (!resolved.toLowerCase().startsWith(REPO_ROOT.toLowerCase())) return null;
  return fs.existsSync(resolved) && fs.statSync(resolved).isFile() ? resolved : null;
}

function readSnippet(ref, maxChars = 2200) {
  const file = repoFile(ref);
  if (!file) return { exists: false, content: '', bytes: 0 };
  const content = fs.readFileSync(file, 'utf8');
  return { exists: true, content: content.slice(0, maxChars), bytes: Buffer.byteLength(content) };
}

function commandExists(command) {
  const probe = spawnSync(process.platform === 'win32' ? 'where.exe' : 'which', [command], {
    encoding: 'utf8',
    shell: false,
  });
  return probe.status === 0;
}

function localBin(command) {
  const suffix = process.platform === 'win32' ? '.cmd' : '';
  const candidate = path.join(REPO_ROOT, 'node_modules', '.bin', `${command}${suffix}`);
  return fs.existsSync(candidate) ? candidate : null;
}

function resolveAstGrepCommand() {
  return localBin('ast-grep') || localBin('sg') || (commandExists('ast-grep') ? 'ast-grep' : (commandExists('sg') ? 'sg' : null));
}

function astGrepSymbols(ref) {
  const file = repoFile(ref);
  if (!file) return { status: 'WARN', parser: 'missing_file', symbols: [] };
  const rel = normalizeRef(path.relative(REPO_ROOT, file));
  const svelteRel = rel.startsWith('sveltekit-frontend/') ? rel.slice('sveltekit-frontend/'.length) : rel;
  const indexedSymbols = loadCanonicalSymbols().get(svelteRel) ?? loadCanonicalSymbols().get(rel) ?? [];
  if (indexedSymbols.length) {
    return {
      status: 'LIVE_PASS',
      parser: 'canonical_ast_grep_index',
      symbols: indexedSymbols.slice(0, 40).map((row) => ({
        kind: row.kind,
        symbol: row.symbol,
        parser: row.parser ?? 'ast-grep+regex',
        line: row.line,
      })),
    };
  }
  const text = fs.readFileSync(file, 'utf8');
  const symbols = [];

  const astCommand = resolveAstGrepCommand();
  if (astCommand) {
    const parserName = path.basename(astCommand).replace(/\.cmd$/i, '');
    const langArgs = rel.endsWith('.ts') || rel.endsWith('.tsx') ? ['--lang', 'ts'] : [];
    const patterns = [
      { kind: 'function', args: ['run', ...langArgs, '--pattern', 'function $NAME($$$ARGS) { $$$BODY }', '--json=stream', rel] },
      { kind: 'export_function', args: ['run', ...langArgs, '--pattern', 'export function $NAME($$$ARGS) { $$$BODY }', '--json=stream', rel] },
      { kind: 'export_const', args: ['run', ...langArgs, '--pattern', 'export const $NAME = $VALUE', '--json=stream', rel] },
      { kind: 'class', args: ['run', ...langArgs, '--pattern', 'class $NAME { $$$BODY }', '--json=stream', rel] },
      { kind: 'import_static', args: ['run', ...langArgs, '--pattern', 'import $X from $SRC', '--json=stream', rel] },
    ];
    for (const pattern of patterns) {
      const result = spawnSync(astCommand, pattern.args, {
        cwd: REPO_ROOT,
        encoding: 'utf8',
        maxBuffer: 1024 * 1024 * 16,
        shell: process.platform === 'win32',
      });
      for (const line of String(result.stdout ?? '').split(/\r?\n/)) {
        if (!line.trim()) continue;
        try {
          const event = JSON.parse(line);
          const captures = event?.metaVariables?.single ?? event?.meta_variables?.single ?? {};
          const name = captures?.NAME?.text
            ?? captures?.NAME?.value
            ?? captures?.SRC?.text?.replace(/^['"]|['"]$/g, '')
            ?? captures?.SRC?.value?.replace(/^['"]|['"]$/g, '')
            ?? event?.text?.match(/\b(?:function|class|const)\s+([A-Za-z0-9_$]+)/)?.[1]
            ?? event?.text?.match(/from\s+['"]([^'"]+)['"]/)?.[1];
          if (name) symbols.push({ kind: pattern.kind, symbol: String(name), parser: parserName });
        } catch {
          // ast-grep stream can include non-JSON diagnostics on some builds.
        }
      }
    }
  }

  if (!symbols.length) {
    const patterns = [
      { kind: 'function', re: /\b(?:export\s+)?(?:async\s+)?function\s+([A-Za-z0-9_$]+)/g },
      { kind: 'const', re: /\bexport\s+const\s+([A-Za-z0-9_$]+)/g },
      { kind: 'class', re: /\b(?:export\s+)?class\s+([A-Za-z0-9_$]+)/g },
      { kind: 'import', re: /\bimport\s+(?:type\s+)?[^'"]+from\s+['"]([^'"]+)['"]/g },
    ];
    for (const pattern of patterns) {
      for (const match of text.matchAll(pattern.re)) {
        symbols.push({ kind: pattern.kind, symbol: match[1], parser: 'regex_fallback' });
      }
    }
  }

  const deduped = [];
  const seen = new Set();
  for (const symbol of symbols) {
    const key = `${symbol.kind}:${symbol.symbol}`;
    if (seen.has(key)) continue;
    seen.add(key);
    deduped.push(symbol);
  }
  return { status: deduped.length ? 'LIVE_PASS' : 'WARN', parser: deduped[0]?.parser ?? 'none', symbols: deduped.slice(0, 24) };
}

async function postJson(url, body, timeoutMs = 45_000) {
  const response = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(timeoutMs),
  });
  const text = await response.text();
  let parsed = null;
  try {
    parsed = text ? JSON.parse(text) : null;
  } catch {
    parsed = { raw: text };
  }
  if (!response.ok) throw new Error(`HTTP ${response.status}: ${text.slice(0, 300)}`);
  return parsed;
}

function extractLangFeatures(data) {
  const features = new Set();
  for (const value of data?.features ?? []) features.add(String(value));
  for (const entity of data?.entities ?? []) {
    if (entity?.text) features.add(String(entity.text));
    if (entity?.label) features.add(String(entity.label));
  }
  for (const value of data?.keywords ?? []) features.add(String(value));
  if (data?.structure?.document_type) features.add(String(data.structure.document_type));
  return [...features].filter(Boolean).slice(0, 32);
}

async function langExtract(snippets) {
  const started = Date.now();
  const content = snippets.map((item) => `FILE: ${item.source_ref}\n${item.content}`).join('\n\n---\n\n').slice(0, 9000);
  try {
    const data = await postJson(`${LANGEXTRACT_URL}/extract`, {
      content,
      document_type: 'code',
      extract_entities: true,
      extract_structure: true,
      use_ollama_ner: true,
    }, 60_000);
    return {
      lane: {
        status: 'LIVE_PASS',
        url: LANGEXTRACT_URL,
        endpoint: '/extract',
        duration_ms: Date.now() - started,
        feature_count: extractLangFeatures(data).length,
      },
      data,
      features: extractLangFeatures(data),
    };
  } catch (error) {
    return {
      lane: {
        status: 'FAIL',
        url: LANGEXTRACT_URL,
        endpoint: '/extract',
        duration_ms: Date.now() - started,
        error: error.message,
      },
      data: null,
      features: [],
    };
  }
}

function stripThoughtBlocks(text) {
  return String(text ?? '')
    .replace(/<\|channel\|>thought[\s\S]*?(?=<\|channel\|>|$)/gi, '')
    .replace(/<\|channel\|>thought<channel\|>/gi, '')
    .replace(/<think>[\s\S]*?<\/think>/gi, '')
    .trim();
}

function sanitizeGemmaJsonText(text) {
  const raw = String(text ?? '').trim();
  let cleaned = stripThoughtBlocks(raw);
  if (!cleaned && raw.includes('{')) {
    cleaned = raw.replace(/<\|?[^>]+>\|?/g, '').trim();
  }
  const start = cleaned.indexOf('{');
  const end = cleaned.lastIndexOf('}');
  if (start >= 0 && end > start) cleaned = cleaned.slice(start, end + 1);
  return {
    raw,
    cleaned,
    thoughtStripped: raw !== cleaned && /thought|<think>|<\|channel\|>/i.test(raw),
  };
}

async function gemma4Summary(aceEnvelope) {
  const started = Date.now();
  const messages = [
    {
      role: 'system',
      content: 'You summarize bounded Parent Atlas ACE envelopes. Return strict JSON only. Do not include hidden reasoning.',
    },
    {
      role: 'user',
      content: JSON.stringify({
        task: 'Summarize this ACE envelope for KMeans/SOM clustering and agentic kanban planning in 2-3 sentences.',
        required_json: {
          summary: 'string',
          clustering_label: 'string',
          ontology_label: 'string',
          domain_class: 'string',
          kanban_hint: 'string',
        },
        ace: aceEnvelope,
      }),
    },
  ];
  try {
    const data = await postJson(`${GEMMA4_URL}/v1/chat/completions`, {
      model: 'gemma4-legal-iq4xs-direct.gguf',
      messages,
      temperature: 0.1,
      max_tokens: 420,
      response_format: { type: 'json_object' },
    }, 120_000);
    const sanitized = sanitizeGemmaJsonText(data?.choices?.[0]?.message?.content ?? '');
    const content = sanitized.cleaned;
    let parsed = null;
    try {
      parsed = JSON.parse(content);
    } catch {
      parsed = { summary: content };
    }
    return {
      lane: {
        status: content ? 'LIVE_PASS' : 'FAIL',
        url: GEMMA4_URL,
        endpoint: '/v1/chat/completions',
        duration_ms: Date.now() - started,
        thought_blocks_stripped: sanitized.thoughtStripped,
      },
      data: parsed,
    };
  } catch (error) {
    return {
      lane: {
        status: 'FAIL',
        url: GEMMA4_URL,
        endpoint: '/v1/chat/completions',
        duration_ms: Date.now() - started,
        error: error.message,
      },
      data: null,
    };
  }
}

function buildAceEnvelope(envelope, snippets, astRows, langFeatures) {
  return {
    ace_id: `ace:${hash(envelope.envelope_id)}`,
    story_id: envelope.story_id,
    task_id: envelope.task_id,
    worker_id: 'test-gpu-retrieval-summary-fanout',
    feature_id: envelope.feature_id,
    feature_label: envelope.feature_label,
    domain_class: envelope.domain_class,
    ontology_label: envelope.ontology_label,
    topology_label: envelope.topology_label,
    source_refs: snippets.map((item) => ({
      packet_key: item.packet_key,
      source_ref: item.source_ref,
      feature_id: item.feature_id,
      rrf_score: item.rrf_score,
    })),
    retrieval_path: envelope.retrieval?.strategy ? [envelope.retrieval.strategy] : [],
    cache_namespace: 'bifrost:summary-envelope',
    ast_symbols: astRows.flatMap((row) => row.symbols.map((symbol) => ({ source_ref: row.source_ref, ...symbol }))).slice(0, 80),
    langextract_features: langFeatures,
    provenance: {
      parent_envelope_id: envelope.envelope_id,
      packet_identity_mutated: false,
      generated_at: nowIso(),
    },
  };
}

function buildSeeds(aceEnvelope, gemmaSummary) {
  return aceEnvelope.source_refs.map((ref, index) => ({
    seed_id: `seed:${hash(`${aceEnvelope.ace_id}:${ref.packet_key ?? ref.source_ref}`)}`,
    ace_id: aceEnvelope.ace_id,
    packet_key: ref.packet_key,
    source_ref: ref.source_ref,
    feature_id: ref.feature_id ?? aceEnvelope.feature_id,
    feature_label: aceEnvelope.feature_label,
    domain_class: gemmaSummary?.domain_class ?? aceEnvelope.domain_class,
    ontology_label: gemmaSummary?.ontology_label ?? aceEnvelope.ontology_label,
    topology_label: aceEnvelope.topology_label,
    clustering_label: gemmaSummary?.clustering_label ?? aceEnvelope.topology_label,
    rank: index + 1,
    rrf_score: ref.rrf_score,
    embedding_source: 'summary_envelope+ast+langextract',
    kmeans_ready: true,
    som20x20_ready: true,
    ae_train_ready: false,
    identity_mutated: false,
  }));
}

function markdown(report) {
  return `# GPU Retrieval Summary Fan-out Proof

- status: ${report.status}
- input: \`${path.relative(REPO_ROOT, INPUT).replace(/\\/g, '/')}\`
- ACE output: \`${path.relative(REPO_ROOT, OUT_ACE).replace(/\\/g, '/')}\`
- KMeans/SOM seed output: \`${path.relative(REPO_ROOT, OUT_SEEDS).replace(/\\/g, '/')}\`
- source refs tested: ${report.summary.source_refs_tested}
- ACE envelopes: ${report.summary.ace_envelopes}
- clustering seeds: ${report.summary.clustering_seeds}

## Lanes

| Lane | Status | Detail |
|---|---:|---|
| envelope_read | ${report.lanes.envelope_read.status} | rows=${report.lanes.envelope_read.rows} |
| source_file_read | ${report.lanes.source_file_read.status} | existing=${report.lanes.source_file_read.existing}/${report.lanes.source_file_read.checked} |
| ast_structural_pass | ${report.lanes.ast_structural_pass.status} | symbols=${report.lanes.ast_structural_pass.symbols} |
| langextract | ${report.lanes.langextract.status} | features=${report.lanes.langextract.feature_count ?? 0} |
| ace_envelope | ${report.lanes.ace_envelope.status} | packet_identity_mutated=${report.lanes.ace_envelope.packet_identity_mutated} |
| gemma4_summary | ${report.lanes.gemma4_summary.status} | duration_ms=${report.lanes.gemma4_summary.duration_ms ?? 0} |
| kmeans_som_seeds | ${report.lanes.kmeans_som_seeds.status} | rows=${report.lanes.kmeans_som_seeds.rows} |

## Gemma4 Summary

${report.gemma4_summary?.summary ?? 'No summary produced.'}

## Next

Use \`${path.relative(REPO_ROOT, OUT_SEEDS).replace(/\\/g, '/')}\` as the bounded derived input for KMeans/SOM 20x20 clustering. Keep AE/SOM training gated until summary and feature-envelope coverage is intentionally widened.
`;
}

async function main() {
  const startedAt = nowIso();
  const envelopes = readNdjson(INPUT);
  const envelope = envelopes[0];
  const lanes = {
    envelope_read: {
      status: envelope ? 'LIVE_PASS' : 'FAIL',
      rows: envelopes.length,
      input: path.relative(REPO_ROOT, INPUT).replace(/\\/g, '/'),
    },
  };

  if (!envelope) {
    const report = { status: 'FAIL', started_at: startedAt, generated_at: nowIso(), lanes, summary: {} };
    writeJson(OUT_JSON, report);
    fs.writeFileSync(OUT_MD, markdown(report), 'utf8');
    process.exitCode = 1;
    return;
  }

  const refs = (envelope.source_refs ?? []).slice(0, LIMIT);
  const snippets = refs.map((ref) => {
    const snippet = readSnippet(ref.source_ref);
    return { ...ref, ...snippet, source_ref: normalizeRef(ref.source_ref) };
  });
  lanes.source_file_read = {
    status: snippets.some((item) => item.exists) ? 'LIVE_PASS' : 'FAIL',
    checked: snippets.length,
    existing: snippets.filter((item) => item.exists).length,
  };

  const astRows = snippets.filter((item) => item.exists).map((item) => ({
    source_ref: item.source_ref,
    ...astGrepSymbols(item.source_ref),
  }));
  const symbolCount = astRows.reduce((sum, row) => sum + row.symbols.length, 0);
  lanes.ast_structural_pass = {
    status: symbolCount ? 'LIVE_PASS' : 'WARN',
    files: astRows.length,
    symbols: symbolCount,
    parsers: [...new Set(astRows.map((row) => row.parser))],
  };

  const lang = await langExtract(snippets.filter((item) => item.exists).slice(0, 4));
  lanes.langextract = lang.lane;

  const aceEnvelope = buildAceEnvelope(envelope, snippets, astRows, lang.features);
  lanes.ace_envelope = {
    status: aceEnvelope.source_refs.length && aceEnvelope.ace_id ? 'LIVE_PASS' : 'FAIL',
    packet_identity_mutated: false,
    source_refs: aceEnvelope.source_refs.length,
    ast_symbols: aceEnvelope.ast_symbols.length,
    langextract_features: aceEnvelope.langextract_features.length,
  };

  const gemma = await gemma4Summary(aceEnvelope);
  lanes.gemma4_summary = gemma.lane;

  const seedRows = buildSeeds(aceEnvelope, gemma.data);
  lanes.kmeans_som_seeds = {
    status: seedRows.length ? 'LIVE_PASS' : 'FAIL',
    rows: seedRows.length,
    kmeans_ready: seedRows.filter((row) => row.kmeans_ready).length,
    som20x20_ready: seedRows.filter((row) => row.som20x20_ready).length,
    ae_train_ready: seedRows.filter((row) => row.ae_train_ready).length,
  };

  writeJsonl(OUT_ACE, [aceEnvelope]);
  writeJsonl(OUT_SEEDS, seedRows);

  const laneStatuses = Object.values(lanes).map((lane) => lane.status);
  const status = laneStatuses.includes('FAIL') ? 'FAIL' : (laneStatuses.includes('WARN') ? 'WARN' : 'LIVE_PASS');
  const report = {
    status,
    started_at: startedAt,
    generated_at: nowIso(),
    input: path.relative(REPO_ROOT, INPUT).replace(/\\/g, '/'),
    outputs: {
      ace_envelope_ndjson: path.relative(REPO_ROOT, OUT_ACE).replace(/\\/g, '/'),
      kmeans_som_seed_ndjson: path.relative(REPO_ROOT, OUT_SEEDS).replace(/\\/g, '/'),
    },
    lanes,
    ace_envelope: {
      ace_id: aceEnvelope.ace_id,
      story_id: aceEnvelope.story_id,
      task_id: aceEnvelope.task_id,
      feature_id: aceEnvelope.feature_id,
      source_refs: aceEnvelope.source_refs.length,
      ast_symbols: aceEnvelope.ast_symbols.length,
      langextract_features: aceEnvelope.langextract_features.length,
    },
    gemma4_summary: gemma.data,
    summary: {
      source_refs_tested: snippets.length,
      source_files_found: snippets.filter((item) => item.exists).length,
      ace_envelopes: 1,
      clustering_seeds: seedRows.length,
      identity_mutated: false,
    },
  };
  writeJson(OUT_JSON, report);
  fs.writeFileSync(OUT_MD, markdown(report), 'utf8');
  console.log(JSON.stringify({
    status: report.status,
    lanes: Object.fromEntries(Object.entries(report.lanes).map(([key, lane]) => [key, lane.status])),
    outputs: report.outputs,
  }, null, 2));
  if (status === 'FAIL') process.exitCode = 1;
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
