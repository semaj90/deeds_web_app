// @vitest-environment node
/**
 * Phase A5 — AGENTS.md hand-edit preservation.
 *
 * Covers the @auto:* block contract from
 * docs/design/2026-05-11_agents-directory-card-regen.md §4:
 *   - render each known block from a card
 *   - locate auto-blocks in arbitrary markdown
 *   - merge new card content into existing markdown, preserving operator text
 *   - first-run wrapping when no markers are present
 *   - writer env-gate refusing live fs writes under VITEST
 */

import { describe, expect, it, vi } from 'vitest';

import {
	renderBlockBody,
	renderFreshMarkdown,
	findAutoBlocks,
	mergeCardIntoMarkdown,
	AUTO_BLOCK_IDS,
} from '../src/lib/server/agents/regen/markdown/auto-blocks.js';
import { writeCardMarkdown } from '../src/lib/server/agents/regen/writers/markdown-writer.js';
import type { AgentsDirectoryCard } from '../src/lib/server/agents/agents-card-store.js';

function makeCard(overrides: Partial<AgentsDirectoryCard> = {}): AgentsDirectoryCard {
	return {
		id:              'agents:dir:src-lib-server-ace',
		dirPath:         'src/lib/server/ace',
		title:           'ACE',
		summary:         'ACE context assembler — fuses RAG/KAG/SOM/PR for legal queries.',
		staticImports:   ['$lib/server/redis', '$lib/server/vector/qdrant-manager'],
		dynamicImports:  ['$lib/server/heavy-thing'],
		pathAliases:     ['$lib'],
		featureKeys:     ['ace.assembler', 'ace.stage_a0'],
		routeSurfaces:   ['src/routes/api/ace/+server.ts'],
		schemaTables:    ['evidence_vectors', 'ace_retrieval_runs'],
		qdrantTags:      ['ace', 'retrieval', 'kag'],
		neo4jNodeId:     'agents:dir:src-lib-server-ace',
		couchDocId:      'agents:dir:src-lib-server-ace',
		auditStatus:     'SHIPPED',
		recommendations: ['src/lib/server/rag', 'src/lib/server/vector'],
		activityScore:   3.14,
		lastAccessedAt:  '2026-05-11T22:00:00.000Z',
		lastIndexedAt:   '2026-05-11T23:00:00.000Z',
		contentHash:     'a'.repeat(64),
		gates:           { 'G-AI-01': true, 'G-AI-02': false, 'G-AI-03': true },
		...overrides,
	};
}

// ── renderBlockBody ──────────────────────────────────────────────────────────

describe('renderBlockBody', () => {
	const card = makeCard();

	it('summary block uses card.title + summary', () => {
		const body = renderBlockBody('summary', card);
		expect(body).toContain('# ACE');
		expect(body).toContain('ACE context assembler');
	});

	it('imports block lists static + dynamic imports + aliases', () => {
		const body = renderBlockBody('imports', card);
		expect(body).toContain('Static');
		expect(body).toContain('$lib/server/redis');
		expect(body).toContain('Dynamic');
		expect(body).toContain('$lib/server/heavy-thing');
		expect(body).toContain('$lib');
	});

	it('imports block degrades to empty placeholder when no imports', () => {
		const body = renderBlockBody('imports', makeCard({ staticImports: [], dynamicImports: [], pathAliases: [] }));
		expect(body).toContain('no resolved imports');
	});

	it('features block lists feature_keys + route surfaces + schema tables', () => {
		const body = renderBlockBody('features', card);
		expect(body).toContain('ace.assembler');
		expect(body).toContain('+server.ts');
		expect(body).toContain('evidence_vectors');
	});

	it('topology block surfaces qdrantTags + neo4jNodeId + couchDocId', () => {
		const body = renderBlockBody('topology', card);
		expect(body).toContain('retrieval');
		expect(body).toContain('agents:dir:src-lib-server-ace');
	});

	it('status block renders auditStatus + recommendations', () => {
		const body = renderBlockBody('status', card);
		expect(body).toContain('SHIPPED');
		expect(body).toContain('src/lib/server/rag');
	});

	it('gates block emits a table with ✓ / ✗', () => {
		const body = renderBlockBody('gates', card);
		expect(body).toContain('| Gate | Status |');
		expect(body).toContain('| `G-AI-01` | ✓ |');
		expect(body).toContain('| `G-AI-02` | ✗ |');
	});

	it('activity block reports score + lastAccessedAt when present', () => {
		const body = renderBlockBody('activity', card);
		expect(body).toContain('3.14');
		expect(body).toContain('2026-05-11T22:00:00');
	});
});

// ── renderFreshMarkdown ──────────────────────────────────────────────────────

describe('renderFreshMarkdown', () => {
	it('wraps each auto-block with start/end markers', () => {
		const md = renderFreshMarkdown(makeCard());
		for (const id of AUTO_BLOCK_IDS) {
			expect(md).toContain(`<!-- @auto:${id} start -->`);
			expect(md).toContain(`<!-- @auto:${id} end -->`);
		}
	});

	it('emits the regen header above the auto-block region', () => {
		const md = renderFreshMarkdown(makeCard());
		expect(md).toContain('This file is partially regen-managed');
		expect(md).toContain('agents-card: agents:dir:src-lib-server-ace');
	});
});

// ── findAutoBlocks ───────────────────────────────────────────────────────────

describe('findAutoBlocks', () => {
	it('locates every well-formed start/end pair', () => {
		const md = renderFreshMarkdown(makeCard());
		const spans = findAutoBlocks(md);
		const ids = spans.map((s) => s.id);
		for (const id of AUTO_BLOCK_IDS) expect(ids).toContain(id);
	});

	it('ignores a dangling start marker without a matching end', () => {
		const md = '<!-- @auto:summary start -->\nbody but no closing tag\n## Other content';
		const spans = findAutoBlocks(md);
		expect(spans).toHaveLength(0);
	});

	it('surfaces unknown auto-ids for diagnostics', () => {
		const md = '<!-- @auto:future_field start -->\nbody\n<!-- @auto:future_field end -->';
		const spans = findAutoBlocks(md);
		expect(spans).toHaveLength(1);
		expect(spans[0].id).toBe('future_field');
	});
});

// ── mergeCardIntoMarkdown ────────────────────────────────────────────────────

describe('mergeCardIntoMarkdown', () => {
	const card = makeCard();

	it('produces a fresh file when existing is null or empty', () => {
		const m1 = mergeCardIntoMarkdown(card, null);
		const m2 = mergeCardIntoMarkdown(card, '');
		expect(m1.appendedBlocks.length).toBe(AUTO_BLOCK_IDS.length);
		expect(m1.changed).toBe(true);
		expect(m2.appendedBlocks.length).toBe(AUTO_BLOCK_IDS.length);
	});

	it('preserves operator-authored text outside auto-blocks', () => {
		const existing = renderFreshMarkdown(card).replace(
			/<!-- @auto:status end -->/,
			'<!-- @auto:status end -->\n\n## Operator notes\n\nDo NOT touch the TODO in context-assembler.ts:1247 — wait for Phase D.',
		);
		const merged = mergeCardIntoMarkdown(card, existing);
		expect(merged.body).toContain('## Operator notes');
		expect(merged.body).toContain('wait for Phase D');
	});

	it('replaces auto-block content in place when card data changes', () => {
		const existing = renderFreshMarkdown(card);
		const newCard = makeCard({ auditStatus: 'PARTIAL', summary: 'something different' });
		const merged = mergeCardIntoMarkdown(newCard, existing);
		expect(merged.replacedBlocks).toContain('summary');
		expect(merged.replacedBlocks).toContain('status');
		expect(merged.body).toContain('PARTIAL');
		expect(merged.body).toContain('something different');
		expect(merged.body).not.toContain('ACE context assembler — fuses RAG');
	});

	it('appends missing auto-blocks at the end of legacy files', () => {
		// Legacy file with only @auto:summary, missing the rest
		const legacy = '<!-- @auto:summary start -->\nold summary\n<!-- @auto:summary end -->\n\n## Some operator note';
		const merged = mergeCardIntoMarkdown(card, legacy);
		expect(merged.replacedBlocks).toEqual(['summary']);
		expect(merged.appendedBlocks).toEqual(['imports', 'features', 'topology', 'status', 'gates', 'activity']);
		expect(merged.body).toContain('## Some operator note');
	});

	it('wraps content as auto-blocks when no markers exist (legacy → regen)', () => {
		const legacy = '# Old AGENTS.md\n\nManually-written by operator before regen existed.';
		const merged = mergeCardIntoMarkdown(card, legacy);
		expect(merged.body).toContain('<!-- @auto:summary start -->');
		expect(merged.body).toContain('Old AGENTS.md');
		expect(merged.body).toContain('operator-authored content below');
		expect(merged.appendedBlocks.length).toBe(AUTO_BLOCK_IDS.length);
	});

	it('returns changed=false when the existing file already matches', () => {
		const existing = renderFreshMarkdown(card);
		// Render again — same card → spans replaced with identical content
		const merged = mergeCardIntoMarkdown(card, existing);
		expect(merged.changed).toBe(false);
	});

	it('leaves unknown @auto:* blocks alone for forward compatibility', () => {
		const existing =
			renderFreshMarkdown(card).replace(
				/<!-- @auto:gates end -->/,
				'<!-- @auto:gates end -->\n\n<!-- @auto:future_field start -->\nblock from next version\n<!-- @auto:future_field end -->',
			);
		const merged = mergeCardIntoMarkdown(card, existing);
		expect(merged.body).toContain('@auto:future_field start');
		expect(merged.body).toContain('block from next version');
	});
});

// ── writeCardMarkdown (env-gate) ─────────────────────────────────────────────

describe('writeCardMarkdown', () => {
	it('returns skipped=disabled when enabled is false', async () => {
		const writeFn = vi.fn();
		const r = await writeCardMarkdown(makeCard(), { enabled: false, writeFileFn: writeFn });
		expect(r.wrote).toBe(false);
		expect(r.skipped).toBe('disabled');
		expect(writeFn).not.toHaveBeenCalled();
	});

	it('returns skipped=test-env-blocked under VITEST even when enabled=true', async () => {
		const writeFn = vi.fn();
		const r = await writeCardMarkdown(makeCard(), { enabled: true, writeFileFn: writeFn });
		expect(r.wrote).toBe(false);
		expect(r.skipped).toBe('test-env-blocked');
		expect(writeFn).not.toHaveBeenCalled();
	});

	it('writes a fresh file via injected fs adapters when allowLiveWritesInTests=true', async () => {
		const readFn  = vi.fn(async () => null);
		const writeFn = vi.fn(async () => undefined);
		const r = await writeCardMarkdown(makeCard(), {
			enabled: true,
			allowLiveWritesInTests: true,
			readFileFn: readFn,
			writeFileFn: writeFn,
		});
		expect(r.wrote).toBe(true);
		expect(r.appendedBlocks.length).toBe(AUTO_BLOCK_IDS.length);
		expect(writeFn).toHaveBeenCalledOnce();
		const [absPath, body] = writeFn.mock.calls[0] as [string, string];
		// platform-agnostic: normalise back-slashes so the assertion works on Windows + posix
		expect(absPath.replace(/\\/g, '/')).toContain('src/lib/server/ace');
		expect(absPath.endsWith('AGENTS.md')).toBe(true);
		expect(body).toContain('<!-- @auto:summary start -->');
	});

	it('skips write when merged body equals existing (idempotent)', async () => {
		const card = makeCard();
		const existing = renderFreshMarkdown(card);
		const readFn  = vi.fn(async () => existing);
		const writeFn = vi.fn(async () => undefined);
		const r = await writeCardMarkdown(card, {
			enabled: true,
			allowLiveWritesInTests: true,
			readFileFn: readFn,
			writeFileFn: writeFn,
		});
		expect(r.wrote).toBe(false);
		expect(r.skipped).toBe('unchanged');
		expect(writeFn).not.toHaveBeenCalled();
	});

	it('captures fs errors as result.error instead of throwing', async () => {
		const r = await writeCardMarkdown(makeCard(), {
			enabled: true,
			allowLiveWritesInTests: true,
			readFileFn: async () => null,
			writeFileFn: async () => { throw new Error('EACCES'); },
		});
		expect(r.wrote).toBe(false);
		expect(r.error).toBe('EACCES');
	});
});
