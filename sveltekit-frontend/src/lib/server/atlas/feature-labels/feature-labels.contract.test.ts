/**
 * Contract tests for the feature-label registry draft.
 * Static checks only: they read the draft SQL and the Drizzle declaration, and they never connect to a database.
 */
import { describe, expect, it, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { getTableConfig } from 'drizzle-orm/pg-core';
import { atlasFeatureLabels } from '../../db/schema/atlas-feature-labels.js';
import { atlasFeatureConcepts, atlasFeatureSourceIdentities, atlasFeatureConceptCrosswalk } from '../../db/schema/atlas-feature-identity.js';

const ROOT = resolve(__dirname, '../../../../..');
const MIGRATION = readFileSync(resolve(ROOT, 'drizzle/manual/20261021_feature_identity_v2.sql'), 'utf8');
const ROLLBACK = readFileSync(resolve(ROOT, 'drizzle/manual/20261021_feature_identity_v2.rollback.sql'), 'utf8');
const DRIZZLE = readFileSync(resolve(ROOT, 'src/lib/server/db/schema/atlas-feature-labels.ts'), 'utf8');

const EXPECTED_COLUMNS = [
  'canonical_feature_id', 'label_revision', 'feature_label', 'community_id', 'domain_class', 'capability',
  'concept_id', 'label_source', 'label_status', 'evidence_refs', 'reviewed_by', 'reviewed_at',
  'created_at', 'updated_at',
];

function createTableColumns(sql: string): string[] {
  const body = sql.slice(sql.indexOf('CREATE TABLE IF NOT EXISTS atlas_feature_labels ('));
  const block = body.slice(body.indexOf('(') + 1, body.indexOf('\n);'));
  // Column definitions come first; the first CONSTRAINT line ends the column list.
  const columnLines: string[] = [];
  for (const raw of block.split('\n')) {
    const line = raw.trim();
    if (line.startsWith('CONSTRAINT')) break;
    if (/^[a-z_]+\s+/.test(line)) columnLines.push(line.split(/\s+/)[0]);
  }
  return columnLines;
}

describe('atlas_feature_labels migration draft', () => {
  it('declares exactly the expected columns', () => {
    expect(createTableColumns(MIGRATION).sort()).toEqual([...EXPECTED_COLUMNS].sort());
  });

  it('has the (canonical_feature_id, label_revision) primary key and revision/status/nonblank constraints', () => {
    expect(MIGRATION).toContain('PRIMARY KEY (canonical_feature_id, label_revision)');
    expect(MIGRATION).toContain('CHECK (label_revision >= 1)');
    expect(MIGRATION).toContain("CHECK (label_status IN ('PROPOSED', 'REVIEWED', 'WITHDRAWN', 'SUPERSEDED'))");
    expect(MIGRATION).toContain("CHECK (btrim(feature_label) <> '')");
  });

  it('requires reviewer and review time for any REVIEWED row', () => {
    expect(MIGRATION).toContain("label_status NOT IN ('REVIEWED', 'WITHDRAWN') OR (reviewed_by IS NOT NULL AND reviewed_at IS NOT NULL)");
  });

  it('references the proposed canonical concept owner, preserving structural and product tables', () => {
    expect(MIGRATION).toContain('REFERENCES atlas_feature_concepts (canonical_feature_id) ON DELETE RESTRICT');
    expect(MIGRATION).not.toContain('REFERENCES atlas_features (feature_id)');
    expect(DRIZZLE).toContain('atlasFeatureConcepts.canonicalFeatureId');
  });

  it('defines the current approved label from the latest REVIEWED or WITHDRAWN decision', () => {
    expect(MIGRATION).toContain('CREATE OR REPLACE VIEW atlas_feature_labels_current AS');
    expect(MIGRATION).toContain('SELECT DISTINCT ON (canonical_feature_id)');
    expect(MIGRATION).toContain("WHERE label_status IN ('REVIEWED', 'WITHDRAWN')");
    expect(MIGRATION).toContain('ORDER BY canonical_feature_id, label_revision DESC');
    expect(MIGRATION).toContain("WHERE latest_decision.label_status = 'REVIEWED'");
  });

  it('is additive: no drops, deletes, inserts, or data updates outside the updated_at trigger', () => {
    expect(MIGRATION).not.toMatch(/\bDROP\s+TABLE\b/i);
    expect(MIGRATION).not.toMatch(/\bDELETE\s+FROM\b/i);
    expect(MIGRATION).not.toMatch(/\bINSERT\s+INTO\b/i);
    expect(MIGRATION).not.toMatch(/^\s*UPDATE\s+(?!atlas_feature_labels SET)/im);
  });

  it('keeps domain, capability and concept as separate columns', () => {
    expect(MIGRATION).toMatch(/domain_class\s+text/);
    expect(MIGRATION).toMatch(/capability\s+text/);
    expect(MIGRATION).toMatch(/concept_id\s+text/);
  });

  it('rollback refuses to drop a non-empty table', () => {
    expect(ROLLBACK).toContain('ROLLBACK_REFUSED');
    expect(ROLLBACK).toContain('DROP TABLE IF EXISTS atlas_feature_labels');
  });
});

describe('Drizzle declaration parity', () => {
  for (const table of [atlasFeatureConcepts, atlasFeatureSourceIdentities, atlasFeatureConceptCrosswalk, atlasFeatureLabels]) {
    const config = getTableConfig(table);
    it(`matches SQL columns, nullability, checks, and indexes for ${config.name}`, () => {
      const start = MIGRATION.indexOf(`CREATE TABLE IF NOT EXISTS ${config.name} (`);
      expect(start).toBeGreaterThanOrEqual(0);
      const block = MIGRATION.slice(start, MIGRATION.indexOf('\n);', start));
      const definitions = block.split('\n').map(line => line.trim()).filter(line => /^[a-z_]+\s+(text|integer|jsonb|timestamptz)\b/.test(line));
      expect(config.columns.map(column => column.name).sort()).toEqual(definitions.map(line => line.split(/\s+/)[0]).sort());
      for (const column of config.columns) {
        const definition = definitions.find(line => line.startsWith(`${column.name} `))!;
        expect(column.notNull, `${config.name}.${column.name}`).toBe(/NOT NULL|PRIMARY KEY/.test(definition));
      }
      const sqlChecks = [...block.matchAll(/CONSTRAINT\s+(\w+)\s+CHECK/g)].map(match => match[1]).sort();
      expect(config.checks.map(constraint => constraint.name).sort()).toEqual(sqlChecks);
      const sqlIndexes = [...MIGRATION.matchAll(new RegExp(`CREATE INDEX IF NOT EXISTS (\\w+)\\s+ON ${config.name}\\b`, 'g'))].map(match => match[1]).sort();
      expect(config.indexes.map(index => index.config.name).sort()).toEqual(sqlIndexes);
    });
  }

  it('binds labels and crosswalks to the canonical layer through real Drizzle foreign keys', () => {
    const targets = (table: typeof atlasFeatureLabels | typeof atlasFeatureConceptCrosswalk) => getTableConfig(table).foreignKeys.map(key => {
      const reference = key.reference();
      return { columns: reference.columns.map(column => column.name),
        target: getTableConfig(reference.foreignTable).name,
        foreignColumns: reference.foreignColumns.map(column => column.name), onDelete: key.onDelete };
    });
    expect(targets(atlasFeatureLabels)).toEqual([{ columns: ['canonical_feature_id'], target: 'atlas_feature_concepts', foreignColumns: ['canonical_feature_id'], onDelete: 'restrict' }]);
    expect(targets(atlasFeatureConceptCrosswalk)).toEqual([
      { columns: ['source_namespace', 'local_feature_id'], target: 'atlas_feature_source_identities', foreignColumns: ['source_namespace', 'local_feature_id'], onDelete: 'restrict' },
      { columns: ['canonical_feature_id'], target: 'atlas_feature_concepts', foreignColumns: ['canonical_feature_id'], onDelete: 'restrict' },
    ]);
  });

  it('maps every SQL column to a Drizzle field with the same database name', () => {
    for (const column of EXPECTED_COLUMNS) {
      expect(DRIZZLE).toContain(`'${column}'`);
    }
  });

  it('declares the composite primary key with the same name as the SQL constraint', () => {
    expect(DRIZZLE).toContain("name: 'atlas_feature_labels_pk'");
    expect(DRIZZLE).toContain('[table.canonicalFeatureId, table.labelRevision]');
  });
});

describe('read-only admin loader degraded contract', () => {
  it('returns the same top-level keys on failure as on success', async () => {
    vi.resetModules();
    vi.doMock('$lib/server/db/client.js', () => ({
      pool: { query: vi.fn().mockRejectedValue(new Error('connection refused')) },
    }));
    const { loadFeatureLabelAdminView } = await import('../feature-labels/feature-label-admin.js');
    const degraded = await loadFeatureLabelAdminView(10);
    expect(degraded.status).toBe('DEGRADED');
    expect(degraded.error).toContain('connection refused');

    vi.resetModules();
    vi.doMock('$lib/server/db/client.js', () => ({
      pool: {
        query: vi.fn().mockImplementation(async (sql: string) => {
          if (sql.includes('to_regclass')) return { rows: [{ present: false }] };
          return { rows: [] };
        }),
      },
    }));
    const { loadFeatureLabelAdminView: loadOk } = await import('../feature-labels/feature-label-admin.js');
    const ok = await loadOk(10);
    expect(ok.status).toBe('OK');
    expect(ok.approvedLabelsTable).toBe('ABSENT');
    expect(Object.keys(ok).sort()).toEqual(Object.keys(degraded).sort());
  });

  it('issues only SELECT statements', async () => {
    vi.resetModules();
    const seen: string[] = [];
    vi.doMock('$lib/server/db/client.js', () => ({
      pool: {
        query: vi.fn().mockImplementation(async (sql: string) => {
          seen.push(sql);
          return { rows: [] };
        }),
      },
    }));
    const { loadFeatureLabelAdminView } = await import('../feature-labels/feature-label-admin.js');
    await loadFeatureLabelAdminView(5);
    expect(seen.length).toBeGreaterThan(0);
    for (const sql of seen) {
      expect(sql.trim().toUpperCase().startsWith('SELECT')).toBe(true);
    }
  });
});
