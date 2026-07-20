import { describe, expect, it } from 'vitest';
import { GET } from './+server.js';

describe('GET /api/admin/atlas/runtime-registry', () => {
  it('returns the atlas runtime registry snapshot', async () => {
    const response = await GET({} as Parameters<typeof GET>[0]);

    expect(response.status).toBe(200);

    const body = (await response.json()) as {
      version: string;
      adminPath: string;
      searchPath: string;
      sections: Array<{ id: string }>;
    };

    expect(body.version).toBe('atlas-runtime-registry-v1');
    expect(body.adminPath).toBe('/admin/atlas');
    expect(body.searchPath).toBe('/api/admin/atlas/registry/search');
    expect(body.sections.map((section) => section.id)).toEqual([
      'contract',
      'capability',
      'projection',
      'model',
      'embedding',
      'worker',
      'pipeline',
      'feature',
      'recommendation',
    ]);
  });
});
