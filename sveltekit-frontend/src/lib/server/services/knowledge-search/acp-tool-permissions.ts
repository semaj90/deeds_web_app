/**
 * ACP Tool Permission Map (A2A-04 repair, 2026-09-23)
 *
 * Not a second authorization system. This is a DATA-only mapping of every
 * name registered in ACPToolRegistry.ts's `TOOLS` object to the
 * `AtlasToolPermission` tier it requires -- the same role→permission
 * derivation logic already used everywhere else (derivePermissionGrant() /
 * toolAuthorizationGuard() / hasPermission(), all in
 * $lib/server/auth/tool-authorization.ts) is reused unchanged. This file
 * exists only because ACPToolRegistry.ts's tool names (`atlas.kanban.claim`,
 * `db:query`, etc.) are a disjoint set from atlasToolRegistry's own 6 tools
 * (`atlas.search`, `atlas.graph.expand`, ...) -- exactly the same kind of
 * per-tool fact atlasToolRegistry already keeps for its own tool set.
 *
 * Fail-closed contract: every tool name in ACPToolRegistry.TOOLS MUST have
 * an entry here. A tool present in TOOLS but absent from this map is
 * treated as requiring the highest tier (`code:write`) by
 * requiredAcpToolPermission() below, never as "no permission required" --
 * "tool absent from capability map == execute anyway" is explicitly
 * prohibited by this repair's authorization.
 */
import type { AtlasToolPermission } from '$lib/server/ace/atlas-tool-registry.js';

export const ACP_TOOL_REQUIRED_PERMISSION: Record<string, AtlasToolPermission> = {
	// Read-only search/analysis/metrics -- lowest tier
	'knowledge:search': 'search:read',
	'cache:get': 'search:read',
	'metrics:snapshot': 'search:read',
	'metrics:health': 'search:read',
	'langextract:extract': 'search:read',
	'langextract:batch': 'search:read',
	'search:hyperrag': 'search:read',
	'nlp:capabilities': 'search:read',
	'nlp:analyze': 'search:read',
	'nlp:classify_domain': 'search:read',
	'nlp:ast-chunk': 'search:read',
	'openspec:workboard_recommend': 'search:read',
	'graph:snapshot-parity:validate': 'graph:read',
	'atlas:cugraph:pagerank:dry': 'graph:read',

	// Workflow reads
	'atlas.kanban.list': 'workflow:read',
	'atlas.kanban.show': 'workflow:read',

	// Workflow mutations
	'atlas.kanban.heartbeat': 'workflow:write',
	'atlas.kanban.claim': 'workflow:write',
	'atlas.kanban.block': 'workflow:write',
	'atlas.kanban.complete': 'workflow:write',
	'atlas.kanban.retry': 'workflow:write',
	'atlas.kanban.create_child': 'workflow:write',
	'openspec:record_attempt': 'workflow:write',
	'phase89:board-workflow': 'workflow:write',
	'cache:set': 'workflow:write',
	'atlas:cugraph:pagerank': 'workflow:write',

	// Proposal-tier: analysis that suggests a fix but does not itself apply one
	'error:analyze': 'code:propose',
	'fix:synthesize': 'code:propose',
	'llm:generate': 'code:propose',

	// Highest tier: applies a fix, runs arbitrary allowlisted shell actions,
	// or executes caller-supplied SQL against the canonical database
	'fix:apply': 'code:write',
	'atlas:bash-worker': 'code:write',
	'db:query': 'code:write',
};

/**
 * Resolve the required permission for an ACP tool name. Fails closed: a
 * tool name not present in ACP_TOOL_REQUIRED_PERMISSION (including one that
 * IS registered in ACPToolRegistry.TOOLS but was never added here -- a
 * config omission) requires the highest tier, never "no permission".
 */
export function requiredAcpToolPermission(toolName: string): AtlasToolPermission {
	return ACP_TOOL_REQUIRED_PERMISSION[toolName] ?? 'code:write';
}
