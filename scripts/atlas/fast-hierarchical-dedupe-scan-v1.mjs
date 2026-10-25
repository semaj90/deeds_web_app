import { createHash } from 'node:crypto';
import fs, { readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';

const SAMPLE_BYTES = 4096; // 4 KB head + 4 KB tail

export function computeHeadTailDigest(filePath, fileSize) {
  if (!Number.isSafeInteger(fileSize) || fileSize < 0) throw new Error('INVALID_SAMPLE_FILE_SIZE');
  const fd = fs.openSync(filePath, 'r');
  try {
    const before = fs.fstatSync(fd);
    if (!before.isFile() || before.size !== fileSize) throw new Error('SAMPLE_FILE_SIZE_MISMATCH');
    const hash = createHash('sha256');
    const ranges = fileSize <= SAMPLE_BYTES * 2
      ? [[0, fileSize]]
      : [[0, SAMPLE_BYTES], [fileSize - SAMPLE_BYTES, SAMPLE_BYTES]];
    for (const [position, length] of ranges) {
      const buffer = Buffer.alloc(length);
      let offset = 0;
      while (offset < length) {
        const bytesRead = fs.readSync(fd, buffer, offset, length - offset, position + offset);
        if (bytesRead === 0) throw new Error('SAMPLE_READBACK_INCOMPLETE');
        offset += bytesRead;
      }
      hash.update(buffer);
    }
    const after = fs.fstatSync(fd);
    if (['dev', 'ino', 'size', 'mtimeMs', 'ctimeMs'].some((field) => before[field] !== after[field])) {
      throw new Error('SAMPLE_FILE_CHANGED_DURING_READ');
    }
    return hash.digest('hex').slice(0, 32);
  } finally {
    fs.closeSync(fd);
  }
}

export function scanSubdirectoryBreakdown(rootDir, maxDepth = 2) {
  const summary = new Map();

  function walk(currentPath, relParts) {
    let entries;
    try {
      entries = readdirSync(currentPath, { withFileTypes: true });
    } catch {
      return;
    }
    const bucketKey = relParts.slice(0, maxDepth).join('/') || '[root]';
    if (!summary.has(bucketKey)) {
      summary.set(bucketKey, { files: 0, bytes: 0, sizeBuckets: new Map() });
    }
    const bucket = summary.get(bucketKey);

    for (const entry of entries) {
      if (entry.isSymbolicLink()) continue;
      const fullPath = join(currentPath, entry.name);
      if (entry.isDirectory()) {
        if (entry.name === '.git' || entry.name === 'node_modules') continue;
        walk(fullPath, [...relParts, entry.name]);
      } else if (entry.isFile()) {
        try {
          const st = statSync(fullPath);
          bucket.files += 1;
          bucket.bytes += st.size;
        } catch {
          // Skip transient locked files
        }
      }
    }
  }

  walk(rootDir, []);
  return [...summary.entries()]
    .map(([dir, stats]) => ({
      dir,
      files: stats.files,
      megabytes: Math.round(stats.bytes / (1024 * 1024))
    }))
    .sort((a, b) => b.megabytes - a.megabytes);
}

// CLI direct execution
if (process.argv[1]?.replace(/\\/g, '/').endsWith('fast-hierarchical-dedupe-scan-v1.mjs')) {
  const target = process.argv[2] ?? '.tmp';
  const depth = Number(process.argv[3] ?? 2);
  const rows = scanSubdirectoryBreakdown(target, depth);
  console.table(rows.slice(0, 25));
}
