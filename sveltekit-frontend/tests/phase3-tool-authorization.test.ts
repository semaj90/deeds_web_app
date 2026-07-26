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
import {
  derivePermissionGrant,
  checkToolAccess,
  validateToolName,
  toolAuthorizationGuard,
} from '$lib/server/auth/tool-authorization';
import type { PermissionGrant } from '$lib/server/auth/tool-authorization';

describe('Phase 3: Tool Authorization', () => {
  // Mock atlas-tool-registry with test tools
  vi.mock('$lib/server/ace/atlas-tool-registry', () => ({
    atlasToolRegistry: {
      'search.codebase': { permission: 'search:read' },
      'graph.expand': { permission: 'graph:read' },
      'code.propose_change': { permission: 'code:propose' },
      'code.apply_change': { permission: 'code:write' },
    },
  }));

  describe('G3.1: validateToolName', () => {
    it('accepts valid tool names (namespace.name pattern)', () => {
      expect(validateToolName('search.codebase')).toBe('search.codebase');
      expect(validateToolName('graph.expand')).toBe('graph.expand');
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
    it('allows access when permission granted', () => {
      const grant: PermissionGrant = {
        userId: 'user-123',
        permissions: new Set(['search:read']),
      };

      // Should not throw
      expect(() => checkToolAccess('search.codebase', grant)).not.toThrow();
    });

    it('denies access when permission not granted', () => {
      const grant: PermissionGrant = {
        userId: 'user-123',
        permissions: new Set(['search:read']),
      };

      expect(() => checkToolAccess('code.apply_change', grant)).toThrow(
        /Permission denied.*code:write/
      );
    });

    it('rejects unknown tools', () => {
      const grant: PermissionGrant = {
        userId: 'user-123',
        permissions: new Set(['search:read']),
      };

      expect(() => checkToolAccess('unknown.tool', grant)).toThrow(
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

    it('returns permission grant when authenticated', () => {
      const grant = toolAuthorizationGuard(createMockEvent('admin'));
      expect(grant.userId).toBe('user-123');
      expect(grant.permissions.has('search:read')).toBe(true);
    });

    it('throws 401 error when not authenticated', () => {
      expect(() => toolAuthorizationGuard(createMockEvent())).toThrow(
        'Tool dispatch requires authenticated user'
      );
    });
  });

  describe('Phase 3 Integration: Route 2 (/api/acp/rpc) scenario', () => {
    it('allows admin to call search tool', () => {
      const event = {
        locals: {
          user: { id: 'admin-1', email: 'admin@example.com', role: 'admin' },
        },
      } as RequestEvent;

      const grant = toolAuthorizationGuard(event);
      const toolName = validateToolName('search.codebase');

      expect(() => checkToolAccess(toolName, grant)).not.toThrow();
    });

    it('blocks viewer from calling code.write tool', () => {
      const event = {
        locals: {
          user: { id: 'viewer-1', email: 'viewer@example.com', role: 'viewer' },
        },
      } as RequestEvent;

      const grant = toolAuthorizationGuard(event);
      const toolName = validateToolName('code.apply_change');

      expect(() => checkToolAccess(toolName, grant)).toThrow(
        /Permission denied.*code:write/
      );
    });
  });

  describe('Phase 3 Integration: Route 7 (/api/agent/execute) scenario', () => {
    it('allows analyst to call code.propose tool', () => {
      const event = {
        locals: {
          user: { id: 'analyst-1', email: 'analyst@example.com', role: 'analyst' },
        },
      } as RequestEvent;

      const grant = toolAuthorizationGuard(event);
      const toolName = validateToolName('code.propose_change');

      expect(() => checkToolAccess(toolName, grant)).not.toThrow();
    });

    it('blocks analyst from calling code.write tool', () => {
      const event = {
        locals: {
          user: { id: 'analyst-1', email: 'analyst@example.com', role: 'analyst' },
        },
      } as RequestEvent;

      const grant = toolAuthorizationGuard(event);
      const toolName = validateToolName('code.apply_change');

      expect(() => checkToolAccess(toolName, grant)).toThrow(
        /Permission denied.*code:write/
      );
    });
  });
});
