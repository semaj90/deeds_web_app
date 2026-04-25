#!/usr/bin/env node
import { spawnSync } from 'child_process';
import path from 'path';

/*
  deploy-migrations.mjs
  - Generates drizzle types, runs migrations, and optionally refreshes materialized views.
  Usage:
    node deploy-migrations.mjs
    node deploy-migrations.mjs --refresh-mv
    node deploy-migrations.mjs --mv view1,view2
    node deploy-migrations.mjs --dir=./sveltekit-frontend
*/

function run(cmd, args, opts = {}) {
  const res = spawnSync(cmd, args, { stdio: 'inherit', shell: true, ...opts });
  if (res.status !== 0) {
    throw new Error(`Command failed: ${cmd} ${args.join(' ')}`);
  }
}

async function main() {
  const args = process.argv.slice(2);
  const refreshFlag = args.includes('--refresh-mv') || process.env.REFRESH_MVS === 'true';
  const mvIndex = args.findIndex(a => a === '--mv');
  let mvList = [];
  if (mvIndex !== -1 && args[mvIndex + 1]) {
    mvList = args[mvIndex + 1]
      .split(',')
      .map(s => s.trim())
      .filter(Boolean);
  }

  // allow overriding the working dir where drizzle config/migrations live
  const dirArg = args.find(a => a.startsWith('--dir='));
  const migrationsDir = dirArg
    ? path.resolve(process.cwd(), dirArg.split('=')[1])
    : path.resolve(process.cwd(), 'sveltekit-frontend');

  console.log(`Using migrations dir: ${migrationsDir}`);

  try {
    console.log('1) Running drizzle-kit generate (codegen)');
    run('npx', ['-y', 'drizzle-kit', 'generate'], { cwd: migrationsDir });

    console.log('2) Running drizzle-kit migrate');
    run('npx', ['-y', 'drizzle-kit', 'migrate'], { cwd: migrationsDir });

    if (refreshFlag || mvList.length) {
      console.log('3) Refreshing materialized views');
      const refreshScript = path.join(migrationsDir, 'scripts', 'db', 'refresh-mv.mjs');
      if (mvList.length) {
        run('node', [refreshScript, '--mv', mvList.join(',')], { cwd: migrationsDir });
      } else {
        run('node', [refreshScript], { cwd: migrationsDir });
      }
    }

    console.log('db deploy complete');
  } catch (err) {
    console.error('Deploy migration failed:', err?.message || err);
    process.exit(1);
  }
}

main();
