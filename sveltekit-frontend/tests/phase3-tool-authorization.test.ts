/**
 * Phase 3: Tool Authorization Gate Tests
 *
 * Tests verify:
 * - G3.1: Route 2 (/api/acp/rpc) enforces tool authorization
 * - G3.2: Route 7 (/api/agent/execute) enforces tool authorization
 * - G3.3: Permission grant derivation (role-based access)
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { RequestEvent } from '@sveltejs/kit';
import type { PermissionGrant } from '$lib/server/ace/atlas-tool-registry';

const {
  auditLogMock,
  getGrantFromCacheMock,
  setGrantInCacheMock,
} = vi.hoisted(() => ({
  auditLogMock: vi.fn(async () => {}),
  getGrantFromCacheMock: vi.fn(async () => null),
  setGrantInCacheMock: vi.fn(async () => {}),
}));

vi.mock('$lib/server/auth/tool-authorization-audit.js', async () => {
  const actual = await vi.importActual<typeof import('$lib/server/auth/tool-authorization-audit')>(
    '$lib/server/auth/tool-authorization-audit'
  );
  return {
    ...actual,
    logAuthorizationAudit: auditLogMock,
  };
});

vi.mock('$lib/server/auth/tool-authorization-cache.js', () => ({
  getGrantFromCache: getGrantFromCacheMock,
  setGrantInCache: setGrantInCacheMock,
}));

vi.mock('$lib/server/ace/atlas-tool-registry', () => ({
  atlasToolRegistry: {
    'atlas.search': { permission: 'search:read' },
    'atlas.graph.expand': { permission: 'graph:read' },
    'atlas.graph.pagerank': { permission: 'graph:read' },
    'atlas.patch.propose': { permission: 'code:propose' },
    'atlas.patch.apply': { permission: 'code:write' },
  },
}));

import {
  derivePermissionGrant,
  checkToolAccess,
  validateToolName,
  toolAuthorizationGuard,
} from '$lib/server/auth/tool-authorization';
import { checkToolAccessWithAudit, derivePermissionGrantWithAudit } from '$lib/server/auth/tool-authorization-audit';

describe('Phase 3: Tool Authorization', () => {

  beforeEach(() => {
    vi.clearAllMocks();
    getGrantFromCacheMock.mockResolvedValue(null);
    setGrantInCacheMock.mockResolvedValue(undefined);
    auditLogMock.mockResolvedValue(undefined);
  });

  describe('G3.1: validateToolName', () => {
    it('accepts valid tool names (namespace.name pattern)', () => {
      expect(validateToolName('atlas.search')).toBe('atlas.search');
      expect(validateToolName('atlas.graph.expand')).toBe('atlas.graph.expand');
      expect(validateToolName('kb.trace_search')).toBe('kb.trace_search');
    });

    it('rejects empty tool names', () => {
      expect(() => validateToolName('')).toThrow('Tool name must be 1-256 characters');
    });

    it('rejects non-string tool names', () => {
      expect(() => validateToolName(123 as unknown as string)).toThrow(
        'Tool name must be a string'
      );
      expect(() => validateToolName(null as unknown as string)).toThrow(
        'Tool name must be a string'
      );
    });

    it('rejects invalid format (uppercase, spaces, special chars)', () => {
      expect(() => validateToolName('SearchCodebase')).toThrow('Invalid tool name format');
      expect(() => validateToolName('search codebase')).toThrow('Invalid tool name format');
      expect(() => validateToolName('search@codebase')).toThrow('Invalid tool name format');
    });

    it('rejects tool names > 256 characters', () => {
      const longName = 'a.'.repeat(130);
      expect(() => validateToolName(longName)).toThrow('Tool name must be 1-256 characters');
    });
  });

  describe('G3.2: derivePermissionGrant', () => {
    const createMockEvent = (role?: string): RequestEvent => ({
      locals: {
        user: role
          ? {
              id: 'user-123',
              email: 'test@example.com',
              role,
            }
          : null,
      },
    } as RequestEvent);

    it('admin gets all 4 permissions', () => {
      const grant = derivePermissionGrant(createMockEvent('admin'));
      expect(grant.permissions.has('search:read')).toBe(true);
      expect(grant.permissions.has('graph:read')).toBe(true);
      expect(grant.permissions.has('code:propose')).toBe(true);
      expect(grant.permissions.has('code:write')).toBe(true);
    });

    it('superadmin gets all 4 permissions', () => {
      const grant = derivePermissionGrant(createMockEvent('superadmin'));
      expect(grant.permissions.has('code:write')).toBe(true);
    });

    it('analyst gets search + graph + propose', () => {
      const grant = derivePermissionGrant(createMockEvent('analyst'));
      expect(grant.permissions.has('search:read')).toBe(true);
      expect(grant.permissions.has('graph:read')).toBe(true);
      expect(grant.permissions.has('code:propose')).toBe(true);
      expect(grant.permissions.has('code:write')).toBe(false);
    });

    it('viewer/user gets search only', () => {
      const viewerGrant = derivePermissionGrant(createMockEvent('viewer'));
      const userGrant = derivePermissionGrant(createMockEvent('user'));

      expect(viewerGrant.permissions.has('search:read')).toBe(true);
      expect(viewerGrant.permissions.has('graph:read')).toBe(false);

      expect(userGrant.permissions.has('search:read')).toBe(true);
      expect(userGrant.permissions.has('graph:read')).toBe(false);
    });

    it('throws if no authenticated user', () => {
      expect(() => derivePermissionGrant(createMockEvent())).toThrow(
        'derivePermissionGrant called without authenticated user'
      );
    });
  });

  describe('G3.3: checkToolAccess', () => {
    it('allows access when permission granted', async () => {
      const grant: PermissionGrant = {
        userId: 'user-123',
        permissions: new Set(['search:read']),
      };

      await expect(checkToolAccess('atlas.search', grant)).resolves.toBeUndefined();
      expect(auditLogMock).toHaveBeenCalledWith(
        expect.objectContaining({
          userId: 'user-123',
          toolName: 'atlas.search',
          action: 'ACCESS_ALLOWED',
          permission: 'search:read',
        })
      );
    });

    it('denies access when permission not granted', async () => {
      const grant: PermissionGrant = {
        userId: 'user-123',
        permissions: new Set(['search:read']),
      };

      await expect(checkToolAccess('atlas.patch.apply', grant)).rejects.toThrow(
        /Permission denied.*code:write/
      );
    });

    it('rejects unknown tools', async () => {
      const grant: PermissionGrant = {
        userId: 'user-123',
        permissions: new Set(['search:read']),
      };

      await expect(checkToolAccess('unknown.tool', grant)).rejects.toThrow(
        'Tool not found in allowlist'
      );
    });
  });

  describe('G3.4: toolAuthorizationGuard', () => {
    const createMockEvent = (role?: string): RequestEvent => ({
      locals: {
        user: role
          ? {
              id: 'user-123',
              email: 'test@example.com',
              role,
            }
          : null,
      },
    } as RequestEvent);

    it('returns permission grant when authenticated', async () => {
      const grant = await toolAuthorizationGuard(createMockEvent('admin'));
      expect(grant.userId).toBe('user-123');
      expect(grant.permissions.has('search:read')).toBe(true);
    });

    it('throws 401 error when not authenticated', async () => {
      await expect(toolAuthorizationGuard(createMockEvent())).rejects.toThrow(
        'Tool dispatch requires authenticated user'
      );
    });
  });

  describe('Phase 3 Integration: Route 2 (/api/acp/rpc) scenario', () => {
    it('allows admin to call search tool', async () => {
      const event = {
        locals: {
          user: { id: 'admin-1', email: 'admin@example.com', role: 'admin' },
        },
      } as RequestEvent;

      const grant = await toolAuthorizationGuard(event);
      const toolName = validateToolName('atlas.search');

      await expect(checkToolAccess(toolName, grant)).resolves.toBeUndefined();
    });

    it('blocks viewer from calling code.write tool', async () => {
      const event = {
        locals: {
          user: { id: 'viewer-1', email: 'viewer@example.com', role: 'viewer' },
        },
      } as RequestEvent;

      const grant = await toolAuthorizationGuard(event);
      const toolName = validateToolName('atlas.patch.apply');

      await expect(checkToolAccess(toolName, grant)).rejects.toThrow(
        /Permission denied.*code:write/
      );
    });
  });

  describe('Phase 3 Integration: Route 7 (/api/agent/execute) scenario', () => {
    it('allows analyst to call code.propose tool', async () => {
      const event = {
        locals: {
          user: { id: 'analyst-1', email: 'analyst@example.com', role: 'analyst' },
        },
      } as RequestEvent;

      const grant = await toolAuthorizationGuard(event);
      const toolName = validateToolName('atlas.patch.propose');

      await expect(checkToolAccess(toolName, grant)).resolves.toBeUndefined();
    });

    it('blocks analyst from calling code.write tool', async () => {
      const event = {
        locals: {
          user: { id: 'analyst-1', email: 'analyst@example.com', role: 'analyst' },
        },
      } as RequestEvent;

      const grant = await toolAuthorizationGuard(event);
      const toolName = validateToolName('atlas.patch.apply');

      await expect(checkToolAccess(toolName, grant)).rejects.toThrow(
        /Permission denied.*code:write/
      );
    });
  });

  describe('Runtime authorization policy coverage', () => {
    const createMockEvent = (role?: string): RequestEvent => ({
      locals: {
        user: role
          ? {
              id: `${role}-user`,
              email: `${role}@example.com`,
              role,
            }
          : null,
      },
    } as RequestEvent);

    it('denies anonymous caller', async () => {
      await expect(toolAuthorizationGuard(createMockEvent())).rejects.toThrow(
        'Tool dispatch requires authenticated user'
      );
    });

    it('viewer is denied graph read and write tools', async () => {
      const grant = await toolAuthorizationGuard(createMockEvent('viewer'));
      await expect(checkToolAccess('atlas.graph.pagerank', grant)).rejects.toThrow(
        /lacks 'graph:read'/
      );
      await expect(checkToolAccess('atlas.patch.apply', grant)).rejects.toThrow(
        /lacks 'code:write'/
      );
    });

    it('admin is allowed graph read and write tools', async () => {
      const grant = await toolAuthorizationGuard(createMockEvent('admin'));
      await expect(checkToolAccess('atlas.graph.pagerank', grant)).resolves.toBeUndefined();
      await expect(checkToolAccess('atlas.patch.apply', grant)).resolves.toBeUndefined();
    });

    it('invalid tool name is rejected before authorization', () => {
      expect(() => validateToolName('Atlas.Graph.PageRank')).toThrow('Invalid tool name format');
    });

    it('missing grant is rejected by access check', async () => {
      const missingGrant = {
        userId: 'missing-grant',
        permissions: new Set(),
      } satisfies PermissionGrant;
      await expect(checkToolAccess('atlas.graph.pagerank', missingGrant)).rejects.toThrow(
        /lacks 'graph:read'/
      );
    });

    it('expired cache falls back to derived grant instead of elevating permissions', async () => {
      getGrantFromCacheMock.mockResolvedValueOnce(null);
      const grant = await toolAuthorizationGuard(createMockEvent('viewer'));
      expect(setGrantInCacheMock).toHaveBeenCalledTimes(1);
      await expect(checkToolAccess('atlas.graph.pagerank', grant)).rejects.toThrow(
        /lacks 'graph:read'/
      );
    });

    it('audit wrapper records denied access and remains non-blocking on audit failure', async () => {
      const grant = await toolAuthorizationGuard(createMockEvent('viewer'));
      auditLogMock.mockRejectedValueOnce(new Error('audit down'));
      await expect(checkToolAccessWithAudit('atlas.patch.apply', grant)).resolves.toEqual({
        allowed: false,
        error: expect.stringMatching(/lacks 'code:write'/),
      });
    });

    it('grant derivation audit is non-blocking when audit storage fails', async () => {
      auditLogMock.mockRejectedValueOnce(new Error('audit storage unavailable'));
      const grant = await derivePermissionGrantWithAudit(createMockEvent('analyst'));
      expect(grant.permissions.has('graph:read')).toBe(true);
    });

    it('MCP caller does not automatically become admin', async () => {
      const traceMcpGrant = {
        userId: 'trace-mcp-service',
        permissions: new Set(['graph:read']),
      } satisfies PermissionGrant;

      await expect(checkToolAccess('atlas.graph.pagerank', traceMcpGrant)).resolves.toBeUndefined();
      await expect(checkToolAccess('atlas.patch.apply', traceMcpGrant)).rejects.toThrow(
        /lacks 'code:write'/
      );
    });
  });
});
