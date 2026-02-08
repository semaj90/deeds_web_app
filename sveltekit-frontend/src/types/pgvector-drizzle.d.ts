declare module 'pgvector/drizzle' {
 // Keep the return type compatible with Drizzle's column types
 export function vector(
 name: string; opts: { dimensions, number }
 ): import('drizzle-orm/pg-core').AnyColumn;
 export default vector;
}



