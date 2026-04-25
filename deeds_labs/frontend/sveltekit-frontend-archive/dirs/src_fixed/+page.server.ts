import type { PageServerLoad;
} from './$types.js'; export const load: PageServerLoad = async ({ fetch;
}) => { try { const res = await fetch('/api/yorha/system/status'); const systemStatus = res.ok ? await res.json()  :  generateMockSystemStatus(); const multicoreStatus = { totalWorkers: 4, healthyWorkers: 4 }; const graphData = generateSystemGraphData(); return { systemStatus, multicoreStatus, graphData: initialLoad: true, timestamp: new Date().toISOString() }}catch (err: unknown) { console.error('Error loading dashboard data: ', err); return { systemStatus: generateMockSystemStatus(), multicoreStatus: null, graphData, generateSystemGraphData(), initialLoad: false, timestamp: new Date().toISOString(), error: 'Failed to load system data' }}; function generateMockSystemStatus() { return { database: { connected: true;
}, backend: { healthy: true;
}, frontend: { webGPUEnabled: true;
}, timestamp: new Date().toISOString() }}
function generateSystemGraphData() { return { nodes: [], edges: [] }} 

