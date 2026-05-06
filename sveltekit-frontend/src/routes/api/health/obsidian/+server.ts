/**
 * GET /api/health/obsidian — Obsidian Local REST API reachability probe.
 *
 * Returns detailed status so you can verify each piece of the integration:
 *   - configured:   OBSIDIAN_URL + OBSIDIAN_API_KEY both present in env
 *   - reachable:    HTTPS handshake completes against the plugin
 *   - authenticated: Bearer token accepted (200 from /)
 *   - vaultRoot:    folder name reported by the plugin (when authenticated)
 *
 * Designed as the first-call smoke test after installing the
 * obsidian-local-rest-api plugin. Public-safe (no secrets returned).
 */

import { json, type RequestHandler } from '@sveltejs/kit';
import { ENV } from '$lib/server/env.server.js';

export const GET: RequestHandler = async ({ locals }) => {
  if (!locals.user) return json({ error: 'Unauthorized' }, { status: 401 });

  const url = ENV.OBSIDIAN_URL;
  const key = ENV.OBSIDIAN_API_KEY;

  const status = {
    configured:    Boolean(url && key),
    urlConfigured: Boolean(url),
    apiKeySet:     Boolean(key),
    reachable:     false as boolean | null,
    authenticated: false as boolean | null,
    vaultName:     null as string | null,
    httpStatus:    null as number | null,
    error:         null as string | null,
    hint:          null as string | null,
  };

  if (!url) {
    status.hint = 'Set OBSIDIAN_URL in .env (default: https://127.0.0.1:27124)';
    return json(status);
  }
  if (!key) {
    status.hint = 'Install Obsidian + the obsidian-local-rest-api plugin, copy its API key, set OBSIDIAN_API_KEY in .env';
    return json(status);
  }

  try {
    // Plugin uses a self-signed cert when listening on HTTPS. Allow it for
    // loopback URLs only — undici's Agent gives us scoped TLS bypass without
    // touching the global NODE_TLS_REJECT_UNAUTHORIZED knob.
    const fetchOpts: Parameters<typeof fetch>[1] = {
      headers: { Authorization: `Bearer ${key}` },
      signal:  AbortSignal.timeout(3000),
    };
    const isLoopbackHttps = /^https:\/\/(127\.0\.0\.1|localhost)(:|\/|$)/.test(url);
    if (isLoopbackHttps) {
      const { Agent } = await import('undici');
      (fetchOpts as { dispatcher?: unknown }).dispatcher = new Agent({
        connect: { rejectUnauthorized: false },
      });
    }
    const res = await fetch(url, fetchOpts);
    status.reachable  = true;
    status.httpStatus = res.status;
    if (res.ok) {
      status.authenticated = true;
      try {
        const body = await res.json();
        // Plugin returns { service, versions, ... } and may include vault info
        status.vaultName = (body as { vault?: { name?: string } }).vault?.name
          ?? (body as { authenticated?: boolean; service?: string }).service
          ?? null;
      } catch {/* non-JSON response — still reachable */}
      status.hint = 'Obsidian is fully connected. Run POST /api/wiki/sync-to-obsidian to push the seeded wiki notes.';
    } else if (res.status === 401 || res.status === 403) {
      status.authenticated = false;
      status.hint = `Plugin reachable but auth failed (HTTP ${res.status}). Verify OBSIDIAN_API_KEY matches the plugin's API key.`;
    } else {
      status.hint = `Plugin returned HTTP ${res.status} — check that the vault is open and the plugin is enabled.`;
    }
  } catch (err) {
    status.reachable = false;
    const msg = (err as Error)?.message ?? String(err);
    status.error = msg;
    if (msg.includes('certificate') || msg.includes('CERT')) {
      status.hint = 'TLS error — the plugin uses a self-signed cert. Either set NODE_TLS_REJECT_UNAUTHORIZED=0 in dev OR import the plugin cert into your trust store.';
    } else if (msg.includes('ECONNREFUSED') || msg.includes('fetch failed')) {
      status.hint = 'Plugin not reachable — open Obsidian, ensure the obsidian-local-rest-api plugin is enabled, and confirm the port (default 27124).';
    } else {
      status.hint = `Connection failed: ${msg}`;
    }
  }

  return json(status);
};