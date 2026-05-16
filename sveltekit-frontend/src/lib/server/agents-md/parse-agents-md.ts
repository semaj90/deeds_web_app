/**
 * LLMS.md → envelope parser.
 *
 * Pure function — no I/O. Takes the raw markdown body + repo-relative file
 * path and returns an AgentsMdEnvelope ready for Postgres / Redis / Qdrant.
 *
 * The parser is intentionally lenient: LLMS.md files are author-written
 * markdown, not strictly machine-generated. We extract what we can:
 *
 *   - title       → first H1
 *   - summary     → first paragraph after the H1, capped at 2000 chars
 *   - rules       → bullet items under "## Rules" / "## Conventions" / "## Standards"
 *   - tools       → table or bullet items under "## Tools" / "## Tool Policy"
 *   - constraints → bullet items under "## Constraints" / "## Forbidden"
 *   - tags        → bullet items under "## Tags" / "## Semantic Tags"
 *
 * Anything we can't parse cleanly is skipped (no exceptions).
 */

import { createHash } from 'node:crypto';
import {
  LLMS_MD_SCHEMA_VERSION,
  agentsMdEnvelopeSchema,
  type AgentRule,
  type AgentToolPolicy,
  type AgentConstraint,
  type AgentsMdEnvelope,
} from './schema.js';

const RULE_HEADERS       = ['rules', 'conventions', 'standards', 'guidelines'];
const TOOL_HEADERS       = ['tools', 'tool policy', 'allowed tools', 'tool registry'];
const CONSTRAINT_HEADERS = ['constraints', 'forbidden', 'do not', "don't", 'limits'];
const TAG_HEADERS        = ['tags', 'semantic tags', 'qdrant tags', 'topics'];

const SEVERITY_RE   = /\b(critical|high|important|medium|low|note|info)\b/i;
const SEVERITY_MAP: Record<string, AgentRule['severity']> = {
  critical: 'high', high: 'high', important: 'high',
  medium:   'medium',
  low:      'low', note: 'low', info: 'low',
};

interface Section {
  header: string;
  body:   string[];
}

function splitSections(md: string): { preamble: string[]; sections: Section[] } {
  const lines    = md.split(/\r?\n/);
  const preamble: string[] = [];
  const sections: Section[] = [];
  let cur: Section | null = null;

  for (const line of lines) {
    const m = /^##+\s+(.+?)\s*$/.exec(line);
    if (m) {
      if (cur) sections.push(cur);
      cur = { header: m[1].toLowerCase().trim(), body: [] };
      continue;
    }
    if (cur) cur.body.push(line);
    else     preamble.push(line);
  }
  if (cur) sections.push(cur);

  return { preamble, sections };
}

function findSection(sections: Section[], headers: ReadonlyArray<string>): Section | null {
  for (const s of sections) {
    for (const h of headers) {
      if (s.header === h || s.header.startsWith(h)) return s;
    }
  }
  return null;
}

function extractBullets(body: string[]): string[] {
  const out: string[] = [];
  for (const raw of body) {
    const m = /^\s*[-*+]\s+(.+?)\s*$/.exec(raw);
    if (m && m[1].length >= 2) out.push(m[1]);
  }
  return out;
}

function extractRules(section: Section | null): AgentRule[] {
  if (!section) return [];
  const bullets = extractBullets(section.body);
  return bullets.slice(0, 50).map((rule) => {
    const sev = SEVERITY_RE.exec(rule);
    const severity = (sev ? SEVERITY_MAP[sev[1].toLowerCase()] : 'medium') ?? 'medium';
    // Inline tags: `[tag1, tag2]` at end of bullet
    const tagMatch = /\[([a-z0-9, _-]+)\]\s*$/i.exec(rule);
    const tags = tagMatch
      ? tagMatch[1].split(',').map((t) => t.trim().toLowerCase()).filter(Boolean)
      : [];
    return {
      rule:     rule.replace(/\[[a-z0-9, _-]+\]\s*$/i, '').trim().slice(0, 2000),
      severity,
      tags,
    };
  });
}

function extractTools(section: Section | null): AgentToolPolicy[] {
  if (!section) return [];
  const out: AgentToolPolicy[] = [];

  // Form 1: bullet items like "- toolname: allowed (read-only)" or "- toolname: forbidden"
  for (const b of extractBullets(section.body)) {
    const m = /^([\w.-]+)\s*[:=]\s*(allowed|forbidden|denied|yes|no|true|false)(?:\s*\(([^)]+)\))?\s*(?:—\s*(.+))?$/i.exec(b);
    if (m) {
      const allowed = /^(allowed|yes|true)$/i.test(m[2]);
      out.push({
        tool:    m[1],
        allowed,
        scope:   m[3]?.trim().toLowerCase() ?? 'unspecified',
        reason:  m[4]?.trim(),
      });
    }
  }

  // Form 2: markdown table rows: | tool | allowed/forbidden | scope | reason |
  for (const raw of section.body) {
    if (!raw.startsWith('|')) continue;
    if (/^\|\s*-+/.test(raw)) continue; // separator row
    const cells = raw.split('|').map((c) => c.trim()).filter((c, i, a) => i > 0 && i < a.length - 1);
    if (cells.length < 2) continue;
    if (/^(tool|name)$/i.test(cells[0])) continue; // header row
    const allowed = /^(allowed|yes|true|✓|✅)$/i.test(cells[1]);
    if (!cells[0].match(/^[\w.-]+$/)) continue;
    out.push({
      tool:    cells[0],
      allowed,
      scope:   (cells[2] ?? 'unspecified').toLowerCase(),
      reason:  cells[3],
    });
  }

  return out.slice(0, 50);
}

function extractConstraints(section: Section | null): AgentConstraint[] {
  if (!section) return [];
  return extractBullets(section.body).slice(0, 30).map((b) => {
    const tagMatch = /\[([a-z0-9, _-]+)\]\s*$/i.exec(b);
    const applies_to = tagMatch
      ? tagMatch[1].split(',').map((t) => t.trim().toLowerCase()).filter(Boolean)
      : [];
    return {
      constraint: b.replace(/\[[a-z0-9, _-]+\]\s*$/i, '').trim().slice(0, 2000),
      applies_to,
    };
  });
}

function extractTags(section: Section | null): string[] {
  if (!section) return [];
  const text = section.body.join(' ').toLowerCase();
  const tagSet = new Set<string>();
  // Tags can be a bullet list or a comma-separated paragraph
  for (const b of extractBullets(section.body)) {
    for (const t of b.split(/[,;]\s*/)) {
      const norm = t.trim().toLowerCase().replace(/[^a-z0-9-]/g, '');
      if (norm.length >= 2 && norm.length <= 60) tagSet.add(norm);
    }
  }
  if (tagSet.size === 0) {
    for (const t of text.split(/[,;\n]\s*/)) {
      const norm = t.trim().toLowerCase().replace(/[^a-z0-9-]/g, '');
      if (norm.length >= 2 && norm.length <= 60) tagSet.add(norm);
    }
  }
  return [...tagSet].slice(0, 30);
}

function extractTitleAndSummary(preamble: string[]): { title?: string; summary: string } {
  let title: string | undefined;
  let summaryLines: string[] = [];
  let pastTitle = false;

  for (const raw of preamble) {
    const t = /^#\s+(.+?)\s*$/.exec(raw);
    if (t && !title) { title = t[1].trim(); pastTitle = true; continue; }
    if (!pastTitle) continue;
    if (/^#{1,6}\s/.test(raw)) break; // next heading ends summary
    if (raw.trim() === '' && summaryLines.length > 0) break;
    if (raw.trim() === '') continue;
    summaryLines.push(raw.trim());
  }

  return {
    title,
    summary: summaryLines.join(' ').slice(0, 2000),
  };
}

/**
 * Parse an LLMS.md body into a typed envelope. Pure function.
 * Throws if the resulting envelope fails Zod validation (shouldn't happen
 * with valid inputs, but the validator is the contract).
 */
export function parseAgentsMd(body: string, filePath: string): AgentsMdEnvelope {
  const norm = body.replace(/\r\n/g, '\n').trim();
  const contentHash = createHash('sha256').update(norm).digest('hex');

  const fp        = filePath.replace(/\\/g, '/');
  // Strip /LLMS.md OR bare LLMS.md (repo root). Empty result → '.'
  const directory = fp.replace(/(?:^|\/)AGENTS\.md$/i, '').replace(/\/$/, '') || '.';
  const stableKey = `agents:${fp}`;

  const { preamble, sections } = splitSections(norm);
  const { title, summary }     = extractTitleAndSummary(preamble);

  const rules       = extractRules(findSection(sections, RULE_HEADERS));
  const tools       = extractTools(findSection(sections, TOOL_HEADERS));
  const constraints = extractConstraints(findSection(sections, CONSTRAINT_HEADERS));
  const tags        = extractTags(findSection(sections, TAG_HEADERS));

  // Heuristic confidence — more structure = higher confidence
  const structureScore = Math.min(1,
    (rules.length > 0 ? 0.25 : 0) +
    (tools.length > 0 ? 0.20 : 0) +
    (constraints.length > 0 ? 0.15 : 0) +
    (tags.length > 0 ? 0.15 : 0) +
    (title ? 0.10 : 0) +
    (summary.length > 30 ? 0.15 : 0),
  );

  const envelope: AgentsMdEnvelope = {
    kind:           'LLMS.md',
    stable_key:     stableKey,
    file_path:      fp,
    directory_path: directory,
    content_hash:   contentHash,
    title,
    summary,
    applies_to:     { directory, children: true },
    rules,
    tools,
    constraints,
    semantic_tags:  tags,
    // qdrant_tags inherits from semantic_tags by default — indexer can override
    qdrant_tags:    tags,
    confidence:     Math.max(0.5, structureScore || 0.5),
    schema_version: LLMS_MD_SCHEMA_VERSION,
  };

  return agentsMdEnvelopeSchema.parse(envelope);
}
