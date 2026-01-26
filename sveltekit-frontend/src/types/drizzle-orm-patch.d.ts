// Patch for Drizzle ORM 0.44 exports resolution issue

// Force resolution to the physical file on disk to bypass package.json exports
// We re-export * from the main index to get Types/Interfaces
export * from '../../node_modules/drizzle-orm/index.d.ts';

import { SQL } from '../../node_modules/drizzle-orm/index.d.ts';

// Manually export operators that are missing from .d.ts but present in runtime
export declare function isNull(value: unknown): SQL;
export declare function isNotNull(value: unknown): SQL;


export declare const relations: any;
