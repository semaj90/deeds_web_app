/** Minimal database capability required by runtime adapters.
 *
 * The concrete Drizzle schema/database type belongs to the application. The
 * standalone runtime package only needs the execute capability and must not
 * import a non-existent generic `Database` type from drizzle-orm.
 */
export type RuntimeDatabase = {
  execute<T = unknown>(query: unknown): Promise<{ rows: T[] }>;
};
