import dotenv from 'dotenv';
dotenv.config();

const QDRANT_URL = process.env.QDRANT_URL ?? 'http://127.0.0.1:6333';
const QDRANT_COLL = process.env.QDRANT_COLLECTION ?? 'codebase_chunks_768';

function normalizeRepoPath(value) {
  if (!value || typeof value !== 'string') return null;
  return value
    .replace(/\\/g, '/')
    .replace(/^.*?\/sveltekit-frontend\//, '')
    .replace(/^.*?\/src\//, 'src/')
    .replace(/^\.\/+/, '')
    .trim();
}

function getPayloadPath(payload = {}) {
  return (
    payload.file_path ??
    payload.filePath ??
    payload.relativePath ??
    payload.relative_path ??
    payload.path ??
    payload.source_path ??
    payload.source ??
    payload.file ??
    payload.filepath ??
    payload.stable_key ??
    payload.stableKey ??
    null
  );
}

function buildPayloadAliases(payload = {}) {
  const path = getPayloadPath(payload);
  const norm = normalizeRepoPath(path);
  return [
    path,
    norm,
    payload.stableKey,
    payload.stable_key,
    payload.relativePath,
    payload.relative_path,
    payload.filePath,
    payload.file_path,
  ].filter(Boolean);
}

function expandPathAliases(fp) {
  if (!fp) return [];
  const norm = normalizeRepoPath(fp);
  const variants = new Set([fp, norm]);
  if (norm.startsWith('$lib/'))  variants.add('src/lib/' + norm.slice('$lib/'.length));
  if (norm.startsWith('~lib/'))  variants.add('src/lib/' + norm.slice('~lib/'.length));
  if (norm.startsWith('@lib/'))  variants.add('src/lib/' + norm.slice('@lib/'.length));
  if (norm.startsWith('src/lib/')) variants.add('$lib/' + norm.slice('src/lib/'.length));
  if (norm.startsWith('src/')) variants.add(norm.slice('src/'.length));
  return [...variants];
}

function addQdrantAlias(index, rawKey, pointId) {
  const key = normalizeRepoPath(rawKey);
  if (!key) return;
  let s = index.get(key);
  if (!s) { s = new Set(); index.set(key, s); }
  s.add(pointId);
}

async function testIndex() {
  console.log('Testing codebase_chunks_768 index build...');
  console.log('QDRANT_URL:', QDRANT_URL);
  console.log('QDRANT_COLL:', QDRANT_COLL);

  const index = new Map();
  let offset = null;
  let collected = 0;
  
  const r = await fetch(`${QDRANT_URL}/collections/${QDRANT_COLL}/points/scroll`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      limit: 50,
      with_payload: true,
      with_vector: false,
    }),
  });
  if (!r.ok) {
    console.error('Fetch failed:', r.status);
    return;
  }
  const d = await r.json();
  const pts = d.result?.points ?? [];
  console.log('Fetched sample points count:', pts.length);
  if (pts.length > 0) {
    console.log('Sample point payload keys:', Object.keys(pts[0].payload));
    console.log('Sample getPayloadPath:', getPayloadPath(pts[0].payload));
    console.log('Sample buildPayloadAliases:', buildPayloadAliases(pts[0].payload));
  }

  for (const pt of pts) {
    for (const alias of buildPayloadAliases(pt.payload)) {
      addQdrantAlias(index, alias, pt.id);
      for (const expanded of expandPathAliases(alias)) {
        addQdrantAlias(index, expanded, pt.id);
      }
    }
  }

  console.log('Index unique paths count:', index.size);
  console.log('Index sample keys:', [...index.keys()].slice(0, 10));
}

testIndex();
