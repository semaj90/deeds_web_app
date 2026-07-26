/**
 * Tool Authorization Bridge
 *
 * Centralizes tool permission checking for all agent execution paths.
 * Routes that dispatch tools (RPC, agent/execute) must use this module.
 *
 * Contract:
 * 1. Every tool invocation flows through checkToolAccess()
 * 2. Permission grant is derived from `locals.user` + workspace context
 * 3. Unknown tools are rejected before execution
 * 4. Caller lacks permission → 403 Forbidden
 */

import type { RequestEvent } from '@sveltejs/kit';
import type { AtlasToolName, PermissionGrant, AtlasToolPermission } from '$lib/server/ace/atlas-tool-registry';
import { atlasToolRegistry } from '$lib/server/ace/atlas-tool-registry';

/**
 * Derive permission grant from authenticated user and workspace context
 */
export function derivePermissionGrant(event: RequestEvent): PermissionGrant {
  const user = event.locals.user;
  if (!user) {
    throw new Error('derivePermissionGrant called without authenticated user');
  }

  // Map role → permissions
  const permissions: Set<AtlasToolPermission> = new Set();

  if (user.role === 'admin' || user.role === 'superadmin') {
    // Admins have all permissions
    permissions.add('search:read');
    permissions.add('graph:read');
    permissions.add('code:propose');
    permissions.add('code:write');
  } else if (user.role === 'analyst') {
    // Analysts can search and propose changes
    permissions.add('search:read');
    permissions.add('graph:read');
    permissions.add('code:propose');
  } else if (user.role === 'viewer' || user.role === 'user') {
    // Viewers/users can only search
    permissions.add('search:read');
  }

  return {
    userId: user.id,
    permissions,
  };
}

/**
 * Check if tool is in allowlist and caller has permission to invoke it
 * Logs authorization decisions asynchronously (non-blocking)
 *
 * @throws Error if tool unknown
 * @throws Error if permission denied
 */
export async function checkToolAccess(toolName: string, grant: PermissionGrant): Promise<void> {
  // Whitelist check: is this tool registered?
  if (!(toolName in atlasToolRegistry)) {
    // Log validation failure
    const { logAuthorizationAudit } = await import('./tool-authorization-audit.js');
    logAuthorizationAudit({
      userId: grant.userId,
      toolName,
      action: 'VALIDATION_FAILED',
      error: `Tool not found in allowlist: '${toolName}'`,
      timestamp: new Date(),
    }).catch(() => {});
    throw new Error(`Tool not found in allowlist: '${toolName}'`);
  }

  // Get the tool definition
  const tool = atlasToolRegistry[toolName as AtlasToolName];

  // Permission check: does caller have required permission?
  if (!grant.permissions.has(tool.permission)) {
    // Log access denial
    const { logAuthorizationAudit } = await import('./tool-authorization-audit.js');
    logAuthorizationAudit({
      userId: grant.userId,
      toolName,
      action: 'ACCESS_DENIED',
      permission: tool.permission,
      error: `Permission denied: lacks '${tool.permission}'`,
      timestamp: new Date(),
    }).catch(() => {});
    throw new Error(
      `Permission denied: user '${grant.userId}' lacks '${tool.permission}' for tool '${toolName}'`
    );
  }

  // Log successful access
  const { logAuthorizationAudit } = await import('./tool-authorization-audit.js');
  logAuthorizationAudit({
    userId: grant.userId,
    toolName,
    action: 'ACCESS_ALLOWED',
    permission: tool.permission,
    timestamp: new Date(),
  }).catch(() => {});
}

/**
 * Tool authorization middleware for request handlers
 *
 * Returns permission grant or throws 401/403
 */
export function toolAuthorizationGuard(event: RequestEvent): PermissionGrant {
  const user = event.locals.user;
  if (!user) {
    throw new Error('Tool dispatch requires authenticated user (401)');
  }

  return derivePermissionGrant(event);
}

/**
 * Validate tool name format before authorization check
 * Prevents invalid/malicious tool names from reaching the registry
 */
export function validateToolName(toolName: unknown): string {
  if (typeof toolName !== 'string') {
    throw new Error('Tool name must be a string');
  }

  if (toolName.length === 0 || toolName.length > 256) {
    throw new Error('Tool name must be 1-256 characters');
  }

  // Tool names follow pattern: namespace.name or namespace.category.name
  // Example: atlas.search, atlas.graph.expand, kb.trace_search
  const validPattern = /^[a-z_][a-z0-9_]*(\.[a-z0-9_]+)*$/i;
  if (!validPattern.test(toolName)) {
    throw new Error(
      `Invalid tool name format: '${toolName}'. Must match pattern: namespace.name (alphanumeric and underscores)`
    );
  }

  return toolName;
}
