export interface LegalAuthority {
	id: string;
	title: string;
	level: 'constitutional' | 'statutory' | 'judicial' | 'administrative';
	jurisdiction: 'federal' | 'state';
	weight: number; // Hierarchy weight (e.g. Constitutional = 100, Statutory = 80)
}

export class CitationAuthorityService {
	private static AUTHORITY_WEIGHTS = {
		constitutional: 100,
		statutory: 80,
		judicial: 60,
		administrative: 40
	};

	/**
	 * Returns the authority weight for a citation type.
	 */
	static getWeight(level: LegalAuthority['level']): number {
		return this.AUTHORITY_WEIGHTS[level] || 0;
	}

	/**
	 * Maps a raw citation string to an authority level.
	 */
	static detectLevel(citation: string): LegalAuthority['level'] {
		const lower = citation.toLowerCase();
		if (lower.includes('u.s. const.') || lower.includes('constitution')) return 'constitutional';
		if (lower.includes('u.s.c.') || lower.includes('statute')) return 'statutory';
		if (lower.includes('u.s.') || lower.includes('s.ct.') || lower.includes('f.3d')) return 'judicial';
		if (lower.includes('c.f.r.')) return 'administrative';
		return 'statutory'; // Default
	}

	/**
	 * Reranks search results based on authority weight.
	 * This ensures that higher-level authorities (e.g. Constitution) rise above
	 * lower-level ones if they are equally relevant.
	 */
	static rerankByAuthority(results: any[]): any[] {
		return results.sort((a, b) => {
			const weightA = this.getWeight(this.detectLevel(a.payload.citation || ''));
			const weightB = this.getWeight(this.detectLevel(b.payload.citation || ''));
			
			// Combine vector score (0-1) with normalized authority weight (0-1)
			const scoreA = (a.score * 0.7) + ((weightA / 100) * 0.3);
			const scoreB = (b.score * 0.7) + ((weightB / 100) * 0.3);
			
			return scoreB - scoreA;
		});
	}
}
