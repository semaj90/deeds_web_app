// Charge bundling service with HMM-inspired penalty classification and victim inference

import { type RequestEvent } from "@sveltejs/kit";

export interface BundledCharge {
	statuteCode: string;
	title: string;
	reason: string;
	confidence: number;
	frequency: number; // How often filed together (0-1)
}

export interface ChargeBundle {
	victimClass: string;
	penaltyLevel: string;
	suggestedBundles: BundledCharge[];
	confidence: number;
}

// Penalty classification patterns (HMM-inspired states)
const penaltyPatterns: Record<string, string[]> = {
	felony: [
		'murder',
		'rape',
		'robbery',
		'burglary',
		'kidnapping',
		'arson',
		'trafficking',
		'assault with weapon',
		'child abuse',
		'sexual assault'
	],
	wobbler: [
		'dui injury',
		'child endangerment',
		'assault',
		'battery',
		'theft',
		'fraud',
		'embezzlement',
		'stalking',
		'harassment'
	],
	misdemeanor: [
		'resisting arrest',
		'disorderly conduct',
		'trespassing',
		'vandalism',
		'drunk in public',
		'simple assault',
		'petty theft',
		'harassment'
	],
	infraction: ['traffic violation', 'parking', 'noise complaint', 'minor offense']
};

// Victim class inference patterns
const victimPatterns: Record<string, string[]> = {
	child: [
		'child',
		'minor',
		'juvenile',
		'infant',
		'baby',
		'endangerment',
		'abuse',
		'neglect',
		'molestation'
	],
	elder: ['elder', 'elderly', 'senior', 'aged', 'dependent adult', 'nursing home'],
	spouse: ['spouse', 'partner', 'domestic', 'intimate', 'family violence', 'dv'],
	disabled: ['disabled', 'disability', 'vulnerable', 'incapacitated', 'dependent']
};

// Charge bundling patterns (citation clusters + penalty patterns)
const bundlePatterns: Record<string, BundledCharge[]> = {
	'273a': [
		// Child Endangerment
		{
			statuteCode: '273ab',
			title: 'Corporal Injury to Child',
			reason: 'Enhancement - physical injury component',
			confidence: 0.95,
			frequency: 0.85
		},
		{
			statuteCode: '368',
			title: 'Abuse of Dependent Adult/Elder',
			reason: 'Common companion - similar victim protection',
			confidence: 0.7,
			frequency: 0.45
		},
		{
			statuteCode: '11165.7',
			title: 'Failure to Report Child Abuse',
			reason: 'Enhancement - mandatory reporting violation',
			confidence: 0.8,
			frequency: 0.6
		},
		{
			statuteCode: '148',
			title: 'Resisting Arrest',
			reason: 'Common companion - arrest resistance',
			confidence: 0.5,
			frequency: 0.3
		}
	],
	'211': [
		// Robbery
		{
			statuteCode: '245',
			title: 'Assault with Deadly Weapon',
			reason: 'Enhancement - weapon use',
			confidence: 0.9,
			frequency: 0.7
		},
		{
			statuteCode: '148',
			title: 'Resisting Arrest',
			reason: 'Common companion - arrest resistance',
			confidence: 0.7,
			frequency: 0.5
		},
		{
			statuteCode: '182',
			title: 'Conspiracy',
			reason: 'Enhancement - group crime',
			confidence: 0.6,
			frequency: 0.4
		},
		{
			statuteCode: '12022.5',
			title: 'Personal Use of Firearm',
			reason: 'Enhancement - weapon allegation',
			confidence: 0.8,
			frequency: 0.6
		}
	],
	'23153': [
		// DUI Causing Injury
		{
			statuteCode: '20001',
			title: 'Hit and Run - Injury',
			reason: 'Enhancement - failure to stop',
			confidence: 0.85,
			frequency: 0.65
		},
		{
			statuteCode: '148',
			title: 'Resisting Arrest',
			reason: 'Common companion - arrest resistance',
			confidence: 0.6,
			frequency: 0.35
		},
		{
			statuteCode: '192',
			title: 'Vehicular Manslaughter',
			reason: 'Enhancement - if death results',
			confidence: 0.4,
			frequency: 0.15
		},
		{
			statuteCode: '12022.7',
			title: 'Great Bodily Injury Enhancement',
			reason: 'Enhancement - serious injury',
			confidence: 0.75,
			frequency: 0.5
		}
	]
};

export function inferPenaltyLevel(query: string): string {
	const queryLower = query.toLowerCase();

	for (const [level, patterns] of Object.entries(penaltyPatterns)) {
		if (patterns.some((p) => queryLower.includes(p))) {
			return level;
		}
	}

	return 'misdemeanor'; // Default
}

export function inferVictimClass(query: string): string {
	const queryLower = query.toLowerCase();

	for (const [victimClass, patterns] of Object.entries(victimPatterns)) {
		if (patterns.some((p) => queryLower.includes(p))) {
			return victimClass;
		}
	}

	return 'general'; // Default
}

export function suggestBundles(statuteCode: string, query: string): BundledCharge[] {
	const bundles = bundlePatterns[statuteCode] || [];

	// Filter bundles based on query context
	const queryLower = query.toLowerCase();
	return bundles.filter((bundle) => {
		// Always include high-confidence bundles
		if (bundle.confidence >= 0.8) return true;

		// Include medium-confidence if query mentions related terms
		if (bundle.confidence >= 0.6) {
			return (
				queryLower.includes('weapon') ||
				queryLower.includes('injury') ||
				queryLower.includes('arrest') ||
				queryLower.includes('group')
			);
		}

		return false;
	});
}

export function classifyCharge(query: string, statuteCode: string): ChargeBundle {
	const penaltyLevel = inferPenaltyLevel(query);
	const victimClass = inferVictimClass(query);
	const suggestedBundles = suggestBundles(statuteCode, query);

	// Calculate overall confidence logic
    // simplified:
    let confidence = 0.7;
    if (suggestedBundles.length > 0) confidence += 0.1;
    if (victimClass !== 'general') confidence += 0.15;
    // cap at 0.95
    if (confidence > 0.95) confidence = 0.95;

	return {
		victimClass,
		penaltyLevel,
		suggestedBundles,
		confidence,
	};
}

export function getPenaltyColor(penaltyLevel: string): string {
	const colors: Record<string, string> = {
		felony: 'crimson',
		wobbler: 'orange',
		misdemeanor: 'yellow',
		infraction: 'blue',
	};
	return colors[penaltyLevel] ?? 'gray';
}

export function getVictimIcon(victimClass: string): string {
	const icons: Record<string, string> = {
		child: '👶',
		elder: '👴',
		spouse: '💑',
		disabled: '♿',
		general: '👤',
	};
	return icons[victimClass] ?? '👤';
}

