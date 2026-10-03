import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { getTableConfig } from 'drizzle-orm/pg-core';
import { OPENSPEC_EVIDENCE_TABLES_V1 } from './openspec-evidence-schema';

const MANUAL = resolve(process.cwd(), 'drizzle/manual');
const FILES = [
  '20261001_openspec_evidence_fabric_v1.sql',
  '20261001_openspec_evidence_fabric_v2.sql',
  '20261001_openspec_task_identity_history_v1.sql',
  '20261001_openspec_evidence_retrieval_v1.sql'
];
const sql = FILES.map((f) => readFileSync(resolve(MANUAL, f), 'utf8')).join('\n');

function sqlColumns(table: string): string[] {
  const cols = new Set<string>();
  const create = new RegExp(`CREATE TABLE IF NOT EXISTS public\\.${table} \\(([\\s\\S]*?)\\n\\);`).exec(sql);
  for (const line of (create?.[1] ?? '').split('\n')) {
    const m = /^ {2}([a-z_]+)\s+(?!PRIMARY|UNIQUE|FOREIGN|CHECK)/.exec(line);
    if (m) cols.add(m[1]);
  }
  const alter = new RegExp(`ALTER TABLE public\\.${table}\\s+([\\s\\S]*?);`, 'g');
  for (const a of sql.matchAll(alter)) {
    for (const m of a[1].matchAll(/ADD COLUMN IF NOT EXISTS ([a-z_]+)/g)) cols.add(m[1]);
  }
  return [...cols].sort();
}

describe('openspec evidence Drizzle declarations match the unapplied SQL', () => {
  for (const table of Object.values(OPENSPEC_EVIDENCE_TABLES_V1)) {
    const cfg = getTableConfig(table);
    it(`${cfg.name}: column set equals SQL column set`, () => {
      const drizzleCols = cfg.columns.map((c) => c.name).sort();
      const fromSql = sqlColumns(cfg.name);
      expect(fromSql.length).toBeGreaterThan(0);
      expect(drizzleCols).toEqual(fromSql);
    });
  }

  it('declares every SQL table exactly once', () => {
    const sqlTables = [...sql.matchAll(/CREATE TABLE IF NOT EXISTS public\.([a-z_]+)/g)].map((m) => m[1]).sort();
    const declared = Object.values(OPENSPEC_EVIDENCE_TABLES_V1).map((t) => getTableConfig(t).name).sort();
    expect(declared).toEqual(sqlTables);
  });

  it('keeps the embedding column at 768 dims with the semantic_768 default', () => {
    const cfg = getTableConfig(OPENSPEC_EVIDENCE_TABLES_V1.openspecEvidenceChunks);
    const emb = cfg.columns.find((c) => c.name === 'embedding');
    expect(emb?.getSQLType()).toBe('vector(768)');
    const rep = cfg.columns.find((c) => c.name === 'representation_revision');
    expect(rep?.default).toBe('semantic_768');
  });

  it('is not registered in the drizzle-kit schema entry, so no migration can be generated from it', () => {
    const entry = readFileSync(resolve(process.cwd(), 'src/lib/server/db/schema.ts'), 'utf8');
    expect(entry).not.toContain('openspec-evidence-schema');
  });
});
