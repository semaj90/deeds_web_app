/**
 * Minimal Postgres schema placeholder for the deeds-web app.
 * Export a typed, empty schema so importing this module causes no TypeScript errors.
 */

export type ColumnType = 'text' | 'integer' | 'boolean' | 'timestamp' | 'uuid' | 'jsonb';

export type TableDefinition = {
  [column: string]: ColumnType;
};

export type DatabaseSchema = {
  [table: string]: TableDefinition;
};

/**
 * Replace this empty object with your actual table definitions, for example:
 *
 * export const schema: DatabaseSchema = {
 *   users: {
 *     id: 'uuid',
 *     name: 'text',
 *     created_at: 'timestamp',
 *   },
 * };
 */
export const schema: DatabaseSchema = {};

export default schema;
