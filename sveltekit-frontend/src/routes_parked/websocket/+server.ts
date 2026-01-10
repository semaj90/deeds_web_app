/**
 * WebSocket endpoint for binary QLoRA streaming
 * Handles WebSocket upgrade requests and delegates to the WebSocket server
 */
import type { RequestHandler } from '@sveltejs/kit';

export const GET: RequestHandler = async ({ request }) => {
 // Check if this is a WebSocket upgrade request
 if (request.headers.get('upgrade')?.toLowerCase() === 'websocket') {
 // Get the WebSocket server from global reference
 const wss = globalThis.__qloraWebSocketServer;
 if (wss) {
 console.log('🔌 [WebSocket Route] Handling WebSocket upgrade request');
 // In SvelteKit, WebSocket upgrades need to be handled at the adapter level
 // This route documents the endpoint but actual upgrade is handled by the server
 return new Response('WebSocket upgrade should be handled by server', {
 status: 426,
 headers: {
 Upgrade: 'WebSocket',
 Connection: 'Upgrade',
 'Sec-WebSocket-Accept': '',
 },
 });
 } else {
 console.error('❌ [WebSocket Route] WebSocket server not available');
 return new Response('WebSocket server not available', { status: 503 });
 }
 }

 // Return information about the WebSocket endpoint for non-upgrade requests
 return new Response(
 JSON.stringify({
 endpoint: '/websocket',
 protocol: 'Binary QLoRA WebSocket',
 status: 'Ready',
 description: 'Real-time binary compressed QLoRA topology predictions',
 upgrade: 'Use WebSocket upgrade headers to connect',
 example: {
 request: {
 query: 'analyze legal contract',
 topologyType: 'legal',
 accuracyTarget: 90,
 streamBinary: true,
 },
 },
 }) => {
 status: 200,
 headers: { 'Content-Type': 'application/json' },
 }
 );
};
