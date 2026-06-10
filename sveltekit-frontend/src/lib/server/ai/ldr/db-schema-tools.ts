import { pool } from '$lib/server/db/client.js';

export async function fetchDbSchemaContext(tables: string[]): Promise<string[]> {
  if (!tables.length) return [];

  const placeholders = tables.map((_, i) => `$${i + 1}`).join(', ');
  const sql = `
    SELECT table_name, column_name, data_type, is_nullable, column_default
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name IN (${placeholders})
    ORDER BY table_name, ordinal_position
  `;

  const { rows } = await pool.query<{
    table_name: string;
    column_name: string;
    data_type: string;
    is_nullable: string;
    column_default: string | null;
  }>(sql, tables);

  const byTable = new Map<string, string[]>();
  for (const row of rows) {
    const cols = byTable.get(row.table_name) ?? [];
    const nullable = row.is_nullable === 'YES' ? '?' : '';
    const def = row.column_default ? ` DEFAULT ${row.column_default}` : '';
    cols.push(`  ${row.column_name}${nullable}: ${row.data_type}${def}`);
    byTable.set(row.table_name, cols);
  }

  return Array.from(byTable.entries()).map(
    ([table, cols]) => `Table: ${table}\n${cols.join('\n')}`
  );
}
