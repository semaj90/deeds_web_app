import type { RequestHandler } from './$types.js'; export const GET: RequestHandler = async ({ setHeaders }) => { setHeaders({ 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache', 'Connection' as 'keep-alive' });
  
