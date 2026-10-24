/**
 * Server-side CouchDB configuration contract (single owner).
 *
 * Contract:
 *   COUCHDB_URL       protocol, host and port only; no credentials
 *   COUCHDB_USER      username (required)
 *   COUCHDB_PASSWORD  password (required; no fallback)
 *
 * Migration: a COUCHDB_URL that still embeds userinfo is stripped and reported once, without the
 * credential. The embedded credential is never used for authentication. Error messages never
 * include a secret value.
 */

export interface CouchDbConfigV1 {
  /** Credential-free base URL, without a trailing slash. */
  baseUrl: string;
  /** Value for the Authorization request header. */
  authorization: string;
  /** True when the configured URL still carried userinfo and it was stripped. */
  strippedUserinfo: boolean;
}

let reportedUserinfo = false;

export function resolveCouchDbConfigV1(env: NodeJS.ProcessEnv = process.env): CouchDbConfigV1 {
  const raw = env.COUCHDB_URL?.trim();
  if (!raw) {
    throw new Error('CouchDB is not configured: COUCHDB_URL is missing');
  }

  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    throw new Error('CouchDB is not configured: COUCHDB_URL is not a valid URL');
  }

  const strippedUserinfo = Boolean(url.username || url.password);
  url.username = '';
  url.password = '';

  const user = env.COUCHDB_USER?.trim();
  const password = env.COUCHDB_PASSWORD;
  if (!user || !password) {
    throw new Error('CouchDB is not configured: COUCHDB_USER and COUCHDB_PASSWORD are required');
  }

  if (strippedUserinfo && !reportedUserinfo) {
    reportedUserinfo = true;
    console.warn('[couchdb-config] COUCHDB_URL contains credentials; they are ignored and must be removed from configuration');
  }

  return {
    baseUrl: url.toString().replace(/\/+$/, ''),
    authorization: 'Basic ' + Buffer.from(`${user}:${password}`, 'utf8').toString('base64'),
    strippedUserinfo,
  };
}
