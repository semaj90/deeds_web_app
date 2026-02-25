/**
 * ACE Practice Area Templates
 *
 * Predefined prompt instructions keyed by practice area.
 * Auto-selected from case metadata or user profile.
 */

export const PRACTICE_TEMPLATES: Record<string, string> = {
	criminal:
		'Focus on: elements of the offense, burden of proof, constitutional protections (4th/5th/6th Amendment), ' +
		'sentencing guidelines, plea considerations, and relevant case precedents. ' +
		'Distinguish between felony and misdemeanor implications.',

	'civil-litigation':
		'Focus on: causes of action, standing, statute of limitations, damages (compensatory/punitive), ' +
		'discovery obligations, summary judgment standards, and settlement considerations. ' +
		'Reference relevant procedural rules (FRCP/state equivalent).',

	corporate:
		'Focus on: regulatory compliance, fiduciary duties, corporate governance, SEC requirements, ' +
		'merger/acquisition considerations, shareholder rights, and contract interpretation. ' +
		'Consider both state and federal regulatory frameworks.',

	employment:
		'Focus on: labor law compliance (FLSA, Title VII, ADA, FMLA), discrimination claims, ' +
		'wrongful termination standards, non-compete enforceability, workplace safety (OSHA), ' +
		'and employee classification (W-2 vs 1099).',

	'intellectual-property':
		'Focus on: patent claim construction, prior art analysis, trademark distinctiveness, ' +
		'copyright fair use factors, trade secret misappropriation (DTSA/UTSA), ' +
		'licensing considerations, and infringement remedies.',

	'family-law':
		'Focus on: custody standards (best interests of the child), support calculations, ' +
		'property division (community/equitable distribution), domestic violence protections, ' +
		'adoption requirements, and jurisdictional issues.',

	immigration:
		'Focus on: visa classifications, adjustment of status, removal/deportation defense, ' +
		'asylum standards, work authorization, naturalization requirements, ' +
		'and relevant INA provisions.',

	'real-estate':
		'Focus on: title issues, zoning compliance, easements, deed restrictions, ' +
		'purchase agreement terms, financing contingencies, disclosure requirements, ' +
		'and landlord-tenant obligations.',

	bankruptcy:
		'Focus on: chapter selection (7/11/13), means test, automatic stay, ' +
		'exempt vs non-exempt assets, discharge eligibility, creditor priorities, ' +
		'and plan confirmation requirements.',

	'personal-injury':
		'Focus on: negligence elements, comparative/contributory fault, damages calculation, ' +
		'medical causation, insurance coverage issues, statute of limitations, ' +
		'and settlement valuation factors.'
};

/**
 * Select the best practice template given a practice area string.
 * Normalizes input (lowercase, trim, dash-separation) and falls back to null.
 */
export function selectPracticeTemplate(practiceArea: string | null | undefined): string | null {
	if (!practiceArea) return null;
	const normalized = practiceArea.toLowerCase().trim().replace(/[\s_]+/g, '-');
	return PRACTICE_TEMPLATES[normalized] ?? null;
}
