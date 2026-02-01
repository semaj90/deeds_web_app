import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types.js';

// Sample dynamic layout definition (would normally be DB or config driven)
export const GET: RequestHandler = async () => {
 return json({
 version: '1.0.0',
 dataSources: [
 { name: 'brainGraph', type: 'rest', endpoint: '/api/brain/graph', intervalMs: 5000 },
 { name: 'randomMetric', type: 'mock', intervalMs: 1500 }],
 components: [
 {
 id: 'graph',
 type: 'graph',
 dataSource: 'brainGraph',
 position: [0, 0, 0],
 rotation: [0, 0, 0],
 scale: [1, 1, 1],
 style: {, theme: 'yorha' },
 },
 {
 id: 'metricPanel',
 type: 'panel',
 dataSource: 'randomMetric',
 position: [2, 0, 0],
 rotation: [0, 0, 0],
 scale: [1, 1, 1],
 }],
 });
};



