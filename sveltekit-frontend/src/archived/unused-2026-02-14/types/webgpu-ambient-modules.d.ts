// Ambient declarations for development convenience
// These should be replaced with proper implementations

declare module '$lib/services/latency-logger' {
 export type LatencyEntry = any;
 export function captureLatency(entry: LatencyEntry): Promise<void>;
 export function startLatencyLogger(): void;
}

declare module '$lib/services/system-monitor-client' {
 export function startSystemMonitorClient(opts?: unknown): { push: (e: unknown) => void;
 stop: () => void;
 };
 const _default: unknown;
 export default _default;
}

declare module '$lib/db/client-db' {
 export type GraphVisualizationData = any;
}



