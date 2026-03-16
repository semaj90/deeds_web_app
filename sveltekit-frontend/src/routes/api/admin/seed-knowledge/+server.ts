/**
 * POST /api/admin/seed-knowledge
 *   Seed legal_glossary, statutes, statute_chunks, legal_precedents
 *   Optional ?embed=true to generate 768-dim embeddings via Ollama embeddinggemma
 *
 * GET /api/admin/seed-knowledge?action=index-pdfs
 *   Index lawpdfs/ directory through the evidence upload pipeline
 */
import { json, type RequestHandler } from '@sveltejs/kit';
import db from '$lib/server/db';
import { legalGlossary, statutes, statuteChunks, legalPrecedents } from '$lib/server/db/schema-postgres.js';
import { eq, and } from 'drizzle-orm';
import { ENV } from '$lib/server/env.server.js';
import { glossaryTerms, statuteData, precedentData } from '$lib/server/data/legal-seed-data.js';
import { readdir, readFile } from 'fs/promises';
import { join } from 'path';
import { ollamaFetch } from '$lib/server/ollama.js';

const OLLAMA_URL = ENV.OLLAMA_BASE_URL;
const EMBEDDING_MODEL = 'embeddinggemma:latest';

async function embedText(text: string): Promise<number[] | null> {
	try {
		const res = await ollamaFetch(`${OLLAMA_URL}/api/embeddings`, {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({ model: EMBEDDING_MODEL, prompt: text }),
			signal: AbortSignal.timeout(15000),
		});
		if (!res.ok) return null;
		const data = await res.json();
		return Array.isArray(data.embedding) ? data.embedding : null;
	} catch {
		return null;
	}
}

function chunkContent(content: string, maxLen = 300): string[] {
	const paragraphs = content.split(/\n\n|\.\s+/).filter((p) => p.trim().length > 20);
	if (paragraphs.length === 0) return [content];
	const chunks: string[] = [];
	let current = '';
	for (const para of paragraphs) {
		if (current.length + para.length > maxLen && current.length > 0) {
			chunks.push(current.trim());
			current = para;
		} else {
			current += (current ? '. ' : '') + para;
		}
	}
	if (current.trim()) chunks.push(current.trim());
	return chunks.length > 0 ? chunks : [content];
}

export const POST: RequestHandler = async ({ url }) => {
	const withEmbeddings = url.searchParams.get('embed') === 'true';
	const start = performance.now();
	const results = { glossary: 0, statutes: 0, chunks: 0, precedents: 0, embeddings: 0, errors: [] as string[] };

	// ── 1. Insert glossary terms ──
	for (const entry of glossaryTerms) {
		try {
			const exists = await db.select({ id: legalGlossary.id })
				.from(legalGlossary)
				.where(eq(legalGlossary.term, entry.term))
				.limit(1);
			if (exists.length > 0) continue;

			await db.insert(legalGlossary).values({
				term: entry.term,
				definition: entry.definition,
				category: entry.category,
				jurisdiction: entry.jurisdiction,
				relatedTerms: entry.relatedTerms,
				sources: entry.sources,
			});
			results.glossary++;
		} catch (e) {
			results.errors.push(`glossary:${entry.term}: ${String(e).slice(0, 100)}`);
		}
	}

	// ── 2. Insert statutes + chunks ──
	for (const statute of statuteData) {
		try {
			const exists = await db.select({ id: statutes.id })
				.from(statutes)
				.where(and(
					eq(statutes.section, statute.section),
					eq(statutes.jurisdiction, statute.jurisdiction),
				))
				.limit(1);
			if (exists.length > 0) continue;

			const [inserted] = await db.insert(statutes).values({
				title: statute.title,
				content: statute.content,
				jurisdiction: statute.jurisdiction,
				section: statute.section,
				category: statute.category,
				sourceUrl: statute.sourceUrl,
			}).returning({ id: statutes.id });

			if (inserted) {
				results.statutes++;
				const chunks = chunkContent(statute.content);
				for (let i = 0; i < chunks.length; i++) {
					try {
						await db.insert(statuteChunks).values({
							statuteId: inserted.id,
							chunkIndex: i,
							content: chunks[i],
						});
						results.chunks++;
					} catch (e) {
						results.errors.push(`chunk:${statute.section}[${i}]: ${String(e).slice(0, 100)}`);
					}
				}
			}
		} catch (e) {
			results.errors.push(`statute:${statute.section}: ${String(e).slice(0, 100)}`);
		}
	}

	// ── 3. Insert precedents ──
	for (const prec of precedentData) {
		try {
			const exists = await db.select({ id: legalPrecedents.id })
				.from(legalPrecedents)
				.where(eq(legalPrecedents.title, prec.title))
				.limit(1);
			if (exists.length > 0) continue;

			await db.insert(legalPrecedents).values({
				title: prec.title,
				summary: prec.summary,
				citation: prec.citation,
				court: prec.court,
				decisionDate: prec.decisionDate ? new Date(prec.decisionDate) : undefined,
			});
			results.precedents++;
		} catch (e) {
			results.errors.push(`precedent:${prec.title}: ${String(e).slice(0, 100)}`);
		}
	}

	// ── 4. Optional embeddings ──
	if (withEmbeddings) {
		// Embed glossary
		try {
			const unembedded = await db.select({
				id: legalGlossary.id,
				term: legalGlossary.term,
				definition: legalGlossary.definition,
			}).from(legalGlossary).limit(200);

			for (const row of unembedded) {
				if (row.term && row.definition) {
					const embedding = await embedText(`${row.term}: ${row.definition}`);
					if (embedding) {
						await db.update(legalGlossary)
							.set({ embedding: Array.from(embedding) })
							.where(eq(legalGlossary.id, row.id));
						results.embeddings++;
					}
				}
			}
		} catch (e) {
			results.errors.push(`embed-glossary: ${String(e).slice(0, 100)}`);
		}

		// Embed statute chunks
		try {
			const unembedded = await db.select({
				id: statuteChunks.id,
				content: statuteChunks.content,
			}).from(statuteChunks).limit(500);

			for (const row of unembedded) {
				const embedding = await embedText(row.content);
				if (embedding) {
					await db.update(statuteChunks)
						.set({ embedding: Array.from(embedding) })
						.where(eq(statuteChunks.id, row.id));
					results.embeddings++;
				}
			}
		} catch (e) {
			results.errors.push(`embed-chunks: ${String(e).slice(0, 100)}`);
		}
	}

	const elapsed = Math.round(performance.now() - start);
	return json({
		success: true,
		inserted: results,
		withEmbeddings,
		timing_ms: elapsed,
	});
};

// ── GET: Index lawpdfs/ via evidence upload pipeline ──
export const GET: RequestHandler = async ({ url, fetch: svelteFetch }) => {
	const action = url.searchParams.get('action');
	if (action !== 'index-pdfs') {
		return json({ error: 'Use ?action=index-pdfs' }, { status: 400 });
	}

	const start = performance.now();
	const lawpdfsDir = join(process.cwd(), '..', 'lawpdfs');
	const results = { total: 0, success: 0, failed: 0, files: [] as string[], errors: [] as string[] };

	let files: string[];
	try {
		const entries = await readdir(lawpdfsDir);
		files = entries.filter((f) => f.toLowerCase().endsWith('.pdf'));
		results.total = files.length;
	} catch {
		// Try alternate path
		try {
			const altDir = join(process.cwd(), 'lawpdfs');
			const entries = await readdir(altDir);
			files = entries.filter((f) => f.toLowerCase().endsWith('.pdf'));
			results.total = files.length;
		} catch (e) {
			return json({ error: `Cannot read lawpdfs/: ${String(e)}`, tried: [lawpdfsDir] }, { status: 500 });
		}
	}

	// Also check for complaint.pdf at root
	const rootComplaint = join(process.cwd(), '..', 'complaint.pdf');
	try {
		await readFile(rootComplaint);
		files.push('__ROOT__/complaint.pdf');
		results.total++;
	} catch {
		// no complaint.pdf
	}

	for (const filename of files) {
		try {
			const isRoot = filename.startsWith('__ROOT__/');
			const filePath = isRoot
				? join(process.cwd(), '..', 'complaint.pdf')
				: join(lawpdfsDir, filename);

			const buffer = await readFile(filePath);
			const displayName = isRoot ? 'complaint.pdf' : filename;

			// Build FormData for the upload endpoint
			const formData = new FormData();
			formData.append('file', new Blob([buffer], { type: 'application/pdf' }), displayName);
			formData.append('title', displayName.replace('.pdf', ''));
			formData.append('evidenceType', 'document');
			formData.append('description', `Auto-indexed from lawpdfs/ directory`);

			const res = await svelteFetch('/api/evidence/upload', {
				method: 'POST',
				body: formData,
			});

			if (res.ok) {
				results.success++;
				results.files.push(displayName);
			} else {
				const errText = await res.text().catch(() => res.statusText);
				results.failed++;
				results.errors.push(`${displayName}: ${res.status} ${errText.slice(0, 100)}`);
			}
		} catch (e) {
			results.failed++;
			results.errors.push(`${filename}: ${String(e).slice(0, 100)}`);
		}
	}

	return json({
		success: true,
		indexed: results,
		timing_ms: Math.round(performance.now() - start),
	});
};
