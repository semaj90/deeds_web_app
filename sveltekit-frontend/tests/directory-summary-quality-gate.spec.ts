import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest';
import { existsSync, readFileSync, writeFileSync, mkdirSync, renameSync, unlinkSync } from 'node:fs';
import path from 'node:path';

// Mock dynamic/private & dynamic/public
vi.mock('$env/dynamic/private', () => ({ env: {} }));
vi.mock('$env/dynamic/public', () => ({ env: {} }));

// Mock lib/server/env.server.js
vi.mock('$lib/server/env.server.js', () => ({
  ENV: {
    QDRANT_URL: 'http://qdrant.test:6333',
  },
}));

// Mock Redis
const mockRedisGet = vi.fn();
const mockRedisSet = vi.fn();
vi.mock('$lib/server/redis.js', () => ({
  getRedis: () => ({
    get: mockRedisGet,
    set: mockRedisSet,
  }),
}));

// Mock directory summarizer
const mockIngestDirectorySummaries = vi.fn();
vi.mock('$lib/server/indexer/directory-summarizer.js', () => ({
  ingestDirectorySummaries: mockIngestDirectorySummaries,
}));

describe('Directory Summary Quality Gate (/api/codebase-index/summarize-dirs)', () => {
  const GRAPH_JSON = path.resolve('docs/graph/codebase-graph.json');
  const BACKUP_JSON = path.resolve('docs/graph/codebase-graph.json.backup');
  let hasBackup = false;

  beforeEach(() => {
    vi.clearAllMocks();

    // Mock Qdrant Scroll results
    const mockResponse = {
      ok: true,
      json: async () => ({
        result: {
          points: [
            {
              payload: {
                file_path: 'src/lib/valid/1.ts',
                som_cluster: 1,
                som_bmu_row: 2,
                som_bmu_col: 3,
              },
            },
            {
              payload: {
                file_path: 'src/lib/cached/1.ts',
                som_cluster: 1,
                som_bmu_row: 2,
                som_bmu_col: 3,
              },
            },
          ],
        },
      }),
    };
    vi.spyOn(global, 'fetch').mockResolvedValue(mockResponse as never);

    // Mock ingestDirectorySummaries
    mockIngestDirectorySummaries.mockResolvedValue({
      directoriesProcessed: 1,
      wikiNotesWritten: 1,
      neo4jEdgesCreated: 1,
      communityRowsUpserted: 1,
      webSearchTriggered: 0,
      errors: [],
    });

    // Backup original graph JSON
    if (existsSync(GRAPH_JSON)) {
      renameSync(GRAPH_JSON, BACKUP_JSON);
      hasBackup = true;
    } else {
      const graphDir = path.dirname(GRAPH_JSON);
      if (!existsSync(graphDir)) {
        mkdirSync(graphDir, { recursive: true });
      }
    }
  });

  afterEach(() => {
    // Restore backup
    if (existsSync(GRAPH_JSON)) {
      unlinkSync(GRAPH_JSON);
    }
    if (hasBackup && existsSync(BACKUP_JSON)) {
      renameSync(BACKUP_JSON, GRAPH_JSON);
    }
    vi.restoreAllMocks();
  });

  it('returns 401 when the caller is unauthenticated', async () => {
    const { POST } = await import('../src/routes/api/codebase-index/summarize-dirs/+server.js');

    const request = new Request('http://localhost/api/codebase-index/summarize-dirs', {
      method: 'POST',
    });

    const response = await POST({
      request,
      locals: {},
    } as never);

    expect(response.status).toBe(401);
    const body = await response.json();
    expect(body).toEqual({ error: 'Unauthorized' });
  });

  it('returns 424 when graph JSON is missing', async () => {
    const { POST } = await import('../src/routes/api/codebase-index/summarize-dirs/+server.js');

    const request = new Request('http://localhost/api/codebase-index/summarize-dirs', {
      method: 'POST',
    });

    const response = await POST({
      request,
      locals: { user: { id: 'admin-1' } },
    } as never);

    expect(response.status).toBe(424);
    const body = await response.json();
    expect(body.error).toContain('Fast AST graph not found');
  });

  it('correctly filters noisy directories, file counts, byte limits, Qdrant points, and caches', async () => {
    // Create custom mock files list in codebase-graph.json
    const mockGraph = {
      files: [
        // noisy generated folders
        { rel: 'node_modules/lodash/index.js', tags: ['js'], summary: '', routeHandlers: [], todos: [] },
        { rel: '.svelte-kit/tsconfig.json', tags: ['json'], summary: '', routeHandlers: [], todos: [] },
        { rel: 'docs/graph/codebase-graph.json', tags: ['json'], summary: '', routeHandlers: [], todos: [] },
        // noisy archive folders
        { rel: 'logs/server.log', tags: ['log'], summary: '', routeHandlers: [], todos: [] },
        { rel: 'archive/old-code.ts', tags: ['ts'], summary: '', routeHandlers: [], todos: [] },
        // no source files folder (only non-source extensions)
        { rel: 'src/lib/assets/logo.png', tags: [], summary: '', routeHandlers: [], todos: [] },
        { rel: 'src/lib/assets/manifest.json', tags: [], summary: '', routeHandlers: [], todos: [] },
        // too many files folder (41 items in the folder)
        ...Array.from({ length: 41 }).map((_, i) => ({
          rel: `src/lib/too-many-files/file_${i}.ts`,
          tags: ['ts'],
          summary: '',
          routeHandlers: [],
          todos: [],
        })),
        // too many bytes folder (we will mock statSync to return 300KB for this file)
        { rel: 'src/lib/too-many-bytes/large.ts', tags: ['ts'], summary: '', routeHandlers: [], todos: [] },
        // no qdrant points folder
        { rel: 'src/lib/no-qdrant/empty.ts', tags: ['ts'], summary: '', routeHandlers: [], todos: [] },
        // cached unchanged folder
        { rel: 'src/lib/cached/1.ts', tags: ['ts'], summary: '', routeHandlers: [], todos: [] },
        // valid folder to summarize
        { rel: 'src/lib/valid/1.ts', tags: ['ts'], summary: '', routeHandlers: [], todos: [] },
      ],
    };
    writeFileSync(GRAPH_JSON, JSON.stringify(mockGraph, null, 2));

    // Mock existsSync to return true for absolute file checks
    const originalExists = existsSync;
    vi.spyOn(require('node:fs'), 'existsSync').mockImplementation((p: string) => {
      if (typeof p === 'string' && (p.includes('large.ts') || p.includes('1.ts') || p.includes('empty.ts'))) {
        return true;
      }
      return originalExists(p);
    });

    // Mock statSync to simulate sizes and modification times
    vi.spyOn(require('node:fs'), 'statSync').mockImplementation((p: string) => {
      if (typeof p === 'string' && p.includes('large.ts')) {
        return { size: 300000, mtimeMs: 1234567890 } as never;
      }
      if (typeof p === 'string' && (p.includes('1.ts') || p.includes('empty.ts'))) {
        return { size: 1000, mtimeMs: 1234567890 } as never;
      }
      return { size: 0, mtimeMs: 0 } as never;
    });

    // Mock Redis responses
    // Return the correct hash for cached directory, and null for valid directory
    mockRedisGet.mockImplementation((key: string) => {
      if (key.includes('dir:summary:hash:src/lib/cached')) {
        // Return a mock matching sha256 hash to trigger cache_unchanged
        return '6727289230559eb4e4bdc8f85f1c93a0ca2586e3f421d009be379a51278ffc1a';
      }
      return null;
    });

    const { POST } = await import('../src/routes/api/codebase-index/summarize-dirs/+server.js');

    const request = new Request('http://localhost/api/codebase-index/summarize-dirs', {
      method: 'POST',
    });

    const response = await POST({
      request,
      locals: { user: { id: 'admin-1' } },
    } as never);

    expect(response.status).toBe(200);
    const body = await response.json();

    expect(body.success).toBe(true);
    expect(body.outcomes).toEqual({
      summarized: 1, // src/lib/valid
      skipped_generated_dir: 3, // node_modules/lodash, .svelte-kit, docs/graph
      skipped_archive_or_log: 2, // logs, archive
      skipped_too_many_files: 1, // src/lib/too-many-files
      skipped_too_many_bytes: 1, // src/lib/too-many-bytes
      no_qdrant_points: 1, // src/lib/no-qdrant
      no_source_files: 1, // src/lib/assets
      timeout: 0,
      cache_unchanged: 1, // src/lib/cached
      summary_failed: 0,
    });
  });
});
