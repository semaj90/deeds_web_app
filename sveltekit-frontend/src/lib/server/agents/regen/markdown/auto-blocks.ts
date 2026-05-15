/**
 * Phase A5 — `@auto:*` block contract for LLMS.md hand-edit preservation.
 *
 * Spec: docs/design/2026-05-11_agents-directory-card-regen.md §4 "Hand-edit policy".
 *
 * LLMS.md files mix regen-owned content (auto-blocks) with operator notes
 * (anything outside the markers). Regen REPLACES auto-blocks verbatim; it
 * NEVER touches text outside them. Operator-authored sections like
 * "## Operator notes (preserved across regen)" survive forever.
 *
 *   <!-- @auto:summary start -->
 *   This directory implements ACE context assembly.
 *   <!-- @auto:summary end -->
 *
 * First-run policy: if an existing LLMS.md has zero auto-blocks, regen
 * appends a fresh block set at the end and preserves the original content
 * above. If no LLMS.md exists at all, regen writes a brand-new file
 * composed entirely of auto-blocks.
 *
 * Pure module — no I/O, no DB. The fs writer lives in
 * `../writers/markdown-writer.ts` and gates writes with the same env-gate
 * pattern as the CouchDB/Qdrant writers.
 */

import type { AgentsDirectoryCard } from '../../agents-card-store.js';

export type AutoBlockId =
	| 'summary'
	| 'imports'
	| 'features'
	| 'topology'
	| 'status'
	| 'gates'
	| 'activity';

export const AUTO_BLOCK_IDS: readonly AutoBlockId[] = [
	'summary',
	'imports',
	'features',
	'topology',
	'status',
	'gates',
	'activity',
];

const START_RE = (id: AutoBlockId) => new RegExp(`<!--\\s*@auto:${id}\\s+start\\s*-->`);
const END_RE   = (id: AutoBlockId) => new RegExp(`<!--\\s*@auto:${id}\\s+end\\s*-->`);
const ANY_START_RE = /<!--\s*@auto:([a-z0-9_-]+)\s+start\s*-->/g;

// ── Render: card → block body ────────────────────────────────────────────────

/** Render one auto-block's inner body (without the start/end markers). */
export function renderBlockBody(id: AutoBlockId, card: AgentsDirectoryCard): string {
	switch (id) {
		case 'summary':  return renderSummary(card);
		case 'imports':  return renderImports(card);
		case 'features': return renderFeatures(card);
		case 'topology': return renderTopology(card);
		case 'status':   return renderStatus(card);
		case 'gates':    return renderGates(card);
		case 'activity': return renderActivity(card);
	}
}

function renderSummary(card: AgentsDirectoryCard): string {
	const lines = [
		`# ${card.title || card.dirPath}`,
		'',
		card.summary || '_(no summary available — graphify hasn\'t resolved a cluster for this dir yet)_',
	];
	return lines.join('\n');
}

function renderImports(card: AgentsDirectoryCard): string {
	const lines: string[] = ['## Imports', ''];
	if (card.staticImports.length === 0 && card.dynamicImports.length === 0) {
		lines.push('_(no resolved imports under this directory)_');
		return lines.join('\n');
	}
	if (card.staticImports.length > 0) {
		lines.push('**Static (top consumers):**');
		for (const i of card.staticImports.slice(0, 20)) lines.push(`- \`${i}\``);
		lines.push('');
	}
	if (card.dynamicImports.length > 0) {
		lines.push('**Dynamic:**');
		for (const i of card.dynamicImports.slice(0, 10)) lines.push(`- \`${i}\``);
		lines.push('');
	}
	if (card.pathAliases.length > 0) {
		lines.push('**Path aliases reachable from this dir:** ' + card.pathAliases.map((a) => `\`${a}\``).join(' · '));
	}
	return lines.join('\n').replace(/\n+$/, '');
}

function renderFeatures(card: AgentsDirectoryCard): string {
	const lines: string[] = ['## Features + routes + schema', ''];
	if (card.featureKeys.length > 0) {
		lines.push('**Feature keys (master_LLMS.md):** ' + card.featureKeys.map((k) => `\`${k}\``).join(' · '));
	} else {
		lines.push('_(no feature_implementations rows map to this directory)_');
	}
	if (card.routeSurfaces.length > 0) {
		lines.push('');
		lines.push('**Route surfaces:**');
		for (const r of card.routeSurfaces.slice(0, 12)) lines.push(`- \`${r}\``);
	}
	if (card.schemaTables.length > 0) {
		lines.push('');
		lines.push('**Drizzle tables referenced:** ' + card.schemaTables.map((t) => `\`${t}\``).join(' · '));
	}
	return lines.join('\n');
}

function renderTopology(card: AgentsDirectoryCard): string {
	const lines: string[] = ['## Topology'];
	if (card.qdrantTags.length === 0) {
		lines.push('', '_(no Qdrant tags resolved — graphify pending)_');
	} else {
		lines.push('', '**Qdrant tags:** ' + card.qdrantTags.slice(0, 16).map((t) => `\`${t}\``).join(' · '));
	}
	if (card.neo4jNodeId) lines.push('', `**Neo4j node id:** \`${card.neo4jNodeId}\``);
	if (card.couchDocId)  lines.push(`**CouchDB doc id:** \`${card.couchDocId}\``);
	return lines.join('\n');
}

function renderStatus(card: AgentsDirectoryCard): string {
	const lines: string[] = ['## Audit status', '', `**Status:** \`${card.auditStatus}\``];
	if (card.recommendations.length > 0) {
		lines.push('', '**Related directories:**');
		for (const r of card.recommendations) lines.push(`- \`${r}\``);
	}
	return lines.join('\n');
}

function renderGates(card: AgentsDirectoryCard): string {
	const entries = Object.entries(card.gates ?? {});
	if (entries.length === 0) return '## Logic gates\n\n_(no gates evaluated)_';
	const lines: string[] = ['## Logic gates', '', '| Gate | Status |', '|---|---|'];
	for (const [id, ok] of entries.sort(([a], [b]) => a.localeCompare(b))) {
		lines.push(`| \`${id}\` | ${ok ? '✓' : '✗'} |`);
	}
	return lines.join('\n');
}

function renderActivity(card: AgentsDirectoryCard): string {
	const lines: string[] = ['## Activity'];
	if (card.activityScore > 0) {
		lines.push('', `**Activity score:** ${card.activityScore.toFixed(2)}`);
		if (card.lastAccessedAt) lines.push(`**Last accessed:** ${card.lastAccessedAt}`);
	} else {
		lines.push('', '_(no recent activity in the context_timeline window)_');
	}
	return lines.join('\n');
}

// ── Render: full file ────────────────────────────────────────────────────────

const HEADER = (card: AgentsDirectoryCard) => [
	'<!-- This file is partially regen-managed.',
	'     Sections wrapped in <!-- @auto:* start/end --> are overwritten on every',
	'     `npm run agents:regen` pass. Anything OUTSIDE those markers is preserved.',
	'     Operator-authored notes belong below the auto-block region. -->',
	'',
	`<!-- agents-card: ${card.id} -->`,
	`<!-- regen run-id: not-recorded-in-file -->`,
	`<!-- lastIndexedAt: ${card.lastIndexedAt} -->`,
	'',
].join('\n');

/**
 * Render a complete LLMS.md body composed entirely of auto-blocks. Used
 * when no file exists yet OR as the auto-region in `mergeCardIntoMarkdown`.
 */
export function renderAllAutoBlocks(card: AgentsDirectoryCard): string {
	const parts: string[] = [];
	for (const id of AUTO_BLOCK_IDS) {
		parts.push(wrapBlock(id, renderBlockBody(id, card)));
	}
	return parts.join('\n\n');
}

/** Render a complete fresh file (header + all auto-blocks). */
export function renderFreshMarkdown(card: AgentsDirectoryCard): string {
	return HEADER(card) + renderAllAutoBlocks(card) + '\n';
}

function wrapBlock(id: AutoBlockId, body: string): string {
	return `<!-- @auto:${id} start -->\n${body}\n<!-- @auto:${id} end -->`;
}

// ── Parse: existing markdown → known auto-block spans ────────────────────────

export interface AutoBlockSpan {
	id:    AutoBlockId | string;       // unknown ids are surfaced for diagnostics
	start: number;                     // index of `<!-- @auto:` marker (inclusive)
	end:   number;                     // index AFTER the closing `-->` (exclusive)
}

/**
 * Locate every well-formed `@auto:<id>` start/end pair. Unmatched/dangling
 * markers are ignored (the merger leaves them untouched so the operator can
 * see the corruption manually).
 */
export function findAutoBlocks(md: string): AutoBlockSpan[] {
	const spans: AutoBlockSpan[] = [];
	ANY_START_RE.lastIndex = 0;
	let match: RegExpExecArray | null;
	while ((match = ANY_START_RE.exec(md)) !== null) {
		const id = match[1];
		const startMarkerStart = match.index;
		const endRe = END_RE(id as AutoBlockId);
		endRe.lastIndex = startMarkerStart;
		const endMatch = endRe.exec(md);
		if (!endMatch) continue;
		const endMarkerEnd = endMatch.index + endMatch[0].length;
		spans.push({ id, start: startMarkerStart, end: endMarkerEnd });
	}
	return spans;
}

// ── Merge: card → new markdown that preserves operator-edits ─────────────────

export interface MergeResult {
	body:           string;
	replacedBlocks: AutoBlockId[];     // which blocks were swapped in place
	appendedBlocks: AutoBlockId[];     // blocks that didn't exist before → appended
	changed:        boolean;           // false iff the result === input verbatim
}

/**
 * Splice fresh auto-block bodies into existing markdown.
 *
 *   - Existing `@auto:<id>` blocks are REPLACED in place (preserving the
 *     surrounding text).
 *   - Missing blocks are APPENDED to the end (with a separator). The
 *     operator can re-order them manually later.
 *   - Operator text outside auto-blocks is left strictly alone.
 *
 * If `existing` is empty or has zero auto-blocks, we treat it as a fresh
 * file: prepend the header + render all auto-blocks, append the existing
 * content (so legacy LLMS.md content isn't lost — operators can prune
 * it later).
 */
export function mergeCardIntoMarkdown(card: AgentsDirectoryCard, existing: string | null): MergeResult {
	const newBodyByBlock = new Map<AutoBlockId, string>();
	for (const id of AUTO_BLOCK_IDS) {
		newBodyByBlock.set(id, wrapBlock(id, renderBlockBody(id, card)));
	}

	if (!existing || !existing.trim()) {
		const body = renderFreshMarkdown(card);
		return { body, replacedBlocks: [], appendedBlocks: [...AUTO_BLOCK_IDS], changed: true };
	}

	const spans = findAutoBlocks(existing);
	if (spans.length === 0) {
		// Legacy file — wrap as: HEADER + all auto-blocks + original content
		// (with a divider so the operator can see what's pre-regen).
		const body =
			HEADER(card) +
			renderAllAutoBlocks(card) +
			'\n\n<!-- ── operator-authored content below (preserved across regen) ── -->\n\n' +
			existing.trimEnd() +
			'\n';
		return { body, replacedBlocks: [], appendedBlocks: [...AUTO_BLOCK_IDS], changed: body !== existing };
	}

	// In-place replace known blocks; track which we covered.
	const replacedSet = new Set<AutoBlockId>();
	// Walk spans in REVERSE so earlier indices don't shift as we splice.
	let out = existing;
	for (const span of [...spans].sort((a, b) => b.start - a.start)) {
		const id = span.id as AutoBlockId;
		const fresh = newBodyByBlock.get(id);
		if (!fresh) continue; // unknown @auto:<id> from a future version — leave alone
		out = out.slice(0, span.start) + fresh + out.slice(span.end);
		replacedSet.add(id);
	}

	// Append any auto-block we don't yet have a span for.
	const missing: AutoBlockId[] = [];
	for (const id of AUTO_BLOCK_IDS) {
		if (!replacedSet.has(id)) missing.push(id);
	}
	if (missing.length > 0) {
		const trailer =
			(out.endsWith('\n') ? '' : '\n') +
			'\n<!-- ── regen appended these auto-blocks; operator may re-order ── -->\n\n' +
			missing.map((id) => newBodyByBlock.get(id)!).join('\n\n') +
			'\n';
		out += trailer;
	}

	return {
		body:           out,
		replacedBlocks: [...replacedSet],
		appendedBlocks: missing,
		changed:        out !== existing,
	};
}
