import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const outputDirectory = path.join(repoRoot, '.tmp', 'atlas');
const model = 'embeddinggemma:latest';
const endpoint = 'http://127.0.0.1:11434/api/embed';
const searchArgs = [
  '--files', '--hidden',
  '-g', '*.sql',
  '-g', '!**/.git/**', '-g', '!**/node_modules/**', '-g', '!**/.tmp/**',
  '-g', '!**/vendor/**', '-g', '!**/build/**', '-g', '!**/dist/**'
];
const maxCharactersPerFile = 5500;
const defaultBatchSize = 16;
const defaultSimilarityThreshold = 0.84;

function sha256(value) {
  return createHash('sha256').update(value).digest('hex');
}

export function sanitizeSqlForEmbedding(sql, filePath, maxCharacters = maxCharactersPerFile) {
  if (sql.includes('\0')) return { text: '', binary: true, truncated: false };
  let text = sql
    .replace(/\/\*[\s\S]*?\*\//g, ' ')
    .replace(/--[^\r\n]*/g, ' ')
    .replace(/\$([A-Za-z_][A-Za-z0-9_]*)\$[\s\S]*?\$\1\$/g, ' <body> ')
    .replace(/\$\$[\s\S]*?\$\$/g, ' <body> ')
    .replace(/(?:\b(?:E|N|U&))?'(?:''|\\.|[^'])*'/gi, ' <string-literal> ')
    .replace(/\b\d+(?:\.\d+)?\b/g, ' <number> ')
    .replace(/\s+/g, ' ')
    .trim();
  const prefix = `SQL file path ${filePath.replace(/\\/g, '/')} ; `;
  const remaining = Math.max(0, maxCharacters - prefix.length);
  const truncated = text.length > remaining;
  text = `${prefix}${text.slice(0, remaining)}`;
  return { text, binary: false, truncated };
}

export function categorizeSqlPath(filePath) {
  const normalized = filePath.replace(/\\/g, '/').toLowerCase();
  const name = path.posix.basename(normalized);
  if (/test|fixture|sample|example/.test(normalized)) return 'tests-fixtures-examples';
  if (/drizzle\/manual|manual\/|proposed|draft/.test(normalized)) return 'manual-or-proposed-ddl';
  if (/drizzle\/migrations|\/migrations?\/|_journal|snapshot/.test(normalized)) return 'registered-or-versioned-migration-candidate';
  if (/index|hnsw|ivfflat|gin|gist|btree/.test(name)) return 'index-or-query-performance';
  if (/backfill|seed|populate|import|repair|reconcile/.test(name)) return 'data-transform-or-backfill';
  if (/function|procedure|trigger|view|policy|rls/.test(name)) return 'database-programmability-or-policy';
  if (/schema|table|column|constraint|extension/.test(name)) return 'schema-definition-or-extension';
  return 'other-sql';
}

export function cosineSimilarity(left, right) {
  if (left.length !== right.length || left.length === 0) return Number.NEGATIVE_INFINITY;
  let dot = 0;
  let leftNorm = 0;
  let rightNorm = 0;
  for (let index = 0; index < left.length; index += 1) {
    const a = left[index];
    const b = right[index];
    dot += a * b;
    leftNorm += a * a;
    rightNorm += b * b;
  }
  if (leftNorm === 0 || rightNorm === 0) return Number.NEGATIVE_INFINITY;
  return dot / Math.sqrt(leftNorm * rightNorm);
}

export function buildSimilarityGroups(records, threshold = defaultSimilarityThreshold, neighborsPerFile = 3) {
  const parents = records.map((_, index) => index);
  const find = (index) => {
    let current = index;
    while (parents[current] !== current) {
      parents[current] = parents[parents[current]];
      current = parents[current];
    }
    return current;
  };
  const join = (left, right) => {
    const rootLeft = find(left);
    const rootRight = find(right);
    if (rootLeft !== rootRight) parents[rootRight] = rootLeft;
  };
  const neighborLists = records.map(() => []);
  for (let left = 0; left < records.length; left += 1) {
    for (let right = left + 1; right < records.length; right += 1) {
      const similarity = cosineSimilarity(records[left].vector, records[right].vector);
      if (!Number.isFinite(similarity)) continue;
      if (similarity >= threshold) join(left, right);
      neighborLists[left].push({ index: right, similarity });
      neighborLists[right].push({ index: left, similarity });
    }
  }
  const groups = new Map();
  for (let index = 0; index < records.length; index += 1) {
    const root = find(index);
    const group = groups.get(root) ?? [];
    group.push(index);
    groups.set(root, group);
  }
  const neighbors = neighborLists.map((items) => items
    .sort((left, right) => right.similarity - left.similarity)
    .slice(0, neighborsPerFile)
    .map(({ index, similarity }) => ({ path: records[index].path, similarity: Number(similarity.toFixed(4)) })));
  return {
    groups: [...groups.values()].filter((members) => members.length > 1).map((members) => members.map((index) => records[index].path)),
    neighbors
  };
}

function getSqlFiles() {
  const output = execFileSync('rg', searchArgs, { cwd: repoRoot, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], timeout: 30000, maxBuffer: 32 * 1024 * 1024 });
  return output.split(/\r?\n/).filter(Boolean).map((filePath) => filePath.replace(/\\/g, '/')).sort();
}

async function embedTexts(texts, batchSize) {
  const vectors = [];
  for (let offset = 0; offset < texts.length; offset += batchSize) {
    const batch = texts.slice(offset, offset + batchSize);
    const response = await fetch(endpoint, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ model, input: batch }),
      signal: AbortSignal.timeout(120000)
    });
    if (!response.ok) throw new Error(`EMBEDDING_HTTP_${response.status}: batch ${Math.floor(offset / batchSize) + 1}`);
    const payload = await response.json();
    if (payload.model !== model || !Array.isArray(payload.embeddings) || payload.embeddings.length !== batch.length) {
      throw new Error(`EMBEDDING_RESPONSE_SHAPE_INVALID: batch ${Math.floor(offset / batchSize) + 1}`);
    }
    for (const vector of payload.embeddings) {
      if (!Array.isArray(vector) || vector.length !== 768 || vector.some((value) => !Number.isFinite(value))) {
        throw new Error('EMBEDDING_VECTOR_CONTRACT_INVALID');
      }
      vectors.push(Float32Array.from(vector));
    }
    process.stdout.write(`Embedded ${Math.min(offset + batch.length, texts.length)}/${texts.length} SQL files locally\n`);
  }
  return vectors;
}

function parseArgs(argv) {
  const options = { batchSize: defaultBatchSize, threshold: defaultSimilarityThreshold };
  for (const arg of argv) {
    if (arg.startsWith('--batch-size=')) options.batchSize = Number(arg.slice(13));
    else if (arg.startsWith('--threshold=')) options.threshold = Number(arg.slice(12));
    else throw new Error(`UNKNOWN_ARGUMENT:${arg}`);
  }
  if (!Number.isInteger(options.batchSize) || options.batchSize < 1 || options.batchSize > 32) throw new Error('BATCH_SIZE_OUT_OF_RANGE');
  if (!Number.isFinite(options.threshold) || options.threshold < 0.5 || options.threshold > 0.99) throw new Error('SIMILARITY_THRESHOLD_OUT_OF_RANGE');
  return options;
}

function markdownReport({ records, groups, neighbors, threshold, generatedAt }) {
  const groupByPath = new Map();
  groups.forEach((members, index) => members.forEach((filePath) => groupByPath.set(filePath, index + 1)));
  const categoryCounts = new Map();
  for (const record of records) categoryCounts.set(record.category, (categoryCounts.get(record.category) ?? 0) + 1);
  const lines = [
    '# Repository SQL Inventory — EmbeddingGemma Context Map',
    '',
    `Generated: ${generatedAt}  `,
    `Discovered files: ${records.length}; semantic similarity threshold: ${threshold}; model: \`${model}\` (local Ollama at 127.0.0.1:11434).`,
    '',
    '## Safety and interpretation',
    '- Embeddings were generated from SQL after removing line/block comments, quoted string literals, dollar-quoted bodies, and numeric literals. Path and SQL identifiers/keywords remain in the local input.',
    '- Vectors existed only in process memory. No SQL body, vector, database, Qdrant collection, or model cache was written by this script.',
    '- Similarity groups are navigation hints, not duplicate detection, migration order, schema ownership, or permission to apply/merge/drop SQL.',
    '- Files ignored by ripgrep or under `.git`, `node_modules`, `.tmp`, `vendor`, `build`, and `dist` are excluded; this is a repo source inventory, not a filesystem forensic scan.',
    '',
    '## Category counts',
    ''
  ];
  for (const [category, count] of [...categoryCounts].sort((left, right) => right[1] - left[1] || left[0].localeCompare(right[0]))) lines.push(`- ${category}: ${count}`);
  lines.push('', '## Semantic similarity groups', '');
  if (groups.length === 0) lines.push(`No multi-file group met the ${threshold} similarity threshold.`, '');
  groups.forEach((members, index) => {
    lines.push(`### Group ${index + 1} (${members.length} files)`, '');
    for (const member of members) lines.push(`- \`${member}\``);
    lines.push('');
  });
  lines.push('## Complete file index', '', '| # | Category | Similarity group | Size | SHA-256 | File | Nearest semantic neighbors |', '|---:|---|---:|---:|---|---|---|');
  records.forEach((record, index) => {
    const nearest = neighbors[index].map((neighbor) => `\`${neighbor.path}\` (${neighbor.similarity})`).join('<br>') || '—';
    lines.push(`| ${index + 1} | ${record.category} | ${groupByPath.get(record.path) ?? '—'} | ${record.sizeBytes} B${record.truncated ? ' (embedded prefix)' : ''} | \`${record.sha256}\` | \`${record.path}\` | ${nearest} |`);
  });
  lines.push('', '---', 'No SQL files were executed or modified.', '');
  return lines.join('\n');
}

export async function organizeSqlFiles(options = {}) {
  const { batchSize = defaultBatchSize, threshold = defaultSimilarityThreshold } = options;
  const files = getSqlFiles();
  const records = [];
  const embeddingTexts = [];
  for (const filePath of files) {
    const absolutePath = path.resolve(repoRoot, filePath);
    if (!existsSync(absolutePath)) continue;
    const bytes = readFileSync(absolutePath);
    const source = bytes.toString('utf8');
    const scrubbed = sanitizeSqlForEmbedding(source, filePath);
    if (scrubbed.binary || scrubbed.text.length === 0) continue;
    records.push({ path: filePath, sizeBytes: bytes.length, sha256: sha256(bytes), category: categorizeSqlPath(filePath), truncated: scrubbed.truncated });
    embeddingTexts.push(scrubbed.text);
  }
  if (!records.length) throw new Error('NO_EMBEDDABLE_SQL_FILES');
  const vectors = await embedTexts(embeddingTexts, batchSize);
  const semantic = buildSimilarityGroups(records.map((record, index) => ({ ...record, vector: vectors[index] })), threshold);
  const generatedAt = new Date().toISOString();
  const manifest = {
    schema: 'AtlasSqlSemanticInventoryV1',
    generatedAt,
    root: '.',
    filesScanned: records.length,
    embedding: { model, endpoint, dimensions: 768, threshold, vectorsPersisted: false, inputPolicy: 'SQL comments and literal values scrubbed; path and identifiers retained' },
    similarityGroupCount: semantic.groups.length,
    filesInSimilarityGroups: semantic.groups.reduce((sum, group) => sum + group.length, 0),
    groups: semantic.groups,
    files: records.map((record, index) => ({ ...record, similarityGroup: semantic.groups.findIndex((group) => group.includes(record.path)) + 1 || null, nearestNeighbors: semantic.neighbors[index] }))
  };
  mkdirSync(outputDirectory, { recursive: true });
  const jsonPath = path.join(outputDirectory, 'sql-file-inventory-embeddinggemma-v1.json');
  const markdownPath = path.join(outputDirectory, 'sql-file-inventory-embeddinggemma-v1.md');
  writeFileSync(jsonPath, `${JSON.stringify(manifest, null, 2)}\n`, 'utf8');
  writeFileSync(markdownPath, `${markdownReport({ records, groups: semantic.groups, neighbors: semantic.neighbors, threshold, generatedAt })}\n`, 'utf8');
  return { jsonPath, markdownPath, filesScanned: records.length, groupCount: semantic.groups.length, groupedFiles: manifest.filesInSimilarityGroups, model, dimensions: 768, vectorsPersisted: false };
}

if (process.argv[1] && pathToFileURL(path.resolve(process.argv[1])).href === import.meta.url) {
  try {
    const options = parseArgs(process.argv.slice(2));
    const summary = await organizeSqlFiles(options);
    process.stdout.write(`${JSON.stringify(summary, null, 2)}\n`);
  } catch (error) {
    process.stderr.write(`${error.message}\n`);
    process.exitCode = 1;
  }
}
