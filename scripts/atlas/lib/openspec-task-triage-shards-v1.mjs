import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import { dirname, isAbsolute, relative, resolve, sep } from 'node:path';

const TRIAGE_SCHEMA = 'atlas.openspec-task-triage-corpus.v1';
const SHARD_SCHEMA = 'atlas.openspec-task-triage-shard-manifest.v1';
const sha256 = (value) => `sha256:${createHash('sha256').update(value, 'utf8').digest('hex')}`;

function safeShardPath(manifestPath, shardPath) {
  if (typeof shardPath !== 'string' || isAbsolute(shardPath)) throw new Error('TRIAGE_SHARD_PATH_INVALID');
  const target = resolve(dirname(manifestPath), shardPath);
  const rel = relative(dirname(manifestPath), target);
  if (!rel || rel === '..' || rel.startsWith(`..${sep}`) || isAbsolute(rel)) throw new Error('TRIAGE_SHARD_PATH_INVALID');
  return target;
}

export function writeTaskTriageShardsV1(corpus, outputPath, maxShardBytes = 2_000_000) {
  if (corpus?.schema !== TRIAGE_SCHEMA || !Array.isArray(corpus.taskCardCorpus?.cards)) {
    throw new Error('TRIAGE_SHARD_CORPUS_INVALID');
  }
  if (!Number.isSafeInteger(maxShardBytes) || maxShardBytes < 1024 || maxShardBytes >= 10_000_000) {
    throw new Error('TRIAGE_SHARD_LIMIT_INVALID');
  }

  const { cards, ...taskCardCorpus } = corpus.taskCardCorpus;
  const corpusBody = { ...corpus, taskCardCorpus };
  const rowsDigest = createHash('sha256');
  for (const card of cards) rowsDigest.update(`${JSON.stringify(card)}\n`, 'utf8');
  const rowsChecksum = `sha256:${rowsDigest.digest('hex')}`;
  const contentKey = sha256(`${JSON.stringify(corpusBody)}\n${rowsChecksum}`).slice(7, 27);
  const shardDirectory = `${outputPath}.shards-${contentKey}`;
  mkdirSync(shardDirectory, { recursive: true });

  const shards = [];
  let rows = [];
  let rowBytes = 0;
  const flush = () => {
    const data = rows.join('');
    const fileName = `part-${String(shards.length).padStart(4, '0')}.jsonl`;
    const shardPath = resolve(shardDirectory, fileName);
    if (existsSync(shardPath)) {
      if (readFileSync(shardPath, 'utf8') !== data) throw new Error(`TRIAGE_SHARD_CONTENT_CONFLICT:${fileName}`);
    } else {
      writeFileSync(shardPath, data, { encoding: 'utf8', flag: 'wx' });
    }
    shards.push({
      path: relative(dirname(outputPath), shardPath).split(sep).join('/'),
      rowCount: rows.length,
      bytes: Buffer.byteLength(data),
      checksum: sha256(data),
    });
    rows = [];
    rowBytes = 0;
  };

  for (const card of cards) {
    const row = `${JSON.stringify(card)}\n`;
    const bytes = Buffer.byteLength(row);
    if (bytes > maxShardBytes) throw new Error('TRIAGE_ROW_EXCEEDS_SHARD_LIMIT');
    if (rows.length > 0 && rowBytes + bytes > maxShardBytes) flush();
    rows.push(row);
    rowBytes += bytes;
  }
  if (rows.length > 0 || shards.length === 0) flush();

  const manifestBody = {
    schema: SHARD_SCHEMA,
    corpusSchema: TRIAGE_SCHEMA,
    corpus: corpusBody,
    rowCount: cards.length,
    rowsChecksum,
    shardCount: shards.length,
    shards,
  };
  const manifest = { ...manifestBody, checksum: sha256(JSON.stringify(manifestBody)) };
  const serialized = `${JSON.stringify(manifest)}\n`;
  if (Buffer.byteLength(serialized) >= 10_000_000) throw new Error('TRIAGE_SHARD_MANIFEST_OVER_LIMIT');

  mkdirSync(dirname(outputPath), { recursive: true });
  if (!existsSync(outputPath) || readFileSync(outputPath, 'utf8') !== serialized) {
    const tempPath = `${outputPath}.next-${process.pid}-${Date.now()}`;
    writeFileSync(tempPath, serialized, { encoding: 'utf8', flag: 'wx' });
    try {
      renameSync(tempPath, outputPath);
    } catch (error) {
      if (!existsSync(outputPath) || readFileSync(outputPath, 'utf8') !== serialized) throw error;
    }
  }

  const readback = loadTaskTriageCorpusV1(outputPath);
  if (readback.taskCardCorpus.cards.length !== cards.length
    || JSON.stringify(readback.taskCardCorpus.cards) !== JSON.stringify(cards)) {
    throw new Error('TRIAGE_SHARD_READBACK_MISMATCH');
  }
  return { rowCount: cards.length, shardCount: shards.length, manifestBytes: Buffer.byteLength(serialized), checksum: manifest.checksum, rowsChecksum };
}

export function loadTaskTriageCorpusV1(inputPath) {
  const parsed = JSON.parse(readFileSync(inputPath, 'utf8'));
  if (parsed?.schema === TRIAGE_SCHEMA) return parsed;
  if (parsed?.schema !== SHARD_SCHEMA || parsed.corpusSchema !== TRIAGE_SCHEMA || !Array.isArray(parsed.shards)) {
    throw new Error('TRIAGE_CORPUS_SCHEMA_UNSUPPORTED');
  }
  const { checksum, ...manifestBody } = parsed;
  if (checksum !== sha256(JSON.stringify(manifestBody))) throw new Error('TRIAGE_SHARD_MANIFEST_CHECKSUM_MISMATCH');
  const cards = [];
  const rowsDigest = createHash('sha256');
  for (const shard of parsed.shards) {
    const shardPath = safeShardPath(inputPath, shard.path);
    const data = readFileSync(shardPath, 'utf8');
    if (Buffer.byteLength(data) !== shard.bytes || sha256(data) !== shard.checksum) {
      throw new Error(`TRIAGE_SHARD_CHECKSUM_MISMATCH:${shard.path}`);
    }
    rowsDigest.update(data, 'utf8');
    const rows = data.split('\n').filter(Boolean).map((line) => JSON.parse(line));
    if (rows.length !== shard.rowCount) throw new Error(`TRIAGE_SHARD_ROW_COUNT_MISMATCH:${shard.path}`);
    cards.push(...rows);
  }
  if (cards.length !== parsed.rowCount) throw new Error('TRIAGE_SHARD_TOTAL_ROW_COUNT_MISMATCH');
  if (`sha256:${rowsDigest.digest('hex')}` !== parsed.rowsChecksum) throw new Error('TRIAGE_SHARD_ROWS_CHECKSUM_MISMATCH');
  return {
    ...parsed.corpus,
    schema: parsed.corpusSchema,
    taskCardCorpus: { ...parsed.corpus.taskCardCorpus, cards },
  };
}
