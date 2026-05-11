import { db } from '$lib/server/db/client';
import { legalNodes } from '$lib/server/db/schema/legal-nodes';
import { legalCitations } from '$lib/server/db/schema/legal-citations';
import { eq, like, or } from 'drizzle-orm';

export class LegalCitationService {
	/**
	 * Resolves a citation string (e.g. "Art. I, § 1") to a legal node ID.
	 */
	static async resolveCitation(citation: string): Promise<string | null> {
		const results = await db
			.select({ id: legalNodes.id })
			.from(legalNodes)
			.where(
				or(
					eq(legalNodes.citationLabel, citation),
					like(legalNodes.nodePath, `%${citation.toLowerCase().replace(/ /g, '-')}%`)
				)
			)
			.limit(1);

		return results[0]?.id || null;
	}

	/**
	 * Links a node to its citations by scanning its text.
	 */
	static async linkCitationsForNode(nodeId: string, text: string): Promise<void> {
		const patterns = [
			{ regex: /Art\.\s+[IVXLCDM]+,\s+§\s+\d+/g, type: 'constitutional' },
			{ regex: /\d+\s+U\.?S\.?C\.?\s*§?\s*\d+/g, type: 'statutory' },
			{ regex: /[A-Z][a-z]+\s+v\.\s+[A-Z][a-z]+/g, type: 'judicial' }
		];

		for (const pattern of patterns) {
			const matches = text.match(pattern.regex) || [];
			for (const match of matches) {
				const targetId = await this.resolveCitation(match);
				
				await db.insert(legalCitations).values({
					fromNodeId: nodeId,
					toNodeId: targetId,
					citationText: match,
					citationType: pattern.type as any,
					normalizedTarget: match
				}).onConflictDoNothing();
			}
		}
	}


	/**
	 * Retrieves all nodes cited by a given node.
	 */
	static async getCitedNodes(nodeId: string) {
		return await db
			.select({
				id: legalNodes.id,
				heading: legalNodes.heading,
				fullText: legalNodes.fullText,
				citationLabel: legalNodes.citationLabel
			})
			.from(legalCitations)
			.innerJoin(legalNodes, eq(legalCitations.toNodeId, legalNodes.id))
			.where(eq(legalCitations.fromNodeId, nodeId));
	}
}
