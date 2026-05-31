#!/usr/bin/env node
import fs from 'fs';
import { spawnSync } from 'child_process';
import { fileURLToPath } from 'url';

const args = process.argv.slice(2);
if (args.length === 0) {
  console.error('Usage: run_with_env.mjs <script-relative-path> [args...]');
  process.exit(2);
}

const envFile = new URL('../../.env', import.meta.url);
let envText = '';
try { envText = fs.readFileSync(envFile, 'utf8'); } catch (e) { console.error('Could not read .env:', e.message); process.exit(2); }
const env = {};
for (const line of envText.split(/\r?\n/)) {
  if (!line || line.trim().startsWith('#')) continue;
  const idx = line.indexOf('=');
  if (idx <= 0) continue;
  const k = line.slice(0, idx).trim();
  const v = line.slice(idx+1);
  env[k] = v;
}
env.PGUSER = env.PGUSER || 'postgres';
env.PGPASSWORD = env.PGPASSWORD || (env.DATABASE_URL && new URL(env.DATABASE_URL).password) || 'postgres';
env.PGHOST = env.PGHOST || 'localhost';
env.PGPORT = env.PGPORT || (env.DATABASE_URL && (() => { try { return new URL(env.DATABASE_URL).port } catch(e){return '5434'} })()) || '5434';
env.PGDATABASE = env.PGDATABASE || (env.DATABASE_URL && (() => { try { return new URL(env.DATABASE_URL).pathname.replace('/', '') } catch(e){return 'legal_ai_db'} })()) || 'legal_ai_db';
env.REDIS_URL = env.REDIS_URL || `redis://${env.REDIS_HOST||'localhost'}:${env.REDIS_PORT||'6379'}`;
env.NEO4J_USER = env.NEO4J_USER || 'neo4j';
env.NEO4J_PASS = env.NEO4J_PASS || 'neo4j';

const childEnv = Object.assign({}, process.env, env);
const scriptPath = fileURLToPath(new URL(`./${args[0]}`, import.meta.url));
const scriptArgs = args.slice(1);
console.log('Running', scriptPath, scriptArgs.join(' '));
const res = spawnSync(process.execPath, [scriptPath, ...scriptArgs], { stdio: 'inherit', env: childEnv });
process.exit(res.status || 0);
