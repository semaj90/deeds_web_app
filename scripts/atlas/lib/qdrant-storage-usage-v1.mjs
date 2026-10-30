export function parseQdrantStorageUsageV1(output) {
  const bytesByPath = {};
  const walByCollection = {};

  for (const line of String(output ?? '').split(/\r?\n/).filter(Boolean)) {
    const match = line.match(/^(\d+)\s+(.+)$/);
    if (!match) continue;
    const bytes = Number(match[1]);
    const targetPath = match[2].replaceAll('\\', '/');
    if (!Number.isSafeInteger(bytes) || bytes < 0) continue;

    if (targetPath === '/qdrant' || targetPath.startsWith('/qdrant/')) bytesByPath[targetPath] = bytes;
    const walMatch = targetPath.match(/\/collections\/([^/]+)\/0\/wal$/);
    if (walMatch) walByCollection[walMatch[1]] = bytes;
  }

  return {
    bytesByPath,
    walByCollection,
    walDirectoryCount: Object.keys(walByCollection).length,
    walTotalBytes: Object.values(walByCollection).reduce((sum, bytes) => sum + bytes, 0),
  };
}
