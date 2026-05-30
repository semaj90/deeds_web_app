#!/usr/bin/env node
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

const SQL = path.join('scripts','sql','parent_atlas_join.sql');
const SQL_ARG = SQL.replace(/\\/g, '/');

function hasDuckDB(){
  try{ const r = spawnSync('duckdb',['--version'],{ stdio:'pipe' }); return r.status===0; } catch { return false; }
}

if(!hasDuckDB()){
  console.error('duckdb CLI not found in PATH. Install duckdb or run the SQL via your local client.');
  console.error('You can run: duckdb -c ".read scripts/sql/parent_atlas_join.sql"');
  process.exit(2);
}

const cmd = `duckdb -c ".read ${SQL_ARG}"`;
console.log('running:', cmd);
const res = spawnSync(cmd, { shell: true, stdio: 'inherit' });
if (res.error) { console.error(res.error); process.exit(1); }
process.exit(res.status || 0);
