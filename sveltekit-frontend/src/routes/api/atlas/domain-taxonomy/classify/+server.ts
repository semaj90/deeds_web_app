import { json } from '@sveltejs/kit';
import { z } from 'zod';
import type { RequestHandler } from './$types';
import { classifyDomainTaxonomy } from '$lib/server/atlas/domain-taxonomy.js';

/**
 * Internal, service-to-service exposure of the canonical domain-taxonomy classifier
 * (sveltekit-frontend/src/lib/server/atlas/domain-taxonomy.ts::classifyDomainTaxonomy).
 *
 * Built for openspec/changes/parent-atlas-search-classifier-sidecar task 2 — the NLP sidecar
 * (Python, a separate process) calls this route to bootstrap `source: 'weak_label'` training
 * data for its classify pass, rather than reimplementing the keyword/regex rules in Python
 * (which would create a second, competing owner of the same taxonomy).
 *
 * No auth guard yet — matches this repo's existing DEV_BYPASS_AUTH-era posture for internal
 * analysis routes (see CLAUDE.md's G4 tracking table; this route is added there in the same
 * commit). Real hardening is deferred to the single later production-hardening pass, per
 * feedback_dev_bypass_auth_defer_hardening in project memory.
 */

const DomainTaxonomyInputSchema = z
	.object({
		sourceRef: z.string().nullish(),
		featureId: z.string().nullish(),
		summary: z.string().nullish(),
		title: z.string().nullish(),
		symbol: z.string().nullish(),
		imports: z.array(z.string()).nullish(),
		routes: z.array(z.string()).nullish(),
		schema: z.array(z.string()).nullish(),
		dependencies: z.array(z.string()).nullish(),
		neighbors: z.array(z.string()).nullish(),
		metadata: z.array(z.string()).nullish(),
	})
	.strict();

export const POST: RequestHandler = async (event) => {
	let body: unknown;
	try {
		body = await event.request.json();
	} catch {
		return json({ ok: false, error: 'invalid JSON body' }, { status: 400 });
	}

	const parsed = DomainTaxonomyInputSchema.safeParse(body);
	if (!parsed.success) {
		return json({ ok: false, error: 'invalid request body', issues: parsed.error.issues }, { status: 400 });
	}

	const classification = classifyDomainTaxonomy(parsed.data);
	return json({ ok: true, classification });
};
