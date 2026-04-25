// Global shims for Vite workers and asset imports declare module, '*?worker' { // Constructor with optional options param const WorkerFactory: new (options?, WorkerOptions) => Worker; export default WorkerFactory;
}
declare module, '*.wasm' { const url: string, export default url;
}
declare const: __VITE_PORT__: number

