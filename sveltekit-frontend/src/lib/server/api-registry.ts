/**
 * API Registry — Categorized catalog of all 175+ API endpoints.
 * Used by /api/docs and /all-routes for organized display.
 */

export interface ApiEndpoint {
	path: string;
	methods: string[];
	category: string;
	description: string;
	status: 'active' | 'legacy' | 'stub';
}

export type ApiCategory =
	| 'Auth'
	| 'Cases'
	| 'Evidence'
	| 'Persons'
	| 'Citations'
	| 'AI/Chat'
	| 'RAG/Search'
	| 'Analytics'
	| 'Graph'
	| 'Tags'
	| 'Infrastructure'
	| 'Admin'
	| 'Indexing'
	| 'Pipeline'
	| 'Reports'
	| 'Vision'
	| 'Tools'
	| 'Legacy'
	| 'Documents'
	| 'Embeddings'
	| 'Health'
	| 'Cache'
	| 'Codebase'
	| 'Routes'
	| 'System';

export const API_REGISTRY: ApiEndpoint[] = [
	// ── Auth ─────────────────────────────────────
	{ path: '/api/auth/login', methods: ['POST'], category: 'Auth', description: 'User login (Lucia v3)', status: 'active' },
	{ path: '/api/auth/register', methods: ['POST'], category: 'Auth', description: 'User registration', status: 'active' },
	{ path: '/api/auth/logout', methods: ['GET', 'POST'], category: 'Auth', description: 'Invalidate session', status: 'active' },
	{ path: '/api/auth/session', methods: ['GET'], category: 'Auth', description: 'Get current session', status: 'active' },
	{ path: '/api/auth/me', methods: ['GET'], category: 'Auth', description: 'Get authenticated user', status: 'active' },
	{ path: '/api/auth/demo-login', methods: ['GET', 'POST'], category: 'Auth', description: 'Demo login', status: 'active' },
	{ path: '/api/auth/health', methods: ['GET'], category: 'Auth', description: 'Auth service health', status: 'active' },
	{ path: '/api/auth/debug', methods: ['GET'], category: 'Auth', description: 'Debug auth state', status: 'active' },

	// ── Cases ────────────────────────────────────
	{ path: '/api/cases', methods: ['GET', 'POST', 'PATCH', 'DELETE'], category: 'Cases', description: 'Case CRUD', status: 'active' },
	{ path: '/api/cases/[id]', methods: ['GET', 'PATCH', 'DELETE'], category: 'Cases', description: 'Get/update/delete case', status: 'active' },
	{ path: '/api/cases/[id]/analyze/stream', methods: ['POST'], category: 'Cases', description: 'Stream case analysis', status: 'active' },
	{ path: '/api/cases/[id]/canvas', methods: ['GET', 'POST'], category: 'Cases', description: 'Case canvas visualization', status: 'active' },
	{ path: '/api/cases/[id]/citations', methods: ['GET', 'POST'], category: 'Cases', description: 'Case citations', status: 'active' },
	{ path: '/api/cases/[id]/laws', methods: ['GET', 'POST'], category: 'Cases', description: 'Laws linked to case', status: 'active' },
	{ path: '/api/cases/[id]/notes', methods: ['GET', 'POST'], category: 'Cases', description: 'Case notes', status: 'active' },
	{ path: '/api/cases/[id]/notes/[noteId]', methods: ['GET', 'PATCH', 'DELETE'], category: 'Cases', description: 'Specific note CRUD', status: 'active' },

	// ── Evidence ─────────────────────────────────
	{ path: '/api/evidence/upload', methods: ['POST'], category: 'Evidence', description: '8-stage upload pipeline', status: 'active' },
	{ path: '/api/evidence/search', methods: ['POST'], category: 'Evidence', description: 'RAG+KAG+DAG search', status: 'active' },
	{ path: '/api/evidence/analysis', methods: ['POST'], category: 'Evidence', description: 'Entity extraction + forensics', status: 'active' },
	{ path: '/api/evidence/realtime', methods: ['GET'], category: 'Evidence', description: 'SSE processing progress', status: 'active' },
	{ path: '/api/evidence/[docId]/status', methods: ['GET'], category: 'Evidence', description: 'Upload status', status: 'active' },
	{ path: '/api/v1/evidence/analyze', methods: ['POST'], category: 'Evidence', description: 'V1 evidence analysis', status: 'legacy' },

	// ── Persons ──────────────────────────────────
	{ path: '/api/persons', methods: ['GET', 'POST'], category: 'Persons', description: 'Persons of interest CRUD', status: 'active' },
	{ path: '/api/persons-of-interest/[id]/associates', methods: ['GET'], category: 'Persons', description: 'List associates', status: 'active' },
	{ path: '/api/persons-of-interest/[id]/associates/[associateId]', methods: ['DELETE'], category: 'Persons', description: 'Remove associate', status: 'active' },

	// ── Citations ────────────────────────────────
	{ path: '/api/citations', methods: ['GET', 'POST'], category: 'Citations', description: 'Citation search + creation', status: 'active' },
	{ path: '/api/statutes/search', methods: ['POST'], category: 'Citations', description: 'Search statutes', status: 'active' },
	{ path: '/api/precedents/search', methods: ['POST'], category: 'Citations', description: 'Search precedents', status: 'active' },
	{ path: '/api/glossary/search', methods: ['POST'], category: 'Citations', description: 'Search legal glossary', status: 'active' },

	// ── AI/Chat ──────────────────────────────────
	{ path: '/api/ai/chat', methods: ['POST'], category: 'AI/Chat', description: 'Simple JSON chat', status: 'active' },
	{ path: '/api/ai/case-prediction', methods: ['POST'], category: 'AI/Chat', description: 'Case outcome prediction', status: 'active' },
	{ path: '/api/ai/case-scoring', methods: ['POST'], category: 'AI/Chat', description: 'Evidence-weighted scoring', status: 'active' },
	{ path: '/api/ai/feedback', methods: ['POST'], category: 'AI/Chat', description: 'Chat feedback/rating', status: 'active' },
	{ path: '/api/ai/models', methods: ['GET'], category: 'AI/Chat', description: 'Available models list', status: 'active' },
	{ path: '/api/ai/stats', methods: ['GET'], category: 'AI/Chat', description: 'AI inference statistics', status: 'active' },
	{ path: '/api/ai/yorha/context-chat', methods: ['POST'], category: 'AI/Chat', description: 'YorHa AI assistant', status: 'active' },
	{ path: '/api/agents/chat', methods: ['POST'], category: 'AI/Chat', description: 'Agent chat with tool-use', status: 'active' },
	{ path: '/api/chat', methods: ['POST'], category: 'AI/Chat', description: 'Main chat endpoint', status: 'active' },
	{ path: '/api/chat/stream', methods: ['GET', 'POST'], category: 'AI/Chat', description: 'Streaming chat SSE', status: 'active' },
	{ path: '/api/chat/migrate', methods: ['POST'], category: 'AI/Chat', description: 'Session migration', status: 'active' },
	{ path: '/api/sse/chat', methods: ['POST'], category: 'AI/Chat', description: 'ACE context SSE chat', status: 'active' },
	{ path: '/api/stream', methods: ['GET'], category: 'AI/Chat', description: 'Generic streaming', status: 'active' },
	{ path: '/api/stream/[chatId]', methods: ['GET'], category: 'AI/Chat', description: 'Stream specific chat', status: 'active' },

	// ── RAG/Search ───────────────────────────────
	{ path: '/api/rag/search', methods: ['POST'], category: 'RAG/Search', description: 'Vector search + ranking', status: 'active' },
	{ path: '/api/rag/validate', methods: ['POST'], category: 'RAG/Search', description: 'Validate + score sources', status: 'active' },
	{ path: '/api/rag/answer', methods: ['POST'], category: 'RAG/Search', description: 'Generate answer with citations', status: 'active' },
	{ path: '/api/knowledge/search', methods: ['POST'], category: 'RAG/Search', description: 'Knowledge base search', status: 'active' },
	{ path: '/api/knowledge/document/[id]', methods: ['GET'], category: 'RAG/Search', description: 'Knowledge document', status: 'active' },
	{ path: '/api/knowledge/stats', methods: ['GET'], category: 'RAG/Search', description: 'Knowledge stats', status: 'active' },
	{ path: '/api/knowledge/stream', methods: ['POST'], category: 'RAG/Search', description: 'Knowledge search streaming', status: 'active' },
	{ path: '/api/knowledge', methods: ['GET', 'POST', 'PATCH'], category: 'RAG/Search', description: 'Knowledge base CRUD', status: 'active' },
	{ path: '/api/kb/validate', methods: ['GET', 'POST'], category: 'RAG/Search', description: 'Knowledge validation', status: 'active' },
	{ path: '/api/summarize', methods: ['POST'], category: 'RAG/Search', description: 'Text summarization', status: 'active' },

	// ── Analytics ────────────────────────────────
	{ path: '/api/analytics/events', methods: ['GET', 'POST'], category: 'Analytics', description: 'Log/retrieve events', status: 'active' },
	{ path: '/api/analytics/summary', methods: ['GET'], category: 'Analytics', description: 'Weekly summary stats', status: 'active' },
	{ path: '/api/analytics/patterns', methods: ['GET'], category: 'Analytics', description: 'Top query patterns', status: 'active' },

	// ── Graph ────────────────────────────────────
	{ path: '/api/graph/relationships', methods: ['GET'], category: 'Graph', description: 'Entity relationships (Neo4j)', status: 'active' },
	{ path: '/api/graph/connections', methods: ['GET'], category: 'Graph', description: 'Case connections via shared entities', status: 'active' },
	{ path: '/api/graph/sync', methods: ['POST'], category: 'Graph', description: 'PostgreSQL → Neo4j sync', status: 'active' },

	// ── Tags ─────────────────────────────────────
	{ path: '/api/tags', methods: ['GET'], category: 'Tags', description: 'List all unique tags', status: 'active' },
	{ path: '/api/tags/search', methods: ['GET'], category: 'Tags', description: 'Semantic tag search (Qdrant)', status: 'active' },
	{ path: '/api/tags/[tagId]', methods: ['GET'], category: 'Tags', description: 'Tag detail (CouchDB)', status: 'active' },
	{ path: '/api/analyze-tag', methods: ['POST'], category: 'Tags', description: 'Tag analysis (Ollama)', status: 'active' },

	// ── Embeddings ───────────────────────────────
	{ path: '/api/embed', methods: ['GET', 'POST'], category: 'Embeddings', description: '768-dim embedding service', status: 'active' },

	// ── Health ───────────────────────────────────
	{ path: '/api/health', methods: ['GET'], category: 'Health', description: 'Overall system health', status: 'active' },
	{ path: '/api/health/capabilities', methods: ['GET'], category: 'Health', description: 'Server capabilities (30s cache)', status: 'active' },
	{ path: '/api/health/database', methods: ['GET'], category: 'Health', description: 'PostgreSQL connectivity', status: 'active' },
	{ path: '/api/health/neo4j', methods: ['GET'], category: 'Health', description: 'Neo4j graph health', status: 'active' },
	{ path: '/api/health/ocr', methods: ['GET', 'POST'], category: 'Health', description: 'OCR service health', status: 'active' },
	{ path: '/api/health/ollama', methods: ['GET'], category: 'Health', description: 'Ollama LLM health', status: 'active' },
	{ path: '/api/health/redis', methods: ['GET'], category: 'Health', description: 'Redis cache health', status: 'active' },
	{ path: '/api/health/search', methods: ['GET'], category: 'Health', description: 'Qdrant search health', status: 'active' },
	{ path: '/api/health/services', methods: ['GET'], category: 'Health', description: 'All services summary', status: 'active' },

	// ── Cache ────────────────────────────────────
	{ path: '/api/cache', methods: ['GET', 'POST', 'DELETE'], category: 'Cache', description: 'Cache CRUD', status: 'active' },
	{ path: '/api/cache/metrics', methods: ['GET'], category: 'Cache', description: 'Cache metrics', status: 'active' },
	{ path: '/api/cache/nintendo', methods: ['GET'], category: 'Cache', description: 'NES cartridge cache', status: 'active' },
	{ path: '/api/cache/recent-queries', methods: ['GET', 'POST'], category: 'Cache', description: 'Recent query cache', status: 'active' },

	// ── Codebase ─────────────────────────────────
	{ path: '/api/codebase/index', methods: ['GET', 'POST'], category: 'Codebase', description: 'Index codebase', status: 'active' },
	{ path: '/api/codebase/recall', methods: ['POST'], category: 'Codebase', description: 'Dual-vector recall', status: 'active' },
	{ path: '/api/codebase/rerank', methods: ['POST'], category: 'Codebase', description: 'GPU rerank chunks', status: 'active' },
	{ path: '/api/codebase/apply-patch', methods: ['POST'], category: 'Codebase', description: 'Apply code patch', status: 'active' },
	{ path: '/api/codebase-index', methods: ['GET', 'POST'], category: 'Codebase', description: 'Codebase indexing', status: 'active' },
	{ path: '/api/codebase-index/clusters', methods: ['GET'], category: 'Codebase', description: 'Error clustering', status: 'active' },
	{ path: '/api/codebase-index/errors', methods: ['GET'], category: 'Codebase', description: 'Error listing', status: 'active' },
	{ path: '/api/codebase-index/graph', methods: ['GET'], category: 'Codebase', description: 'Error dependency graph', status: 'active' },
	{ path: '/api/codebase-index/reindex', methods: ['POST'], category: 'Codebase', description: 'Reindex codebase', status: 'active' },
	{ path: '/api/codebase-index/search', methods: ['GET'], category: 'Codebase', description: 'Codebase search', status: 'active' },
	{ path: '/api/codebase-index/stats', methods: ['GET'], category: 'Codebase', description: 'Indexing statistics', status: 'active' },
	{ path: '/api/codebase-index/error-filters', methods: ['GET'], category: 'Codebase', description: 'Error filter options', status: 'active' },

	// ── Admin/Tools ──────────────────────────────
	{ path: '/api/admin/agent/fix', methods: ['POST'], category: 'Admin', description: 'Agent-powered fixes', status: 'active' },
	{ path: '/api/admin/knowledge', methods: ['GET'], category: 'Admin', description: 'Knowledge base admin', status: 'active' },
	{ path: '/api/admin/routes', methods: ['GET'], category: 'Admin', description: 'Route analytics', status: 'active' },
	{ path: '/api/admin/routes/stream', methods: ['GET'], category: 'Admin', description: 'Route event streaming', status: 'active' },
	{ path: '/api/acp/execute', methods: ['POST'], category: 'Tools', description: 'ACP tool execution', status: 'active' },
	{ path: '/api/acp/tools', methods: ['GET'], category: 'Tools', description: 'ACP tool schemas', status: 'active' },
	{ path: '/api/tools/execute', methods: ['GET', 'POST'], category: 'Tools', description: 'MCP tool execution', status: 'active' },

	// ── Documents ────────────────────────────────
	{ path: '/api/cartridge/export', methods: ['POST'], category: 'Documents', description: 'NES cartridge export', status: 'active' },
	{ path: '/api/document/[docId]', methods: ['GET'], category: 'Documents', description: 'Document metadata', status: 'active' },
	{ path: '/api/analyze-file', methods: ['POST'], category: 'Documents', description: 'File analysis', status: 'active' },

	// ── Reports ──────────────────────────────────
	{ path: '/api/reports', methods: ['GET', 'POST'], category: 'Reports', description: 'Reports CRUD', status: 'active' },
	{ path: '/api/reports/generate', methods: ['POST'], category: 'Reports', description: 'Generate legal report', status: 'active' },
	{ path: '/api/reports/save', methods: ['POST'], category: 'Reports', description: 'Save report', status: 'active' },

	// ── Vision ───────────────────────────────────
	{ path: '/api/vision/analyze', methods: ['GET', 'POST'], category: 'Vision', description: 'YOLO image analysis', status: 'active' },

	// ── Routes/Monitoring ────────────────────────
	{ path: '/api/routes/events', methods: ['GET'], category: 'Routes', description: 'Route event SSE', status: 'active' },
	{ path: '/api/routes/[routeId]/errors', methods: ['GET', 'POST'], category: 'Routes', description: 'Route errors', status: 'active' },
	{ path: '/api/routes/[routeId]/health-event', methods: ['GET', 'POST'], category: 'Routes', description: 'Route health events', status: 'active' },
	{ path: '/api/routes/[routeId]/interactions', methods: ['GET', 'POST'], category: 'Routes', description: 'Route interactions', status: 'active' },
	{ path: '/api/routes/[routeId]/error-brain-analyses', methods: ['GET'], category: 'Routes', description: 'Error brain analyses', status: 'active' },
	{ path: '/api/routes/[routeId]/error-brain-analysis', methods: ['POST'], category: 'Routes', description: 'Create analysis', status: 'active' },
	{ path: '/api/routes/[routeId]/error-brain-patch', methods: ['POST'], category: 'Routes', description: 'Create patch', status: 'active' },
	{ path: '/api/routes/[routeId]/error-brain-patch/[patchId]', methods: ['PUT'], category: 'Routes', description: 'Apply patch', status: 'active' },

	// ── Pipeline/Indexing ────────────────────────
	{ path: '/api/indexing', methods: ['GET', 'POST'], category: 'Indexing', description: 'Document indexing', status: 'active' },
	{ path: '/api/pipeline/run', methods: ['POST'], category: 'Pipeline', description: 'Run pipeline job', status: 'active' },
	{ path: '/api/pipeline/status/[jobId]', methods: ['GET'], category: 'Pipeline', description: 'Job status', status: 'active' },
	{ path: '/api/generate-cluster-summaries', methods: ['POST'], category: 'Pipeline', description: 'Summarize clusters', status: 'active' },

	// ── System ───────────────────────────────────
	{ path: '/api/consolidation/status', methods: ['GET'], category: 'System', description: 'Migration status', status: 'active' },
	{ path: '/api/dashboard/stats', methods: ['GET'], category: 'System', description: 'Dashboard statistics', status: 'active' },
	{ path: '/api/errors/summary', methods: ['GET'], category: 'System', description: 'Error summary', status: 'active' },
	{ path: '/api/ollama/pull', methods: ['GET', 'POST'], category: 'System', description: 'Pull Ollama models', status: 'active' },
	{ path: '/api/ping', methods: ['GET'], category: 'System', description: 'Simple ping', status: 'active' },
	{ path: '/api/rabbitmq/publish', methods: ['GET', 'POST'], category: 'System', description: 'RabbitMQ job publishing', status: 'active' },
	{ path: '/api/system/env', methods: ['GET'], category: 'System', description: 'Environment (dev only)', status: 'active' },
	{ path: '/api/system/health', methods: ['GET'], category: 'System', description: 'System health', status: 'active' },
	{ path: '/api/topology', methods: ['GET'], category: 'System', description: 'System topology', status: 'active' },
	{ path: '/api/topology/stream', methods: ['GET'], category: 'System', description: 'Topology SSE', status: 'active' },
	{ path: '/api/security/validate/progress', methods: ['GET'], category: 'System', description: 'Validation progress', status: 'active' },

	// ── Legacy (Phase routes) ────────────────────
	{ path: '/api/phase72/errors', methods: ['GET'], category: 'Legacy', description: 'Phase 72 error table', status: 'legacy' },
	{ path: '/api/phase72/suggest-fix', methods: ['POST'], category: 'Legacy', description: 'Ollama-powered fixes', status: 'legacy' },
	{ path: '/api/phase82/status', methods: ['GET'], category: 'Legacy', description: 'Phase 82 upgrade status', status: 'legacy' },
	{ path: '/api/phase82/upgrade-route', methods: ['POST'], category: 'Legacy', description: 'Phase 82 upgrade', status: 'legacy' },
	{ path: '/api/internal/error-brain/runs', methods: ['GET', 'POST'], category: 'Legacy', description: 'Error brain runs', status: 'active' },
	{ path: '/api/internal/error-brain/status', methods: ['GET'], category: 'Legacy', description: 'Error brain status', status: 'active' },
	{ path: '/api/system/phase78/status', methods: ['GET'], category: 'Legacy', description: 'Phase 78 status', status: 'legacy' },
	{ path: '/api/system/phase78/apply-patch', methods: ['POST'], category: 'Legacy', description: 'Phase 78 patch', status: 'legacy' },

	// ── Phase 89 (Codebase Analyzer) ─────────────
	{ path: '/api/phase89/analyze', methods: ['POST'], category: 'Codebase', description: 'Phase 89 analysis', status: 'active' },
	{ path: '/api/phase89/activity', methods: ['GET'], category: 'Codebase', description: 'Activity analysis', status: 'active' },
	{ path: '/api/phase89/agentic-fix', methods: ['POST'], category: 'Codebase', description: 'Agentic code fix', status: 'active' },
	{ path: '/api/phase89/clusters', methods: ['GET'], category: 'Codebase', description: 'Error clusters', status: 'active' },
	{ path: '/api/phase89/components', methods: ['GET'], category: 'Codebase', description: 'Component analysis', status: 'active' },
	{ path: '/api/phase89/config', methods: ['GET'], category: 'Codebase', description: 'Phase 89 config', status: 'active' },
	{ path: '/api/phase89/fix', methods: ['POST'], category: 'Codebase', description: 'Automated fixes', status: 'active' },
	{ path: '/api/phase89/graph', methods: ['GET'], category: 'Codebase', description: 'Dependency graph', status: 'active' },
	{ path: '/api/phase89/graph/expand', methods: ['POST'], category: 'Codebase', description: 'Expand graph nodes', status: 'active' },
	{ path: '/api/phase89/graph/top-errors', methods: ['GET'], category: 'Codebase', description: 'Top error nodes', status: 'active' },
	{ path: '/api/phase89/node/[id]/docs', methods: ['GET'], category: 'Codebase', description: 'Node documentation', status: 'active' },
	{ path: '/api/phase89/node/[id]/similar', methods: ['GET'], category: 'Codebase', description: 'Similar nodes', status: 'active' },
	{ path: '/api/phase89/pipeline', methods: ['GET', 'POST'], category: 'Codebase', description: 'Analysis pipeline', status: 'active' },
	{ path: '/api/phase89/related/[id]', methods: ['GET'], category: 'Codebase', description: 'Related errors', status: 'active' },
	{ path: '/api/phase89/similar-clusters', methods: ['POST'], category: 'Codebase', description: 'Similar clusters', status: 'active' },
	{ path: '/api/phase89/stats', methods: ['GET'], category: 'Codebase', description: 'Phase 89 stats', status: 'active' },
	{ path: '/api/phase89/status', methods: ['GET'], category: 'Codebase', description: 'Pipeline status', status: 'active' },
	{ path: '/api/phase89/stream', methods: ['GET'], category: 'Codebase', description: 'Event streaming', status: 'active' },
	{ path: '/api/phase89/topology', methods: ['GET'], category: 'Codebase', description: 'Error topology', status: 'active' },
	{ path: '/api/phase89/vector-search', methods: ['POST'], category: 'Codebase', description: 'Vector search', status: 'active' },

	// ── Docs ─────────────────────────────────────
	{ path: '/api/docs', methods: ['GET'], category: 'System', description: 'API registry (this endpoint)', status: 'active' },
];

// ── Query helpers ────────────────────────────────

export function getEndpointsByCategory(category: string): ApiEndpoint[] {
	return API_REGISTRY.filter((e) => e.category === category);
}

export function getCategories(): string[] {
	return [...new Set(API_REGISTRY.map((e) => e.category))].sort();
}

export function searchEndpoints(query: string): ApiEndpoint[] {
	const q = query.toLowerCase();
	return API_REGISTRY.filter(
		(e) =>
			e.path.toLowerCase().includes(q) ||
			e.description.toLowerCase().includes(q) ||
			e.category.toLowerCase().includes(q)
	);
}

export function getRegistrySummary(): {
	total: number;
	byCategory: Record<string, number>;
	byStatus: Record<string, number>;
} {
	const byCategory: Record<string, number> = {};
	const byStatus: Record<string, number> = {};

	for (const ep of API_REGISTRY) {
		byCategory[ep.category] = (byCategory[ep.category] ?? 0) + 1;
		byStatus[ep.status] = (byStatus[ep.status] ?? 0) + 1;
	}

	return { total: API_REGISTRY.length, byCategory, byStatus };
}
