/**
 * POST /api/simulation — Start a new courtroom simulation session
 * GET  /api/simulation — List active simulation sessions
 *
 * Initializes a prosecution simulation from a fictional case, loading the full
 * case file (charges, actors, events, canon chunk links) into a session.
 */

import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { db } from '$lib/server/db/client';
import {
	fictionalCases,
	fictionalCaseCharges,
	fictionalCaseActors,
	fictionalCaseEvents,
} from '$lib/server/db/schema-postgres.js';
import { eq } from 'drizzle-orm';
import type { Redis } from 'ioredis';
import { getRedis } from '$lib/server/redis.js';
import { z } from 'zod';
import { randomUUID } from 'crypto';

const SESSION_PREFIX = 'sim:session:';
const SESSION_TTL = 60 * 60 * 4; // 4 hours
const USER_SESSIONS_PREFIX = 'sim:user:';

/** Procedural phases for a criminal trial simulation */
const CRIMINAL_PHASES = [
	'pretrial',
	'arraignment',
	'discovery',
	'motions',
	'jury_selection',
	'opening_statements',
	'prosecution_case',
	'defense_case',
	'closing_arguments',
	'jury_instructions',
	'verdict',
	'sentencing',
] as const;

/** Procedural phases for a civil trial simulation */
const CIVIL_PHASES = [
	'filing',
	'answer',
	'discovery',
	'motions',
	'mediation',
	'trial_prep',
	'opening_statements',
	'plaintiff_case',
	'defense_case',
	'closing_arguments',
	'judgment',
] as const;

const CRIMINAL_CATEGORIES = new Set([
	'wire_fraud', 'drug_trafficking', 'firearms', 'cybercrime', 'obstruction',
]);

export interface SimulationSession {
	id: string;
	userId: string;
	caseId: string;
	caseData: {
		caseNumber: string;
		category: string;
		charge: string;
		primaryStatute: string | null;
		defendantName: string;
		jurisdiction: string;
		jurisdictionCity: string | null;
		financialLoss: string | number | null;
		narrative: string;
	};
	charges: Array<{
		chargeName: string;
		statute: string | null;
		canonChunkIds: string[];
		isPrimary: boolean;
	}>;
	actors: Array<{
		name: string;
		role: string;
		description: string | null;
	}>;
	events: Array<{
		eventType: string;
		eventDate: string | null;
		description: string;
		canonChunkIds: string[];
		orderIndex: number;
	}>;
	procedureType: 'criminal' | 'civil';
	phases: string[];
	currentPhase: number;
	currentTurn: number;
	dialogueHistory: Array<{
		phase: string;
		turn: number;
		speaker: string;
		role: 'prosecutor' | 'defense' | 'judge' | 'witness' | 'narrator';
		content: string;
		canonRefs: string[];
		timestamp: string;
	}>;
	rulings: Array<{
		phase: string;
		type: string;
		ruling: string;
		reasoning: string;
	}>;
	status: 'active' | 'completed' | 'abandoned';
	createdAt: string;
	updatedAt: string;
}

const startSchema = z.object({
	fictionalCaseId: z.string().uuid('Invalid fictional case ID'),
});

export const POST: RequestHandler = async ({ request, locals }) => {
	if (!locals.user?.id) {
		return json({ success: false, error: 'Unauthorized' }, { status: 401 });
	}

	const body = await request.json().catch(() => null);
	if (!body) return json({ success: false, error: 'Invalid JSON body' }, { status: 400 });

	const parsed = startSchema.safeParse(body);
	if (!parsed.success) {
		return json(
      { success: false, error: parsed.error.issues[0]?.message ?? 'Invalid input' },
      { status: 400 }
    );
	}

	const { fictionalCaseId } = parsed.data;

	try {
		// Load the fictional case
		const [caseRow] = await db
			.select()
			.from(fictionalCases)
			.where(eq(fictionalCases.id, fictionalCaseId))
			.limit(1);

		if (!caseRow) {
			return json({ success: false, error: 'Fictional case not found' }, { status: 404 });
		}

		// Load related data in parallel
		const [charges, actors, events] = await Promise.all([
			db.select().from(fictionalCaseCharges).where(eq(fictionalCaseCharges.fictionalCaseId, fictionalCaseId)),
			db.select().from(fictionalCaseActors).where(eq(fictionalCaseActors.fictionalCaseId, fictionalCaseId)),
			db.select().from(fictionalCaseEvents).where(eq(fictionalCaseEvents.fictionalCaseId, fictionalCaseId))
				.orderBy(fictionalCaseEvents.orderIndex),
		]);

		const isCriminal = CRIMINAL_CATEGORIES.has(caseRow.category);
		const phases = isCriminal ? [...CRIMINAL_PHASES] : [...CIVIL_PHASES];

		const sessionId = randomUUID();
		const session: SimulationSession = {
			id: sessionId,
			userId: locals.user.id,
			caseId: fictionalCaseId,
			caseData: {
				caseNumber: caseRow.caseId,
				category: caseRow.category,
				charge: caseRow.charge,
				primaryStatute: caseRow.primaryStatute,
				defendantName: caseRow.defendantName,
				jurisdiction: caseRow.jurisdiction,
				jurisdictionCity: caseRow.jurisdictionCity,
				financialLoss: caseRow.financialLoss,
				narrative: caseRow.narrative,
			},
			charges: charges.map((c) => ({
				chargeName: c.chargeName,
				statute: c.statute,
				canonChunkIds: parseJsonArray(c.canonChunkIds),
				isPrimary: c.isPrimary ?? false,
			})),
			actors: actors.map((a) => ({
				name: a.name,
				role: a.role,
				description: a.description,
			})),
			events: events.map((e) => ({
				eventType: e.eventType,
				eventDate: e.eventDate ? String(e.eventDate) : null,
				description: e.description ?? '',
				canonChunkIds: parseJsonArray(e.canonChunkIds),
				orderIndex: e.orderIndex ?? 0,
			})),
			procedureType: isCriminal ? 'criminal' : 'civil',
			phases,
			currentPhase: 0,
			currentTurn: 0,
			dialogueHistory: [],
			rulings: [],
			status: 'active',
			createdAt: new Date().toISOString(),
			updatedAt: new Date().toISOString(),
		};

		// Generate the opening narrator turn
		session.dialogueHistory.push({
			phase: phases[0],
			turn: 0,
			speaker: 'Court Clerk',
			role: 'narrator',
			content: generatePhaseIntro(session),
			canonRefs: [],
			timestamp: new Date().toISOString(),
		});

		// Store in Redis
		const redis: Redis = getRedis();
		await redis.set(
			SESSION_PREFIX + sessionId,
			JSON.stringify(session),
			'EX',
			SESSION_TTL,
		);

		// Track user's sessions
		await redis.sadd(USER_SESSIONS_PREFIX + locals.user.id, sessionId);

		const responseData = {
      sessionId,
      status: 'active',
      procedureType: session.procedureType,
      currentPhase: phases[0],
      totalPhases: phases.length,
      caseNumber: caseRow.caseId,
      charge: caseRow.charge,
      defendant: caseRow.defendantName,
      jurisdiction: caseRow.jurisdiction,
      dialogue: session.dialogueHistory,
    };

    return json({ success: true, data: responseData, ...responseData }, { status: 201 });
	} catch (err) {
		console.error('[simulation] POST error:', err);
		return json(
      { success: false, error: 'Failed to start simulation', data: null },
      { status: 500 }
    );
	}
};

export const GET: RequestHandler = async ({ locals }) => {
	if (!locals.user?.id) {
		return json({ error: 'Unauthorized' }, { status: 401 });
	}

	try {
		const redis: Redis = getRedis();
		const sessionIds = await redis.smembers(USER_SESSIONS_PREFIX + locals.user.id);
		const sessions: Array<{
			id: string;
			caseNumber: string;
			charge: string;
			defendant: string;
			status: string;
			currentPhase: string;
			progress: string;
			createdAt: string;
		}> = [];

		for (const sid of sessionIds) {
			const raw = await redis.get(SESSION_PREFIX + sid);
			if (!raw) {
				await redis.srem(USER_SESSIONS_PREFIX + locals.user.id, sid);
				continue;
			}
			const s = JSON.parse(raw) as SimulationSession;
			sessions.push({
				id: s.id,
				caseNumber: s.caseData.caseNumber,
				charge: s.caseData.charge,
				defendant: s.caseData.defendantName,
				status: s.status,
				currentPhase: s.phases[s.currentPhase] ?? 'unknown',
				progress: `${s.currentPhase + 1}/${s.phases.length}`,
				createdAt: s.createdAt,
			});
		}

		return json({
			sessions: sessions.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()),
		});
	} catch (err) {
		console.error('[simulation] GET error:', err);
		return json({ sessions: [] });
	}
};

function parseJsonArray(val: unknown): string[] {
	if (Array.isArray(val)) return val.map(String);
	if (typeof val === 'string') {
		try { const arr = JSON.parse(val); return Array.isArray(arr) ? arr.map(String) : []; }
		catch { return []; }
	}
	return [];
}

function generatePhaseIntro(session: SimulationSession): string {
	const { caseData, procedureType, charges } = session;
	const chargeList = charges.map((c) => c.chargeName).join(', ');

	if (procedureType === 'criminal') {
		return `All rise. The ${caseData.jurisdiction === 'US-FED' ? 'United States District Court' : `${caseData.jurisdiction} Superior Court`} is now in session. Case number ${caseData.caseNumber}: The ${caseData.jurisdiction === 'US-FED' ? 'United States' : `People of ${caseData.jurisdiction}`} versus ${caseData.defendantName}. The defendant is charged with ${chargeList}${caseData.primaryStatute ? ` in violation of ${caseData.primaryStatute}` : ''}. Counsel, please state your appearances for the record.\n\n[FICTIONAL SIMULATION — NOT LEGAL ADVICE]`;
	}

	return `This court is now in session. Case number ${caseData.caseNumber}: plaintiff versus ${caseData.defendantName}. This matter involves ${caseData.charge}. Counsel, please state your appearances.\n\n[FICTIONAL SIMULATION — NOT LEGAL ADVICE]`;
}
