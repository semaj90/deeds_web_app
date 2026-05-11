/**
 * ACE Context Source: Agents Directory Cards
 * 
 * Fetches relevant directory cards (Karpathy Wiki entries) based on the 
 * current search context to provide architectural hints and authority scores.
 */

import { readCardFromRedis, cardIdForDir, type AgentsDirectoryCard } from './agents-card-store';
import { couchdb } from '../services/couchdb-client';

const COUCHDB_DB = 'karpathy_wiki';

/**
 * Fetch directory cards for a set of file paths.
 * Tries Redis first (hot cache), then CouchDB (durable wiki).
 */
export async function getCardsForPaths(paths: string[]): Promise<AgentsDirectoryCard[]> {
	const dirPaths = [...new Set(paths.map(p => {
		// Handle cases where path is a file or directory
		// We want the parent directory for files, or the directory itself
		if (p.includes('.') && !p.endsWith('/')) {
			return p.split('/').slice(0, -1).join('/');
		}
		return p;
	}))].filter(Boolean);

	const cards: AgentsDirectoryCard[] = [];
	
	await Promise.all(dirPaths.map(async (dirPath) => {
		try {
			// 1. Try Redis
			const card = await readCardFromRedis(dirPath);
			if (card) {
				cards.push(card);
				return;
			}

			// 2. Try CouchDB
			const id = cardIdForDir(dirPath);
			const doc = await couchdb.get(COUCHDB_DB, id) as any;
			if (doc && doc.id) {
				// Strip CouchDB metadata
				const { _id, _rev, ...cardData } = doc;
				cards.push(cardData as AgentsDirectoryCard);
			}
		} catch (err) {
			// Ignore individual failures
		}
	}));

	return cards;
}

/**
 * Search for cards by feature key using CouchDB views.
 */
export async function getCardsByFeature(featureKey: string): Promise<AgentsDirectoryCard[]> {
	try {
		const viewRes = await couchdb.view(COUCHDB_DB, 'wiki', 'by_feature_key', {
			key: JSON.stringify(featureKey),
			include_docs: 'true'
		});
		
		return viewRes.rows.map(r => {
			if (!r.doc) return null;
			const { _id, _rev, ...cardData } = r.doc as any;
			return cardData as AgentsDirectoryCard;
		}).filter((c): c is AgentsDirectoryCard => c !== null);
	} catch (err) {
		console.warn('[agents-context-source] getCardsByFeature failed:', err);
		return [];
	}
}

/**
 * Format cards into a concise architectural context block for the LLM.
 */
export function formatCardsContext(cards: AgentsDirectoryCard[]): string {
	if (cards.length === 0) return '';

	let ctx = `## Codebase Wiki: Directory Authority & Architectural Hints\n`;
	
	// Sort by activity score or audit status
	const sorted = [...cards].sort((a, b) => (b.activityScore || 0) - (a.activityScore || 0));

	for (const card of sorted.slice(0, 5)) {
		ctx += `\n### Directory: ${card.dirPath} (${card.auditStatus})\n`;
		if (card.summary) ctx += `Summary: ${card.summary}\n`;
		if (card.featureKeys.length > 0) ctx += `Features: ${card.featureKeys.join(', ')}\n`;
		if (card.recommendations.length > 0) ctx += `Next Best Actions: ${card.recommendations.join('; ')}\n`;
		
		// Gates summary (G-AI flags)
		const activeGates = Object.entries(card.gates || {})
			.filter(([_, active]) => active)
			.map(([gate]) => gate);
		if (activeGates.length > 0) {
			ctx += `Status Gates: ${activeGates.join(', ')}\n`;
		}
	}

	return ctx;
}
