/**
 * browser-context-sanitizer.ts
 *
 * Pure-function sanitizer for the Browser Context Lane. Same input → same
 * output, no I/O, no DB. Called by the API route before storage and again
 * defensively before the snapshot enters the LLM prompt.
 *
 * Trust model: the input arrived from an untrusted browser extension or
 * a Copilot panel running in the operator's browser. We:
 *   1. Reject forbidden URL schemes outright (chrome://, file://, javascript:, etc.)
 *   2. Strip query strings from URLs by default (#1 source of token leaks)
 *   3. Redact common secret-name patterns from URL fragments + snippet text
 *   4. Cap counts and lengths
 *   5. Mark the result `trust: 'untrusted_user_visible'`
 *
 * The redaction is intentionally conservative: false-positive redactions
 * (a benign `?token=foo` query param) are fine, false-negative leaks of
 * a real bearer token would not be.
 */
import {
  BrowserContextSnapshotSchema,
  BROWSER_CONTEXT_CAPS,
  FORBIDDEN_URL_SCHEMES,
  REDACTED_TOKEN_NAMES,
  type BrowserContextSnapshot,
  type BrowserTab,
  type BrowserSnippet,
  type BrowserHistoryHit,
  type SanitizedBrowserContext,
} from '$lib/types/browser-context.js';
import { createSafeRegex } from '$lib/server/utils/re2.js';

/** Build the case-insensitive secret-name regex once. Matches `name=value`
 *  in URL queries AND `name: value` (colon, optional space) in snippet bodies. */
const TOKEN_NAME_PATTERN = REDACTED_TOKEN_NAMES.map(n =>
  n.replace(/[-_]/g, '[-_]?')   // tolerate access-token / access_token
).join('|');

/** Matches `?…token=value…` or `&…token=value…` inside a URL query string. */
const URL_QUERY_TOKEN_RE = createSafeRegex(`([?&])(${TOKEN_NAME_PATTERN})=[^&#]*`, 'gi');

/** Matches `name: value` or `name = value` lines inside snippet bodies. */
const SNIPPET_TOKEN_LINE_RE = createSafeRegex(`^(\\s*(?:${TOKEN_NAME_PATTERN}))\\s*[:=]\\s*\\S.*$`, 'gim');

/** Bearer / JWT-shaped tokens floating free in text. */
const BEARER_PREFIX_RE = /\b(Bearer\s+)[A-Za-z0-9._\-+/=]{16,}/g;
const JWT_LIKE_RE      = /\beyJ[A-Za-z0-9_\-]+\.[A-Za-z0-9_\-]+\.[A-Za-z0-9_\-]+\b/g;

export interface SanitizeResult {
  context:          SanitizedBrowserContext;
  /** Per-call counters — useful for logging without storing the rejected items. */
  stats:            SanitizedBrowserContext['sanitized'];
  /** Truthy when the entire input was rejected (e.g. failed Zod). */
  rejected_reason:  string | null;
}

/** Returns whether the URL uses a scheme we accept. http(s) + safe relative paths only. */
function isAcceptableUrl(raw: string): boolean {
  if (!raw || typeof raw !== 'string') return false;
  const lower = raw.trim().toLowerCase();
  for (const bad of FORBIDDEN_URL_SCHEMES) {
    if (lower.startsWith(bad)) return false;
  }
  // http, https, or relative (starts with `/` or is hostname-like)
  return lower.startsWith('http://') || lower.startsWith('https://')
      || lower.startsWith('/')        || /^[a-z0-9.-]+\//i.test(raw);
}

/** Strip query string entirely; leave path + fragment. Token leaks live in queries. */
function sanitizeUrl(raw: string): { url: string; redacted: boolean } {
  if (!raw) return { url: '', redacted: false };
  // Try to parse with URL constructor; fall back to naive split.
  try {
    const u = new URL(raw, 'http://placeholder.invalid');
    const hadTokenInQuery = URL_QUERY_TOKEN_RE.test(u.search);
    URL_QUERY_TOKEN_RE.lastIndex = 0;
    u.search = '';
    // Drop hash if it contains token-like substrings, otherwise keep.
    let hadTokenInHash = false;
    if (u.hash) {
      const hashRedacted = u.hash.replace(URL_QUERY_TOKEN_RE, (_, sep, name) => {
        hadTokenInHash = true;
        return `${sep}${name}=[REDACTED]`;
      });
      URL_QUERY_TOKEN_RE.lastIndex = 0;
      u.hash = hashRedacted;
    }
    const isPlaceholder = u.hostname === 'placeholder.invalid';
    const out = isPlaceholder ? `${u.pathname}${u.hash}` : u.toString();
    return { url: out, redacted: hadTokenInQuery || hadTokenInHash };
  } catch {
    // Naive fallback: split on `?` and `#`.
    const [base, rest = ''] = raw.split('?', 2);
    const hadToken = URL_QUERY_TOKEN_RE.test(rest);
    URL_QUERY_TOKEN_RE.lastIndex = 0;
    return { url: base, redacted: hadToken };
  }
}

/** Redact secret-name lines + bearer/jwt tokens from snippet body text. */
function sanitizeSnippetText(raw: string): { text: string; redactions: number } {
  if (!raw) return { text: '', redactions: 0 };
  let text = raw;
  let redactions = 0;
  text = text.replace(SNIPPET_TOKEN_LINE_RE, (_, name) => {
    redactions++;
    return `${name}: [REDACTED]`;
  });
  text = text.replace(BEARER_PREFIX_RE, (_, prefix) => {
    redactions++;
    return `${prefix}[REDACTED]`;
  });
  text = text.replace(JWT_LIKE_RE, () => {
    redactions++;
    return '[REDACTED_JWT]';
  });
  // Cap final length (post-redaction) to the schema limit.
  if (text.length > BROWSER_CONTEXT_CAPS.MAX_SNIPPET_CHARS) {
    text = text.slice(0, BROWSER_CONTEXT_CAPS.MAX_SNIPPET_CHARS) + '…[truncated]';
  }
  return { text, redactions };
}

function sanitizeTab(t: BrowserTab, stats: SanitizedBrowserContext['sanitized']): BrowserTab | null {
  if (!isAcceptableUrl(t.url)) {
    stats.forbidden_schemes_seen++;
    return null;
  }
  const { url, redacted } = sanitizeUrl(t.url);
  if (redacted) stats.urls_redacted++;
  return {
    id:     t.id,
    title:  t.title.slice(0, BROWSER_CONTEXT_CAPS.MAX_TITLE_CHARS),
    url:    url.slice(0, BROWSER_CONTEXT_CAPS.MAX_URL_CHARS),
    active: !!t.active,
    pinned: !!t.pinned,
  };
}

function sanitizeSnippet(s: BrowserSnippet, stats: SanitizedBrowserContext['sanitized']): BrowserSnippet | null {
  if (!isAcceptableUrl(s.source_url)) {
    stats.forbidden_schemes_seen++;
    return null;
  }
  const { url, redacted } = sanitizeUrl(s.source_url);
  if (redacted) stats.urls_redacted++;
  const { text, redactions } = sanitizeSnippetText(s.text);
  stats.snippet_redactions += redactions;
  return {
    source_url: url.slice(0, BROWSER_CONTEXT_CAPS.MAX_URL_CHARS),
    title:      s.title?.slice(0, BROWSER_CONTEXT_CAPS.MAX_TITLE_CHARS),
    text,
    selector:   s.selector?.slice(0, 500),
  };
}

function sanitizeHistoryHit(h: BrowserHistoryHit, stats: SanitizedBrowserContext['sanitized']): BrowserHistoryHit | null {
  if (!isAcceptableUrl(h.url)) {
    stats.forbidden_schemes_seen++;
    return null;
  }
  const { url, redacted } = sanitizeUrl(h.url);
  if (redacted) stats.urls_redacted++;
  return {
    url:        url.slice(0, BROWSER_CONTEXT_CAPS.MAX_URL_CHARS),
    title:      h.title?.slice(0, BROWSER_CONTEXT_CAPS.MAX_TITLE_CHARS),
    score:      typeof h.score === 'number' && h.score >= 0 && h.score <= 1 ? h.score : undefined,
    visited_at: h.visited_at,
  };
}

/**
 * Sanitize an arbitrary input. Validates against the Zod schema first; on
 * failure returns a degraded empty snapshot so callers never get null.
 */
export function sanitizeBrowserContext(input: unknown): SanitizeResult {
  const parsed = BrowserContextSnapshotSchema.safeParse(input);
  const stats: SanitizedBrowserContext['sanitized'] = {
    tabs_dropped:           0,
    snippets_dropped:       0,
    history_hits_dropped:   0,
    urls_redacted:          0,
    snippet_redactions:     0,
    forbidden_schemes_seen: 0,
  };

  if (!parsed.success) {
    const empty = emptyContext();
    return {
      context:         { ...empty, sanitized: stats, trust: 'untrusted_user_visible', received_at: new Date().toISOString() },
      stats,
      rejected_reason: parsed.error.message.slice(0, 500),
    };
  }

  const raw: BrowserContextSnapshot = parsed.data;
  const tabs:         BrowserTab[]         = [];
  const snippets:     BrowserSnippet[]     = [];
  const history_hits: BrowserHistoryHit[]  = [];

  for (const t of raw.tabs.slice(0, BROWSER_CONTEXT_CAPS.MAX_TABS)) {
    const safe = sanitizeTab(t, stats);
    if (safe) tabs.push(safe); else stats.tabs_dropped++;
  }
  for (const s of raw.snippets.slice(0, BROWSER_CONTEXT_CAPS.MAX_SNIPPETS)) {
    const safe = sanitizeSnippet(s, stats);
    if (safe) snippets.push(safe); else stats.snippets_dropped++;
  }
  for (const h of raw.history_hits.slice(0, BROWSER_CONTEXT_CAPS.MAX_HISTORY_HITS)) {
    const safe = sanitizeHistoryHit(h, stats);
    if (safe) history_hits.push(safe); else stats.history_hits_dropped++;
  }

  let current_tab: BrowserTab | undefined;
  if (raw.current_tab) {
    const safe = sanitizeTab(raw.current_tab, stats);
    if (safe) current_tab = safe; else stats.tabs_dropped++;
  }

  return {
    context: {
      captured_at:           raw.captured_at,
      session_id:            raw.session_id,
      current_tab,
      tabs,
      snippets,
      history_hits,
      highlighted_element_id: raw.highlighted_element_id?.slice(0, BROWSER_CONTEXT_CAPS.MAX_HIGHLIGHTED_ID),
      embed_model:           raw.embed_model,
      embed_device:          raw.embed_device,
      sanitized:             stats,
      trust:                 'untrusted_user_visible',
      received_at:           new Date().toISOString(),
    },
    stats,
    rejected_reason: null,
  };
}

/** Default empty snapshot for the GET path when no snapshot was POSTed. */
export function emptyContext(): BrowserContextSnapshot {
  return {
    captured_at:  new Date(0).toISOString(),
    session_id:   'empty',
    tabs:         [],
    snippets:     [],
    history_hits: [],
    embed_device: 'unavailable',
  };
}



