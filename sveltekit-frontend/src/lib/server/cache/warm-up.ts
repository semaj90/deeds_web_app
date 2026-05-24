/**
 * Cache Warm-Up Script
 *
 * Pre-populates Redis L1 and Bifrost L2 caches with responses to common legal queries.
 * Run this on server startup or via cron job to ensure high cache hit rates.
 *
 * Usage:
 *   import { warmUpCache } from '$lib/server/cache/warm-up.js';
 *   await warmUpCache();
 *
 * Or via CLI:
 *   node scripts/cache-warmup.mjs
 */

import { bifrostChat } from '$lib/server/ollama.js';

/**
 * Common Legal Queries — 120 queries across 6 domains
 *
 * These queries are selected based on:
 * - High frequency in real user sessions
 * - Coverage of core legal concepts
 * - Diversity across practice areas
 * - Typical question patterns (definition, comparison, procedure, evidence analysis)
 */
const COMMON_QUERIES = [
	// ══════════════════════════════════════════════════════════════
	// Evidence Law (20 queries)
	// ══════════════════════════════════════════════════════════════
	'What is hearsay evidence?',
	'Define preponderance of evidence',
	'What is the best evidence rule?',
	'Explain the difference between direct and circumstantial evidence',
	'What are the exceptions to the hearsay rule?',
	'What is exculpatory evidence?',
	'Define chain of custody in evidence',
	'What is the fruit of the poisonous tree doctrine?',
	'Explain the exclusionary rule',
	'What is impeachment evidence?',
	'Define relevance in evidence law',
	'What is the attorney-client privilege?',
	'Explain work product doctrine',
	'What is spoliation of evidence?',
	'Define authentication of evidence',
	'What is demonstrative evidence?',
	'Explain the original writing rule',
	'What is the burden of proof in civil cases?',
	'Define reasonable doubt',
	'What is a chain of inference?',

	// ══════════════════════════════════════════════════════════════
	// Civil Procedure (20 queries)
	// ══════════════════════════════════════════════════════════════
	'What is a motion for summary judgment?',
	'Define subject matter jurisdiction',
	'What is personal jurisdiction?',
	'Explain the difference between a complaint and an answer',
	'What is a counterclaim?',
	'Define res judicata',
	'What is collateral estoppel?',
	'Explain the discovery process',
	'What is a deposition?',
	'Define interrogatories',
	'What is a motion to dismiss?',
	'Explain forum non conveniens',
	'What is venue in civil procedure?',
	'Define service of process',
	'What is a default judgment?',
	'Explain the statute of limitations',
	'What is a protective order?',
	'Define joinder of parties',
	'What is a class action lawsuit?',
	'Explain the doctrine of forum shopping',

	// ══════════════════════════════════════════════════════════════
	// Torts (20 queries)
	// ══════════════════════════════════════════════════════════════
	'What is negligence?',
	'Define duty of care',
	'What is proximate cause?',
	'Explain the difference between negligence and strict liability',
	'What is a tort?',
	'Define intentional infliction of emotional distress',
	'What is defamation?',
	'Explain the difference between libel and slander',
	'What is battery in tort law?',
	'Define assault',
	'What is false imprisonment?',
	'Explain trespass to land',
	'What is conversion?',
	'Define nuisance',
	'What is vicarious liability?',
	'Explain respondeat superior',
	'What is contributory negligence?',
	'Define comparative negligence',
	'What is the eggshell skull rule?',
	'Explain assumption of risk',

	// ══════════════════════════════════════════════════════════════
	// Contracts (20 queries)
	// ══════════════════════════════════════════════════════════════
	'What is a contract?',
	'Define consideration in contract law',
	'What is an offer?',
	'Explain acceptance of an offer',
	'What is the mailbox rule?',
	'Define breach of contract',
	'What is anticipatory repudiation?',
	'Explain specific performance',
	'What is the Statute of Frauds?',
	'Define parol evidence rule',
	'What is unconscionability?',
	'Explain the doctrine of mistake',
	'What is frustration of purpose?',
	'Define impossibility of performance',
	'What is liquidated damages?',
	'Explain mitigation of damages',
	'What is rescission?',
	'Define reformation of a contract',
	'What is a third-party beneficiary?',
	'Explain assignment of rights',

	// ══════════════════════════════════════════════════════════════
	// Criminal Law (20 queries)
	// ══════════════════════════════════════════════════════════════
	'What is mens rea?',
	'Define actus reus',
	'What is the difference between murder and manslaughter?',
	'Explain felony murder rule',
	'What is accomplice liability?',
	'Define conspiracy',
	'What is attempt in criminal law?',
	'Explain solicitation',
	'What is self-defense?',
	'Define duress as a defense',
	'What is entrapment?',
	'Explain the insanity defense',
	'What is diminished capacity?',
	'Define voluntary intoxication',
	'What is the Fifth Amendment privilege against self-incrimination?',
	'Explain Miranda rights',
	'What is probable cause?',
	'Define reasonable suspicion',
	'What is the Fourth Amendment?',
	'Explain the exclusionary rule in criminal procedure',

	// ══════════════════════════════════════════════════════════════
	// Evidence Analysis (20 queries)
	// ══════════════════════════════════════════════════════════════
	'Analyze this document for relevant evidence',
	'Summarize the key facts in this evidence',
	'What legal issues are raised by this evidence?',
	'Identify potential objections to this evidence',
	'What is the evidentiary value of this document?',
	'How should this evidence be authenticated?',
	'What chain of custody issues exist?',
	'Identify privileged information in this document',
	'What redactions are needed for this evidence?',
	'Analyze this evidence for hearsay exceptions',
	'What is the relevance of this evidence to the case?',
	'Identify metadata issues in this document',
	'What expert testimony would support this evidence?',
	'Analyze this evidence for spoliation issues',
	'What foundation is needed for this evidence?',
	'Identify credibility issues with this evidence',
	'How does this evidence support our legal theory?',
	'What opposing arguments could challenge this evidence?',
	'Analyze this document for admissibility under FRE',
	'What additional evidence would corroborate this?',
];

/**
 * Warm up cache with all common queries
 *
 * @param options.batchSize - Number of queries to process in parallel (default: 5)
 * @param options.delayMs - Delay between batches in milliseconds (default: 1000)
 * @param options.model - LLM model to use (default: gemma4-rotorquant:latest)
 * @param options.dryRun - If true, only log queries without calling LLM (default: false)
 */
export async function warmUpCache(options: {
	batchSize?: number;
	delayMs?: number;
	model?: string;
	dryRun?: boolean;
} = {}): Promise<WarmUpReport> {
	const {
		batchSize = 5,
		delayMs = 1000,
		model = 'gemma4-rotorquant:latest',
		dryRun = false,
	} = options;

	console.log(`[warm-up] Starting cache warm-up`);
	console.log(`[warm-up] Total queries: ${COMMON_QUERIES.length}`);
	console.log(`[warm-up] Batch size: ${batchSize}`);
	console.log(`[warm-up] Delay between batches: ${delayMs}ms`);
	console.log(`[warm-up] Model: ${model}`);
	console.log(`[warm-up] Dry run: ${dryRun}`);

	const startTime = Date.now();
	const report: WarmUpReport = {
		totalQueries: COMMON_QUERIES.length,
		successful: 0,
		failed: 0,
		skipped: 0,
		errors: [],
		durationMs: 0,
		model,
	};

	if (dryRun) {
		console.log(`[warm-up] DRY RUN — queries would be processed:`);
		COMMON_QUERIES.forEach((query, idx) => {
			console.log(`  ${idx + 1}. ${query}`);
		});
		report.skipped = COMMON_QUERIES.length;
		report.durationMs = Date.now() - startTime;
		return report;
	}

	// Process queries in batches to avoid overwhelming the LLM
	for (let i = 0; i < COMMON_QUERIES.length; i += batchSize) {
		const batch = COMMON_QUERIES.slice(i, i + batchSize);
		const batchNum = Math.floor(i / batchSize) + 1;
		const totalBatches = Math.ceil(COMMON_QUERIES.length / batchSize);

		console.log(`[warm-up] Processing batch ${batchNum}/${totalBatches} (${batch.length} queries)`);

		// Process batch in parallel
		const results = await Promise.allSettled(
			batch.map(async (query, batchIdx) => {
				const queryNum = i + batchIdx + 1;
				try {
					console.log(`  [${queryNum}/${COMMON_QUERIES.length}] "${query.slice(0, 50)}..."`);

					let response: string | null = null;

					// Try Bifrost first (L1 Redis + L2 semantic cache)
					try {
						response = await bifrostChat(
							[{ role: 'user', content: query }],
							model,
							{
								temperature: 0.3, // Low temperature for consistent caching
								maxTokens: 200, // Short responses for common queries
								timeoutMs: 10000, // 10s timeout for Bifrost
							}
						);
					} catch (bifrostErr) {
						// Keep cache warm-up behind Bifrost so cache/memory lanes do
						// not bypass the gateway and call Gemma4/Ollama directly.
						throw new Error(`Bifrost warm-up failed: ${bifrostErr instanceof Error ? bifrostErr.message : String(bifrostErr)}`);
					}

					if (response) {
						report.successful++;
						console.log(`  ✓ [${queryNum}] Success (${response.length} chars)`);
					} else {
						report.failed++;
						report.errors.push({ query, error: 'Empty response' });
						console.warn(`  ✗ [${queryNum}] Empty response`);
					}
				} catch (err) {
					report.failed++;
					const error = err instanceof Error ? err.message : String(err);
					report.errors.push({ query, error });
					console.error(`  ✗ [${queryNum}] Error:`, error);
				}
			})
		);

		// Log batch summary
		const batchSuccess = results.filter((r) => r.status === 'fulfilled').length;
		const batchFailed = results.filter((r) => r.status === 'rejected').length;
		console.log(`[warm-up] Batch ${batchNum} complete: ${batchSuccess} success, ${batchFailed} failed`);

		// Delay between batches to avoid rate limiting
		if (i + batchSize < COMMON_QUERIES.length) {
			console.log(`[warm-up] Waiting ${delayMs}ms before next batch...`);
			await new Promise((resolve) => setTimeout(resolve, delayMs));
		}
	}

	report.durationMs = Date.now() - startTime;

	console.log(`\n[warm-up] ═══════════════════════════════════════════`);
	console.log(`[warm-up] Cache Warm-Up Complete`);
	console.log(`[warm-up] ═══════════════════════════════════════════`);
	console.log(`[warm-up] Total queries:   ${report.totalQueries}`);
	console.log(`[warm-up] Successful:      ${report.successful} (${((report.successful / report.totalQueries) * 100).toFixed(1)}%)`);
	console.log(`[warm-up] Failed:          ${report.failed}`);
	console.log(`[warm-up] Duration:        ${(report.durationMs / 1000).toFixed(1)}s`);
	console.log(`[warm-up] Avg per query:   ${(report.durationMs / report.totalQueries).toFixed(0)}ms`);
	console.log(`[warm-up] ═══════════════════════════════════════════\n`);

	if (report.errors.length > 0) {
		console.log(`[warm-up] Errors (${report.errors.length}):`);
		report.errors.slice(0, 5).forEach(({ query, error }) => {
			console.log(`  - "${query.slice(0, 50)}...": ${error}`);
		});
		if (report.errors.length > 5) {
			console.log(`  ... and ${report.errors.length - 5} more errors`);
		}
	}

	return report;
}

/**
 * Warm up cache for a specific domain
 *
 * @param domain - Legal domain to warm up (evidence, civil-procedure, torts, contracts, criminal, evidence-analysis)
 */
export async function warmUpDomain(
	domain: 'evidence' | 'civil-procedure' | 'torts' | 'contracts' | 'criminal' | 'evidence-analysis',
	options: {
		batchSize?: number;
		delayMs?: number;
		model?: string;
		dryRun?: boolean;
	} = {}
): Promise<WarmUpReport> {
	console.log(`[warm-up] DEBUG: COMMON_QUERIES.length at start of warmUpDomain: ${COMMON_QUERIES.length}`);
	console.log(`[warm-up] DEBUG: domain parameter: ${domain}`);

	const domainQueries = {
		evidence: COMMON_QUERIES.slice(0, 20),
		'civil-procedure': COMMON_QUERIES.slice(20, 40),
		torts: COMMON_QUERIES.slice(40, 60),
		contracts: COMMON_QUERIES.slice(60, 80),
		criminal: COMMON_QUERIES.slice(80, 100),
		'evidence-analysis': COMMON_QUERIES.slice(100, 120),
	};

	const queries = domainQueries[domain];
	console.log(`[warm-up] DEBUG: queries array length: ${queries.length}`);
	console.log(`[warm-up] Warming up ${domain} domain (${queries.length} queries)`);

	// Temporarily override COMMON_QUERIES with domain-specific subset
	const originalQueries = COMMON_QUERIES.slice();
	COMMON_QUERIES.length = 0;
	COMMON_QUERIES.push(...queries);

	const report = await warmUpCache(options);

	// Restore original queries
	COMMON_QUERIES.length = 0;
	COMMON_QUERIES.push(...originalQueries);

	return report;
}

/**
 * Warm-up report returned by warmUpCache()
 */
export interface WarmUpReport {
	totalQueries: number;
	successful: number;
	failed: number;
	skipped: number;
	errors: Array<{ query: string; error: string }>;
	durationMs: number;
	model: string;
}

