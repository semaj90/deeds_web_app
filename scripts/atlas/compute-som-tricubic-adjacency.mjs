#!/usr/bin/env node
/**
 * Compute SOM tricubic adjacency for the canonical 20x20 grid.
 *
 * This materializes the derived SOM neighborhood surface expected by the
 * topology validator as `som_adjacency_matrix`.
 *
 * The table is derived, not canonical truth. It may be rebuilt idempotently.
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import pg from 'pg';
import dotenv from 'dotenv';

const { Pool } = pg;
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, '../..');
const REPORTS_DIR = path.join(REPO_ROOT, 'docs', 'reports');
const OUT_JSON = path.join(REPORTS_DIR, 'som-tricubic-adjacency-report.json');
const OUT_MD = path.join(REPORTS_DIR, 'som-tricubic-adjacency-report.md');

dotenv.config({ path: path.join(REPO_ROOT, '.env') });
dotenv.config({ path: path.join(REPO_ROOT, 'sveltekit-frontend', '.env.local'), override: false });

const DATABASE_URL = process.env.DATABASE_URL || 'postgresql://legal_admin:123456@127.0.0.1:5434/legal_ai_db';
const APPLY = process.argv.includes('--apply');
const DRY_RUN = !APPLY;
const VERBOSE = process.argv.includes('--verbose');
const GRID_SIZE = 20;
const CELL_COUNT = GRID_SIZE * GRID_SIZE;

function cellId(row, col) {
  return `som:${row}:${col}`;
}

function directionFromDelta(dr, dc) {
  if (dr === -1 && dc === 0) return 'north';
  if (dr === 1 && dc === 0) return 'south';
  if (dr === 0 && dc === 1) return 'east';
  if (dr === 0 && dc === -1) return 'west';
  if (dr === -1 && dc === 1) return 'north_east';
  if (dr === -1 && dc === -1) return 'north_west';
  if (dr === 1 && dc === 1) return 'south_east';
  if (dr === 1 && dc === -1) return 'south_west';
  return 'unknown';
}

function buildAdjacencyRows() {
  const rows = [];
  for (let sourceRow = 0; sourceRow < GRID_SIZE; sourceRow++) {
    for (let sourceCol = 0; sourceCol < GRID_SIZE; sourceCol++) {
      for (let dr = -1; dr <= 1; dr++) {
        for (let dc = -1; dc <= 1; dc++) {
          if (dr === 0 && dc === 0) continue;
          const targetRow = sourceRow + dr;
          const targetCol = sourceCol + dc;
          if (targetRow < 0 || targetRow >= GRID_SIZE || targetCol < 0 || targetCol >= GRID_SIZE) continue;

          const orthogonal = dr === 0 || dc === 0;
          rows.push({
            source_cell_id: cellId(sourceRow, sourceCol),
            target_cell_id: cellId(targetRow, targetCol),
            source_row: sourceRow,
            source_col: sourceCol,
            target_row: targetRow,
            target_col: targetCol,
            direction: directionFromDelta(dr, dc),
            distance: orthogonal ? 1 : Math.SQRT2,
            weight: orthogonal ? 1 : 0.707,
          });
        }
      }
    }
  }
  return rows;
}

function renderMarkdown(report) {
  return `# SOM Tricubic Adjacency Report

Generated: ${report.generated_at}
Mode: **${report.mode.toUpperCase()}**

## Summary

| Metric | Count |
|:---|---:|
| Grid size | ${GRID_SIZE} x ${GRID_SIZE} |
| Cells | ${report.summary.cell_count} |
| Directed edges | ${report.summary.edge_count} |
| Orthogonal edges | ${report.summary.orthogonal_edges} |
| Diagonal edges | ${report.summary.diagonal_edges} |
| Status | ${report.status} |

${report.sample.length > 0 ? `## Sample

${report.sample.map((row) => `- ${row.source_cell_id} -> ${row.target_cell_id} (${row.direction}, w=${row.weight})`).join('\n')}
` : ''}
`;
}

async function main() {
  const pool = new Pool({ connectionString: DATABASE_URL });
  const report = {
    generated_at: new Date().toISOString(),
    mode: APPLY ? 'apply' : 'dry-run',
    grid_size: GRID_SIZE,
    summary: {
      cell_count: CELL_COUNT,
      edge_count: 0,
      orthogonal_edges: 0,
      diagonal_edges: 0,
    },
    sample: [],
    status: 'PENDING',
    output_table: 'som_adjacency_matrix',
  };

  try {
    console.log('╔════════════════════════════════════════════════════════════════╗');
    console.log('║  SOM Tricubic Adjacency Materializer                          ║');
    console.log(`║  Mode: ${APPLY ? 'APPLY' : 'DRY-RUN'.padEnd(54)}║`);
    console.log('╚════════════════════════════════════════════════════════════════╝\n');

    const rows = buildAdjacencyRows();
    report.summary.edge_count = rows.length;
    report.summary.orthogonal_edges = rows.filter((row) => row.weight === 1).length;
    report.summary.diagonal_edges = rows.filter((row) => row.weight !== 1).length;
    report.sample = rows.slice(0, 8);

    console.log(`Grid cells: ${GRID_SIZE} x ${GRID_SIZE} = ${CELL_COUNT}`);
    console.log(`Derived directed edges: ${rows.length}`);
    console.log(`Orthogonal edges: ${report.summary.orthogonal_edges}`);
    console.log(`Diagonal edges: ${report.summary.diagonal_edges}`);

    if (APPLY) {
      const client = await pool.connect();
      try {
        await client.query('BEGIN');
        await client.query(`
          CREATE TABLE IF NOT EXISTS som_adjacency_matrix (
            source_cell_id text NOT NULL,
            target_cell_id text NOT NULL,
            source_row integer NOT NULL,
            source_col integer NOT NULL,
            target_row integer NOT NULL,
            target_col integer NOT NULL,
            direction text NOT NULL,
            distance double precision NOT NULL,
            weight double precision NOT NULL,
            topology_version text NOT NULL DEFAULT '2026-07-19',
            created_at timestamptz NOT NULL DEFAULT now(),
            PRIMARY KEY (source_cell_id, target_cell_id)
          )
        `);
        await client.query('TRUNCATE TABLE som_adjacency_matrix');

        const batchSize = 500;
        for (let i = 0; i < rows.length; i += batchSize) {
          const batch = rows.slice(i, i + batchSize);
          const values = [];
          const placeholders = [];
          let p = 1;
          for (const row of batch) {
            values.push(
              row.source_cell_id,
              row.target_cell_id,
              row.source_row,
              row.source_col,
              row.target_row,
              row.target_col,
              row.direction,
              row.distance,
              row.weight,
            );
            placeholders.push(`($${p++}, $${p++}, $${p++}, $${p++}, $${p++}, $${p++}, $${p++}, $${p++}, $${p++})`);
          }
          await client.query(
            `
              INSERT INTO som_adjacency_matrix (
                source_cell_id, target_cell_id,
                source_row, source_col, target_row, target_col,
                direction, distance, weight
              ) VALUES ${placeholders.join(', ')}
              ON CONFLICT (source_cell_id, target_cell_id) DO UPDATE SET
                source_row = EXCLUDED.source_row,
                source_col = EXCLUDED.source_col,
                target_row = EXCLUDED.target_row,
                target_col = EXCLUDED.target_col,
                direction = EXCLUDED.direction,
                distance = EXCLUDED.distance,
                weight = EXCLUDED.weight
            `,
            values,
          );
        }

        await client.query('CREATE INDEX IF NOT EXISTS idx_som_adjacency_source ON som_adjacency_matrix(source_row, source_col)');
        await client.query('CREATE INDEX IF NOT EXISTS idx_som_adjacency_target ON som_adjacency_matrix(target_row, target_col)');
        await client.query('COMMIT');
        console.log('Postgres table som_adjacency_matrix refreshed.');
      } catch (error) {
        await client.query('ROLLBACK').catch(() => {});
        throw error;
      } finally {
        client.release();
      }
    }

    report.status = 'PASS';

    fs.mkdirSync(REPORTS_DIR, { recursive: true });
    fs.writeFileSync(OUT_JSON, JSON.stringify(report, null, 2));
    fs.writeFileSync(OUT_MD, renderMarkdown(report));

    console.log(`Report written: ${path.relative(REPO_ROOT, OUT_JSON)}`);
    console.log(`Status: ${report.status}`);
  } catch (error) {
    report.status = 'FAIL';
    report.error = error?.message || String(error);
    fs.mkdirSync(REPORTS_DIR, { recursive: true });
    fs.writeFileSync(OUT_JSON, JSON.stringify(report, null, 2));
    fs.writeFileSync(OUT_MD, renderMarkdown(report));
    console.error(`\n❌ SOM adjacency materializer failed: ${report.error}`);
    process.exitCode = 1;
  } finally {
    await pool.end();
  }
}

main();
