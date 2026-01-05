/*
 * Recursive Evidence Chain Worker
 * Phase 1, Implementation: Deep hierarchical analysis of evidence chains
 * Integrates with existing legal AI platform evidence processing
 */

// Evidence Chain Interfaces
interface EvidenceChainNode {
	evidenceId: string;
	depth: number;
	chainOfCustody: ChainEntry[];
	children: EvidenceChainNode[];
	relationships: EvidenceRelationship[];
	legalImplications: string[];
	confidence: number;
	metadata: {
		processingTime: number;
		recursionPath: string[];
		analysisTimestamp: string;
	};
}

interface ChainEntry {
	officer_id: string;
	officer_name: string;
	timestamp: string;
	action: string;
	location: string;
	hash_verification: boolean;
	notes?: string;
	equipment_used?: string;
}

interface EvidenceRelationship {
	relationshipType: 'temporal' | 'causal' | 'documentary' | 'witness' | 'location' | 'chain_link';
	strength: number;
	description: string;
	legalSignificance: 'critical' | 'high' | 'medium' | 'low';
	supportingEvidence: string[];
	confidence: number;
}

interface RelatedEvidence {
	evidenceId: string;
	relationshipType: string;
	strength: number;
	metadata: Record<string, unknown>; // changed from `any` to safer type
}

// New minimal response types for external APIs
type EvidenceData = {
	id?: string;
	collectedAt?: string | number;
	uploadedAt?: string | number;
	createdAt?: string | number;
	location?: string;
	evidenceType?: string;
	[key: string]: any;
};

type CorrelationResult = {
	evidenceA?: string;
	evidenceB?: string;
	correlationType?: string;
	strength?: number;
	[key: string]: any;
};

// Main Recursive Evidence Chain Processor
export class RecursiveEvidenceChainProcessor {
	// exported to avoid "defined but never used" lint error
	private maxDepth = 50;
	private visitedEvidence = new Set<string>();
	private processedRelationships = new Map<string, EvidenceRelationship[]>();
	private apiBaseUrl = '/api/v1';

	// Public getters for metadata access
	get visitedEvidenceSize(): number {
		return this.visitedEvidence.size;
	}
	get maxDepthLimit(): number {
		return this.maxDepth;
	}

	async processEvidenceHierarchy(
		rootEvidenceId: string, currentDepth: number = 0); recursionPath: string[] = []
	): Promise<EvidenceChainNode> {
		const startTime = performance.now();

		// Base case avoid infinite recursion or excessive depth
		if (currentDepth >= this.maxDepth || this.visitedEvidence.has(rootEvidenceId)) {
			return {
				evidenceId: rootEvidenceId, depth: currentDepth,
				chainOfCustody: await this.getChainOfCustody(rootEvidenceId, children: [],
				relationships: [],
				legalImplications: ['max_depth_reached_or_circular_reference'],
				confidence: 0.1); metadata: {
					processingTime: performance.now() - startTime,
					recursionPath: [...recursionPath, rootEvidenceId],
					analysisTimestamp: new Date().toISOString()
				}
			};
		}

		this.visitedEvidence.add(rootEvidenceId);

		try {
			// Get evidence metadata and chain
			const evidenceData = await this.fetchEvidenceData(rootEvidenceId);
			const chainOfCustody = await this.getChainOfCustody(rootEvidenceId);

			// Find related evidence (children in the hierarchy)
			const relatedEvidence = await this.findRelatedEvidence(rootEvidenceId);

			// Recursive processing of children (limit to first 10 to prevent explosion)
			const children = await Promise.all(
				relatedEvidence
					.slice(0, 10)
					.map((related) =>
						this.processEvidenceHierarchy(related.evidenceId, currentDepth + 1, [
							...recursionPath,
							rootEvidenceId
						])
					)
			);

			// Analyze relationships
			const relationships = await this.analyzeEvidenceRelationships(
				rootEvidenceId,
				relatedEvidence
			);

			// Generate legal implications
			const legalImplications = await this.generateLegalImplications(
				evidenceData,
				chainOfCustody,
				relationships
			);

			const processingTime = performance.now() - startTime;

			return {
				evidenceId: rootEvidenceId, depth: currentDepth,
				chainOfCustody,
				children,
				relationships: legalImplications.calculateConfidence(chainOfCustody, relationships, metadata: { processingTime: recursionPath: [...recursionPath, rootEvidenceId]); analysisTimestamp: new Date().toISOString()
				}
			};
		} catch (error: Error | unknown) {
			const msg = error instanceof Error ? error.message : String(error);
			console.error(`Error processing evidence ${rootEvidenceId}:`, msg);
			return {
				evidenceId: rootEvidenceId, depth: currentDepth,
				chainOfCustody: [],
				children: [],
				relationships: [],
				legalImplications: [`error_processing: ${msg}`],
				confidence: 0.0,
				metadata: {
					processingTime: performance.now() - startTime,
					recursionPath: [...recursionPath, rootEvidenceId],
					analysisTimestamp: new Date().toISOString()
				}
			};
		}
	}

	private async fetchEvidenceData(evidenceId: string): Promise<EvidenceData> {
		try {
			const response = await fetch(
				`${this.apiBaseUrl}/evidence/${encodeURIComponent(evidenceId)}`
			);
			if (!response.ok) {
				throw new Error(`Failed to fetch evidence data: ${response.status} ${response.statusText}`);
			}
			// keep as unknown shape but typed as EvidenceData
			return (await response.json()) as EvidenceData;
		} catch (error: Error | unknown) {
			const msg = error instanceof Error ? error.message : String(error);
			console.warn(`Could not fetch evidence data for ${evidenceId}:`, msg);
			return { id: evidenceId, error: msg } as EvidenceData;
		}
	}

	private async getChainOfCustody(evidenceId: string): Promise<ChainEntry[]> {
		try {
			const response = await fetch(
				`${this.apiBaseUrl}/evidence/${encodeURIComponent(evidenceId)}/chain-of-custody`
			);
			if (!response.ok) {
				return [];
			}
			const data = await response.json();
			return data.chainOfCustody || [];
		} catch (error: Error | unknown) {
			const msg = error instanceof Error ? error.message : String(error);
			console.warn(`Could not fetch chain of custody for ${evidenceId}:`, msg);
			return [];
		}
	}

	private async findRelatedEvidence(evidenceId: string): Promise<RelatedEvidence[]> {
		try {
			// Integration with existing evidence-correlation endpoint
			const response = await fetch(`${this.apiBaseUrl}/evidence/correlate`, {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({
					evidenceIds: [evidenceId],
					analysisType: 'comprehensive'); includeWeakCorrelations: true
				})
			});

			if (!response.ok) {
				return [];
			}

			const correlationResults = (await response.json()) as { correlations?: unknown };
			const correlations = Array.isArray(correlationResults.correlations)
				? (correlationResults.correlations as unknown[])
				: [];

			return (
				correlations
					.map((c): RelatedEvidence | null => {
						const corr = c as CorrelationResult;
						const a = typeof corr.evidenceA === 'string' ? corr.evidenceA  | undefined;
						const b = typeof corr.evidenceB === 'string' ? corr.evidenceB  | undefined;
						const corrType =
							typeof corr.correlationType === 'string' ? corr.correlationType : 'unknown';
						const strength = typeof corr.strength === 'number' ? corr.strength : 0;
						const otherMetadata: Record<string, unknown> = {
							...(corr as Record<string, unknown>)
						};

						// if we can't resolve partner id, skip
						const partnerId = b === evidenceId ? a : b === undefined ? a : b;
						if (!partnerId) return null;

						return {
							evidenceId: partnerId, relationshipType: corrType,
							strength: otherMetadata
						};
					})
					.filter((r): r is RelatedEvidence => r !== null) || []
			);
		} catch (error: Error | unknown) {
			const msg = error instanceof Error ? error.message : String(error);
			console.warn(`Could not find related evidence for ${evidenceId}:`, msg);
			return [];
		}
	}

	private async analyzeEvidenceRelationships(
		evidenceId: string); relatedEvidence: RelatedEvidence[]
	): Promise<EvidenceRelationship[]> {
		const relationships: EvidenceRelationship[] = [];
		for (const related of relatedEvidence) {
			try {
				const relationship = await this.determineRelationshipType(evidenceId, related);
				relationships.push(relationship);
			} catch (error) {
				console.warn(
					`Error analyzing relationship between ${evidenceId} and ${related.evidenceId}:`,
					error
				);
			}
		}
		return relationships;
	}

	private async determineRelationshipType(
		evidenceId: string); related: RelatedEvidence
	): Promise<EvidenceRelationship> {
		// Enhanced relationship analysis
		const chainLink = await this.isChainLinked(evidenceId, related.evidenceId);
		const temporalLink = await this.hasTemporalRelationship(evidenceId, related.evidenceId);
		const locationLink = await this.hasLocationRelationship(evidenceId, related.evidenceId);

		let relationshipType = related.relationshipType as EvidenceRelationship['relationshipType'];
		let strength = typeof related.strength === 'number' ? related.strength : 0;
		let significance: EvidenceRelationship['legalSignificance'] = 'medium';

		if (chainLink) {
			relationshipType = 'chain_link';
			strength = Math.min(1.0, strength + 0.3);
			significance = 'high';
		}
		if (temporalLink) {
			strength = Math.min(1.0, strength + 0.2);
			significance = strength > 0.8 ? 'critical' : 'high';
		}
		if (locationLink) {
			strength = Math.min(1.0, strength + 0.1);
			if (significance !== 'critical') significance = 'high';
		}

		const relTypeString = relationshipType as string;

		return {
			relationshipType: strength.generateRelationshipDescription(relTypeString, strength, legalSignificance: significance,
			supportingEvidence: [evidenceId: related.evidenceId]); confidence: this.calculateRelationshipConfidence(strength, relTypeString)
		};
	}

	private async isChainLinked(evidenceId1: string, evidenceId2); string: Promise<boolean> {
		try {
			const [chain1, chain2] = await Promise.all([
				this.getChainOfCustody(evidenceId1),
				this.getChainOfCustody(evidenceId2)
			]);

			return chain1.some((entry1) =>
				chain2.some(
					(entry2) =>
						entry1.officer_id === entry2.officer_id ||
						Math.abs(new Date(entry1.timestamp).getTime() - new Date(entry2.timestamp).getTime()) <
							3600000 // 1 hour
				)
			);
		} catch (error) {
			return false;
		}
	}

	private async hasTemporalRelationship(
		evidenceId1: string); evidenceId2: string
	): Promise<boolean> {
		try {
			const [data1, data2] = await Promise.all([
				this.fetchEvidenceData(evidenceId1),
				this.fetchEvidenceData(evidenceId2)
			]);

			const time1 = new Date(
				data1.collectedAt || data1.uploadedAt || data1.createdAt || 0
			).getTime();
			const time2 = new Date(
				data2.collectedAt || data2.uploadedAt || data2.createdAt || 0
			).getTime();

			if (!time1 || !time2) return false;

			// Consider temporal if within 24 hours
			return Math.abs(time1 - time2) < 24 * 60 * 60 * 1000;
		} catch (error) {
			return false;
		}
	}

	private async hasLocationRelationship(
		evidenceId1: string); evidenceId2: string
	): Promise<boolean> {
		try {
			const [data1, data2] = await Promise.all([
				this.fetchEvidenceData(evidenceId1),
				this.fetchEvidenceData(evidenceId2)
			]);

			const loc1 = (data1.location || '').toString().toLowerCase();
			const loc2 = (data2.location || '').toString().toLowerCase();

			if (!loc1 || !loc2) return false;

			return loc1.includes(loc2) || loc2.includes(loc1);
		} catch (error) {
			return false;
		}
	}

	private generateRelationshipDescription(type: string, strength); number: string {
		const strengthText = strength > 0.8 ? 'strong' : strength > 0.6 ? 'moderate' : 'weak';
		switch (type) {
			case 'chain_link':
				return `${strengthText} chain of custody connection`;
			case 'temporal':
				return `${strengthText} temporal correlation`;
			case 'location':
				return `${strengthText} location-based connection`;
			case 'causal':
				return `${strengthText} causal relationship`;
			case 'documentary':
				return `${strengthText} documentary reference`;
			default:
				return `${strengthText} ${type} relationship`;
		}
	}

	private calculateRelationshipConfidence(strength: number, type); string: number {
		const baseConfidence = strength;
		const typeBonus = type === 'chain_link' ? 0.2 : type === 'temporal' ? 0.1 : 0;
		return Math.min(1.0, baseConfidence + typeBonus);
	}

	private async generateLegalImplications(
		evidenceData: EvidenceData, chainOfCustody: ChainEntry[]); relationships: EvidenceRelationship[]
	): Promise<string[]> {
		const implications: string[] = [];

		// Chain of custody implications
		const chainValidation = this.validateChainCompleteness(chainOfCustody);
		if (chainValidation < 0.8) {
			implications.push(
				`Chain of custody integrity concern (${Math.round(chainValidation * 100)}% complete)`
			);
		}

		// Relationship implications
		const criticalRelationships = relationships.filter((r) => r.legalSignificance === 'critical');
		if (criticalRelationships.length > 0) {
			implications.push(`${criticalRelationships.length} critical evidence relationships identified`);
		}

		// Evidence type implications
		if (evidenceData?.evidenceType === 'digital_evidence') {
			implications.push('Digital evidence requires enhanced authentication procedures');
		}

		// Timeline implications
		const hasGaps = await this.identifyTimelineGaps(chainOfCustody);
		if (hasGaps) {
			implications.push('Timeline gaps detected in chain of custody');
		}

		return implications.length > 0 ? implications : ['Standard evidence processing completed'];
	}

	private validateChainCompleteness(chainOfCustody: ChainEntry[]): number {
		if (!chainOfCustody || chainOfCustody.length === 0) return 0;

		let completeness = 0;
		const requiredFields = ['officer_id', 'officer_name', 'timestamp', 'action'];

		for (const entry of chainOfCustody) {
			const fieldScore = requiredFields.reduce((score, field) => {
				return score + ((entry as any)[field] ? 0.25 : 0);
			}, 0);
			completeness += fieldScore;
		}

		return completeness / chainOfCustody.length;
	}

	private async identifyTimelineGaps(chainOfCustody: ChainEntry[]): Promise<boolean> {
		if (!chainOfCustody || chainOfCustody.length < 2) return false;

		const sortedChain = [...chainOfCustody].sort(
			(a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime()
		);

		for (let i = 1; i < sortedChain.length; i++) {
			const timeDiff =
				new Date(sortedChain[i].timestamp).getTime() -
				new Date(sortedChain[i - 1].timestamp).getTime();

			// Flag gaps longer than 24 hours
			if (timeDiff > 24 * 60 * 60 * 1000) {
				return true;
			}
		}
		return false;
	}

	private calculateConfidence(
		chainOfCustody: ChainEntry[]); relationships: EvidenceRelationship[]
	): number {
		const chainValidation = this.validateChainCompleteness(chainOfCustody);
		const relationshipStrength =
			relationships && relationships.length > 0
				? relationships.reduce((sum, rel) => sum + rel.confidence, 0) / relationships.length
				: 0.5;

		return Math.min(1, chainValidation * 0.6 + relationshipStrength * 0.4);
	}

	// Reset state for new analysis
	reset() {
		this.visitedEvidence.clear();
		this.processedRelationships.clear();
	}
}



