import { describe, expect, it, vi } from 'vitest';
import {
  normalizeScopeKey,
  resolveRepositoryScopeV1,
  ScopeResolverErrorCode,
  type DbClient,
} from './packet-repository-scope-v1';

describe('packet-repository-scope-v1', () => {
  describe('normalizeScopeKey', () => {
    it('normalizes "root" to "repo:root"', () => {
      expect(normalizeScopeKey('root')).toBe('repo:root');
      expect(normalizeScopeKey('  root  ')).toBe('repo:root');
    });

    it('preserves "repo:root" and nested scopes', () => {
      expect(normalizeScopeKey('repo:root')).toBe('repo:root');
      expect(normalizeScopeKey('repo:turbovec')).toBe('repo:turbovec');
    });

    it('rejects invalid or empty scope inputs', () => {
      expect(() => normalizeScopeKey('')).toThrow(ScopeResolverErrorCode.SCOPE_INVALID);
      expect(() => normalizeScopeKey('   ')).toThrow(ScopeResolverErrorCode.SCOPE_INVALID);
      // @ts-expect-error test invalid types
      expect(() => normalizeScopeKey(null)).toThrow(ScopeResolverErrorCode.SCOPE_INVALID);
    });
  });

  describe('resolveRepositoryScopeV1', () => {
    const ROOT_UUID = '01a13137-1378-7df9-9968-53738dbf0e48';

    it('resolves repo:root via atlas_graphify_scope_repository_map_v1 join', async () => {
      const mockDb: DbClient = {
        query: vi.fn().mockResolvedValueOnce({
          rows: [
            {
              repository_id: ROOT_UUID,
              source_authority_repo_id: 'deeds-web-app',
              membership_repository_scope: 'repo:root',
            },
          ],
        }),
      };

      const result = await resolveRepositoryScopeV1('repo:root', mockDb);
      expect(result).toEqual({
        repositoryId: ROOT_UUID,
        sourceAuthorityRepoId: 'deeds-web-app',
        membershipScope: 'repo:root',
      });
      expect(mockDb.query).toHaveBeenCalledTimes(1);
    });

    it('resolves direct authority key via fallback query on atlas_repository_identity', async () => {
      const mockDb: DbClient = {
        query: vi
          .fn()
          .mockResolvedValueOnce({ rows: [] }) // map query empty
          .mockResolvedValueOnce({
            rows: [
              {
                repository_id: ROOT_UUID,
                source_authority_repo_id: 'deeds-web-app',
              },
            ],
          }),
      };

      const result = await resolveRepositoryScopeV1('deeds-web-app', mockDb);
      expect(result).toEqual({
        repositoryId: ROOT_UUID,
        sourceAuthorityRepoId: 'deeds-web-app',
        membershipScope: 'deeds-web-app',
      });
      expect(mockDb.query).toHaveBeenCalledTimes(2);
    });

    it('throws SCOPE_UNRESOLVED if neither map nor identity table returns a row', async () => {
      const mockDb: DbClient = {
        query: vi.fn().mockResolvedValue({ rows: [] }),
      };

      await expect(resolveRepositoryScopeV1('repo:unknown', mockDb)).rejects.toThrow(
        /SCOPE_UNRESOLVED/,
      );
    });
  });
});
