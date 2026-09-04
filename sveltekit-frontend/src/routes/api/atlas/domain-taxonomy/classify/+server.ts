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
 * No LOCAL auth check in this file. This path is also caught by hooks.server.ts's global
 * ADMIN_ONLY prefix list (`/api/atlas`, checked ~line 848), which requires
 * `event.locals.user?.role === 'admin'` before this handler ever runs — HOWEVER, a live repro
 * on 2026-09-03 (dev server confirmed up, identical strict-JSON request sent from both the host
 * and from inside the miniforge-nlp-sidecar container to host.docker.internal:5173) got a clean
 * 200 from BOTH callers, not a 403 — DEV_BYPASS_AUTH grants role:'admin' whenever no session
 * cookie is present, which a bare curl/urllib caller satisfies. An earlier in-container retraining
 * run did hit a real HTTP 403 calling this exact route, but its actual cause is NOT established
 * (no response body was captured at the time) — do not assume it was this gate without a fresh,
 * body-captured repro at the moment of failure. See CLAUDE.md's G4 tracking table and
 * openspec/changes/parent-atlas-search-classifier-sidecar/tasks.md Next Steps item 2 for the full
 * trace. Given that ambiguity, the resolved path forward was architectural, not forensic: offline
 * training now goes through scripts/atlas/build-domain-classifier-weak-label-bundle-v1.mts (a
 * frozen, in-process label bundle) instead of depending on this endpoint for 300 live calls. This
 * route itself is left as-is — still useful for interactive checks, ACP/TRACE live paths, and
 * service-to-service diagnostics, per feedback_dev_bypass_auth_defer_hardening in project memory
 * (any real hardening decision is deferred, not fixed inline here).
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
