import crypto from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';
import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import path from 'node:path';

const GENERATION_SCHEMA = 'atlas.okf-dev-corpus-generation.v1';
const RECEIPT_SCHEMA = 'atlas.okf-crawl-publication-receipt.v1';

function sha256(value) {
  return crypto.createHash('sha256').update(value).digest('hex');
}

function canonicalJson(value) {
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(',')}]`;
  if (value !== null && typeof value === 'object') {
    return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${canonicalJson(value[key])}`).join(',')}}`;
  }
  return JSON.stringify(value);
}

function resolveContained(root, relativePath) {
  if (typeof relativePath !== 'string') throw new Error('PUBLICATION_PATH_INVALID');
  const absolute = path.isAbsolute(relativePath) ? path.resolve(relativePath) : path.resolve(root, relativePath);
  const relative = path.relative(path.resolve(root), absolute);
  if (!relative || relative.startsWith('..') || path.isAbsolute(relative)) throw new Error('PUBLICATION_PATH_OUTSIDE_ROOT');
  return absolute;
}

function normalizeEntryPath(root, value, validateEntry) {
  const entry = validateEntry(value);
  const absolute = resolveContained(root, entry.markdown_path);
  const markdownPath = path.relative(path.resolve(root), absolute).replaceAll('\\', '/');
  return validateEntry({ ...entry, markdown_path: markdownPath });
}

function assertUniqueEntries(entries, validateEntry) {
  const refs = new Set();
  const urls = new Set();
  const normalized = entries.map((entry) => validateEntry(entry));
  for (const entry of normalized) {
    if (refs.has(entry.source_ref) || urls.has(entry.url)) throw new Error('PUBLICATION_DUPLICATE_ENTRY');
    refs.add(entry.source_ref);
    urls.add(entry.url);
  }
  return normalized;
}

async function verifyPageArtifact(root, page, validateEntry, allowedPages) {
  const entry = normalizeEntryPath(root, page.entry, validateEntry);
  if (new URL(page.url).protocol !== 'https:') throw new Error('PUBLICATION_URL_MUST_USE_HTTPS');
  if (allowedPages && !allowedPages.some((allowed) => allowed.source_id === page.source_id && allowed.url === page.url)) {
    throw new Error('PUBLICATION_PAGE_NOT_ALLOWLISTED');
  }
  if (entry.source_id !== page.source_id || entry.source_ref !== page.source_ref || entry.url !== page.url) {
    throw new Error('PUBLICATION_PAGE_IDENTITY_MISMATCH');
  }
  if (entry.markdown_path !== path.relative(path.resolve(root), resolveContained(root, page.markdown_path)).replaceAll('\\', '/')) {
    throw new Error('PUBLICATION_PAGE_PATH_MISMATCH');
  }
  const markdownPath = resolveContained(root, entry.markdown_path);
  const sidecarPath = markdownPath.replace(/\.md$/i, '.json');
  if (sidecarPath === markdownPath) throw new Error('PUBLICATION_SIDECAR_PATH_INVALID');
  const [markdownBytes, sidecarBytes] = await Promise.all([readFile(markdownPath), readFile(sidecarPath)]);
  const sidecar = JSON.parse(sidecarBytes.toString('utf8'));
  const normalizedSidecar = normalizeEntryPath(root, sidecar, validateEntry);
  if (normalizedSidecar.source_id !== entry.source_id || normalizedSidecar.source_ref !== entry.source_ref || normalizedSidecar.url !== entry.url ||
      normalizedSidecar.markdown_path !== entry.markdown_path || normalizedSidecar.content_hash !== entry.content_hash) {
    throw new Error('PUBLICATION_SIDECAR_IDENTITY_OR_CHECKSUM_MISMATCH');
  }
  if (sha256(markdownBytes) !== entry.content_hash) throw new Error('PUBLICATION_MARKDOWN_CHECKSUM_MISMATCH');
  return { entry, markdown_checksum: sha256(markdownBytes), sidecar_checksum: sha256(sidecarBytes) };
}

export async function publishOkfDevCorpusGenerationV1(input) {
  if (!/^[a-zA-Z0-9][a-zA-Z0-9._-]{0,127}$/.test(input.run_id)) throw new Error('PUBLICATION_RUN_ID_INVALID');
  if (!/^sha256:[a-f0-9]{64}$/.test(input.demand_snapshot_checksum) || !/^sha256:[a-f0-9]{64}$/.test(input.allowlist_checksum)) {
    throw new Error('PUBLICATION_INPUT_CHECKSUM_INVALID');
  }
  const root = path.resolve(input.output_root);
  const publicationsRoot = path.join(root, '.publications');
  const generationPath = path.join(publicationsRoot, input.run_id);
  await mkdir(publicationsRoot, { recursive: true });
  await mkdir(generationPath, { recursive: false });

  const artifactRoot = path.resolve(input.artifact_root ?? root);
  const entries = assertUniqueEntries(input.entries.map((entry) => normalizeEntryPath(artifactRoot, entry, input.validate_entry)), input.validate_entry);
  const pageResults = [];
  const pageInputs = [
    ...input.pages.map((page) => ({ page, allowed_pages: input.allowed_pages })),
    ...(input.retained_pages ?? []).map((page) => ({ page, allowed_pages: null })),
  ];
  for (const { page, allowed_pages: allowedPages } of pageInputs) {
    pageResults.push(await verifyPageArtifact(artifactRoot, page, input.validate_entry, allowedPages));
  }
  const verifiedEntries = new Map();
  for (const { entry } of pageResults) {
    if (verifiedEntries.has(entry.source_ref)) throw new Error('PUBLICATION_DUPLICATE_PAGE_READBACK');
    verifiedEntries.set(entry.source_ref, entry);
  }
  if (verifiedEntries.size !== entries.length || entries.some((entry) => {
    const verified = verifiedEntries.get(entry.source_ref);
    return !verified || verified.source_id !== entry.source_id || verified.url !== entry.url ||
      verified.markdown_path !== entry.markdown_path || verified.content_hash !== entry.content_hash;
  })) throw new Error('PUBLICATION_ENTRY_WITHOUT_VERIFIED_PAGE');
  const corpusText = `${entries.map((entry) => JSON.stringify(entry)).join('\n')}\n`;
  const artifacts = {
    'corpus.jsonl': Buffer.from(corpusText, 'utf8'),
    'index.md': Buffer.from(input.index_markdown, 'utf8'),
    'summary.json': Buffer.from(`${JSON.stringify(input.summary, null, 2)}\n`, 'utf8'),
  };
  for (const [name, bytes] of Object.entries(artifacts)) await writeFile(path.join(generationPath, name), bytes, { flag: 'wx' });

  const readbackEntries = (await readFile(path.join(generationPath, 'corpus.jsonl'), 'utf8'))
    .split(/\r?\n/).filter(Boolean).map((line) => input.validate_entry(JSON.parse(line)));
  assertUniqueEntries(readbackEntries, input.validate_entry);
  const artifactChecksums = {};
  for (const name of Object.keys(artifacts)) {
    const bytes = await readFile(path.join(generationPath, name));
    if (sha256(bytes) !== sha256(artifacts[name])) throw new Error(`PUBLICATION_ARTIFACT_READBACK_MISMATCH:${name}`);
    artifactChecksums[name] = `sha256:${sha256(bytes)}`;
  }
  if (readbackEntries.length !== entries.length) throw new Error('PUBLICATION_CORPUS_ROW_COUNT_MISMATCH');

  const generation = {
    schema: GENERATION_SCHEMA,
    run_id: input.run_id,
    demand_snapshot_checksum: input.demand_snapshot_checksum,
    allowlist_checksum: input.allowlist_checksum,
    entry_count: entries.length,
    selected_count: input.selected_count,
    staged_count: input.pages.length,
    failed_count: 0,
    page_count: pageResults.length,
    artifacts: artifactChecksums,
    page_readbacks: pageResults,
    canonical_authority: false,
  };
  const generationBytes = Buffer.from(`${JSON.stringify(generation, null, 2)}\n`, 'utf8');
  await writeFile(path.join(generationPath, 'manifest.json'), generationBytes, { flag: 'wx' });
  const generationReadback = JSON.parse(await readFile(path.join(generationPath, 'manifest.json'), 'utf8'));
  if (canonicalJson(generationReadback) !== canonicalJson(generation)) throw new Error('PUBLICATION_GENERATION_MANIFEST_READBACK_MISMATCH');

  const pointer = {
    schema: RECEIPT_SCHEMA,
    run_id: input.run_id,
    generation_manifest: path.relative(root, path.join(generationPath, 'manifest.json')).replaceAll('\\', '/'),
    generation_manifest_checksum: `sha256:${sha256(generationBytes)}`,
    counts: { selected: input.selected_count, staged: input.pages.length, validated: pageResults.length, published: pageResults.length, corpus_total: entries.length, failed: 0 },
    checks: { source_identity: 'PASS', official_url: 'PASS', markdown_checksum: 'PASS', sidecar_checksum: 'PASS', generation_readback: 'PASS', pointer_readback: 'PASS' },
    publication_status: 'PUBLISHED_READBACK_VERIFIED',
    canonical_authority: false,
    writes_performed: true,
    persistent_store_writes_performed: false,
  };
  const pointerPath = path.join(root, 'published-current.json');
  const pointerTempPath = path.join(root, `published-current.${input.run_id}.tmp`);
  await writeFile(pointerTempPath, `${JSON.stringify(pointer, null, 2)}\n`, { flag: 'wx' });
  await rename(pointerTempPath, pointerPath);
  const pointerReadback = JSON.parse(await readFile(pointerPath, 'utf8'));
  if (canonicalJson(pointerReadback) !== canonicalJson(pointer)) throw new Error('PUBLICATION_POINTER_READBACK_MISMATCH');

  return {
    schema: RECEIPT_SCHEMA,
    run_id: input.run_id,
    demand_snapshot_checksum: input.demand_snapshot_checksum,
    allowlist_checksum: input.allowlist_checksum,
    counts: pointer.counts,
    checks: pointer.checks,
    generation_manifest_checksum: pointer.generation_manifest_checksum,
    publication_status: 'PUBLISHED_READBACK_VERIFIED',
    canonical_authority: false,
    writes_performed: true,
    persistent_store_writes_performed: false,
  };
}

export async function writeOkfCrawlFailureReceiptV1(input) {
  const receiptRoot = path.resolve(input.receipt_root);
  await mkdir(receiptRoot, { recursive: true });
  const receipt = {
    schema: RECEIPT_SCHEMA,
    run_id: input.run_id,
    demand_snapshot_checksum: input.demand_snapshot_checksum ?? null,
    allowlist_checksum: input.allowlist_checksum ?? null,
    counts: { selected: input.selected_count ?? 0, staged: input.staged_count ?? 0, validated: input.validated_count ?? 0, published: 0, failed: input.failed_count ?? 1 },
    failed_items: input.failed_items ?? [],
    error_category: input.error_category ?? 'UNCLASSIFIED',
    publication_status: 'FAILED_NOT_PUBLISHED',
    canonical_authority: false,
    writes_performed: true,
    persistent_store_writes_performed: false,
  };
  const receiptPath = path.join(receiptRoot, `${input.run_id}.json`);
  await writeFile(receiptPath, `${JSON.stringify(receipt, null, 2)}\n`, { flag: 'wx' });
  const readback = JSON.parse(await readFile(receiptPath, 'utf8'));
  if (canonicalJson(readback) !== canonicalJson(receipt)) throw new Error('FAILURE_RECEIPT_READBACK_MISMATCH');
  return { path: receiptPath, receipt, checksum: `sha256:${sha256(await readFile(receiptPath))}` };
}

export function resolveOkfDevPublishedCorpusV1(root) {
  const pointerPath = path.join(path.resolve(root), 'published-current.json');
  if (!existsSync(pointerPath)) return null;
  const pointerBytes = readFileSync(pointerPath);
  const pointer = JSON.parse(pointerBytes.toString('utf8'));
  if (pointer.schema !== RECEIPT_SCHEMA || pointer.canonical_authority !== false || pointer.publication_status !== 'PUBLISHED_READBACK_VERIFIED') throw new Error('PUBLICATION_POINTER_INVALID');
  const manifestPath = resolveContained(root, pointer.generation_manifest);
  const manifestBytes = readFileSync(manifestPath);
  if (`sha256:${sha256(manifestBytes)}` !== pointer.generation_manifest_checksum) throw new Error('PUBLICATION_GENERATION_CHECKSUM_MISMATCH');
  const generation = JSON.parse(manifestBytes.toString('utf8'));
  if (generation.schema !== GENERATION_SCHEMA || generation.run_id !== pointer.run_id) throw new Error('PUBLICATION_GENERATION_IDENTITY_MISMATCH');
  const corpusPath = path.join(path.dirname(manifestPath), 'corpus.jsonl');
  const artifactPaths = Object.fromEntries(Object.keys(generation.artifacts ?? {}).map((name) => [name, path.join(path.dirname(manifestPath), name)]));
  for (const name of ['corpus.jsonl', 'index.md', 'summary.json']) {
    const artifactPath = artifactPaths[name];
    if (!artifactPath) throw new Error(`PUBLICATION_ARTIFACT_REFERENCE_MISSING:${name}`);
    const bytes = readFileSync(artifactPath);
    if (`sha256:${sha256(bytes)}` !== generation.artifacts[name]) throw new Error(`PUBLICATION_ARTIFACT_CHECKSUM_MISMATCH:${name}`);
  }
  return { pointer, generation, corpusPath, indexPath: artifactPaths['index.md'], summaryPath: artifactPaths['summary.json'] };
}
