import crypto from 'node:crypto';

export function stable(value) {
  if (Array.isArray(value)) return value.map(stable);
  if (value && typeof value === 'object') {
    return Object.fromEntries(
      Object.keys(value).sort().map((key) => [key, stable(value[key])])
    );
  }
  return value;
}

export function stableStringify(value) {
  return JSON.stringify(stable(value));
}

export function sha256(value) {
  const text = typeof value === 'string' ? value : stableStringify(value);
  return crypto.createHash('sha256').update(text).digest('hex');
}

export function semanticChecksum(value, ignoredKeys = ['generatedAt', 'capturedAt', 'mtimeMs']) {
  function strip(v) {
    if (Array.isArray(v)) return v.map(strip);
    if (v && typeof v === 'object') {
      return Object.fromEntries(
        Object.entries(v)
          .filter(([key]) => !ignoredKeys.includes(key))
          .map(([key, child]) => [key, strip(child)])
      );
    }
    return v;
  }
  return sha256(strip(value));
}

export function object(value) {
  return value && typeof value === 'object' && !Array.isArray(value) ? value : null;
}

export function array(value) {
  return Array.isArray(value) ? value : [];
}

export function string(value) {
  return typeof value === 'string' && value.trim() ? value.trim() : null;
}

export function number(value) {
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}
