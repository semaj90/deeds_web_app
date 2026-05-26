import { readdirSync, readFileSync, rmSync, statSync, mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import process from 'node:process';

const ROOT = path.resolve(process.cwd());
const CACHE_DIR = path.join(ROOT, '.cache', 'ace', 'context-packs');
const LOG_DIR = path.join(ROOT, 'logs', 'ace-context-cache');

const args = new Set(process.argv.slice(2));
const dryRun = args.has('--dry-run');
const maxBytesArg = process.argv.find((arg) => arg.startsWith('--max-bytes='));
const maxBytes = maxBytesArg ? Number(maxBytesArg.split('=')[1]) : 3 * 1024 * 1024 * 1024;
const keepRecent = Number(process.argv.find((arg) => arg.startsWith('--keep='))?.split('=')[1] ?? 200);

function ensureDir(dir) {
  mkdirSync(dir, { recursive: true });
}

function readJsonSafe(filePath) {
  try {
    return JSON.parse(readFileSync(filePath, 'utf8'));
  } catch {
    return null;
  }
}

function getLastUsedAt(filePath) {
  const data = readJsonSafe(filePath);
  const stamp = data?.lastUsedAt ?? data?.plannerState?.lastUsedAt;
  if (typeof stamp === 'string' && !Number.isNaN(Date.parse(stamp))) {
    return new Date(stamp).getTime();
  }
  try {
    return statSync(filePath).mtimeMs;
  } catch {
    return 0;
  }
}

function listFiles() {
  try {
    return readdirSync(CACHE_DIR)
      .filter((name) => name.endsWith('.json'))
      .map((name) => path.join(CACHE_DIR, name))
      .map((filePath) => {
        const stat = statSync(filePath);
        return {
          filePath,
          size: stat.size,
          lastUsedAt: getLastUsedAt(filePath),
        };
      });
  } catch {
    return [];
  }
}

function main() {
  ensureDir(CACHE_DIR);
  ensureDir(LOG_DIR);

  const files = listFiles().sort((a, b) => a.lastUsedAt - b.lastUsedAt);
  const totalBytes = files.reduce((sum, file) => sum + file.size, 0);
  const targetBytes = Math.max(0, maxBytes);
  const overBy = Math.max(0, totalBytes - targetBytes);

  const removed = [];
  let remainingBytes = totalBytes;

  if (files.length > keepRecent) {
    const excess = files.slice(0, Math.max(0, files.length - keepRecent));
    for (const file of excess) {
      removed.push(file);
      remainingBytes -= file.size;
      if (!dryRun) {
        rmSync(file.filePath, { force: true });
      }
    }
  }

  const current = listFiles().sort((a, b) => a.lastUsedAt - b.lastUsedAt);
  let currentBytes = current.reduce((sum, file) => sum + file.size, 0);
  while (currentBytes > targetBytes && current.length > 0) {
    const victim = current.shift();
    if (!victim) break;
    removed.push(victim);
    currentBytes -= victim.size;
    if (!dryRun) {
      rmSync(victim.filePath, { force: true });
    }
  }

  const report = {
    timestamp: new Date().toISOString(),
    dryRun,
    cacheDir: CACHE_DIR,
    maxBytes: targetBytes,
    keepRecent,
    before: {
      fileCount: files.length,
      totalBytes,
      overBy,
    },
    after: {
      fileCount: dryRun ? current.length : listFiles().length,
      totalBytes: dryRun ? currentBytes : listFiles().reduce((sum, file) => sum + file.size, 0),
    },
    removed: removed.map((entry) => ({
      file: path.basename(entry.filePath),
      size: entry.size,
      lastUsedAt: new Date(entry.lastUsedAt).toISOString(),
    })),
  };

  const latestPath = path.join(LOG_DIR, 'prune-ace-context-packs-latest.json');
  writeFileSync(latestPath, `${JSON.stringify(report, null, 2)}\n`, 'utf8');

  const stampPath = path.join(LOG_DIR, `prune-ace-context-packs-${Date.now()}.json`);
  writeFileSync(stampPath, `${JSON.stringify(report, null, 2)}\n`, 'utf8');

  console.log(
    `[ace-context-prune] ${dryRun ? 'dry-run ' : ''}files=${report.before.fileCount} bytes=${report.before.totalBytes} removed=${report.removed.length} remaining=${report.after.totalBytes}`
  );
}

main();
