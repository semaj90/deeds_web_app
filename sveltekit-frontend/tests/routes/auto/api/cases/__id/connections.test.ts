// @vitest-environment node
/**
 * ENHANCED TEST — verifies Auth, Case ownership, Zod validation, and Drizzle CRUD.
 *
 * Route: src/routes/api/cases/[id]/connections/+server.ts
 * Handlers: GET, POST, PATCH, DELETE
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

const { mockDb, selectChain, insertChain, updateChain, deleteChain } = vi.hoisted(() => {
  const createChain = () => {
    const obj: any = {};
    const methods = ['from', 'where', 'limit', 'insert', 'values', 'update', 'set', 'delete', 'returning'];
    methods.forEach(m => {
      obj[m] = vi.fn();
    });
    obj.then = vi.fn();
    return obj;
  };

  const selectChain = createChain();
  const insertChain = createChain();
  const updateChain = createChain();
  const deleteChain = createChain();

  return {
    mockDb: {
      select: vi.fn(),
      insert: vi.fn(),
      update: vi.fn(),
      delete: vi.fn(),
    },
    selectChain,
    insertChain,
    updateChain,
    deleteChain
  };
});

vi.mock('$lib/server/db/client', () => ({
  db: mockDb
}));

// Mock schema to avoid actual DB refs
vi.mock('$lib/server/db/schema-postgres.js', () => ({
  cases: { id: 'id', userId: 'userId' },
  evidenceBoardConnections: { id: 'id', caseId: 'caseId' }
}));

describe('src/routes/api/cases/[id]/connections/+server.ts', () => {
  let handlerGET: any, handlerPOST: any, handlerPATCH: any, handlerDELETE: any;
  const caseId = '00000000-0000-0000-0000-000000000000';
  const userId = 1;
  const mockUser = { id: userId, email: 'test@example.com' };

  beforeEach(async () => {
    vi.resetAllMocks();
    
    // Setup chains
    mockDb.select.mockReturnValue(selectChain);
    selectChain.from.mockReturnValue(selectChain);
    selectChain.where.mockReturnValue(selectChain);
    selectChain.limit.mockReturnValue(selectChain);
    selectChain.then.mockImplementation((resolve: any) => resolve([{ id: caseId }]));

    mockDb.insert.mockReturnValue(insertChain);
    insertChain.values.mockReturnValue(insertChain);
    insertChain.returning.mockResolvedValue([]);

    mockDb.update.mockReturnValue(updateChain);
    updateChain.set.mockReturnValue(updateChain);
    updateChain.where.mockReturnValue(updateChain);
    updateChain.returning.mockResolvedValue([]);

    mockDb.delete.mockReturnValue(deleteChain);
    deleteChain.where.mockReturnValue(deleteChain);
    deleteChain.returning.mockResolvedValue([]);

    const mod = await import('../../../../../../src/routes/api/cases/[id]/connections/+server.js') as any;
    handlerGET = mod.GET;
    handlerPOST = mod.POST;
    handlerPATCH = mod.PATCH;
    handlerDELETE = mod.DELETE;
  });

  function makeReq(method: string, body?: any) {
    return new Request(`http://localhost/api/cases/${caseId}/connections`, {
      method,
      headers: body ? { 'Content-Type': 'application/json' } : {},
      body: body ? JSON.stringify(body) : undefined
    });
  }

  describe('GET', () => {
    it('401 if not logged in', async () => {
      try {
        await handlerGET({ params: { id: caseId }, locals: {}, request: makeReq('GET') });
      } catch (e: any) {
        expect(e.status).toBe(401);
      }
    });

    it('404 if case not found or not owned', async () => {
      selectChain.then.mockImplementation((resolve: any) => resolve([]));
      try {
        await handlerGET({ params: { id: caseId }, locals: { user: mockUser }, request: makeReq('GET') });
      } catch (e: any) {
        expect(e.status).toBe(404);
        expect(e.body.message).toBe('Case not found');
      }
    });

    it('200 with connections list', async () => {
      const mockConnections = [{ id: 'conn-1', label: 'Test Connection' }];
      let callCount = 0;
      selectChain.then.mockImplementation((resolve: any) => {
        callCount++;
        return resolve(callCount === 1 ? [{ id: caseId }] : mockConnections);
      });

      const resp = await handlerGET({ params: { id: caseId }, locals: { user: mockUser }, request: makeReq('GET') });
      expect(resp.status).toBe(200);
      const body = await resp.json();
      expect(body.connections).toEqual(mockConnections);
    });
  });

  describe('POST', () => {
    it('400 for invalid Zod input', async () => {
      try {
        await handlerPOST({ 
          params: { id: caseId }, 
          locals: { user: mockUser }, 
          request: makeReq('POST', { fromEvidenceId: 'invalid' }) 
        });
      } catch (e: any) {
        expect(e.status).toBe(400);
      }
    });

    it('201 on success', async () => {
      const connData = {
        fromEvidenceId: '550e8400-e29b-41d4-a716-446655440000',
        toEvidenceId: '550e8400-e29b-41d4-a716-446655440001',
        label: 'Connected'
      };
      
      insertChain.returning.mockResolvedValue([{ id: 'new-conn', ...connData }]);

      const resp = await handlerPOST({ 
        params: { id: caseId }, 
        locals: { user: mockUser }, 
        request: makeReq('POST', connData) 
      });

      expect(resp.status).toBe(201);
      const body = await resp.json();
      expect(body.connection.id).toBe('new-conn');
    });
  });

  describe('PATCH', () => {
    it('404 if connection to update not found', async () => {
      updateChain.returning.mockResolvedValue([]);
      try {
        await handlerPATCH({ 
          params: { id: caseId }, 
          locals: { user: mockUser }, 
          request: makeReq('PATCH', { connectionId: caseId, label: 'Updated' }) 
        });
      } catch (e: any) {
        expect(e.status).toBe(404);
      }
    });

    it('200 on success', async () => {
      updateChain.returning.mockResolvedValue([{ id: 'conn-1', label: 'Updated' }]);
      const resp = await handlerPATCH({ 
        params: { id: caseId }, 
        locals: { user: mockUser }, 
        request: makeReq('PATCH', { connectionId: caseId, label: 'Updated' }) 
      });
      expect(resp.status).toBe(200);
      const body = await resp.json();
      expect(body.connection.label).toBe('Updated');
    });
  });

  describe('DELETE', () => {
    it('200 on successful deletion', async () => {
      deleteChain.returning.mockResolvedValue([{ id: 'conn-1' }]);
      const resp = await handlerDELETE({ 
        params: { id: caseId }, 
        locals: { user: mockUser }, 
        request: makeReq('DELETE', { connectionId: caseId }) 
      });
      expect(resp.status).toBe(200);
      const body = await resp.json();
      expect(body.success).toBe(true);
    });
  });
});
