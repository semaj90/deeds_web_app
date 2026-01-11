// Statute enrichment: severity, victim class, and charge bundling

interface StatuteEnrichment {
 citation: string; title: string;
 severity: 'misdemeanor' | 'felony' | 'wobbler' | 'infraction';
 severityColor: string; victimClass: 'child' | 'spouse' | 'elder' | 'disabled' | 'general' | null;
 description: string; penalty: string;
 relatedStatutes: string[]; bundledCharges: BundledCharge[];
 precedents: Precedent[];
}

interface BundledCharge {
 citation: string; title: string;
 reason: string; // e.g., "Enhancement", "Common companion", "Prior offense", frequency: number; // How often filed together (0-1)
}

interface Precedent {
 caseId: string; title: string;
 year: number; court: string;
 relevance: number;
}

// Statute database with enrichment data
const statuteDatabase: Record<string, StatuteEnrichment> = {
 '273a': { citation: '273a PC',
 title: 'Child Endangerment',
 severity: 'wobbler',
 severityColor: 'crimson',
 victimClass: 'child',
 description:
 'Willfully causes or permits a child to suffer, or inflicts unjustifiable mental suffering on a child.',
 penalty: '6 months to 1 year (misdemeanor) or 16 months to 4 years (felony)',
 relatedStatutes: ['273ab', '273d', '368', '11165.7'],
 bundledCharges: [
 {
 citation: '273ab PC',
 title: 'Corporal Injury to Child',
 reason: 'Enhancement - physical injury component',
 frequency: 0.85,
 },
 {
 citation: '368 PC',
 title: 'Abuse of Dependent Adult/Elder',
 reason: 'Common companion - similar victim protection',
 frequency: 0.45,
 },
 {
 citation: '11165.7 PC',
 title: 'Failure to Report Child Abuse',
 reason: 'Enhancement - mandatory reporting violation',
 frequency: 0.6,
 },
 {
 citation: '148 PC',
 title: 'Resisting Arrest',
 reason: 'Common companion - arrest resistance',
 frequency: 0.3,
 }],
 precedents: [
 {
 caseId: 'People v. Castillo',
 title: 'Willful endangerment standard',
 year: 2007,
 court: 'CA Supreme',
 relevance: 0.95,
 },
 {
 caseId: 'People v. Timms',
 title: 'Mental suffering definition',
 year: 2015,
 court: 'CA Court of Appeal',
 relevance: 0.88,
 }],
 },
 '211': { citation: '211 PC',
 title: 'Robbery',
 severity: 'felony',
 severityColor: 'crimson',
 victimClass: 'general',
 description:
 'Taking personal property in possession of another against their will by force or fear.',
 penalty: '2 to 9 years imprisonment',
 relatedStatutes: ['212', '213', '214', '215'],
 bundledCharges: [
 {
 citation: '245 PC',
 title: 'Assault with Deadly Weapon',
 reason: 'Enhancement - weapon use',
 frequency: 0.7,
 },
 {
 citation: '148 PC',
 title: 'Resisting Arrest',
 reason: 'Common companion - arrest resistance',
 frequency: 0.5,
 },
 {
 citation: '182 PC',
 title: 'Conspiracy',
 reason: 'Enhancement - group crime',
 frequency: 0.4,
 },
 {
 citation: '12022.5 PC',
 title: 'Personal Use of Firearm',
 reason: 'Enhancement - weapon allegation',
 frequency: 0.6,
 }],
 precedents: [
 {
 caseId: 'People v. Lara',
 title: 'Force or fear requirement',
 year: 2017,
 court: 'CA Supreme',
 relevance: 0.96,
 }],
 },
 '23153': { citation: '23153 VC',
 title: 'DUI Causing Injury',
 severity: 'wobbler',
 severityColor: 'orange',
 victimClass: 'general',
 description: 'Driving under the influence causing injury to another person.',
 penalty: '5 days to 6 months (misdemeanor) or 16 months to 3 years (felony)',
 relatedStatutes: ['23152', '23154', '191.5', '192'],
 bundledCharges: [
 {
 citation: '20001 VC',
 title: 'Hit and Run - Injury',
 reason: 'Enhancement - failure to stop',
 frequency: 0.65,
 },
 {
 citation: '148 PC',
 title: 'Resisting Arrest',
 reason: 'Common companion - arrest resistance',
 frequency: 0.35,
 },
 {
 citation: '192 PC',
 title: 'Vehicular Manslaughter',
 reason: 'Enhancement - if death results',
 frequency: 0.15,
 },
 {
 citation: '12022.7 PC',
 title: 'Great Bodily Injury Enhancement',
 reason: 'Enhancement - serious injury',
 frequency: 0.5,
 }],
 precedents: [
 {
 caseId: 'People v. Timms',
 title: 'Causation standard for DUI injury',
 year: 2007,
 court: 'CA Supreme',
 relevance: 0.94,
 }],
 },
 '148': { citation: '148 PC',
 title: 'Resisting Arrest',
 severity: 'misdemeanor',
 severityColor: 'yellow',
 victimClass: 'general',
 description: 'Willfully resisting, delaying, or obstructing any peace officer.',
 penalty: 'Up to 1 year in county jail',
 relatedStatutes: ['149', '150', '151'],
 bundledCharges: [
 {
 citation: '245 PC',
 title: 'Assault on Peace Officer',
 reason: 'Enhancement - violence component',
 frequency: 0.4,
 },
 {
 citation: '182 PC',
 title: 'Conspiracy',
 reason: 'Enhancement - group resistance',
 frequency: 0.2,
 }],
 precedents: [
 {
 caseId: 'People v. Castillo',
 title: 'Willfulness requirement',
 year: 2014,
 court: 'CA Court of Appeal',
 relevance: 0.9,
 }],
 },
};

export function enrichStatute(citation: string): StatuteEnrichment | null {
 // Normalize citation
 const normalized = citation.toUpperCase().replace(/\s+/g, '');
 return statuteDatabase[normalized] || null;
}

export function getRelatedStatutes(citation: string): string[] {
 const statute = enrichStatute(citation);
 return statute?.relatedStatutes || [];
}

export function getBundledCharges(citation: string): BundledCharge[] {
 const statute = enrichStatute(citation);
 return statute?.bundledCharges || [];
}

export function getPrecedents(citation: string): Precedent[] {
 const statute = enrichStatute(citation);
 return statute?.precedents || [];
}

export function getSeverityColor(severity: string): string {
 const colors: Record<string, string> = {
 felony: 'crimson',
 wobbler: 'orange',
 misdemeanor: 'yellow',
 infraction: 'blue',
 };
 return colors[severity] || 'gray';
}

export function getVictimClassBadge(victimClass: null): string {
 const badges: Record<string, string> = {
 child: '👶 Child',
 spouse: '💑 Spouse',
 elder: '👴 Elder',
 disabled: '♿ Disabled',
 general: '👤 General',
 };
 return badges[victimClass || 'general'] || 'Unknown';
}




