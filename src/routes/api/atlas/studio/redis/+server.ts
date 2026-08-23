import type { RequestHandler } from './$types';

const ALLOWED_PREFIXES = ['ace:', 'atlas:', 'rag:', 'startup:truth', 'ace:diff:latest'];

export const GET: RequestHandler = async ({ url }) => {
  const prefix = url.searchParams.get('prefix') || 'ace:';
  if (!ALLOWED_PREFIXES.some((p) => prefix.startsWith(p))) {
    return new Response(JSON.stringify({ error: 'prefix_not_allowed' }), {
      status: 400,
      headers: { 'content-type': 'application/json' },
    });
  }

  // Stubbed Redis status and sample keys for Studio banners and diagnostics.
  const stub = {
    prefix,
    ok: true,
    note: 'stubbed redis status — replace with real SCAN and TTL+type checks',
    keys: [`${prefix}top:clusters`, `${prefix}hot:card:card-1`, `${prefix}hot:card:card-2`],
  };

  return new Response(JSON.stringify(stub), { headers: { 'content-type': 'application/json' } });
};
