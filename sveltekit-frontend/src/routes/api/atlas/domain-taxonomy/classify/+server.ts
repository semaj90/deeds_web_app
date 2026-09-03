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
 * No LOCAL auth check in this file — but do not read that as unauthenticated. This path is caught
 * by hooks.server.ts's global ADMIN_ONLY prefix list (`/api/atlas`, checked ~line 848), which
 * requires `event.locals.user?.role === 'admin'` before this handler ever runs. Confirmed live
 * 2026-09-03: an in-container weak-label training run (python/train_domain_classifier.py, calling
 * this route over host.docker.internal:5173 with no session cookie) got HTTP 403 here, not a
 * network failure — see CLAUDE.md's G4 tracking table for the correction and open fix options.
 * DEV_BYPASS_AUTH only grants admin when `dev === true` AND no session cookie is present at all;
 * it does not help a caller sitting behind a mismatched auth state. Real hardening (a proper
 * service-to-service credential for this specific route, distinct from the browser-session admin
 * gate) is deferred, per feedback_dev_bypass_auth_defer_hardening in project memory — not fixed
 * inline here.
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
