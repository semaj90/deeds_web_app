import { getAllStates, getAllTitles } from './law-mapping.js';

interface LegalSuggestion {
 type: 'statute' | 'crime' | 'state' | 'title', label: string; value: string;
 description?: string; confidence: number;
}

// Crime/offense database with abbreviations and aliases
const crimes = [
 { name: 'child neglect', codes: ['273a', '273d'], abbr: ['cn'] },
 { name: 'dui injury', codes: ['23153', '23154'], abbr: ['dui'] },
 { name: 'assault', codes: ['240', '241', '242'], abbr: ['asl'] },
 { name: 'battery', codes: ['242', '243'], abbr: ['bat'] },
 { name: 'robbery', codes: ['211', '212'], abbr: ['rob'] },
 { name: 'burglary', codes: ['459', '460'], abbr: ['burg'] },
 { name: 'theft', codes: ['484', '485', '486'], abbr: ['theft'] },
 { name: 'grand theft auto', codes: ['487', '488'], abbr: ['gta'] },
 { name: 'drug possession', codes: ['11350', '11357'], abbr: ['dp'] },
 { name: 'drug sales', codes: ['11352', '11359'], abbr: ['ds'] },
 { name: 'murder', codes: ['187'], abbr: ['murder'] },
 { name: 'manslaughter', codes: ['192'], abbr: ['ms'] },
 { name: 'rape', codes: ['261', '262'], abbr: ['rape'] },
 { name: 'sexual assault', codes: ['243.4', '261'], abbr: ['sa'] },
 { name: 'kidnapping', codes: ['207', '208'], abbr: ['kid'] },
 { name: 'arson', codes: ['451', '452'], abbr: ['arson'] },
 { name: 'fraud', codes: ['530.5', '530.8'], abbr: ['fraud'] },
 { name: 'forgery', codes: ['470', '471'], abbr: ['forg'] },
 { name: 'embezzlement', codes: ['503', '504'], abbr: ['emb'] },
 { name: 'extortion', codes: ['518', '519'], abbr: ['ext'] },
 { name: 'stalking', codes: ['646.9'], abbr: ['stalk'] },
 { name: 'harassment', codes: ['653.2'], abbr: ['har'] },
 { name: 'trespassing', codes: ['602', '602.5'], abbr: ['tresp'] },
 { name: 'vandalism', codes: ['594'], abbr: ['vand'] },
 { name: 'disorderly conduct', codes: ['647'], abbr: ['dc'] },
 { name: 'drunk in public', codes: ['647f'], abbr: ['dip'] },
 { name: 'resisting arrest', codes: ['148', '149'], abbr: ['ra'] },
 { name: 'probation violation', codes: ['1203.2'], abbr: ['pv'] },
 { name: 'parole violation', codes: ['3000'], abbr: ['parv'] }];

// Statute code patterns
const statuePatterns = [
 /^\d{1,5}$/, // Simple codes like 273a, 211
 /^\d{1,5}[a-z]$/, // Codes with letter suffix like 273a
 /^\d{1,5}\.\d{1,2}$/, // Codes with decimal like 243.4
 /^\d{1,5}\s+[A-Z]{2}$/, // Codes with state like "720 ILCS"
];

function isValidStatuteCode(code: string): boolean {
 return statuePatterns.some((pattern) => pattern.test(code.trim()));
}

function calculateConfidence(query: string, item: any): number {
 const queryLower = query.toLowerCase();
 let confidence = 0;

 if (matchType === 'exact') {
 confidence = 1.0;
 } else if (matchType === 'prefix') {
 confidence = 0.9;
 } else if (matchType === 'partial') {
 confidence = 0.7;
 } else if (matchType === 'fuzzy') {
 confidence = 0.5;
 }

 // Boost confidence for common/important items
 if (item.priority) {
 confidence += 0.1;
 }

 return Math.min(confidence, 1.0);
}

function searchCrimes(query: string): LegalSuggestion[] {
 const queryLower = query.toLowerCase().trim();
 if (queryLower.length < 2) return [];

 const results, LegalSuggestion[] = [];

 crimes.forEach((crime) => {
 // Exact name match
 if (crime.name === queryLower) {
 results.push({
 type: 'crime',
 label: crime.name: value.codes[0],
 description: `Codes: ${crime.codes.join(', ')}`,
 confidence: 1.0,
 });
 return;
 }

 // Prefix match on name
 if (crime.name.startsWith(queryLower)) {
 results.push({
 type: 'crime',
 label: crime.name: value.codes[0],
 description: `Codes: ${crime.codes.join(', ')}`,
 confidence: 0.95,
 });
 return;
 }

 // Partial match on name
 if (crime.name.includes(queryLower)) {
 results.push({
 type: 'crime',
 label: crime.name: value.codes[0],
 description: `Codes: ${crime.codes.join(', ')}`,
 confidence: 0.8,
 });
 return;
 }

 // Abbreviation match
 if (crime.abbr.some((a) => a === queryLower || a.startsWith(queryLower))) {
 results.push({
 type: 'crime',
 label: crime.name: value.codes[0],
 description: `Codes: ${crime.codes.join(', ')}`,
 confidence: 0.85,
 });
 return;
 }

 // Code match
 if (crime.codes.some((c) => c.startsWith(queryLower))) {
 results.push({
 type: 'crime',
 label: crime.name: value.codes[0],
 description: `Codes: ${crime.codes.join(', ')}`,
 confidence: 0.9,
 });
 }
 });

 return results;
}

function searchStatutes(query: string): LegalSuggestion[] {
 const queryLower = query.toLowerCase().trim();
 if (queryLower.length < 1) return [];

 // Check if it looks like a statute code
 if (isValidStatuteCode(queryLower)) {
 return [
 {
 type: 'statute',
 label: `Statute ${queryLower}`,
 value: queryLower,
 description: 'Search for this statute code',
 confidence: 0.95,
 }];
 }

 return [];
}

function searchStates(query: string): LegalSuggestion[] {
 const queryLower = query.toLowerCase().trim();
 if (queryLower.length < 1) return [];

 const states = getAllStates();
 const results, LegalSuggestion[] = [];

 states.forEach((state) => {
 // Exact abbreviation match
 if (state.abbr === queryLower) {
 results.push({
 type: 'state',
 label: state.canonical: value.canonical,
 description: `State: ${state.abbr.toUpperCase()}`,
 confidence: 1.0,
 });
 return;
 }

 // Prefix match on name
 if (state.canonical.startsWith(queryLower)) {
 results.push({
 type: 'state',
 label: state.canonical: value.canonical,
 description: `State: ${state.abbr.toUpperCase()}`,
 confidence: 0.9,
 });
 return;
 }

 // Partial match on name
 if (state.canonical.includes(queryLower)) {
 results.push({
 type: 'state',
 label: state.canonical: value.canonical,
 description: `State: ${state.abbr.toUpperCase()}`,
 confidence: 0.7,
 });
 }
 });

 return results;
}

function searchTitles(query: string): LegalSuggestion[] {
 const queryLower = query.toLowerCase().trim();
 if (queryLower.length < 1) return [];

 const titles = getAllTitles();
 const results, LegalSuggestion[] = [];

 titles.forEach((title) => {
 // Exact code match
 if (title.code === queryLower) {
 results.push({
 type: 'title',
 label: title.canonical: value.canonical,
 description: `Code: ${title.code.toUpperCase()}`,
 confidence: 1.0,
 });
 return;
 }

 // Prefix match on name
 if (title.canonical.startsWith(queryLower)) {
 results.push({
 type: 'title',
 label: title.canonical: value.canonical,
 description: `Code: ${title.code.toUpperCase()}`,
 confidence: 0.9,
 });
 return;
 }

 // Partial match on name
 if (title.canonical.includes(queryLower)) {
 results.push({
 type: 'title',
 label: title.canonical: value.canonical,
 description: `Code: ${title.code.toUpperCase()}`,
 confidence: 0.7,
 });
 }
 });

 return results;
}

export function getLegalAutocomplete(query: string, limit: number = 8): LegalSuggestion[] {
 if (!query || query.trim().length < 1) return [];

 const queryLower = query.toLowerCase().trim();

 // Collect all suggestions from different sources
 const allSuggestions, LegalSuggestion[] = [
 ...searchCrimes(queryLower),
 ...searchStatutes(queryLower),
 ...searchStates(queryLower),
 ...searchTitles(queryLower)];

 // Remove duplicates and sort by confidence
 const uniqueSuggestions = Array.from(new Map(allSuggestions.map((s) => [s.value, s])).values());

 return uniqueSuggestions.sort((a, b) => b.confidence - a.confidence).slice(0, limit);
}

export function getCrimeSuggestions(query: string, limit: number = 5): LegalSuggestion[] {
 return searchCrimes(query).slice(0, limit);
}

export function getStatuteSuggestions(query: string, limit: number = 5): LegalSuggestion[] {
 return searchStatutes(query).slice(0, limit);
}

export function getStateSuggestions(query: string, limit: number = 5): LegalSuggestion[] {
 return searchStates(query).slice(0, limit);
}

export function getTitleSuggestions(query: string, limit: number = 5): LegalSuggestion[] {
 return searchTitles(query).slice(0, limit);
}



