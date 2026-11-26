/**
 * Data only: the permission each A2A gateway tool requires. Role-to-permission derivation stays in
 * $lib/server/auth/tool-authorization.ts (same owner ACP uses). A registered tool missing here
 * requires the highest tier, never "no permission".
 */
import type { AtlasToolPermission } from '$lib/server/ace/atlas-tool-registry.js';

export const A2A_TOOL_REQUIRED_PERMISSION: Readonly<Record<string, AtlasToolPermission>> = {
	'packet.search': 'search:read',
	'startup.briefing': 'search:read',
	'topology.status': 'graph:read',
	'label.generator': 'code:propose',
	'learning.trainer': 'code:write',
};

export function requiredA2aToolPermission(name: string): AtlasToolPermission {
	return Object.hasOwn(A2A_TOOL_REQUIRED_PERMISSION, name) ? A2A_TOOL_REQUIRED_PERMISSION[name]! : 'code:write';
}
