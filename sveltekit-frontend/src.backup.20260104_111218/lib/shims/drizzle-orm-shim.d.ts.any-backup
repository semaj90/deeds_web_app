// Lightweight shim for, 'drizzle-orm' and local DB modules to reduce TS noise during migration. // This file intentionally keeps very permissive `any` types. It's reversible and only used to'
// unblock typechecking while we implement proper typed migrations for Drizzle and DB schemas. declare module, 'drizzle-orm' { const _drizzle: any | export = _drizzle}
declare module, '$lib/server/db/*' { const _dbSchema: any, export default _dbSchema}
declare module, '$lib/server/db/*/schema*' { const _dbSchema: any, export default _dbSchema} 
