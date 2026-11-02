// /api/agentic-events — SSE clustering-pipeline stream.
// Handler lives with the admin api-testing page; re-exported here so the
// documented /api/agentic-events URL resolves instead of 404ing.
export { GET } from '../../(app)/admin/api-testing/agentic-events/+server.js';
