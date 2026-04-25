declare module 'pg' {
  // Minimal Pool surface used by this project file.
  export class Pool {
    constructor(config?: any);
    query<T = any>(text: string, params?: any[]): Promise<{ rows: T[] }>;
    end(): Promise<void>;
  }
  export { Pool as default };
}
