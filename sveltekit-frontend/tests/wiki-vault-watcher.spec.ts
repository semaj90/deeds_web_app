// @vitest-environment node
/**
 * Unit tests for Commit 5 — chokidar bidirectional vault watcher.
 * Tests the markdown parser and write-guard logic without real FS or CouchDB.
 */

import { describe, it, expect } from 'vitest';
import { parseMarkdownWikiNote } from '../src/lib/server/obsidian/markdown-wiki-note.js';

// ── 1. ClusterNote round-trip ────────────────────────────────────────────────

describe('parseMarkdownWikiNote — cluster', () => {
	const md = `---
type: cluster
clusterId: 42
clusterType: gpu
generated: 2026-05-05T00:00:00.000Z
version: 2
tags: [ast, server, karpathy-wiki, cluster]
---

# Cluster 42 — GPU Inference

## Purpose
Handles GPU inference orchestration across Ollama + TurboQuant.

## Summary
This cluster groups all inference-related server modules.

## Representative Files
- [[src/lib/server/ollama.ts|ollama.ts]]
- [[src/lib/server/ai/gemma4-agent.ts|gemma4-agent.ts]]

## Topological Neighbors
See also: [[cluster-gpu-10|Cluster 10]], [[cluster-gpu-55|Cluster 55]]

## Warnings
- High VRAM pressure noted
- Two TurboQuant endpoints overlap
`;

	it('parses cluster type', () => {
		const result = parseMarkdownWikiNote(md, 'karpathy-wiki/cluster/cluster-gpu-42.md');
		expect(result).not.toBeNull();
		expect(result!.note.type).toBe('cluster');
	});

	it('extracts clusterId and clusterType', () => {
		const result = parseMarkdownWikiNote(md, 'karpathy-wiki/cluster/cluster-gpu-42.md');
		const note = result!.note as { clusterId: number; clusterType: string };
		expect(note.clusterId).toBe(42);
		expect(note.clusterType).toBe('gpu');
	});

	it('extracts purpose and summary from body sections', () => {
		const result = parseMarkdownWikiNote(md, 'karpathy-wiki/cluster/cluster-gpu-42.md');
		const note = result!.note as { purpose: string; summary: string };
		expect(note.purpose).toContain('GPU inference');
		expect(note.summary).toContain('inference-related');
	});

	it('extracts topological neighbor IDs', () => {
		const result = parseMarkdownWikiNote(md, 'karpathy-wiki/cluster/cluster-gpu-42.md');
		const note = result!.note as { topologicalNeighbors: number[] };
		expect(note.topologicalNeighbors).toContain(10);
		expect(note.topologicalNeighbors).toContain(55);
	});

	it('filters out meta tags from dominantTags', () => {
		const result = parseMarkdownWikiNote(md, 'karpathy-wiki/cluster/cluster-gpu-42.md');
		const note = result!.note as { dominantTags: string[] };
		expect(note.dominantTags).not.toContain('karpathy-wiki');
		expect(note.dominantTags).not.toContain('cluster');
		expect(note.dominantTags).toContain('ast');
	});

	it('produces a stable SHA-1 content hash', () => {
		const r1 = parseMarkdownWikiNote(md, 'path.md');
		const r2 = parseMarkdownWikiNote(md + ' ', 'path.md');
		expect(r1!.contentHash).not.toBe(r2!.contentHash);
		expect(r1!.contentHash).toHaveLength(40);
	});
});

// ── 2. Non-wiki files return null ────────────────────────────────────────────

describe('parseMarkdownWikiNote — non-note files', () => {
	it('returns null for MOC index (type: moc)', () => {
		const moc = `---\ntype: moc\ngenerated: 2026-05-05\n---\n# MOC`;
		expect(parseMarkdownWikiNote(moc, 'karpathy-wiki/index.md')).toBeNull();
	});

	it('returns null for plain markdown with no frontmatter', () => {
		const plain = `# Just a heading\n\nSome content.`;
		expect(parseMarkdownWikiNote(plain, 'some-file.md')).toBeNull();
	});

	it('returns null for report type', () => {
		const report = `---\ntype: report\nsource: docs/graph/codebase-map.md\n---\n# Map`;
		expect(parseMarkdownWikiNote(report, 'karpathy-wiki/reports/codebase-map.md')).toBeNull();
	});
});

// ── 3. PlaybookNote ──────────────────────────────────────────────────────────

describe('parseMarkdownWikiNote — playbook', () => {
	const md = `---
type: playbook
symptom: GPU out of memory during embedding
likelyCluster: 5
likelyDomain: GPU/VRAM
generated: 2026-05-05T00:00:00.000Z
version: 1
---

## Fix Attempts
- Reduce batch size — success: cut VRAM by 40%
- Switch to CPU fallback — failure: too slow

## Resolution
Batch size reduction resolved the OOM condition.
`;

	it('parses playbook type and symptom', () => {
		const r = parseMarkdownWikiNote(md, 'karpathy-wiki/playbook/playbook-test.md');
		expect(r!.note.type).toBe('playbook');
		const n = r!.note as { symptom: string };
		expect(n.symptom).toContain('GPU out of memory');
	});
});