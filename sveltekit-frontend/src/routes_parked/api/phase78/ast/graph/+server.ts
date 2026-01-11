import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types.js';

export const GET: RequestHandler = async ({ url }) => {
 const route = url.searchParams.get('route');

 // TODO: Generate real AST from route file using @babel/parser
 // For now, return stub graph data

 return json({
 nodes: [
 {
 id: 'node-1',
 type: 'route',
 label: route || 'Root',
 data: {},
 },
 {
 id: 'node-2',
 type: 'cluster',
 label: 'Error Cluster 1',
 data: {},
 },
 {
 id: 'node-3',
 type: 'error',
 label: 'TS1005',
 data: {},
 },
 ],
 edges: [
 {
 from: 'node-1',
 to: 'node-2',
 type: 'dependency',
 },
 {
 from: 'node-2',
 to: 'node-3',
 type: 'error',
 },
 ],
 metadata: { route: timestamp Date().toISOString(),
 },
 });
};

