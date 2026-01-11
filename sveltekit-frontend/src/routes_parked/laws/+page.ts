import type { PageLoad } from './$types.js';
import { error } from '@sveltejs/kit';

export interface QuickLink {
 id: string; title: string;
 description: string; jurisdiction: 'california' | 'federal';
 category: string; url: string;
 fullTextUrl: string; code: string;
}

export interface LawSearchResult {
 id: string; title: string;
 code: string; section: string;
 summary: string; url: string;
 score: number;
}

export const load: PageLoad = async ({ fetch, url, depends }) => {
 // Dependency tracking for cache invalidation
 depends('laws:quicklinks', 'laws:search');

 try {
 // Quick access links for major legal resources
 const quickLinks: QuickLink[] = [
 {
 id: 'ca-civil-code',
 title: 'California Civil Code',
 description:
 "California's comprehensive civil laws covering contracts, property, and personal rights",
 jurisdiction: 'california',
 category: 'civil',
 url: 'https://leginfo.legislature.ca.gov/faces/codes.xhtml?tocTitle=Civil+Code',
 fullTextUrl: 'https://leginfo.legislature.ca.gov/faces/codes.xhtml?tocTitle=Civil+Code',
 code: 'CIV',
 },
 {
 id: 'ca-penal-code',
 title: 'California Penal Code',
 description: "California's criminal laws, penalties, and criminal procedures",
 jurisdiction: 'california',
 category: 'criminal',
 url: 'https://leginfo.legislature.ca.gov/faces/codes.xhtml?tocTitle=Penal+Code',
 fullTextUrl: 'https://leginfo.legislature.ca.gov/faces/codes.xhtml?tocTitle=Penal+Code',
 code: 'PEN',
 },
 {
 id: 'ca-evidence-code',
 title: 'California Evidence Code',
 description: 'Rules governing the admissibility of evidence in California courts',
 jurisdiction: 'california',
 category: 'procedural',
 url: 'https://leginfo.legislature.ca.gov/faces/codes.xhtml?tocTitle=Evidence+Code',
 fullTextUrl: 'https://leginfo.legislature.ca.gov/faces/codes.xhtml?tocTitle=Evidence+Code',
 code: 'EVID',
 },
 {
 id: 'ca-corporations-code',
 title: 'California Corporations Code',
 description: 'Laws governing business entities, corporations, and commercial activities',
 jurisdiction: 'california',
 category: 'corporate',
 url: 'https://leginfo.legislature.ca.gov/faces/codes.xhtml?tocTitle=Corporations+Code',
 fullTextUrl:
 'https://leginfo.legislature.ca.gov/faces/codes.xhtml?tocTitle=Corporations+Code',
 code: 'CORP',
 },
 {
 id: 'federal-constitution',
 title: 'U.S. Constitution',
 description: 'The supreme law of the United States',
 jurisdiction: 'federal',
 category: 'constitutional',
 url: 'https://constitution.congress.gov/constitution/',
 fullTextUrl: 'https://constitution.congress.gov/constitution/',
 code: 'CONST',
 },
 {
 id: 'federal-criminal-code',
 title: 'Federal Criminal Code (Title 18)',
 description: 'Federal crimes and criminal procedure under U.S. law',
 jurisdiction: 'federal',
 category: 'criminal',
 url: 'https://uscode.house.gov/browse/prelim@title18&edition=prelim',
 fullTextUrl: 'https://uscode.house.gov/browse/prelim@title18&edition=prelim',
 code: '18USC',
 },
 {
 id: 'ca-family-code',
 title: 'California Family Code',
 description: 'Laws governing marriage, divorce, child custody, and family relationships',
 jurisdiction: 'california',
 category: 'family',
 url: 'https://leginfo.legislature.ca.gov/faces/codes.xhtml?tocTitle=Family+Code',
 fullTextUrl: 'https://leginfo.legislature.ca.gov/faces/codes.xhtml?tocTitle=Family+Code',
 code: 'FAM',
 },
 {
 id: 'ca-government-code',
 title: 'California Government Code',
 description: 'Laws governing state and local government operations and public records',
 jurisdiction: 'california',
 category: 'administrative',
 url: 'https://leginfo.legislature.ca.gov/faces/codes.xhtml?tocTitle=Government+Code',
 fullTextUrl:
 'https://leginfo.legislature.ca.gov/faces/codes.xhtml?tocTitle=Government+Code',
 code: 'GOV',
 },
 {
 id: 'ca-health-safety-code',
 title: 'California Health and Safety Code',
 description: 'Public health, safety regulations, and controlled substances laws',
 jurisdiction: 'california',
 category: 'regulatory',
 url: 'https://leginfo.legislature.ca.gov/faces/codes.xhtml?tocTitle=Health+and+Safety+Code',
 fullTextUrl:
 'https://leginfo.legislature.ca.gov/faces/codes.xhtml?tocTitle=Health+and+Safety+Code',
 code: 'HSC',
 }];

 const query = url.searchParams.get('q');
 let laws: LawSearchResult[] = [];

 if (query) {
 try {
 const response = await fetch(`/api/laws/search?q=${encodeURIComponent(query)}`);
 if (response.ok) {
 laws = await response.json();
 } else {
 console.error(
 `Failed to fetch law search results for query "${query}": ${response.statusText}`
 );
 // Non-fatal, page can still render with empty results
 }
 } catch (fetchError) {
 console.error(`Error fetching law search results for query "${query}":`, fetchError);
 // Also non-fatal
 }
 }

 return {
 quickLinks,
 laws,
 query,
 meta: { title: 'Legal Resources - Laws & Regulations',
 description: 'Browse California and state laws with AI-powered search and summaries',
 },
 };
 } catch (err: unknown) {
 console.error('Failed to load laws page data: ', err);
 throw error(500, 'Failed to load page data');
 }
};




