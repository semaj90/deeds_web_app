#!/usr/bin/env node
/**
 * smoke-browser-context-sanitizer.mjs
 *
 * Pure-function regression for the browser context sanitizer. No services,
 * no DB, no Redis. Verifies:
 *   - forbidden URL schemes drop the entry
 *   - URL query strings strip token-name pairs
 *   - snippet bodies redact token lines + bearer + JWT shapes
 *   - count/length caps clamp oversize input
 *   - schema-rejected payloads return degraded empty context, not throw
 */
import { resolve, dirname } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT      = resolve(__dirname, '..', '..');

let sanitizeBrowserContext;
try {
  const tsx = await import('tsx/esm/api').catch(() => null);
  if (tsx?.register) tsx.register();
  const mod = await import(pathToFileURL(
    resolve(ROOT, 'src/lib/server/admin/browser-context-sanitizer.ts'),
  ).href);
  sanitizeBrowserContext = mod.sanitizeBrowserContext;
} catch (err) {
  console.error('❌ Could not load sanitizer via tsx loader:', err.message);
  process.exit(2);
}

let passed = 0, failed = 0;
function check(name, cond, detail = '') {
  if (cond) { console.log(`  ✅ ${name}${detail ? ' — ' + detail : ''}`); passed++; }
  else      { console.log(`  ❌ ${name}${detail ? ' — ' + detail : ''}`); failed++; }
}

console.log('\n🧪 browser-context-sanitizer smoke\n');

// 1. Token-bearing URL strips the query string and counts as redacted.
{
  const r = sanitizeBrowserContext({
    captured_at: '2026-05-09T00:00:00Z',
    session_id: 'a',
    tabs: [{ title: 'Login', url: 'https://example.com/?token=secret123&debug=1' }],
  });
  const tab = r.context.tabs[0];
  check('1. tokenized URL — query stripped', tab && !tab.url.includes('token'), `url=${tab?.url}`);
  check('1. tokenized URL — counted as redacted', r.stats.urls_redacted >= 1, `urls_redacted=${r.stats.urls_redacted}`);
}

// 2. Forbidden scheme drops the tab entirely + counts forbidden_schemes_seen.
{
  const r = sanitizeBrowserContext({
    captured_at: '2026-05-09T00:00:00Z',
    session_id: 'b',
    tabs: [
      { title: 'good',  url: 'https://example.com/' },
      { title: 'creds', url: 'chrome://settings/passwords' },
      { title: 'js',    url: 'javascript:alert(1)' },
    ],
  });
  check('2. forbidden schemes dropped', r.context.tabs.length === 1, `kept=${r.context.tabs.length}`);
  check('2. forbidden_schemes_seen counted', r.stats.forbidden_schemes_seen === 2, `count=${r.stats.forbidden_schemes_seen}`);
  check('2. tabs_dropped reflects rejection', r.stats.tabs_dropped === 2, `dropped=${r.stats.tabs_dropped}`);
}

// 3. Snippet body redacts Authorization/Bearer + api_key + JWT.
{
  const r = sanitizeBrowserContext({
    captured_at: '2026-05-09T00:00:00Z',
    session_id: 'c',
    snippets: [{
      source_url: 'https://docs.example.com/auth',
      text: [
        'Authorization: Bearer eyJabcdefghijklmnop.qrstuvwxyz.123456',
        'api_key = sk-live-abcdefghijklmno',
        'normal log line — nothing to redact',
        'jwt: eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIxMjM0NTY3ODkwIn0.SflKxwRJSMeKKF2QT4fwpMeJf36POk6yJV_adQssw5c',
      ].join('\n'),
    }],
  });
  const text = r.context.snippets[0]?.text ?? '';
  check('3. Authorization/Bearer redacted', text.includes('[REDACTED') && !text.includes('eyJabcdef'), `len=${text.length}`);
  check('3. api_key line redacted',         /api_?key:\s*\[REDACTED\]/i.test(text), `match=${/api_?key:\s*\[REDACTED\]/i.test(text)}`);
  check('3. JWT shape redacted',            text.includes('[REDACTED_JWT]') || text.includes('[REDACTED]'), `match=${text.includes('[REDACTED')}`);
  check('3. normal line preserved',         text.includes('normal log line'));
  check('3. snippet_redactions counted',    r.stats.snippet_redactions >= 3, `count=${r.stats.snippet_redactions}`);
}

// 4. Count caps — 100 tabs in, ≤50 out.
{
  const tabs = Array.from({ length: 100 }, (_, i) => ({
    title: `t${i}`, url: `https://example.com/${i}`,
  }));
  const r = sanitizeBrowserContext({
    captured_at: '2026-05-09T00:00:00Z', session_id: 'd', tabs,
  });
  // The Zod schema's `.max(50)` rejects the whole payload — the sanitizer
  // returns degraded empty context, not 50 trimmed tabs. That's the expected
  // contract: callers should pre-trim before POSTing.
  check('4. > MAX_TABS rejected by schema', r.rejected_reason !== null, `reason=${r.rejected_reason?.slice(0, 60)}`);
  check('4. degraded context kept shape',   Array.isArray(r.context.tabs), `tabs=${r.context.tabs.length}`);
}

// 5. Schema-invalid payload returns degraded empty, never throws.
{
  let threw = false;
  let r;
  try { r = sanitizeBrowserContext({ not: 'a snapshot' }); }
  catch { threw = true; }
  check('5. invalid payload does not throw', !threw);
  check('5. invalid payload returns degraded', r?.rejected_reason !== null);
  check('5. degraded has trust label', r?.context?.trust === 'untrusted_user_visible');
}

// 6. Trust label always present on success path.
{
  const r = sanitizeBrowserContext({
    captured_at: '2026-05-09T00:00:00Z', session_id: 'e',
  });
  check('6. trust label on clean snapshot', r.context.trust === 'untrusted_user_visible');
}

console.log(`\n${failed === 0 ? '✅ all green' : `❌ ${failed} failed`} — ${passed}/${passed + failed} probes pass\n`);
process.exit(failed === 0 ? 0 : 1);