#!/usr/bin/env node
import { exec } from 'child_process';
import fs from 'fs/promises';
import path from 'path';

const root = process.cwd();
const cmd = 'npm --prefix sveltekit-frontend run db:upsert:feature-cards -- --dry-run';
console.log('Running test command:', cmd);

exec(cmd, { cwd: root, maxBuffer: 10 * 1024 * 1024 }, async (err, stdout, stderr) => {
  const out = stdout + '\n' + stderr;
  const success = out.includes('Upsert report');
  const report = { success, exitCode: err ? err.code : 0, stdout: out };
  const outPath = path.join(root, 'sveltekit-frontend', '.tmp', 'db_upsert_test_result.json');
  try {
    await fs.mkdir(path.dirname(outPath), { recursive: true });
    await fs.writeFile(outPath, JSON.stringify(report, null, 2), 'utf8');
    console.log('Test result written to', outPath);
    process.exit(success ? 0 : 2);
  } catch (e) {
    console.error('Failed to write test result', e);
    process.exit(3);
  }
});
