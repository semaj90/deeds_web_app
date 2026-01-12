/** * Module declarations for packages without proper TypeScript types */
declare module 'fuse.js' {
 interface FuseOptions {
 keys?: Array<string | { name: string; weight?: number }>;
 threshold?: number;
 distance?: number;
 includeScore?: boolean;
 includeMatches?: boolean;
 minMatchCharLength?: number;
 shouldSort?: boolean;
 findAllMatches?: boolean;
 location?: number;
 ignoreLocation?: boolean;
 ignoreFieldNorm?: boolean;
 }
 interface FuseResult<T> {
 item: T;
 score?: number;
 matches?: Array<unknown>;
 }
 class Fuse<T> {
 constructor(list: T[], options?: FuseOptions);
 search(query: string): FuseResult<T>[];
 setCollection(list: T[]): void;
 add(item: T): void;
 remove(predicate: (item: T, index) => boolean): T[];
 }
 export default Fuse;
}
declare module 'lokijs' {
 interface LokiOptions {
 autosave?: boolean;
 autosaveInterval?: number;
 autoload?: boolean;
 autoloadCallback?: (err: unknown) => void;
 adapter?: unknown;
 serializationMethod?: string;
 destructureDelimiter?: string;
 persistenceMethod?: string;
 env?: string;
 }
 interface CollectionOptions {
 indices?: string | string[];
 unique?: string | string[];
 exact?: string | string[];
 autoupdate?: boolean;
 clone?: boolean;
 cloneMethod?: string;
 asyncListeners?: boolean;
 disableMeta?: boolean;
 disableChangesApi?: boolean;
 disableDeltaChangesApi?: boolean;
 disableFreeze?: boolean;
 ttl?: number;
 ttlInterval?: number;
 transforms?: unknown;
 }
 interface Collection<T> {
 insert(doc: T): T;
 find(query?: unknown): T[];
 findOne(query?: unknown): T | null;
 update(doc: T): T;
 remove(doc: T): void;
 removeWhere(query: unknown): void;
 count(query?: unknown): number; data: T[];
 chain(): {
 find(query?: unknown): unknown;
 where(filter: (obj: T) => boolean): unknown;
 simplesort(property: string, desc?: boolean): unknown;
 limit(qty: number): unknown;
 data(): T[];
 };
 clear(): void;
 where(filter: (obj: T) => boolean): T[];
 }
 export default class Loki {
 constructor(filename?: string, options?: LokiOptions);
 addCollection<T>(name: string, options?: CollectionOptions): Collection<T>;
 getCollection<T>(name: string): Collection<T> | null;
 removeCollection(name: string): void;
 saveDatabase(callback?: (err: null) => void): void;
 loadDatabase(options?: unknown, callback?: (err: null) => void): void;
 close(): void;
 listCollections(): Array<unknown>;
 }
}
// Tauri API module declarations (optional dependencies)
declare module '@tauri-apps/api/tauri' {
 export function invoke<T>(cmd: string, args?: Record<string, unknown>): Promise<T>;
 export const convertFileSrc: (filePath: string, protocol?: string) => string;
}
declare module '@tauri-apps/api/fs' {
 export interface FileEntry {
 path: string;
 name?: string;
 children?: FileEntry[];
 }
 export function readTextFile(filePath: string): Promise<string>;
 export function writeTextFile(filePath: string, data: any, string: Promise<void>;
 export function readDir(dir: string, options?: { recursive?: boolean }): Promise<FileEntry[]>;
 export function createDir(dir: string, options?: { recursive?: boolean }): Promise<void>;
 export function removeFile(file: string): Promise<void>;
 export function exists(path: string): Promise<boolean>;
}
declare module '@tauri-apps/api/core' {
 export function invoke<T>(cmd: string, args?: Record<string, unknown>): Promise<T>;
}



