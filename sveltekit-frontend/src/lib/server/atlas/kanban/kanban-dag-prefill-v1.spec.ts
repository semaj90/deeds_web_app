import { describe, it, expect, vi } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import {
  assertScratchDatabaseUri,
  decodeTaskRecordsAndLatents,
  upsertKanbanDagPrefill,
  type DecodedTaskRecordV2
} from './kanban-dag-prefill-v1.js';

describe('kanban-dag-prefill-v1', () => {
  describe('assertScratchDatabaseUri', () => {
    it('throws error when URL is missing', () => {
      expect(() => assertScratchDatabaseUri('')).toThrow('[SECURITY GATE P0] ATLAS_SCRATCH_PG18_URL environment variable is missing.');
    });

    it('throws error when URL contains forbidden production tokens', () => {
      const forbidden = [
        'postgresql://admin:pass@db:5432/legal_ai_db',
        'postgresql://admin:pass@production-db:5432/scratch',
        'postgresql://admin:pass@live.db.internal:5432/scratch',
        'postgresql://admin:pass@db:5432/main_db'
      ];
      for (const uri of forbidden) {
        expect(() => assertScratchDatabaseUri(uri)).toThrow(/contains forbidden production token/);
      }
    });

    it('accepts valid scratch database URL', () => {
      const cleanUri = 'postgresql://admin:pass@127.0.0.1:5434/atlas_scratch_test_db';
      expect(assertScratchDatabaseUri(cleanUri)).toBe(cleanUri);
    });
  });

  describe('decodeTaskRecordsAndLatents', () => {
    it('rejects buffers with wrong size', () => {
      const rec = new Uint8Array(63);
      const lat = new Uint8Array(256);
      expect(() => decodeTaskRecordsAndLatents(rec.buffer, lat.buffer, 1)).toThrow(/RECORD_LENGTH_MISMATCH/);
    });

    it('decodes real 6,527 records if fixture exists', () => {
      const repoRoot = path.resolve(process.cwd(), '..');
      const recPath = path.join(repoRoot, '.tmp', 'atlas', 'openspec-task-lowrank-keyframes.bin');
      const latPath = path.join(repoRoot, '.tmp', 'atlas', 'openspec-task-lowrank-keyframes.latent64.f32le.bin');

      if (!fs.existsSync(recPath) || !fs.existsSync(latPath)) {
        return; // skip if fixtures are not present in test environment
      }

      const recBuf = fs.readFileSync(recPath);
      const latBuf = fs.readFileSync(latPath);

      const records = decodeTaskRecordsAndLatents(recBuf, latBuf, 6527);
      expect(records.length).toBe(6527);
      expect(records[0].taskOrdinal).toBe(0);
      expect(records[6526].taskOrdinal).toBe(6526);

      // Verify position matches first 3 floats of latent64
      for (let i = 0; i < 50; i++) {
        expect(records[i].position[0]).toBeCloseTo(records[i].latent64[0], 5);
        expect(records[i].position[1]).toBeCloseTo(records[i].latent64[1], 5);
        expect(records[i].position[2]).toBeCloseTo(records[i].latent64[2], 5);
      }
    });
  });

  describe('upsertKanbanDagPrefill mock transaction', () => {
    it('executes atomic batch transaction with commit', async () => {
      const mockQueries: string[] = [];
      const mockClient = {
        query: vi.fn(async (text: string) => {
          mockQueries.push(text.trim());
          return { rowCount: 1 };
        }),
        release: vi.fn()
      };
      const mockPool = {
        connect: vi.fn(async () => mockClient)
      } as any;

      const sampleRecord: DecodedTaskRecordV2 = {
        mortonCode: 12345,
        taskOrdinal: 0,
        clusterId: 3,
        position: [1.0, 2.0, 3.0],
        finalScore: 0.85,
        features: [1, 2, 3, 4, 5, 6, 7, 8],
        latent64: new Float32Array(64).fill(0.1)
      };

      const receipt = await upsertKanbanDagPrefill(mockPool, [sampleRecord], ['task:test:0']);
      expect(receipt.success).toBe(true);
      expect(receipt.rowsProcessed).toBe(1);
      expect(mockQueries[0]).toBe('BEGIN;');
      expect(mockQueries[mockQueries.length - 1]).toBe('COMMIT;');
      expect(mockClient.release).toHaveBeenCalled();
    });

    it('rolls back on client query error', async () => {
      const mockQueries: string[] = [];
      const mockClient = {
        query: vi.fn(async (text: string) => {
          mockQueries.push(text.trim());
          if (text.includes('INSERT INTO')) {
            throw new Error('SIMULATED_DB_ERROR');
          }
          return { rowCount: 1 };
        }),
        release: vi.fn()
      };
      const mockPool = {
        connect: vi.fn(async () => mockClient)
      } as any;

      const sampleRecord: DecodedTaskRecordV2 = {
        mortonCode: 12345,
        taskOrdinal: 0,
        clusterId: 3,
        position: [1.0, 2.0, 3.0],
        finalScore: 0.85,
        features: [1, 2, 3, 4, 5, 6, 7, 8],
        latent64: new Float32Array(64)
      };

      await expect(upsertKanbanDagPrefill(mockPool, [sampleRecord], ['task:test:0'])).rejects.toThrow('SIMULATED_DB_ERROR');
      expect(mockQueries).toContain('ROLLBACK;');
      expect(mockClient.release).toHaveBeenCalled();
    });
  });
});
