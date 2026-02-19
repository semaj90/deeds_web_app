#!/usr/bin/env node
// Simple migration generator for common manual SQL operations (enum-add, rls, check, mv)
// Usage examples:
//   node make-migration.mjs enum-add --type my_enum --value new_value
//   node make-migration.mjs rls --table my_table --policy "owner_id = current_setting('app.current_user_id')::uuid"
//   node make-migration.mjs check --table my_table --constraint "amount >= 0" --name positive_amount
//   node make-migration.mjs mv --name my_mv --sql "SELECT id, content FROM documents WHERE is_indexed"

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const argv = process.argv.slice(2);
if (argv.length === 0) {
  console.error('Usage: make-migration.mjs <type> [options]');
  process.exit(1);
}

const type = argv[0];
const opts = {};
for (let i = 1; i < argv.length; i++) {
  const a = argv[i];
  if (a.startsWith('--')) {
    const key = a.slice(2);
    const val = argv[i + 1] && !argv[i + 1].startsWith('--') ? argv[++i] : true;
    opts[key] = val;
  }
}

function timestamp() {
  const d = new Date();
  return d.toISOString().replace(/[-:TZ.]/g, '').slice(0, 14);
}

const migrationsDir = path.join(process.cwd(), 'sveltekit-frontend', 'drizzle', 'migrations');
fs.mkdirSync(migrationsDir, { recursive: true });

let sql = '';
let name = 'manual_migration';

switch (type) {
  case 'enum-add': {
    const t = opts['type'];
    const v = opts['value'];
    if (!t || !v) {
      console.error('enum-add requires --type <enum_name> --value <new_value>');
      process.exit(1);
    }
    name = `add_${v}_to_${t}`;
    sql = `-- Add value to enum ${t}\nALTER TYPE ${t} ADD VALUE IF NOT EXISTS '${v}';\n`;
    break;
  }
  case 'rls': {
    const table = opts['table'];
    const policy = opts['policy'];
    if (!table || !policy) {
      console.error('rls requires --table <table> --policy "<expression>"');
      process.exit(1);
    }
    name = `rls_${table}`;
    sql = `-- Enable RLS and create policy for ${table}\nALTER TABLE ${table} ENABLE ROW LEVEL SECURITY;\nCREATE POLICY ${table}_policy ON ${table} USING (${policy});\nGRANT SELECT, INSERT, UPDATE, DELETE ON ${table} TO public;\n`;
    break;
  }
  case 'check': {
    const table = opts['table'];
    const constraint = opts['constraint'];
    const cname = opts['name'] || `chk_${table}`;
    if (!table || !constraint) {
      console.error('check requires --table <table> --constraint "<expression>" [--name <constraint_name>]');
      process.exit(1);
    }
    name = `add_check_${cname}_on_${table}`;
    sql = `-- Add check constraint ${cname} on ${table}\nALTER TABLE ${table} ADD CONSTRAINT ${cname} CHECK (${constraint});\n`;
    break;
  }
  case 'mv': {
    const mvname = opts['name'];
    const mvsql = opts['sql'];
    if (!mvname || !mvsql) {
      console.error('mv requires --name <mv_name> --sql "<select-statement>"');
      process.exit(1);
    }
    name = `create_mv_${mvname}`;
    sql = `-- Create materialized view ${mvname}\nCREATE MATERIALIZED VIEW ${mvname} AS ${mvsql};\nCREATE INDEX CONCURRENTLY IF NOT EXISTS idx_${mvname}_id ON ${mvname} (id);\n`;
    break;
  }
  default:
    console.error('Unknown migration type:', type);
    process.exit(1);
}

const fname = `${timestamp()}_${name}.sql`;
const dest = path.join(migrationsDir, fname);
fs.writeFileSync(dest, sql, 'utf8');
console.log('Wrote migration:', dest);
console.log('\nPreview:\n', sql);
