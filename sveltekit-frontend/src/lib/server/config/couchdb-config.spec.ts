// @vitest-environment node
import { describe, expect, it, vi } from 'vitest';
import { resolveCouchDbConfigV1 } from './couchdb-config.js';

const SECRET = 'sentinel-secret-value-7f3a';

describe('CouchDB configuration contract', () => {
  it('builds a credential-free base URL and authenticates from separate env values', () => {
    const cfg = resolveCouchDbConfigV1({
      COUCHDB_URL: 'http://localhost:5984/',
      COUCHDB_USER: 'admin',
      COUCHDB_PASSWORD: SECRET,
    } as NodeJS.ProcessEnv);
    expect(cfg.baseUrl).toBe('http://localhost:5984');
    expect(cfg.baseUrl).not.toContain('@');
    expect(cfg.authorization).toBe('Basic ' + Buffer.from(`admin:${SECRET}`).toString('base64'));
    expect(cfg.strippedUserinfo).toBe(false);
  });

  it('strips userinfo from the URL, never authenticates with it, and reports it without the value', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const cfg = resolveCouchDbConfigV1({
      COUCHDB_URL: `http://admin:${SECRET}@localhost:5984`,
      COUCHDB_USER: 'admin',
      COUCHDB_PASSWORD: 'env-password',
    } as NodeJS.ProcessEnv);
    expect(cfg.baseUrl).toBe('http://localhost:5984');
    expect(cfg.authorization).toBe('Basic ' + Buffer.from('admin:env-password').toString('base64'));
    expect(cfg.strippedUserinfo).toBe(true);
    const logged = warn.mock.calls.flat().join(' ');
    expect(logged).not.toContain(SECRET);
    warn.mockRestore();
  });

  it('fails safely when credentials are missing, without echoing any value', () => {
    expect(() => resolveCouchDbConfigV1({ COUCHDB_URL: 'http://localhost:5984', COUCHDB_USER: 'admin' } as NodeJS.ProcessEnv))
      .toThrow(/COUCHDB_PASSWORD/);
    try {
      resolveCouchDbConfigV1({ COUCHDB_URL: 'http://localhost:5984', COUCHDB_USER: 'admin' } as NodeJS.ProcessEnv);
    } catch (err) {
      expect(String((err as Error).message)).not.toContain(SECRET);
    }
  });

  it('fails safely when the URL is missing or malformed', () => {
    expect(() => resolveCouchDbConfigV1({ COUCHDB_USER: 'a', COUCHDB_PASSWORD: 'b' } as NodeJS.ProcessEnv)).toThrow(/COUCHDB_URL is missing/);
    expect(() => resolveCouchDbConfigV1({ COUCHDB_URL: 'not a url', COUCHDB_USER: 'a', COUCHDB_PASSWORD: 'b' } as NodeJS.ProcessEnv)).toThrow(/not a valid URL/);
  });
});
