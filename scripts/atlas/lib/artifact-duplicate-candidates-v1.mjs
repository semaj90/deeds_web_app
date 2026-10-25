export async function mapWithConcurrency(items, limit, mapper) {
  if (!Array.isArray(items) || typeof mapper !== 'function') throw new TypeError('INVALID_CONCURRENT_MAP_INPUT');
  if (!Number.isSafeInteger(limit) || limit < 1) throw new RangeError('INVALID_CONCURRENCY_LIMIT');
  const results = new Array(items.length);
  let nextIndex = 0;
  let firstError = null;
  const worker = async () => {
    while (true) {
      if (firstError) return;
      const index = nextIndex;
      nextIndex += 1;
      if (index >= items.length) return;
      try {
        results[index] = await mapper(items[index], index);
      } catch (error) {
        firstError ??= error;
        return;
      }
    }
  };
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker));
  if (firstError) throw firstError;
  return results;
}

export function groupDuplicateCandidatesBySize(entries) {
  const bySize = new Map();
  for (const entry of entries) {
    if (!Number.isSafeInteger(entry.sizeBytes) || entry.sizeBytes < 0 || entry.sizeBytes > entry.maxHashBytes) continue;
    const group = bySize.get(entry.sizeBytes) ?? [];
    group.push(entry);
    bySize.set(entry.sizeBytes, group);
  }
  return [...bySize.values()].filter((group) => group.length > 1).flat();
}

export function groupDuplicateCandidatesByFingerprint(entries, fingerprintForEntry) {
  const byFingerprint = new Map();
  for (const entry of entries) {
    const fingerprint = fingerprintForEntry(entry);
    if (typeof fingerprint !== 'string' || !fingerprint) continue;
    const key = `${entry.sizeBytes}:${fingerprint}`;
    const group = byFingerprint.get(key) ?? [];
    group.push(entry);
    byFingerprint.set(key, group);
  }
  return [...byFingerprint.values()].filter((group) => group.length > 1).flat();
}
