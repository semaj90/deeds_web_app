const SCHEMA = 'atlas.artifact-fingerprint-cache.v1';
const DIGEST = /^[a-f0-9]{64}$/;
const FIELDS = ['dev', 'ino', 'sizeBytes', 'mtimeNs', 'ctimeNs'];

export function emptyArtifactFingerprintCacheV1() {
  return { schema: SCHEMA, entries: {} };
}

export function parseArtifactFingerprintCacheV1(value) {
  if (value === null || typeof value !== 'object' || value.schema !== SCHEMA
    || value.entries === null || typeof value.entries !== 'object' || Array.isArray(value.entries)) {
    throw new Error('ARTIFACT_FINGERPRINT_CACHE_INVALID');
  }
  return value;
}

export function getReusableArtifactFingerprintV1(cache, entry) {
  const cached = cache.entries[entry.relPath];
  if (!cached || !DIGEST.test(cached.fingerprint ?? '')) return null;
  if (!FIELDS.every((field) => String(cached[field]) === String(entry[field]))) return null;
  return cached.fingerprint;
}

export function setArtifactFingerprintV1(cache, entry, fingerprint) {
  if (!DIGEST.test(fingerprint)) throw new Error('ARTIFACT_FINGERPRINT_INVALID');
  cache.entries[entry.relPath] = {
    dev: String(entry.dev),
    ino: String(entry.ino),
    sizeBytes: entry.sizeBytes,
    mtimeNs: String(entry.mtimeNs),
    ctimeNs: String(entry.ctimeNs),
    fingerprint,
  };
}

export function serializeArtifactFingerprintCacheV1(cache) {
  const entries = Object.fromEntries(Object.entries(cache.entries).sort(([a], [b]) => a.localeCompare(b)));
  return `${JSON.stringify({ schema: SCHEMA, entries }, null, 2)}\n`;
}
