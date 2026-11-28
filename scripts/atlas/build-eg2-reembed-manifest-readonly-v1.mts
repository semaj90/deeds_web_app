/**
 * EG2-RE-01: list the chunks eligible for the EG2 re-embed. Read-only; no embedding, no datastore writes.
 * Eligible = the exact indexed path still contains the chunk text (line endings normalised).
 * No path fallback. This is a disk-text match, not source-revision or workspace-currentness proof.
 * Run from the repo root: npx tsx scripts/atlas/build-eg2-reembed-manifest-readonly-v1.mts
 */
import { execFileSync, spawn } from 'node:child_process';
import { createHash } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import readline from 'node:readline';
import * as representation from '../../sveltekit-frontend/src/lib/server/atlas/embedding/embeddinggemma-task-representation-v1.ts';

const shared: typeof representation = (representation as any).default ?? representation;
const ROOT = process.cwd();
const TOKENIZE_URL = 'http://127.0.0.1:8094/tokenize';
const MAX_CHARS = 8000;
const stamp = new Date().toISOString().replace(/[-:.]/g, '');
const OUT = path.join(ROOT, '.tmp/review', `eg2-reembed-manifest-${stamp}`);

type Row = { id: string; path: string; hash: string | null; content: string };
type Entry = {
  id: string; relativePath: string; chunkContentHash: string | null; inputSha256: string;
  inputChars: number; exceedsServerCharLimit: boolean; tokens: number | null; truncatedAt512: boolean | null;
};

const lf = (text: string) => text.replace(/\r\n/g, '\n');
const files = new Map<string, string | null>();
function readExact(relative: string): string | null {
  let text = files.get(relative);
  if (text === undefined) {
    const full = path.resolve(ROOT, relative);
    text = null;
    if (full.startsWith(ROOT + path.sep)) {
      try { text = lf(fs.readFileSync(full, 'utf8')); } catch { /* absent or unreadable */ }
    }
    files.set(relative, text);
  }
  return text;
}

async function main() {
  fs.mkdirSync(OUT, { recursive: true });
  const sql = `BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY;
    SELECT json_build_object('id', id, 'path', relative_path, 'hash', content_hash, 'content', content)
      FROM codebase_chunk_index WHERE content IS NOT NULL AND btrim(content) <> '' ORDER BY id;
    COMMIT;`;
  const child = spawn('docker', ['exec', 'legal-ai-postgres', 'psql', '-U', 'legal_admin', '-d', 'legal_ai_db', '-qAt', '-v', 'ON_ERROR_STOP=1', '--set=FETCH_COUNT=2000', '-c', sql], { stdio: ['ignore', 'pipe', 'inherit'] });
  const exited = new Promise<number | null>((resolve) => child.once('close', resolve));

  const eligible: Entry[] = [];
  const texts: string[] = [];
  const elsewhere: { id: string; relativePath: string; chunkContentHash: string | null }[] = [];
  const indexed = new Set<string>();
  const counts = { rows: 0, blankContent: 0,eligible: 0, textNotFound: 0, fileAbsent: 0, absentButMatchesUnderFrontend: 0, recipeMismatch: 0 };

  for await (const line of readline.createInterface({ input: child.stdout!, crlfDelay: Infinity })) {
    if (!line.startsWith('{')) continue;
    const row = JSON.parse(line) as Row;
    counts.rows += 1;
    indexed.add(`${row.path}\0${row.hash}`);
    const needle = lf(row.content).trim();
    if (!needle) { counts.blankContent += 1; continue; } // SQL btrim keeps newline/tab-only rows
    const file = readExact(row.path);
    if (file === null) {
      counts.fileAbsent += 1;
      if (readExact(`sveltekit-frontend/${row.path}`)?.includes(needle)) {
        counts.absentButMatchesUnderFrontend += 1;
        elsewhere.push({ id: row.id, relativePath: row.path, chunkContentHash: row.hash });
      }
      continue;
    }
    if (!file.includes(needle)) { counts.textNotFound += 1; continue; }
    counts.eligible += 1;
    const formatted = shared.encodeRetrievalDocument(row.content, row.path);
    if (formatted.formattedText !== `title: ${row.path} | text: ${row.content.trim()}`) counts.recipeMismatch += 1;
    eligible.push({
      id: row.id, relativePath: row.path, chunkContentHash: row.hash,
      inputSha256: createHash('sha256').update(formatted.formattedText, 'utf8').digest('hex'),
      inputChars: formatted.formattedText.length,
      exceedsServerCharLimit: formatted.formattedText.length > MAX_CHARS,
      tokens: null, truncatedAt512: null,
    });
    texts.push(formatted.formattedText);
  }
  const code = await exited;
  if (code !== 0) throw new Error(`PSQL_EXIT_${code}`);
  console.log(`[manifest] ${JSON.stringify(counts)}`);

  // Token counts from the running CPU EG2 server's tokenizer (tokenize only, no embedding).
  let tokenizer: Record<string, unknown> = { url: TOKENIZE_URL, status: 'COUNTED' };
  try {
    for (let i = 0; i < texts.length; i += 32) {
      const response = await fetch(TOKENIZE_URL, {
        method: 'POST', headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ texts: texts.slice(i, i + 32) }), signal: AbortSignal.timeout(60_000),
      });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const body = await response.json() as { token_counts: number[]; model_id: string; max_tokens: number };
      if (body.max_tokens !== 512 || body.token_counts.length !== Math.min(32, texts.length - i)) throw new Error('UNEXPECTED_TOKENIZE_RESPONSE');
      body.token_counts.forEach((n, k) => { eligible[i + k].tokens = n; eligible[i + k].truncatedAt512 = n > 512; });
      tokenizer.modelId = body.model_id;
      if (i % 32_000 === 0) console.log(`[manifest] tokenized ${i}/${texts.length}`);
    }
  } catch (error) {
    tokenizer = { url: TOKENIZE_URL, status: 'INCOMPLETE', error: (error as Error).message };
  }

  const write = (name: string, rows: unknown[]) => {
    const body = rows.map((r) => JSON.stringify(r)).join('\n') + '\n';
    fs.writeFileSync(path.join(OUT, name), body);
    return { name, rows: rows.length, sha256: createHash('sha256').update(body).digest('hex') };
  };
  const receipt = {
    schema: 'atlas.eg2-reembed-manifest.v1',
    generatedAt: new Date().toISOString(),
    command: 'npx tsx scripts/atlas/build-eg2-reembed-manifest-readonly-v1.mts',
    commit: execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim(),
    scriptSha256: createHash('sha256').update(fs.readFileSync(path.join(ROOT, 'scripts/atlas/build-eg2-reembed-manifest-readonly-v1.mts'))).digest('hex'),
    canonicalAuthority: false,
    writesPerformed: false,
    eligibilityRule: 'exact indexed path contains trimmed chunk text, CRLF normalised; no path fallback',
    notProven: ['source revision', 'workspace currentness', 'chunk boundaries still match the current parser', 'coverage of files not in the index'],
    promptRevision: shared.EMBEDDINGGEMMA_PROMPT_REVISION_V1,
    counts: {
      ...counts,
      eligibleFiles: new Set(eligible.map((e) => e.relativePath)).size,
      exceedsServerCharLimit: eligible.filter((e) => e.exceedsServerCharLimit).length,
      truncatedAt512: tokenizer.status === 'COUNTED' ? eligible.filter((e) => e.truncatedAt512).length : null,
      excludedElsewhereAlsoIndexedUnderFrontend: elsewhere.filter((e) => indexed.has(`sveltekit-frontend/${e.relativePath}\0${e.chunkContentHash}`)).length,
    },
    tokenizer,
    artifacts: [write('eligible.ndjson', eligible), write('excluded-matches-under-frontend.ndjson', elsewhere)],
  };
  fs.writeFileSync(path.join(OUT, 'receipt.json'), `${JSON.stringify(receipt, null, 2)}\n`);
  console.log(JSON.stringify(receipt, null, 2));
  console.log(`[manifest] receipt ${path.join(OUT, 'receipt.json')}`);
}

main().catch((error) => { console.error(error); process.exit(1); });
