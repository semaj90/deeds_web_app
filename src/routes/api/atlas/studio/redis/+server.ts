import type { RequestHandler } from './$types';

const ALLOWED_PREFIXES = ['ace:', 'atlas:', 'rag:', 'startup:truth', 'ace:diff:latest'];

export const GET: RequestHandler = async ({ url }) => {
  const prefix = url.searchParams.get('prefix') || 'ace:';
  if (!ALLOWED_PREFIXES.some((p) => prefix.startsWith(p))) {
    return new Response(JSON.stringify({ error: 'prefix_not_allowed' }), { status: 400, headers: { 'content-type': 'application/json' } });
  }

  // NOTE: Implement Redis SCAN in server code; here we return a stubbed example.
  const stub = {
    prefix,
    keys: [],
    note: 'Redis read-only viewer must use SCAN, limit results, hide secrets. This is a stub.'
  };

  return new Response(JSON.stringify(stub), { headers: { 'content-type': 'application/json' } });
};
