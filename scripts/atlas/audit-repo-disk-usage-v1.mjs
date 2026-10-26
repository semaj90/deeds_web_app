import { lstat, mkdir, readdir, rename, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const OUTPUT_DIR = path.join(REPO_ROOT, '.tmp', 'atlas');

function toPosix(value) {
  return value.split(path.sep).join('/');
}

export async function scanRepoDiskUsage(rootDir) {
  const root = path.resolve(rootDir);
  const startedAt = new Date();
  const topLevel = new Map();
  const errors = [];
  const visitedDirectories = new Set();
  const pending = [{ absolutePath: root, relativePath: '' }];
  let fileCount = 0;
  let directoryCount = 0;
  let logicalBytes = 0n;
  let skippedSymlinkCount = 0;
  let readErrorCount = 0;

  while (pending.length > 0) {
    const current = pending.pop();
    let entries;
    try {
      entries = await readdir(current.absolutePath, { withFileTypes: true });
    } catch (error) {
      readErrorCount += 1;
      if (errors.length < 100) errors.push({ path: toPosix(current.relativePath || '.'), code: error.code ?? 'READ_FAILED' });
      continue;
    }

    for (const entry of entries) {
      const relativePath = current.relativePath ? path.join(current.relativePath, entry.name) : entry.name;
      const absolutePath = path.join(current.absolutePath, entry.name);
      if (entry.isSymbolicLink()) {
        skippedSymlinkCount += 1;
        continue;
      }

      let info;
      try {
        info = await lstat(absolutePath, { bigint: true });
      } catch (error) {
        readErrorCount += 1;
        if (errors.length < 100) errors.push({ path: toPosix(relativePath), code: error.code ?? 'STAT_FAILED' });
        continue;
      }

      if (info.isSymbolicLink()) {
        skippedSymlinkCount += 1;
        continue;
      }
      if (info.isDirectory()) {
        const identity = `${info.dev}:${info.ino}`;
        if (visitedDirectories.has(identity)) {
          readErrorCount += 1;
          if (errors.length < 100) errors.push({ path: toPosix(relativePath), code: 'DIRECTORY_ID_REVISIT' });
          continue;
        }
        visitedDirectories.add(identity);
        directoryCount += 1;
        pending.push({ absolutePath, relativePath });
        continue;
      }
      if (!info.isFile()) continue;

      const size = info.size;
      const bucketName = current.relativePath ? current.relativePath.split(path.sep)[0] : '[root-files]';
      let bucket = topLevel.get(bucketName);
      if (!bucket) {
        bucket = { fileCount: 0, logicalBytes: 0n };
        topLevel.set(bucketName, bucket);
      }
      bucket.fileCount += 1;
      bucket.logicalBytes += size;
      fileCount += 1;
      logicalBytes += size;
    }
  }

  const finishedAt = new Date();
  return {
    schema: 'atlas.repo-disk-usage-scan.v1',
    scopeRoot: root,
    startedAt: startedAt.toISOString(),
    finishedAt: finishedAt.toISOString(),
    durationMs: finishedAt.getTime() - startedAt.getTime(),
    depthLimit: null,
    symlinksFollowed: false,
    includesGitAndNodeModules: true,
    measures: 'logical_file_bytes_not_allocated_disk_bytes',
    fileCount,
    directoryCount,
    logicalBytes: logicalBytes.toString(),
    skippedSymlinkCount,
    readErrorCount,
    errorSamples: errors,
    topLevel: [...topLevel.entries()]
      .map(([name, counts]) => ({ name, fileCount: counts.fileCount, logicalBytes: counts.logicalBytes.toString() }))
      .sort((left, right) => {
        const leftBytes = BigInt(left.logicalBytes);
        const rightBytes = BigInt(right.logicalBytes);
        return leftBytes === rightBytes ? left.name.localeCompare(right.name) : leftBytes > rightBytes ? -1 : 1;
      }),
  };
}

async function main() {
  const receipt = await scanRepoDiskUsage(REPO_ROOT);
  await mkdir(OUTPUT_DIR, { recursive: true });
  const stamp = receipt.finishedAt.replace(/[:.]/g, '-');
  const outputPath = path.join(OUTPUT_DIR, `repo-disk-usage-v1-${stamp}.json`);
  const temporaryPath = `${outputPath}.tmp`;
  await writeFile(temporaryPath, `${JSON.stringify(receipt, null, 2)}\n`, { encoding: 'utf8', flag: 'wx' });
  await rename(temporaryPath, outputPath);
  console.log(JSON.stringify({ ...receipt, receiptPath: toPosix(path.relative(REPO_ROOT, outputPath)) }, null, 2));
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch((error) => {
    console.error(error);
    process.exitCode = 1;
  });
}
