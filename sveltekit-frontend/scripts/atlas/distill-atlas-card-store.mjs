#!/usr/bin/env node
import fs from 'fs/promises';
import { existsSync } from 'fs';
import path from 'path';

const CWD = process.cwd();
const CARDS_FILE = path.join(CWD, '.tmp', 'parent-atlas-profile-cards.jsonl');
const OUT_SQL = path.join(CWD, '.tmp', 'distilled-cards-insert.sql');

async function run() {
  if (!existsSync(CARDS_FILE)) {
    console.error(`❌ Error: ${CARDS_FILE} not found. Run build-parent-atlas-cards.mjs first.`);
    process.exit(1);
  }

  const content = await fs.readFile(CARDS_FILE, 'utf8');
  const lines = content.split('\n').filter(Boolean);
  const cards = lines.map(line => JSON.parse(line));

  console.log(`Distilling ${cards.length} cards...`);

  // Generate SQL insert statements for public.atlas_profile_cards
  const sqlStatements = [];
  for (const c of cards) {
    const esc = (val) => {
      if (val === null || val === undefined) return 'NULL';
      return `'${String(val).replace(/'/g, "''")}'`;
    };
    const escArr = (arr) => {
      if (!arr || arr.length === 0) return "'{}'";
      const items = arr.map(x => `"${String(x).replace(/"/g, '\\"')}"`).join(',');
      return `'{${items}}'`;
    };

    sqlStatements.push(`
INSERT INTO public.atlas_profile_cards (
  card_id, source_ref, feature_label, hot_keywords, dependencies, 
  imports, exports, routes, mcp_tools, db_tables, qdrant_collection, 
  redis_keys, network_protocols, encoding_profile, missing_getters, 
  missing_setters, missing_logs, implementation_status, next_action
) VALUES (
  ${esc(c.card_id)}, ${esc(c.sourceRef)}, ${esc(c.feature_label)}, ${escArr(c.hot_keywords)}, ${escArr(c.dependencies)},
  ${escArr([])}, ${escArr([])}, ${escArr(c.routes)}, ${escArr(c.mcp_tools)}, ${escArr(c.db_tables)}, ${esc(c.qdrant_collection)},
  ${escArr(c.redis_keys)}, ${esc(c.protocols[0] || 'unknown')}, ${esc(c.encodings[0] || 'unknown')}, ${escArr(c.missing_getters)},
  ${escArr(c.missing_setters)}, ${escArr(c.missing_logs)}, ${esc(c.status)}, ${esc(c.nextAction)}
) ON CONFLICT (card_id) DO UPDATE SET
  source_ref = EXCLUDED.source_ref,
  feature_label = EXCLUDED.feature_label,
  hot_keywords = EXCLUDED.hot_keywords,
  dependencies = EXCLUDED.dependencies,
  routes = EXCLUDED.routes,
  mcp_tools = EXCLUDED.mcp_tools,
  db_tables = EXCLUDED.db_tables,
  redis_keys = EXCLUDED.redis_keys,
  network_protocols = EXCLUDED.network_protocols,
  encoding_profile = EXCLUDED.encoding_profile,
  implementation_status = EXCLUDED.implementation_status,
  next_action = EXCLUDED.next_action;
`.trim());
  }

  await fs.mkdir(path.dirname(OUT_SQL), { recursive: true });
  await fs.writeFile(OUT_SQL, sqlStatements.join('\n\n') + '\n', 'utf8');
  console.log(`Wrote fallback insert DDL statements to: ${OUT_SQL}`);

  // Attempt live connection using DATABASE_URL if available
  const dbUrl = process.env.DATABASE_URL;
  if (!dbUrl) {
    console.log('ℹ️ DATABASE_URL not set; skipping live Postgres distillation.');
    process.exit(0);
  }

  try {
    const { default: postgres } = await import('postgres');
    const sql = postgres(dbUrl, { max: 1 });
    console.log('Connecting to Postgres database...');
    
    for (const statement of sqlStatements) {
      await sql.unsafe(statement);
    }
    
    console.log('✓ Successfully distilled cards into live Postgres database.');
    await sql.end();
  } catch (err) {
    console.warn('⚠️ Could not connect or insert to live Postgres; fallback SQL generated. Error:', err.message);
  }
}

run().catch(err => {
  console.error(err);
  process.exit(1);
});
