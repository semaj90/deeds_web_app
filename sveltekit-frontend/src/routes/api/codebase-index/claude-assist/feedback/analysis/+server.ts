/**
 * GET /api/codebase-index/claude-assist/feedback/analysis
 *
 * Correlates claude_assist.feedback with claude_assist.completed events
 * to produce actionable breakdowns for retrieval tuning.
 *
 * Returns:
 * - overallStats:    total, useful, notUseful, usefulPct
 * - overlapRate:     editedFiles ∩ topPaths (the key metric)
 * - byDomain:        usefulness breakdown by research domain
 * - byCacheHit:      hit vs miss usefulness
 * - byGraphBucket:   graph neighbor count bucketed (0, 1-3, 4-10, 10+)
 * - byCompactMode:   compact vs debug runs
 * - latencyBuckets:  fast (<2s), medium (2-10s), slow (>10s)
 * - recentCorrelated: last N correlated feedback+completed pairs
 */
import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { db } from '$lib/server/db/client';
import { contextTimeline } from '$lib/server/db/schema-postgres.js';

/** Degraded shape — returned on any error */
const DEGRADED = {
	overallStats:     { total: 0, useful: 0, notUseful: 0, usefulPct: 0 },
	overlapRate:      { mean: 0, samples: 0, withEdits: 0 },
	byDomain:         [] as { domain: string; total: number; useful: number; pct: number }[],
	byCacheHit:       { hit: { total: 0, useful: 0, pct: 0 }, miss: { total: 0, useful: 0, pct: 0 } },
	byGraphBucket:    [] as { bucket: string; total: number; useful: number; pct: number }[],
	byCompactMode:    { compact: { total: 0, useful: 0, pct: 0 }, debug: { total: 0, useful: 0, pct: 0 } },
	latencyBuckets:   [] as { bucket: string; total: number; useful: number; pct: number }[],
	recentCorrelated: [] as any[],
	recommendations:  [] as { icon: string; text: string; confidence: 'low' | 'medium' | 'high' }[],
	suggestedDefaults: null as { maxGraphNeighbors?: number; maxAceChunks?: number; compact?: boolean; cacheTtlHint?: string } | null,
	defaultsImpact: null as {
		appliedAt: string | null;
		before: { total: number; usefulPct: number; overlapMean: number };
		after:  { total: number; usefulPct: number; overlapMean: number };
		delta:  { usefulPct: number; overlapMean: number };
		current: Record<string, unknown> | null;
		previous: Record<string, unknown> | null;
		domainImpact: { domain: string; before: { total: number; usefulPct: number; overlapMean: number }; after: { total: number; usefulPct: number; overlapMean: number }; delta: { usefulPct: number; overlapMean: number } }[];
	} | null,
};

type Payload = Record<string, any>;

/** Compute overlap between editedFiles and topPaths (0..1) */
function overlapScore(editedFiles: string[], topPaths: string[]): number {
	if (!editedFiles.length || !topPaths.length) return 0;
	// Normalize paths: strip leading src/ and compare basenames for fuzzy match
	const normalize = (p: string) => p.replace(/^src\//, '').toLowerCase();
	const topSet = new Set(topPaths.map(normalize));
	const hits = editedFiles.filter(f => topSet.has(normalize(f))).length;
	return hits / editedFiles.length;
}

/** Bucket a graph neighbor count */
function graphBucket(n: number): string {
	if (n === 0) return '0';
	if (n <= 3) return '1-3';
	if (n <= 10) return '4-10';
	return '10+';
}

/** Bucket latency in ms */
function latencyBucket(ms: number): string {
	if (ms < 2000) return 'fast (<2s)';
	if (ms < 10000) return 'medium (2-10s)';
	return 'slow (>10s)';
}

/** Pct helper — avoids divide-by-zero */
function pct(useful: number, total: number): number {
	return total > 0 ? Math.round((useful / total) * 100) : 0;
}

export const GET: RequestHandler = async ({ locals, url }) => {
	if (!locals.user?.id) return json({ error: 'Unauthorized' }, { status: 401 });

	const limit = Math.min(Number(url.searchParams.get('limit')) || 200, 500);
	const windowParam = url.searchParams.get('window') ?? 'all';

	try {
		const { desc, eq, or } = await import('drizzle-orm');

		// Fetch feedback, completed, and tuned_defaults events
		const rows = await db
			.select()
			.from(contextTimeline)
			.where(
				or(
					eq(contextTimeline.eventType, 'claude_assist.feedback'),
					eq(contextTimeline.eventType, 'claude_assist.completed'),
					eq(contextTimeline.eventType, 'assist.tuned_defaults'),
				)!,
			)
			.orderBy(desc(contextTimeline.createdAt))
			.limit(limit);

		// Index completed events by queryHash for O(1) lookup
		const completedByHash = new Map<string, Payload>();
		const feedbackRows: { payload: Payload; createdAt: Date | null }[] = [];
		// Track the two most recent tuned_defaults timestamps
		const defaultsHistory: { payload: Payload; createdAt: Date | null }[] = [];

		for (const row of rows) {
			const p = row.payload as Payload;
			if (row.eventType === 'claude_assist.completed' && p?.queryHash) {
				if (!completedByHash.has(p.queryHash)) {
					completedByHash.set(p.queryHash, p);
				}
			} else if (row.eventType === 'claude_assist.feedback') {
				feedbackRows.push({ payload: p, createdAt: row.createdAt });
			} else if (row.eventType === 'assist.tuned_defaults' && defaultsHistory.length < 2) {
				defaultsHistory.push({ payload: p, createdAt: row.createdAt });
			}
		}

		// ── Window filtering ─────────────────────────────────────────────
		let filteredFeedback = feedbackRows;
		if (windowParam === '7d') {
			const cutoff = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
			filteredFeedback = feedbackRows.filter(r => r.createdAt && r.createdAt >= cutoff);
		} else if (windowParam === '25') {
			filteredFeedback = feedbackRows.slice(0, 25);
		} else if (windowParam === '50') {
			filteredFeedback = feedbackRows.slice(0, 50);
		}
		// else 'all' — use full set

		// ── Overall stats ────────────────────────────────────────────────
		const total = filteredFeedback.length;
		const usefulCount = filteredFeedback.filter(r => r.payload?.useful === true).length;
		const notUsefulCount = total - usefulCount;

		// ── Overlap rate ─────────────────────────────────────────────────
		let overlapSum = 0;
		let overlapSamples = 0;
		let withEdits = 0;

		// ── Domain breakdown ─────────────────────────────────────────────
		const domainMap = new Map<string, { total: number; useful: number }>();

		// ── Cache hit/miss ───────────────────────────────────────────────
		const cacheStats = { hit: { total: 0, useful: 0 }, miss: { total: 0, useful: 0 } };

		// ── Graph bucket ─────────────────────────────────────────────────
		const graphMap = new Map<string, { total: number; useful: number }>();

		// ── Compact mode ─────────────────────────────────────────────────
		const compactStats = { compact: { total: 0, useful: 0 }, debug: { total: 0, useful: 0 } };

		// ── Latency buckets ──────────────────────────────────────────────
		const latencyMap = new Map<string, { total: number; useful: number }>();

		// ── Correlate ────────────────────────────────────────────────────
		const correlated: any[] = [];

		for (const fb of filteredFeedback) {
			const qh = fb.payload?.queryHash as string | undefined;
			const useful = fb.payload?.useful === true;
			const editedFiles = (fb.payload?.editedFiles as string[]) ?? [];
			const completed = qh ? completedByHash.get(qh) : undefined;

			// Overlap
			if (editedFiles.length > 0 && completed?.topPaths) {
				const score = overlapScore(editedFiles, completed.topPaths as string[]);
				overlapSum += score;
				overlapSamples++;
				withEdits++;
			}

			// Domain breakdown
			if (completed?.researchDomains) {
				for (const d of completed.researchDomains as string[]) {
					const entry = domainMap.get(d) ?? { total: 0, useful: 0 };
					entry.total++;
					if (useful) entry.useful++;
					domainMap.set(d, entry);
				}
			}

			// Cache hit/miss
			if (completed) {
				const bucket = completed.cacheHit ? 'hit' : 'miss';
				cacheStats[bucket].total++;
				if (useful) cacheStats[bucket].useful++;
			}

			// Graph neighbor bucket
			if (completed && typeof completed.graphNeighborCount === 'number') {
				const b = graphBucket(completed.graphNeighborCount);
				const entry = graphMap.get(b) ?? { total: 0, useful: 0 };
				entry.total++;
				if (useful) entry.useful++;
				graphMap.set(b, entry);
			}

			// Compact mode
			if (completed) {
				const bucket = completed.compact ? 'compact' : 'debug';
				compactStats[bucket].total++;
				if (useful) compactStats[bucket].useful++;
			}

			// Latency bucket
			if (completed && typeof completed.totalMs === 'number') {
				const b = latencyBucket(completed.totalMs);
				const entry = latencyMap.get(b) ?? { total: 0, useful: 0 };
				entry.total++;
				if (useful) entry.useful++;
				latencyMap.set(b, entry);
			}

			// Recent correlated (for table display)
			if (correlated.length < 10) {
				correlated.push({
					queryHash: qh,
					useful,
					comment: fb.payload?.comment ?? null,
					editedFiles,
					topPaths: completed?.topPaths ?? [],
					domains: completed?.researchDomains ?? [],
					cacheHit: completed?.cacheHit ?? null,
					graphNeighbors: completed?.graphNeighborCount ?? null,
					totalMs: completed?.totalMs ?? null,
					createdAt: fb.createdAt,
				});
			}
		}

		// ── Build sorted breakdowns ──────────────────────────────────────
		const mapToSorted = (m: Map<string, { total: number; useful: number }>) =>
			[...m.entries()]
				.map(([key, v]) => ({ domain: key, ...v, pct: pct(v.useful, v.total) }))
				.sort((a, b) => b.total - a.total);

		const graphBucketOrder = ['0', '1-3', '4-10', '10+'];

		// ── Auto-suggested recommendations ───────────────────────────────
		const MIN_SAMPLES = 5; // need at least this many for a recommendation
		const recs: { icon: string; text: string; confidence: 'low' | 'medium' | 'high' }[] = [];
		const conf = (n: number): 'low' | 'medium' | 'high' =>
			n >= 20 ? 'high' : n >= 10 ? 'medium' : 'low';

		// Graph neighbors underused?
		const gBuckets = graphBucketOrder
			.filter(b => graphMap.has(b))
			.map(b => ({ bucket: b, ...graphMap.get(b)! }));
		const gHigh = gBuckets.find(g => g.bucket === '4-10' || g.bucket === '10+');
		const gZero = gBuckets.find(g => g.bucket === '0');
		if (gHigh && gZero && gHigh.total >= MIN_SAMPLES && gZero.total >= MIN_SAMPLES) {
			const highPct = pct(gHigh.useful, gHigh.total);
			const zeroPct = pct(gZero.useful, gZero.total);
			if (highPct > zeroPct + 10) {
				recs.push({ icon: 'git-branch', text: `Graph neighbors improve usefulness (${highPct}% vs ${zeroPct}% without). Consider raising maxGraphNeighbors.`, confidence: conf(gHigh.total + gZero.total) });
			} else if (zeroPct >= highPct) {
				recs.push({ icon: 'git-branch', text: `Graph neighbors don't improve usefulness (${zeroPct}% without vs ${highPct}% with). Current setting is fine.`, confidence: conf(gHigh.total + gZero.total) });
			}
		}

		// Cache hit vs miss parity
		if (cacheStats.hit.total >= MIN_SAMPLES && cacheStats.miss.total >= MIN_SAMPLES) {
			const hitPct = pct(cacheStats.hit.useful, cacheStats.hit.total);
			const missPct = pct(cacheStats.miss.useful, cacheStats.miss.total);
			if (Math.abs(hitPct - missPct) <= 10) {
				recs.push({ icon: 'database', text: `Cached runs perform similarly to fresh (${hitPct}% vs ${missPct}%). Cache is safe.`, confidence: conf(cacheStats.hit.total + cacheStats.miss.total) });
			} else if (missPct > hitPct + 15) {
				recs.push({ icon: 'database', text: `Fresh runs are more useful than cached (${missPct}% vs ${hitPct}%). Consider shorter cache TTL.`, confidence: conf(cacheStats.hit.total + cacheStats.miss.total) });
			}
		}

		// Compact mode check
		if (compactStats.compact.total >= MIN_SAMPLES) {
			const compPct = pct(compactStats.compact.useful, compactStats.compact.total);
			const dbgPct = compactStats.debug.total >= MIN_SAMPLES
				? pct(compactStats.debug.useful, compactStats.debug.total)
				: null;
			if (dbgPct !== null && compPct >= dbgPct - 5) {
				recs.push({ icon: 'minimize-2', text: `Compact mode has no usefulness drop (${compPct}% vs debug ${dbgPct}%). Keep compact as default.`, confidence: conf(compactStats.compact.total + compactStats.debug.total) });
			} else if (dbgPct !== null && dbgPct > compPct + 15) {
				recs.push({ icon: 'maximize-2', text: `Debug mode is notably more useful (${dbgPct}% vs compact ${compPct}%). Consider raising budgets.`, confidence: conf(compactStats.compact.total + compactStats.debug.total) });
			}
		}

		// Top domain by useful rate
		const sortedDomains = mapToSorted(domainMap);
		const topDomain = sortedDomains.find(d => d.total >= MIN_SAMPLES);
		if (topDomain && topDomain.pct > 0) {
			recs.push({ icon: 'target', text: `Domain "${topDomain.domain}" has highest useful rate: ${topDomain.pct}% (${topDomain.total} samples).`, confidence: conf(topDomain.total) });
		}

		// Overlap rate guidance
		if (overlapSamples >= MIN_SAMPLES) {
			const meanOverlap = Math.round((overlapSum / overlapSamples) * 100);
			if (meanOverlap < 30) {
				recs.push({ icon: 'alert-triangle', text: `Overlap rate is low (${meanOverlap}%). Retrieved files rarely match edits. Consider increasing maxAceChunks.`, confidence: conf(overlapSamples) });
			} else if (meanOverlap >= 60) {
				recs.push({ icon: 'check-circle', text: `Overlap rate is strong (${meanOverlap}%). Retrieval is well-aligned with actual edits.`, confidence: conf(overlapSamples) });
			}
		}

		// Low sample warning
		if (total > 0 && total < 10) {
			recs.push({ icon: 'info', text: `Only ${total} feedback samples. Collect at least 20-30 before tuning defaults.`, confidence: 'low' });
		}

		// Thin-bucket warnings — flag specific breakdowns with unreliable sample sizes
		const THIN_THRESHOLD = 3;
		const thinDomains = sortedDomains.filter(d => d.total > 0 && d.total < THIN_THRESHOLD);
		if (thinDomains.length > 0) {
			const names = thinDomains.map(d => `"${d.domain}" (${d.total})`).join(', ');
			recs.push({ icon: 'alert-circle', text: `Thin data for domains: ${names}. Per-domain stats may be noisy.`, confidence: 'low' });
		}
		const thinGraphBuckets = gBuckets.filter(g => g.total > 0 && g.total < THIN_THRESHOLD);
		if (thinGraphBuckets.length > 0) {
			const names = thinGraphBuckets.map(g => `${g.bucket} (${g.total})`).join(', ');
			recs.push({ icon: 'alert-circle', text: `Thin data for graph buckets: ${names}. Graph neighbor recommendations may be unreliable.`, confidence: 'low' });
		}
		if ((cacheStats.hit.total > 0 && cacheStats.hit.total < THIN_THRESHOLD) || (cacheStats.miss.total > 0 && cacheStats.miss.total < THIN_THRESHOLD)) {
			recs.push({ icon: 'alert-circle', text: `Cache hit/miss split has thin data (hit: ${cacheStats.hit.total}, miss: ${cacheStats.miss.total}). Cache recommendations may be unreliable.`, confidence: 'low' });
		}

		// ── Suggested concrete defaults ──────────────────────────────────
		// Only compute when we have enough signal (≥10 total samples)
		let suggestedDefaults: { maxGraphNeighbors?: number; maxAceChunks?: number; compact?: boolean; cacheTtlHint?: string } | null = null;
		if (total >= 10) {
			suggestedDefaults = {};

			// Graph neighbors: if 4-10 bucket outperforms 0, suggest 8; else keep 10 (current default)
			if (gHigh && gZero && gHigh.total >= MIN_SAMPLES && gZero.total >= MIN_SAMPLES) {
				const highPct = pct(gHigh.useful, gHigh.total);
				const zeroPct = pct(gZero.useful, gZero.total);
				if (highPct > zeroPct + 10) {
					suggestedDefaults.maxGraphNeighbors = 14; // raise from 10
				} else if (zeroPct > highPct + 10) {
					suggestedDefaults.maxGraphNeighbors = 4; // lower if graph hurts
				}
				// else: no change suggested
			}

			// ACE chunks: if overlap is low, suggest raising; if already good, keep
			if (overlapSamples >= MIN_SAMPLES) {
				const meanOvl = Math.round((overlapSum / overlapSamples) * 100);
				if (meanOvl < 30) {
					suggestedDefaults.maxAceChunks = 10; // raise from 6
				} else if (meanOvl >= 60) {
					// retrieval is good, maybe can trim slightly for speed
					suggestedDefaults.maxAceChunks = 5;
				}
			}

			// Compact mode: if debug notably outperforms compact, suggest debug default
			if (compactStats.compact.total >= MIN_SAMPLES && compactStats.debug.total >= MIN_SAMPLES) {
				const compPctVal = pct(compactStats.compact.useful, compactStats.compact.total);
				const dbgPctVal = pct(compactStats.debug.useful, compactStats.debug.total);
				if (dbgPctVal > compPctVal + 15) {
					suggestedDefaults.compact = false; // switch to debug
				} else {
					suggestedDefaults.compact = true; // keep compact
				}
			}

			// Cache TTL: if fresh outperforms cached, suggest shorter TTL
			if (cacheStats.hit.total >= MIN_SAMPLES && cacheStats.miss.total >= MIN_SAMPLES) {
				const hitPctVal = pct(cacheStats.hit.useful, cacheStats.hit.total);
				const missPctVal = pct(cacheStats.miss.useful, cacheStats.miss.total);
				if (missPctVal > hitPctVal + 15) {
					suggestedDefaults.cacheTtlHint = 'shorter';
				} else if (Math.abs(hitPctVal - missPctVal) <= 10) {
					suggestedDefaults.cacheTtlHint = 'keep';
				}
			}

			// If no concrete suggestions emerged, null it out
			if (Object.keys(suggestedDefaults).length === 0) {
				suggestedDefaults = null;
			}
		}

		// ── Defaults impact: before/after comparison ─────────────────────
		let defaultsImpact: typeof DEGRADED.defaultsImpact = null;
		if (defaultsHistory.length > 0 && defaultsHistory[0].createdAt) {
			const applyTime = defaultsHistory[0].createdAt;
			const before = { total: 0, useful: 0, overlapSum: 0, overlapN: 0 };
			const after  = { total: 0, useful: 0, overlapSum: 0, overlapN: 0 };

			// Per-domain accumulators
			const domainBefore = new Map<string, { total: number; useful: number; overlapSum: number; overlapN: number }>();
			const domainAfter  = new Map<string, { total: number; useful: number; overlapSum: number; overlapN: number }>();

			for (const fb of filteredFeedback) {
				const useful = fb.payload?.useful === true;
				const editedFiles = (fb.payload?.editedFiles as string[]) ?? [];
				const qh = fb.payload?.queryHash as string | undefined;
				const completed = qh ? completedByHash.get(qh) : undefined;
				const isAfter = fb.createdAt && fb.createdAt >= applyTime;
				const bucket = isAfter ? after : before;
				const domainMap2 = isAfter ? domainAfter : domainBefore;

				bucket.total++;
				if (useful) bucket.useful++;

				let fbOverlap: number | null = null;
				if (editedFiles.length > 0 && completed?.topPaths) {
					const score = overlapScore(editedFiles, completed.topPaths as string[]);
					bucket.overlapSum += score;
					bucket.overlapN++;
					fbOverlap = score;
				}

				// Accumulate per-domain
				if (completed?.researchDomains) {
					for (const d of completed.researchDomains as string[]) {
						const entry = domainMap2.get(d) ?? { total: 0, useful: 0, overlapSum: 0, overlapN: 0 };
						entry.total++;
						if (useful) entry.useful++;
						if (fbOverlap !== null) { entry.overlapSum += fbOverlap; entry.overlapN++; }
						domainMap2.set(d, entry);
					}
				}
			}

			const bUseful = pct(before.useful, before.total);
			const aUseful = pct(after.useful, after.total);
			const bOverlap = before.overlapN > 0 ? Math.round((before.overlapSum / before.overlapN) * 100) : 0;
			const aOverlap = after.overlapN > 0 ? Math.round((after.overlapSum / after.overlapN) * 100) : 0;

			// Build per-domain impact
			const allDomains = new Set([...domainBefore.keys(), ...domainAfter.keys()]);
			const domainImpact: { domain: string; before: { total: number; usefulPct: number; overlapMean: number }; after: { total: number; usefulPct: number; overlapMean: number }; delta: { usefulPct: number; overlapMean: number } }[] = [];
			for (const domain of allDomains) {
				const b = domainBefore.get(domain) ?? { total: 0, useful: 0, overlapSum: 0, overlapN: 0 };
				const a = domainAfter.get(domain) ?? { total: 0, useful: 0, overlapSum: 0, overlapN: 0 };
				if (b.total + a.total < 2) continue; // skip noise
				const bU = pct(b.useful, b.total);
				const aU = pct(a.useful, a.total);
				const bO = b.overlapN > 0 ? Math.round((b.overlapSum / b.overlapN) * 100) : 0;
				const aO = a.overlapN > 0 ? Math.round((a.overlapSum / a.overlapN) * 100) : 0;
				domainImpact.push({
					domain,
					before: { total: b.total, usefulPct: bU, overlapMean: bO },
					after:  { total: a.total, usefulPct: aU, overlapMean: aO },
					delta:  { usefulPct: aU - bU, overlapMean: aO - bO },
				});
			}
			domainImpact.sort((x, y) => (y.before.total + y.after.total) - (x.before.total + x.after.total));

			defaultsImpact = {
				appliedAt: applyTime.toISOString(),
				before:   { total: before.total, usefulPct: bUseful, overlapMean: bOverlap },
				after:    { total: after.total,  usefulPct: aUseful, overlapMean: aOverlap },
				delta:    { usefulPct: aUseful - bUseful, overlapMean: aOverlap - bOverlap },
				current:  defaultsHistory[0].payload,
				previous: defaultsHistory[1]?.payload ?? null,
				domainImpact,
			};
		}

		return json({
			overallStats: {
				total,
				useful: usefulCount,
				notUseful: notUsefulCount,
				usefulPct: pct(usefulCount, total),
			},
			overlapRate: {
				mean: overlapSamples > 0 ? Math.round((overlapSum / overlapSamples) * 100) : 0,
				samples: overlapSamples,
				withEdits,
			},
			byDomain: mapToSorted(domainMap),
			byCacheHit: {
				hit:  { ...cacheStats.hit,  pct: pct(cacheStats.hit.useful,  cacheStats.hit.total) },
				miss: { ...cacheStats.miss, pct: pct(cacheStats.miss.useful, cacheStats.miss.total) },
			},
			byGraphBucket: graphBucketOrder
				.filter(b => graphMap.has(b))
				.map(b => {
					const v = graphMap.get(b)!;
					return { bucket: b, ...v, pct: pct(v.useful, v.total) };
				}),
			byCompactMode: {
				compact: { ...compactStats.compact, pct: pct(compactStats.compact.useful, compactStats.compact.total) },
				debug:   { ...compactStats.debug,   pct: pct(compactStats.debug.useful,   compactStats.debug.total) },
			},
			latencyBuckets: [...latencyMap.entries()]
				.map(([bucket, v]) => ({ bucket, ...v, pct: pct(v.useful, v.total) }))
				.sort((a, b) => b.total - a.total),
			recentCorrelated: correlated,
			recommendations: recs,
			suggestedDefaults,
			defaultsImpact,
		});
	} catch {
		return json(DEGRADED);
	}
};
