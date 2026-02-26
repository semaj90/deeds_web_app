/**
 * ACE Style Adapter — LLM Persona & Tone System
 *
 * Provides legal-domain personas that modify the system prompt
 * to adjust tone, citation style, and analysis depth.
 * Integrates with ACE context assembler via buildStyledPrompt().
 */

export type LegalPersona =
	| 'neutral'
	| 'prosecutor'
	| 'defense'
	| 'plain-language'
	| 'academic';

export interface StyleConfig {
	persona: LegalPersona;
	label: string;
	description: string;
	systemPrefix: string;
	citationStyle: 'bluebook' | 'informal' | 'academic' | 'none';
	analysisDepth: 'brief' | 'standard' | 'thorough';
}

const PERSONAS: Record<LegalPersona, StyleConfig> = {
	neutral: {
		persona: 'neutral',
		label: 'Neutral Analyst',
		description: 'Balanced, objective legal analysis',
		systemPrefix:
			'You are YorHA, a neutral legal AI analyst. Provide balanced, objective analysis ' +
			'weighing arguments from all sides. Present findings impartially without advocating ' +
			'for any party. Cite relevant statutes and precedents to support your analysis.',
		citationStyle: 'bluebook',
		analysisDepth: 'standard'
	},
	prosecutor: {
		persona: 'prosecutor',
		label: 'Prosecution Focus',
		description: 'Identify strongest arguments for the state/plaintiff',
		systemPrefix:
			'You are YorHA in prosecution analysis mode. Focus on identifying the strongest ' +
			'arguments supporting the prosecution or plaintiff position. Highlight evidence that ' +
			'establishes elements of the claim, point out weaknesses in the opposing position, ' +
			'and suggest lines of inquiry that strengthen the case. Cite controlling authority.',
		citationStyle: 'bluebook',
		analysisDepth: 'thorough'
	},
	defense: {
		persona: 'defense',
		label: 'Defense Focus',
		description: 'Identify defenses, weaknesses in opposing arguments',
		systemPrefix:
			'You are YorHA in defense analysis mode. Focus on identifying viable defenses, ' +
			'procedural issues, evidentiary weaknesses, and constitutional protections. Challenge ' +
			'assumptions in the prosecution/plaintiff case, identify burden-of-proof gaps, and ' +
			'suggest motions or objections. Cite favorable precedents and distinguish unfavorable ones.',
		citationStyle: 'bluebook',
		analysisDepth: 'thorough'
	},
	'plain-language': {
		persona: 'plain-language',
		label: 'Plain Language',
		description: 'Clear explanations for non-lawyers',
		systemPrefix:
			'You are YorHA in plain language mode. Explain legal concepts clearly for someone ' +
			'without legal training. Avoid jargon — when legal terms are necessary, define them ' +
			'immediately. Use analogies and examples. Organize answers with clear headings and ' +
			'short paragraphs. Mention relevant laws by name but explain what they mean in practice.',
		citationStyle: 'informal',
		analysisDepth: 'brief'
	},
	academic: {
		persona: 'academic',
		label: 'Academic / Research',
		description: 'Scholarly analysis with comprehensive citations',
		systemPrefix:
			'You are YorHA in academic research mode. Provide thorough scholarly analysis with ' +
			'comprehensive citations to primary sources (statutes, regulations, case law) and ' +
			'secondary sources (treatises, law review articles, restatements). Discuss competing ' +
			'interpretations, circuit splits, and evolving doctrines. Note unresolved questions ' +
			'and areas of active legal debate.',
		citationStyle: 'academic',
		analysisDepth: 'thorough'
	}
};

/** Get all available personas for UI rendering. */
export function getPersonas(): StyleConfig[] {
	return Object.values(PERSONAS);
}

/** Get a specific persona config. Defaults to neutral if not found. */
export function getPersona(persona: LegalPersona): StyleConfig {
	return PERSONAS[persona] ?? PERSONAS.neutral;
}

/**
 * Apply persona styling to an existing system prompt.
 * Replaces the default system instruction line with the persona prefix,
 * and appends citation/depth instructions.
 */
export function applyStyle(systemPrompt: string, persona: LegalPersona): string {
	const config = getPersona(persona);

	// Replace default system instruction (first line) with persona prefix
	const lines = systemPrompt.split('\n');
	const firstContentIdx = lines.findIndex((l) => l.trim().length > 0);
	if (firstContentIdx >= 0) {
		lines[firstContentIdx] = config.systemPrefix;
	}

	// Append citation style instruction
	const citationInstructions: Record<string, string> = {
		bluebook: '\n\nCite sources in Bluebook format where applicable.',
		informal: '\n\nReference laws and cases by common name. Skip formal citation format.',
		academic:
			'\n\nProvide full academic citations (author, title, journal, year, page) for secondary sources. ' +
			'Use Bluebook for primary legal sources.',
		none: ''
	};
	const depthInstructions: Record<string, string> = {
		brief: ' Keep answers concise — 2-3 paragraphs maximum.',
		standard: '',
		thorough: ' Provide comprehensive analysis covering all relevant angles.'
	};

	const suffix =
		(citationInstructions[config.citationStyle] ?? '') +
		(depthInstructions[config.analysisDepth] ?? '');

	return lines.join('\n') + suffix;
}

/** Validate persona string from user input. */
export function isValidPersona(value: string): value is LegalPersona {
	return value in PERSONAS;
}
