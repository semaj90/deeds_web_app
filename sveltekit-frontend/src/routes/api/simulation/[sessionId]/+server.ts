/**
 * GET    /api/simulation/[sessionId] — Get current simulation state
 * POST   /api/simulation/[sessionId] — Advance simulation (next turn / phase)
 * DELETE /api/simulation/[sessionId] — Abandon simulation
 *
 * The simulation walks through procedural phases, generating dialogue turns
 * for prosecutor, defense counsel, judge, and witnesses at each phase.
 */

import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { redis } from '$lib/server/redis.js';
import { isUuid } from '$lib/server/validation.js';
import { z } from 'zod';
import { ENV } from '$lib/server/env.server.js';
import { ollamaFetch } from '$lib/server/ollama.js';
import type { SimulationSession } from '../+server';

const SESSION_PREFIX = 'sim:session:';
const SESSION_TTL = 60 * 60 * 4;
const USER_SESSIONS_PREFIX = 'sim:user:';

async function getSession(sessionId: string): Promise<SimulationSession | null> {
	const raw = await redis.get(SESSION_PREFIX + sessionId);
	return raw ? JSON.parse(raw) as SimulationSession : null;
}

async function saveSession(session: SimulationSession): Promise<void> {
	session.updatedAt = new Date().toISOString();
	await redis.set(SESSION_PREFIX + session.id, JSON.stringify(session), 'EX', SESSION_TTL);
}

// ── GET: Current session state ──
export const GET: RequestHandler = async ({ params, locals }) => {
	if (!locals.user?.id) return json({ error: 'Unauthorized' }, { status: 401 });
	if (!isUuid(params.sessionId)) return json({ error: 'Invalid session ID' }, { status: 400 });

	try {
		const session = await getSession(params.sessionId);
		if (!session) return json({ error: 'Session not found or expired' }, { status: 404 });
		if (session.userId !== locals.user.id) return json({ error: 'Access denied' }, { status: 403 });

		return json({
			id: session.id,
			status: session.status,
			caseData: session.caseData,
			charges: session.charges,
			actors: session.actors,
			procedureType: session.procedureType,
			phases: session.phases,
			currentPhase: session.currentPhase,
			currentPhaseName: session.phases[session.currentPhase] ?? 'unknown',
			currentTurn: session.currentTurn,
			totalPhases: session.phases.length,
			progress: `${session.currentPhase + 1}/${session.phases.length}`,
			dialogueHistory: session.dialogueHistory,
			rulings: session.rulings,
			createdAt: session.createdAt,
			updatedAt: session.updatedAt,
		});
	} catch (err) {
		console.error('[simulation/session] GET error:', err);
		return json({ error: 'Failed to load session' }, { status: 500 });
	}
};

// ── POST: Advance simulation ──
const advanceSchema = z.object({
	action: z.enum(['next_turn', 'next_phase', 'objection', 'ruling']).default('next_turn'),
	objectionType: z.string().max(200).optional(),
	objectionBasis: z.string().max(1000).optional(),
	userInput: z.string().max(2000).optional(),
});

export const POST: RequestHandler = async ({ params, request, locals }) => {
	if (!locals.user?.id) return json({ error: 'Unauthorized' }, { status: 401 });
	if (!isUuid(params.sessionId)) return json({ error: 'Invalid session ID' }, { status: 400 });

	const body = await request.json().catch(() => null);
	if (!body) return json({ error: 'Invalid JSON body' }, { status: 400 });

	const parsed = advanceSchema.safeParse(body);
	if (!parsed.success) return json({ error: parsed.error.issues[0]?.message ?? 'Invalid input' }, { status: 400 });

	try {
		const session = await getSession(params.sessionId);
		if (!session) return json({ error: 'Session not found or expired' }, { status: 404 });
		if (session.userId !== locals.user.id) return json({ error: 'Access denied' }, { status: 403 });
		if (session.status !== 'active') return json({ error: 'Session is no longer active' }, { status: 400 });

		const { action, objectionType, objectionBasis, userInput } = parsed.data;
		let newDialogue: SimulationSession['dialogueHistory'] = [];

		if (action === 'next_phase') {
			if (session.currentPhase >= session.phases.length - 1) {
				session.status = 'completed';
				newDialogue.push({
					phase: session.phases[session.currentPhase],
					turn: session.currentTurn + 1,
					speaker: 'Court Clerk',
					role: 'narrator',
					content: session.procedureType === 'criminal'
						? `This concludes the proceedings in Case ${session.caseData.caseNumber}. Court is adjourned.\n\n[SIMULATION COMPLETE]`
						: `This concludes the matter of ${session.caseData.caseNumber}. Court is adjourned.\n\n[SIMULATION COMPLETE]`,
					canonRefs: [],
					timestamp: new Date().toISOString(),
				});
			} else {
				session.currentPhase++;
				session.currentTurn = 0;
				const phaseName = session.phases[session.currentPhase];
				newDialogue.push({
					phase: phaseName,
					turn: 0,
					speaker: 'Court Clerk',
					role: 'narrator',
					content: getPhaseTransition(session, phaseName),
					canonRefs: [],
					timestamp: new Date().toISOString(),
				});
			}
		} else if (action === 'objection') {
			const ruling = generateObjectionRuling(session, objectionType, objectionBasis);
			newDialogue.push({
				phase: session.phases[session.currentPhase],
				turn: session.currentTurn + 1,
				speaker: 'Defense Counsel',
				role: 'defense',
				content: `Objection, Your Honor! ${objectionType ? objectionType + '.' : ''} ${objectionBasis || 'This evidence should not be admitted.'}`,
				canonRefs: [],
				timestamp: new Date().toISOString(),
			});
			newDialogue.push({
				phase: session.phases[session.currentPhase],
				turn: session.currentTurn + 2,
				speaker: 'The Court',
				role: 'judge',
				content: ruling.content,
				canonRefs: ruling.canonRefs,
				timestamp: new Date().toISOString(),
			});
			session.rulings.push({
				phase: session.phases[session.currentPhase],
				type: objectionType || 'general',
				ruling: ruling.sustained ? 'sustained' : 'overruled',
				reasoning: ruling.content,
			});
			session.currentTurn += 2;
		} else {
			// next_turn — generate the next dialogue turn via LLM
			const generated = await generateDialogueTurn(session, userInput);
			newDialogue.push(...generated);
			session.currentTurn += generated.length;
		}

		session.dialogueHistory.push(...newDialogue);
		await saveSession(session);

		// Audit log: append action + new dialogue to Redis list (fire-and-forget)
		auditSimulationAction(session.id, locals.user.id, action, newDialogue).catch(() => {});

		return json({
			status: session.status,
			currentPhase: session.currentPhase,
			currentPhaseName: session.phases[session.currentPhase] ?? 'complete',
			currentTurn: session.currentTurn,
			progress: `${session.currentPhase + 1}/${session.phases.length}`,
			newDialogue,
			totalDialogue: session.dialogueHistory.length,
			rulings: session.rulings,
		});
	} catch (err) {
		console.error('[simulation/session] POST error:', err);
		return json({ error: 'Failed to advance simulation' }, { status: 500 });
	}
};

// ── DELETE: Abandon session ──
export const DELETE: RequestHandler = async ({ params, locals }) => {
	if (!locals.user?.id) return json({ error: 'Unauthorized' }, { status: 401 });
	if (!isUuid(params.sessionId)) return json({ error: 'Invalid session ID' }, { status: 400 });

	try {
		const session = await getSession(params.sessionId);
		if (!session) return json({ error: 'Session not found' }, { status: 404 });
		if (session.userId !== locals.user.id) return json({ error: 'Access denied' }, { status: 403 });

		session.status = 'abandoned';
		await saveSession(session);
		await redis.srem(USER_SESSIONS_PREFIX + locals.user.id, params.sessionId);

		return json({ success: true });
	} catch (err) {
		console.error('[simulation/session] DELETE error:', err);
		return json({ error: 'Failed to abandon session' }, { status: 500 });
	}
};

// ── Dialogue generation ──

function getPhaseTransition(session: SimulationSession, phase: string): string {
	const { caseData } = session;
	const transitions: Record<string, string> = {
		pretrial: `Pretrial proceedings. The Court will now address preliminary matters in ${caseData.caseNumber}.`,
		arraignment: `The defendant, ${caseData.defendantName}, is present for arraignment. The charges will now be read.`,
		discovery: `The Court sets the discovery schedule. Both parties are ordered to exchange materials within the statutory timeframe.`,
		motions: `The Court will now hear pretrial motions. Counsel, are there any motions to present?`,
		jury_selection: `We will now proceed to jury selection. The Court will conduct voir dire. Counsel may exercise peremptory challenges and challenges for cause.`,
		opening_statements: `Opening statements. The prosecution may proceed first, followed by the defense.`,
		prosecution_case: `The prosecution may now present its case-in-chief. Call your first witness.`,
		defense_case: `The defense may now present its case. Call your first witness, if any.`,
		closing_arguments: `We will now hear closing arguments. The prosecution will go first, followed by the defense, with the prosecution having the opportunity for rebuttal.`,
		jury_instructions: `The Court will now instruct the jury on the applicable law.`,
		verdict: `Members of the jury, have you reached a verdict?`,
		sentencing: `The Court will now proceed to sentencing.`,
		filing: `A civil complaint has been filed. Case number ${caseData.caseNumber} is now on the docket.`,
		answer: `The defendant has filed an answer. The Court notes the pleadings are closed.`,
		mediation: `The Court has ordered mediation. The parties will attempt to resolve this matter outside of trial.`,
		trial_prep: `The Court will address pretrial matters and finalize the trial schedule.`,
		plaintiff_case: `The plaintiff may now present its case. Call your first witness.`,
		judgment: `The Court is prepared to render judgment.`,
	};

	return (transitions[phase] || `Proceeding to the next phase: ${phase.replace(/_/g, ' ')}.`) + '\n\n[FICTIONAL SIMULATION]';
}

function generateObjectionRuling(
	session: SimulationSession,
	objectionType?: string,
	basis?: string,
): { content: string; canonRefs: string[]; sustained: boolean } {
	const hash = session.currentTurn + session.currentPhase;
	const sustained = hash % 3 !== 0; // ~67% sustained for training variety

	const type = (objectionType || 'general').toLowerCase();
	const canonRefs: string[] = [];

	let content: string;
	if (type.includes('hearsay')) {
		canonRefs.push('632fbf19:0:1715a5cd06d80f54'); // FRE 801
		content = sustained
			? `Sustained. The statement is hearsay under Federal Rule of Evidence 801 and does not fall within any recognized exception. The jury will disregard the last statement.`
			: `Overruled. The statement falls within the business records exception under FRE 803(6). The witness may continue.`;
	} else if (type.includes('relevance') || type.includes('relevant')) {
		canonRefs.push('b2b1b3d9:0:d6f799548c15bcf6'); // FRE 401
		content = sustained
			? `Sustained. The evidence lacks relevance under FRE 401. It does not have a tendency to make a material fact more or less probable.`
			: `Overruled. The Court finds the evidence relevant under FRE 401. Its probative value is not substantially outweighed by the danger of unfair prejudice under FRE 403.`;
	} else if (type.includes('prejudice') || type.includes('403')) {
		canonRefs.push('2f77bd5e:0:e55a3627ea69a6b6'); // FRE 403
		content = sustained
			? `Sustained. Under FRE 403, the probative value of this evidence is substantially outweighed by the danger of unfair prejudice to the defendant.`
			: `Overruled. The Court will allow the evidence under FRE 403, with a limiting instruction to the jury.`;
	} else if (type.includes('foundation') || type.includes('authenticate')) {
		content = sustained
			? `Sustained. Counsel has not laid a proper foundation for this exhibit. You may attempt to authenticate through another witness.`
			: `Overruled. The Court is satisfied with the foundation laid. The exhibit is admitted.`;
	} else {
		content = sustained
			? `Sustained. ${basis ? 'The Court agrees — ' + basis.slice(0, 200) : 'The objection is well-taken.'}`
			: `Overruled. ${basis ? 'The Court does not find the objection persuasive. ' : ''}Counsel may proceed.`;
	}

	return { content: content + '\n\n[FICTIONAL RULING]', canonRefs, sustained };
}

async function generateDialogueTurn(
	session: SimulationSession,
	userInput?: string,
): Promise<SimulationSession['dialogueHistory']> {
	const phase = session.phases[session.currentPhase];
	const { caseData, charges, actors } = session;

	// Determine whose turn it is
	const turnCycle = getTurnCycle(phase, session.procedureType);
	const turnIdx = session.currentTurn % turnCycle.length;
	const { speaker, role } = turnCycle[turnIdx];

	// Build context for LLM
	const recentDialogue = session.dialogueHistory
		.slice(-6)
		.map((d) => `[${d.role.toUpperCase()}] ${d.speaker}: ${d.content.slice(0, 300)}`)
		.join('\n');

	const chargeList = charges.map((c) => `${c.chargeName}${c.statute ? ' (' + c.statute + ')' : ''}`).join('; ');
	const fallbackCanonRefs = charges.flatMap((c) => c.canonChunkIds).slice(0, 5);

	// RAG: Retrieve legal canon chunks relevant to current phase + charges
	let canonRefs = fallbackCanonRefs;
	let legalAuthorityBlock = '';
	try {
		const { qdrant } = await import('$lib/server/vector/qdrant-manager.js');
		const { generateEmbeddings } = await import('$lib/server/grpc/embedding-client.js');

		const ragQuery = `${phase.replace(/_/g, ' ')} ${chargeList} ${caseData.jurisdiction}`;
		const embedResult = await generateEmbeddings([ragQuery]);
		const queryVector = embedResult.vectors?.[0];

		if (queryVector && queryVector.length === 768) {
			const mustConditions: Array<{ key: string; match: { value: string } }> = [];
			if (caseData.jurisdiction) {
				mustConditions.push({ key: 'jurisdiction', match: { value: caseData.jurisdiction } });
			}

			const searchResult = await qdrant.hybridSearch({
				collection: 'legal_canon_chunks',
				queryEmbedding: queryVector,
				query: ragQuery,
				limit: 3,
				scoreThreshold: 0.35,
				filters: mustConditions.length > 0 ? { must: mustConditions } : undefined,
			}).catch(() => ({ results: [] }));

			const hits = searchResult.results ?? [];
			if (hits.length > 0) {
				canonRefs = hits
					.map((h: Record<string, any>) => h.payload?.chunk_id || h.payload?.citation)
					.filter(Boolean) as string[];

				legalAuthorityBlock = '\n\nRelevant Legal Authority:\n' + hits
					.map((h: Record<string, any>) => {
						const p = h.payload ?? {};
						const cite = p.citation || p.chunk_id || 'Unknown';
						const text = (p.content || '').slice(0, 250);
						return `[${cite}] ${text}`;
					})
					.join('\n');
			}
		}
	} catch {
		// RAG unavailable — continue with fallback canonRefs
	}

	const systemPrompt = `You are generating dialogue for a fictional courtroom simulation. You are playing the role of ${speaker} (${role}).

Case: ${caseData.caseNumber}
Defendant: ${caseData.defendantName}
Charges: ${chargeList}
Jurisdiction: ${caseData.jurisdiction}
Current Phase: ${phase.replace(/_/g, ' ')}
Procedure: ${session.procedureType}${legalAuthorityBlock}

RULES:
- Stay in character as ${speaker}
- Reference applicable law and cite specific statutes/rules when relevant
- Keep responses concise (2-4 paragraphs max)
- This is a FICTIONAL simulation for training purposes
- End your response with [FICTIONAL SIMULATION]`;

	const userPrompt = userInput
		? `The user interjects: "${userInput}"\n\nRecent proceedings:\n${recentDialogue}\n\nContinue the ${phase.replace(/_/g, ' ')} phase as ${speaker}.`
		: `Recent proceedings:\n${recentDialogue}\n\nContinue the ${phase.replace(/_/g, ' ')} phase. Deliver your next statement as ${speaker}.`;

	try {
		const res = await ollamaFetch(`${ENV.OLLAMA_BASE_URL}/api/chat`, {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({
				model: 'gemma3-legal:latest',
				messages: [
					{ role: 'system', content: systemPrompt },
					{ role: 'user', content: userPrompt },
				],
				stream: false,
				options: { temperature: 0.7, num_predict: 512 },
			}),
			signal: AbortSignal.timeout(30_000),
		});

		if (!res.ok) {
			// Fallback to template dialogue if LLM unavailable
			return [generateTemplateTurn(session, phase, speaker, role, canonRefs)];
		}

		const data = await res.json();
		const content = data.message?.content || data.response || '';

		return [{
			phase,
			turn: session.currentTurn + 1,
			speaker,
			role: role as SimulationSession['dialogueHistory'][0]['role'],
			content: content.slice(0, 2000) + (content.includes('[FICTIONAL') ? '' : '\n\n[FICTIONAL SIMULATION]'),
			canonRefs,
			timestamp: new Date().toISOString(),
		}];
	} catch {
		// LLM timeout/error → use template
		return [generateTemplateTurn(session, phase, speaker, role, canonRefs)];
	}
}

function getTurnCycle(phase: string, procedureType: string): Array<{ speaker: string; role: string }> {
	const prosecutor = { speaker: procedureType === 'criminal' ? 'Assistant U.S. Attorney' : 'Plaintiff\'s Counsel', role: 'prosecutor' };
	const defense = { speaker: 'Defense Counsel', role: 'defense' };
	const judge = { speaker: 'The Court', role: 'judge' };

	const cycles: Record<string, Array<{ speaker: string; role: string }>> = {
		opening_statements: [prosecutor, defense],
		prosecution_case: [prosecutor, { speaker: 'Witness', role: 'witness' }, defense, judge],
		plaintiff_case: [prosecutor, { speaker: 'Witness', role: 'witness' }, defense, judge],
		defense_case: [defense, { speaker: 'Witness', role: 'witness' }, prosecutor, judge],
		closing_arguments: [prosecutor, defense, prosecutor],
		jury_instructions: [judge],
		jury_selection: [judge, prosecutor, defense],
		verdict: [judge],
		sentencing: [judge, prosecutor, defense],
		judgment: [judge],
	};

	return cycles[phase] || [prosecutor, defense, judge];
}

function generateTemplateTurn(
	session: SimulationSession,
	phase: string,
	speaker: string,
	role: string,
	canonRefs: string[],
): SimulationSession['dialogueHistory'][0] {
	const { caseData } = session;
	const templates: Record<string, Record<string, string>> = {
		opening_statements: {
			prosecutor: `May it please the Court. Ladies and gentlemen of the jury, the evidence will show that the defendant, ${caseData.defendantName}, committed ${caseData.charge}. We will present witnesses and documentary evidence demonstrating each element of this offense beyond a reasonable doubt.`,
			defense: `Thank you, Your Honor. Ladies and gentlemen, my client, ${caseData.defendantName}, is presumed innocent. The prosecution bears the burden of proof, and we are confident that when you hear all the evidence, you will find that burden has not been met.`,
		},
		prosecution_case: {
			prosecutor: `The prosecution calls its next witness to testify regarding the ${caseData.category.replace(/_/g, ' ')} charges against ${caseData.defendantName}.`,
			witness: `I was involved in the investigation of this matter and can speak to the evidence gathered.`,
			defense: `Your Honor, I would like to cross-examine this witness regarding the reliability of their testimony.`,
			judge: `Proceed, counsel. The witness may answer.`,
		},
		verdict: {
			judge: `Members of the jury, have you reached a unanimous verdict? The clerk will read the verdict.`,
		},
	};

	const phaseTemplates = templates[phase] || {};
	const content = phaseTemplates[role] || `${speaker} addresses the Court regarding the ${phase.replace(/_/g, ' ')} phase of these proceedings.`;

	return {
		phase,
		turn: session.currentTurn + 1,
		speaker,
		role: role as SimulationSession['dialogueHistory'][0]['role'],
		content: content + '\n\n[FICTIONAL SIMULATION]',
		canonRefs,
		timestamp: new Date().toISOString(),
	};
}

// ── Audit logging ──
const AUDIT_PREFIX = 'sim:audit:';
const AUDIT_TTL = 60 * 60 * 24 * 7; // 7 days

async function auditSimulationAction(
	sessionId: string,
	userId: string,
	action: string,
	dialogue: SimulationSession['dialogueHistory'],
): Promise<void> {
	const entry = JSON.stringify({
		sessionId,
		userId,
		action,
		dialogueCount: dialogue.length,
		speakers: dialogue.map((d) => d.speaker),
		canonRefs: dialogue.flatMap((d) => d.canonRefs),
		timestamp: new Date().toISOString(),
	});

	const key = AUDIT_PREFIX + sessionId;
	await redis.rpush(key, entry);
	await redis.expire(key, AUDIT_TTL);
}
