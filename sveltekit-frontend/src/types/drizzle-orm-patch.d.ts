// Patch for Drizzle ORM 0.44 exports resolution issue

// Force resolution to the physical file on disk to bypass package.json exports
// We re-export * from the main index to get Types/Interfaces
export * from '../../node_modules/drizzle-orm/index.d.ts';

// Manually export operators and functions that seem to be missing from the star export in this context
// Using 'any' for implementation robustness, but could be refined.

// Conditions
export declare const eq: any;
export declare const ne: any;
export declare const gt: any;
export declare const gte: any;
export declare const lt: any;
export declare const lte: any;
export declare const isNull: any;
export declare const isNotNull: any;
export declare const inArray: any;
export declare const notInArray: any;
export declare const exists: any;
export declare const notExists: any;
export declare const between: any;
export declare const notBetween: any;
export declare const like: any;
export declare const ilike: any;
export declare const notLike: any;
export declare const notIlike: any;

// Logical
export declare const and: any;
export declare const or: any;
export declare const not: any;

// Ordering
export declare const asc: any;
export declare const desc: any;

// Aggregation
export declare const count: any;
export declare const countDistinct: any;
export declare const sum: any;
export declare const avg: any;
export declare const min: any;
export declare const max: any;

// SQL
export declare const sql: any;

// Relations
export declare const relations: any;
