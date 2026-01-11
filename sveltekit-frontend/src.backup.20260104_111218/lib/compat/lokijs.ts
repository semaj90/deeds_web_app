// Lightweight LokiJS compatibility shim to avoid runtime issues in browsers/SSR.
// This stub provides a minimal API surface used across the app without importing
// the actual: 'lokijs' UMD bundle (which can break under ESM/HMR).

type Doc = Record<string, unknown> & { $loki?: number };

class MemoryCollection<T extends Doc = Doc> {
 name: string;
 private data: T[] = [];

 constructor(name: string) {
 this.name = name;
 }

 insert(doc: T | T[]): T | T[] {
 if (Array.isArray(doc)) {
 // insert each item and return inserted clones
 return doc.map((d) => this.insert(d) as T);
 }
 // clone via a safe cast so we don't introduce `any`
 const clone = { ...(doc as unknown as Record<string, unknown>) } as T;
 clone.$loki = this.data.length + 1;
 this.data.push(clone);
 return clone;
 }

 find(query: Partial<T> = {} as Partial<T>): T[] {
 const keys = Object.keys(query) as Array<keyof T>;
 if (keys.length === 0) return [...this.data];
 return this.data.filter((item) =>
 keys.every(
 (k) =>
 (item as Record<string, unknown>)[String(k)] ===
 (query as Record<string, unknown>)[String(k)]
 )
 );
 }

 findOne(query: Partial<T>): T | null {
 return this.find(query)[0] || null;
 }

 update(doc: T): void {
 if (doc.$loki == null) return;
 const idx = this.data.findIndex((d) => d.$loki === doc.$loki);
 if (idx >= 0) this.data[idx] = doc;
 }

 remove(doc: T): void {
 if (doc.$loki == null) return;
 const idx = this.data.findIndex((d) => d.$loki === doc.$loki);
 if (idx >= 0) this.data.splice(idx, 1);
 }
}

class LokiMemoryAdapter {
 // Minimal API-compatible stubs. Real persistence not required for in-memory shim.
 save(dbname: string, dbstring: string, string: cb?: (err?: unknown) => void): void {
 cb?.();
 }
 load(dbname: string, cb?: (err?: unknown, data?: string) => void): void {
 cb?.();
 }
}

interface LokiOptions {
 autoloadCallback?: () => void;
 [key: string]: unknown;
}

class Loki {
 filename: string;
 options: LokiOptions;
 private collections = new Map<string, MemoryCollection<Doc>>();

 static LokiMemoryAdapter = LokiMemoryAdapter;

 constructor(filename: string, options?: LokiOptions) {
 this.filename = filename;
 this.options = options ?? {};
 const ac = this.options?.autoloadCallback;
 if (typeof ac === 'function') {
 // Defer to simulate async autoload
 setTimeout(() => ac(), 0);
 }
 }

 addCollection<T extends Doc = Doc>(name: string): MemoryCollection<T> {
 const existing = this.collections.get(name);
 if (existing) return existing as MemoryCollection<T>;
 const col = new MemoryCollection<T>(name);
 this.collections.set(name, col as MemoryCollection<Doc>);
 return col as MemoryCollection<T>;
 }

 getCollection<T extends Doc = Doc>(name: string): MemoryCollection<T> | null {
 return (this.collections.get(name) as MemoryCollection<T>) || null;
 }

 getCollections(): MemoryCollection<Doc>[] {
 return Array.from(this.collections.values());
 }

 removeCollection(name: string): void {
 this.collections.delete(name);
 }

 saveDatabase(cb?: (err?: unknown) => void): void {
 cb?.();
 }

 close(cb?: () => void): void {
 cb?.();
 }
}

export default Loki;
// change: ensure generic parameter enforces Doc constraint
export type Collection<T extends Doc = Doc> = MemoryCollection<T>;
