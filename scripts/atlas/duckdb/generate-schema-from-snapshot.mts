#!/usr/bin/env node
/**
 * Generate schema definition from DuckDB snapshot.
 * Inspects snapshot tables and exports Drizzle/TypeScript schema definitions.
 *
 * Usage:
 *   npx tsx scripts/atlas/duckdb/generate-schema-from-snapshot.mts [--output schema.ts] [--format drizzle|typescript]
 *
 * ⚠️ MUST be run from project root, NOT sveltekit-frontend/
 * This prevents creating duplicate DuckDB files in wrong locations.
 */

import fs from 'node:fs/promises';
import fsSync from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  createAtlasDuckDB,
} from '../../../packages/atlas-duckdb/src/index.ts';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, '../..');

/** Verify working directory is project root */
function validateWorkingDirectory(): void {
  const packageJsonPath = path.join(process.cwd(), 'package.json');
  if (!fsSync.existsSync(packageJsonPath)) {
    console.error(`❌ ERROR: Must be run from project root`);
    console.error(`   Current directory: ${process.cwd()}`);
    console.error(`   This script should be run from the workspace root, not from sveltekit-frontend/`);
    console.error(`\n   Fix: cd $(git rev-parse --show-toplevel) && npx tsx scripts/atlas/duckdb/generate-schema-from-snapshot.mts`);
    process.exit(1);
  }
}

interface ColumnInfo {
  name: string;
  type: string;
  nullable: boolean;
}

interface TableInfo {
  name: string;
  columns: ColumnInfo[];
}

function drizzleTypeFromDuckDB(duckdbType: string): string {
  const typeMap: Record<string, string> = {
    'INTEGER': 'integer',
    'BIGINT': 'bigint',
    'DOUBLE': 'real',
    'VARCHAR': 'text',
    'BOOLEAN': 'boolean',
    'TIMESTAMP': 'timestamp',
    'DATE': 'date',
    'FLOAT': 'real',
  };

  const normalized = duckdbType.toUpperCase();
  return typeMap[normalized] || 'text';
}

function generateDrizzleSchema(tables: TableInfo[]): string {
  let schema = `import { pgTable, text, integer, bigint, real, boolean, timestamp, date, vector } from 'drizzle-orm/pg-core';\n\n`;

  for (const table of tables) {
    schema += `export const ${table.name} = pgTable('${table.name}', {\n`;

    for (const col of table.columns) {
      const drizzleType = drizzleTypeFromDuckDB(col.type);
      const nullable = col.nullable ? '.notNull()' : '';
      schema += `  ${col.name}: ${drizzleType}('${col.name}')${nullable},\n`;
    }

    schema += `});\n\n`;
  }

  return schema;
}

function generateTypeScript(tables: TableInfo[]): string {
  let typescript = `// Auto-generated TypeScript types from DuckDB snapshot\n\n`;

  for (const table of tables) {
    const interfaceName = table.name
      .split('_')
      .map(part => part.charAt(0).toUpperCase() + part.slice(1))
      .join('');

    typescript += `export interface ${interfaceName} {\n`;

    for (const col of table.columns) {
      let tsType = 'unknown';
      const duckdbType = col.type.toUpperCase();

      if (duckdbType.includes('INT')) tsType = 'number';
      else if (duckdbType.includes('DOUBLE') || duckdbType.includes('FLOAT')) tsType = 'number';
      else if (duckdbType.includes('VARCHAR') || duckdbType.includes('TEXT')) tsType = 'string';
      else if (duckdbType.includes('BOOLEAN')) tsType = 'boolean';
      else if (duckdbType.includes('TIMESTAMP') || duckdbType.includes('DATE')) tsType = 'Date';

      const optional = col.nullable ? '?' : '';
      typescript += `  ${col.name}${optional}: ${tsType};\n`;
    }

    typescript += `}\n\n`;
  }

  return typescript;
}

async function main() {
  validateWorkingDirectory();

  const args = process.argv.slice(2);
  let outputFile = 'schema-generated.ts';
  let format = 'drizzle';

  for (const arg of args) {
    if (arg.startsWith('--output=')) {
      outputFile = arg.slice(9);
    } else if (arg.startsWith('--format=')) {
      format = arg.slice(9);
    }
  }

  console.log(`📋 Generating schema from snapshot...`);
  console.log(`Working directory: ${process.cwd()}`);
  console.log(`Output format: ${format}`);
  console.log(`Output file: ${outputFile}`);

  const startTime = performance.now();
  let db: Awaited<ReturnType<typeof createAtlasDuckDB>> | null = null;

  try {
    db = await createAtlasDuckDB();

    // Get all tables in the DuckDB database
    const tableNames = await db.connection.query(`
      SELECT table_name
      FROM information_schema.tables
      WHERE table_schema = 'main'
      ORDER BY table_name
    `) as Array<{ table_name: string }>;

    console.log(`\n📊 Found ${tableNames.length} tables`);

    const tables: TableInfo[] = [];

    for (const { table_name } of tableNames) {
      const columns = await db.connection.query(`
        SELECT column_name, data_type, is_nullable
        FROM information_schema.columns
        WHERE table_name = $1
        ORDER BY ordinal_position
      `, [table_name]) as Array<{ column_name: string; data_type: string; is_nullable: string }>;

      tables.push({
        name: table_name,
        columns: columns.map(col => ({
          name: col.column_name,
          type: col.data_type,
          nullable: col.is_nullable === 'YES',
        })),
      });

      console.log(`  ✓ ${table_name} (${columns.length} columns)`);
    }

    // Generate schema based on format
    let schemaContent = '';
    if (format === 'drizzle') {
      schemaContent = generateDrizzleSchema(tables);
    } else if (format === 'typescript') {
      schemaContent = generateTypeScript(tables);
    } else {
      throw new Error(`Unknown format: ${format}`);
    }

    // Write to file
    const outputPath = path.join(REPO_ROOT, outputFile);
    await fs.writeFile(outputPath, schemaContent, 'utf8');

    console.log(`\n✓ Schema generated: ${path.relative(REPO_ROOT, outputPath)}`);
    console.log(`✓ Tables: ${tables.length}`);
    console.log(`✓ Total columns: ${tables.reduce((sum, t) => sum + t.columns.length, 0)}`);

    const elapsed = ((performance.now() - startTime) / 1000).toFixed(2);
    console.log(`\n✅ Schema generation complete in ${elapsed}s`);
  } catch (err) {
    console.error(
      `❌ Schema generation failed: ${err instanceof Error ? err.message : String(err)}`
    );
    if (err instanceof Error && err.stack) {
      console.error(err.stack);
    }
    process.exit(1);
  } finally {
    if (db) {
      await db.close();
    }
  }
}

main().catch((err) => {
  console.error('Unhandled error:', err);
  process.exit(1);
});