#!/usr/bin/env node
import { execSync } from 'child_process';
import fs from 'fs';
import path from 'path';

const args = process.argv.slice(2);
const toJson = args.includes('--json');
const useRedis = args.includes('--redis');
const cached = args.includes('--cached');

function run(cmd) {
  try {
    return execSync(cmd, { encoding: 'utf8' }).trim();
  } catch (err) {
    return String(err.message || err);
  }
}

const out = {
  ts: new Date().toISOString(),
  branch: run('git branch --show-current'),
  statusPorcelain: run('git status --porcelain'),
  diffStat: run('git diff --stat'),
  diffNameOnly: run('git diff --name-only'),
  diffCheck: run('git diff --check'),
};

if (cached) {
  out.stagedDiffStat = run('git diff --cached --stat');
  out.stagedNameOnly = run('git diff --cached --name-only');
  out.stagedDiffCheck = run('git diff --cached --check');
}

out.summary = {
  branch: out.branch,
  dirty: out.statusPorcelain.length > 0,
  filesChanged: (out.diffNameOnly || '').split(/\s+/).filter(Boolean).length,
};

const tmpDir = path.resolve('.tmp');
try { fs.mkdirSync(tmpDir, { recursive: true }); } catch (e) {}
const outPath = path.join(tmpDir, 'ace-diff-sniffer.json');
fs.writeFileSync(outPath, JSON.stringify(out, null, 2));

async function maybeStoreRedis(json) {
  if (!useRedis) return false;
  try {
    try {
      const IORedis = await import('ioredis');
      const client = new IORedis.default(process.env.REDIS_URL || undefined);
      await client.set('ace:diff:latest', json);
      await client.quit();
      return true;
    } catch (e) {
      const redisMod = await import('redis');
      const rclient = redisMod.createClient({ url: process.env.REDIS_URL });
      await rclient.connect();
      await rclient.set('ace:diff:latest', json);
      await rclient.disconnect();
      return true;
    }
  } catch (err) {
    return false;
  }
}

(async () => {
  const json = JSON.stringify(out);
  const stored = await maybeStoreRedis(json);

  const human = [];
  human.push(`ACE Diff Sniffer — ${out.ts}`);
  human.push(`Branch: ${out.branch}`);
  human.push(`Dirty: ${out.summary.dirty}`);
  human.push(`Files changed (diff --name-only): ${out.summary.filesChanged}`);
  if (stored) human.push('Stored to Redis: ace:diff:latest');
  human.push(`Wrote: ${outPath}`);

  if (toJson) {
    console.log(json);
  } else {
    console.error(human.join('\n'));
  }
})();
