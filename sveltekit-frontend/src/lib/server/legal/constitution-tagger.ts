/**
 * Constitution Auto-Tagger
 *
 * Stage F of the constitution pipeline: assigns topical and structural tags
 * to legal nodes based on keyword rules + heading patterns.
 *
 * Tags stored as tags_json JSONB on legal_nodes:
 * {
 *   "structural": ["article", "section"],
 *   "topical":    ["due_process", "equal_protection"],
 *   "jurisdiction": ["state", "tx"],
 *   "source_trust": ["official_state", "high"]
 * }
 */

export interface NodeTags {
	structural: string[];
	topical: string[];
	jurisdiction: string[];
	source_trust: string[];
}

// ─────────────────────────────────────────────────────────────────────────────
// Topical keyword rules
// Each rule: { tag, patterns } — patterns are tested against heading + first 200 chars of text
// ─────────────────────────────────────────────────────────────────────────────
const TOPICAL_RULES: Array<{ tag: string; patterns: RegExp[] }> = [
	{
		tag: 'bill_of_rights',
		patterns: [/bill of rights/i, /rights of person/i, /declaration of rights/i],
	},
	{
		tag: 'due_process',
		patterns: [/due process/i, /fair trial/i, /notice and hearing/i],
	},
	{
		tag: 'equal_protection',
		patterns: [/equal protection/i, /anti.?discrimination/i, /civil rights/i, /equal under the law/i],
	},
	{
		tag: 'privacy',
		patterns: [/right to privacy/i, /unreasonable search/i, /unreasonable seizure/i, /fourth amendment/i, /search and seizure/i],
	},
	{
		tag: 'free_speech',
		patterns: [/freedom of speech/i, /freedom of press/i, /freedom of expression/i, /first amendment/i],
	},
	{
		tag: 'religion',
		patterns: [/freedom of religion/i, /establishment of religion/i, /religious/i],
	},
	{
		tag: 'right_to_bear_arms',
		patterns: [/right to bear arms/i, /right to keep.*arms/i, /bear arms/i, /second amendment/i],
	},
	{
		tag: 'elections',
		patterns: [/elections?/i, /voting/i, /ballot/i, /suffrage/i, /electorate/i, /right to vote/i],
	},
	{
		tag: 'legislature',
		patterns: [/legislative/i, /general assembly/i, /state senate/i, /house of representatives/i, /legislature/i],
	},
	{
		tag: 'executive',
		patterns: [/executive/i, /governor/i, /lieutenant governor/i, /executive branch/i],
	},
	{
		tag: 'judiciary',
		patterns: [/judicial/i, /courts?/i, /supreme court/i, /judiciary/i, /judges?/i, /jurisdiction/i],
	},
	{
		tag: 'taxation',
		patterns: [/taxation/i, /tax/i, /revenue/i, /appropriations?/i, /fiscal/i],
	},
	{
		tag: 'education',
		patterns: [/education/i, /school/i, /university/i, /public instruction/i, /common school/i],
	},
	{
		tag: 'local_government',
		patterns: [/municipalities/i, /local government/i, /county/i, /city/i, /township/i, /home rule/i],
	},
	{
		tag: 'criminal_procedure',
		patterns: [/criminal/i, /arrest/i, /bail/i, /habeas corpus/i, /double jeopardy/i, /self.incrimination/i, /cruel.*punishment/i],
	},
	{
		tag: 'property_rights',
		patterns: [/eminent domain/i, /taking of property/i, /property rights/i, /just compensation/i],
	},
	{
		tag: 'amendment_process',
		patterns: [/amendment/i, /constitutional convention/i, /revision/i],
	},
	{
		tag: 'separation_of_powers',
		patterns: [/separation of powers/i, /checks and balances/i, /three branches/i],
	},
	{
		tag: 'preamble',
		patterns: [/^preamble/i, /we.*people/i],
	},
	{
		tag: 'supremacy_clause',
		patterns: [/supremacy/i, /supreme law of the land/i],
	},
	{
		tag: 'commerce_clause',
		patterns: [/commerce clause/i, /regulate commerce/i, /interstate commerce/i],
	},
	{
		tag: 'necessary_and_proper',
		patterns: [/necessary and proper/i, /elastic clause/i],
	},
	{
		tag: 'impeachment',
		patterns: [/impeach/i, /high crimes/i, /misdemeanors/i],
	},
	{
		tag: 'federalism',
		patterns: [/reserved to the states/i, /tenth amendment/i, /federal.*power/i],
	},
];

/**
 * Compute tags for a single legal node.
 *
 * @param heading - Node heading text (e.g. "Article I - Bill of Rights")
 * @param text    - Node body text (first 500 chars sufficient)
 * @param nodeType - Node type string from DB
 * @param stateCode - 2-letter state code
 * @param sourceConfidence - 'high' | 'medium' | 'low'
 * @param isOfficial - whether sourced from official state endpoint
 */
export function tagNode(
	heading: string,
	text: string,
	nodeType: string,
	stateCode: string,
	sourceConfidence: string,
	isOfficial: boolean
): NodeTags {
	const probe = `${heading} ${text.slice(0, 500)}`.toLowerCase();

	// Structural
	const structural: string[] = [nodeType];
	if (/preamble/i.test(heading)) structural.push('preamble');

	// Topical
	const topical: string[] = [];
	for (const rule of TOPICAL_RULES) {
		if (rule.patterns.some((p) => p.test(probe))) {
			topical.push(rule.tag);
		}
	}

	// Jurisdiction
	const isFederal = stateCode === 'us';
	const jurisdiction: string[] = [isFederal ? 'federal' : 'state', stateCode];

	// Source trust
	const source_trust: string[] = [
		isOfficial ? (isFederal ? 'official_federal' : 'official_state') : 'scraped',
		sourceConfidence,
	];

	return { structural, topical, jurisdiction, source_trust };
}

/**
 * Rank score (0.0–1.0) for a node based on context signals.
 * Used for seeding a default rank_score on the node for retrieval boosting.
 *
 * Higher scores: official source, shallow hierarchy, preamble/article level.
 */
export function computeRankScore(
	depth: number,
	nodeType: string,
	isOfficial: boolean,
	sourceConfidence: string
): number {
	let score = 0.5;

	// Shallow nodes give better overview context
	if (depth === 1) score += 0.2;
	else if (depth === 2) score += 0.1;

	// Official source boost
	if (isOfficial) score += 0.15;
	if (sourceConfidence === 'high') score += 0.1;
	else if (sourceConfidence === 'low') score -= 0.1;

	// Node type boost
	if (nodeType === 'preamble') score += 0.05;
	if (nodeType === 'article') score += 0.05;
	if (nodeType === 'amendment') score += 0.05;

	return Math.max(0, Math.min(1, score));
}
