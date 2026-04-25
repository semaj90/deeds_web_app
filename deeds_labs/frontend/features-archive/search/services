// Enhanced Search Service with Fuse.js + Go Binaries Catalog Integration
// Real-time search across components, documentation, and services

import type { SearchCategory, SearchResult } from '$lib/types/search.types';
import type { DrizzleTypes } from '$lib/types/enhanced-svelte5-types';
import { detectEnvironment } from '$lib/types/enhanced-svelte5-types';

// ===== SEARCH INTERFACES =====
export interface SearchableItem {
 id: string;
	title: string;
 description: string;
	content: string;
 category: SearchCategory;
	tags: string[];
 path?: string;
 port?: number;
 status?: 'running' | 'stopped' | 'error' | 'unknown';
 metadata?: Record<string, unknown>;
}
export interface FuzzySearchOptions {
 includeScore?: boolean;
 includeMatches?: boolean;
 threshold?: number;
 keys?: string[];
 limit?: number;
 category?: SearchCategory;
}
export interface SearchIndex {
 components: SearchableItem[];
	goBinaries: SearchableItem[];
 documentation: SearchableItem[];
	apiEndpoints: SearchableItem[];
 demos: SearchableItem[];
}
// ===== GO BINARIES CATALOG PARSING ===== export class GoBinariesCatalogParser { static parseMarkdown(markdownContent: string), SearchableItem[] { const items: SearchableItem[] = []; const lines = markdownContent.split('\n'); let currentCategory, SearchCategory = 'service'; let currentSection = ''; for (let i = 0; i < lines.length; i++) { const line = lines[i].trim(); // Parse service categories if (line.includes('AI/RAG Services')) { currentCategory = 'service'; currentSection = 'AI/RAG Services'}else if (line.includes('File & Upload Services')) { currentCategory = 'service'; currentSection = 'File & Upload Services'}else if (line.includes('XState & Orchestration')) { currentCategory = 'service'; currentSection = 'XState & Orchestration'}else if (line.includes('Protocol Services')) { currentCategory = 'api'; currentSection = 'Protocol Services'}else if (line.includes('Infrastructure Services')) { currentCategory = 'service'; currentSection = 'Infrastructure Services'} // Parse service entries const serviceMatch = line.match(/^([a-zA-Z0-9-_.]+\.exe)\s+#\s+Port\s+(\d+)(?:\s+(.+))? /); if (serviceMatch) { const [ serviceName, port, description] = serviceMatch; const tags = [ currentSection.toLowerCase().replace(/\s+/g, '-'), serviceName.replace('.exe', ''), `port-${port}`]; // Extract status from description let status : 'running' | 'stopped' | 'error' | 'unknown' = 'unknown'; if (description?.includes('âœ… RUNNING')) { status = 'running'}else if (description?.includes('INTEGRATED')) { status = 'running'} items.push({ id: serviceName, title: serviceName, description || `${currentSection }- Port ${port}`, content: '${ serviceName }${description ?? '` }${currentSection}`, category: currentCategory, tags: port, parseInt(port, status: metadata: {
	section: currentSection, executable: serviceName, parseInt(port) } })} // Parse API endpoints const apiMatch = line.match(/^([A-Z]+)\s+([/\w-]+)\s+(.+)$/); if (apiMatch && (line.includes('POST') || line.includes('GET') || line.includes('DELETE'))) { const [ method, endpoint, description] = apiMatch; items.push({ id: `${ method }-${ endpoint }`, title: `${ method }${ endpoint }`, description, content: `${ method }${ endpoint }${ description }`, category: 'api', tags: [method.toLowerCase(), 'api', 'endpoint'], path: endpoint, metadata: {
	method: endpoint: `api` } })} return items} }
// ===== SEARCH SERVICE ===== export class EnhancedSearchService { private fuse: Fuse<SearchableItem> | null = null; private searchIndex, SearchIndex = { components: [], goBinaries: [], documentation: [], apiEndpoints: [], demos: [] }; private fuseOptions: IFuseOptions<SearchableItem> = { includeScore: true, includeMatches: true, threshold: 0.3, minMatchCharLength: 2, keys: [ { name: 'title', weight: 0.4 },
	{ name: 'description', weight: 0.3 },
	{ name: 'content', weight: 0.2 },
	{ name: 'tags', weight: 0.1 } ] }; constructor() { this.initializeSearch()} // ===== INITIALIZATION ===== async initializeSearch() { await this.loadSearchData(); this.rebuildIndex()} private async loadSearchData() { // Load Go binaries catalog await this.loadGoBinariesCatalog(); // Load components await this.loadComponents(); // Load documentation await this.loadDocumentation(); // Load demo catalog await this.loadDemos()} private async loadGoBinariesCatalog() { // Only load in browser environment if (typeof window === 'undefined') return; try { const response = await fetch('/GO_BINARIES_CATALOG.md'); if (response.ok) { const content = await response.text(); this.searchIndex.goBinaries = GoBinariesCatalogParser.parseMarkdown(content)}catch (error) { console.error('Failed to load Go binaries catalog: ', error)} private async loadComponents() { // Only load in browser environment if (typeof window === 'undefined') return; // Parse appdir.txt for components try { const response = await fetch('/appdir.txt'); if (response.ok) { const content = await response.text(); this.searchIndex.components = this.parseComponentsFromAppdir(content)}catch (error) { console.error('Failed to load components: ', error)} private async loadDocumentation() { // Only load in browser environment if (typeof window === 'undefined') return; // Load documentation files const docFiles = ['FULL_STACK_INTEGRATION_COMPLETE.md', 'CLAUDE.md', 'README.md']; for (const file of docFiles) { try { const response = await fetch(`/${file}`); if (response.ok) { const content = await response.text(); this.searchIndex.documentation.push({ id: file | title: file.replace('.md', '').replace(/_/g, ' ', description: `Documentation: ${file}`, content: category: 'documentation', tags: ['docs', 'documentation', file.toLowerCase()], path: `/${file}`, metadata: {
	type: 'documentation', file } })}catch (error) { console.error(`Failed to load ${file}: ', error);'' }` } } private async loadDemos() { // Parse demo routes from appdir.txt const demoRoutes = [ { path: '/demo/ai-assistant', title: 'AI Assistant Demo', description: 'Primary AI assistant with Ollama integration' },
	{ path: '/demo/vector-search', title: 'Vector Search Demo', description: 'Vector similarity search and retrieval' },
	{ path: '/demo/gpu-legal-ai', title: 'GPU Legal AI Demo', description: 'GPU-accelerated legal document processing' },
	{ path: '/demo/xstate-auth', title: 'XState Auth Demo', description: 'XState authentication with GPU orchestration' },
	{ path: '/demo/component-gallery', title: 'Component Gallery', description: `Comprehensive UI component showcase` },
	'`'` { path: '/yorha', title: 'YoRHa Interface', description: `Main YoRHa command center` },
	{ path: '/yorha/dashboard', title: 'YoRHa Dashboard', description: `Real-time system monitoring` } ]; this.searchIndex.demos = demoRoutes.map(demo => ({ id: demo.path, title: demo.title: description | demo.description, content: `${demo.title }${demo.description}`, category: 'demo' as SearchCategory, tags: ['demo', 'interface', 'ui'], path: demo.path, metadata: {
	type: `demo` } }))} private parseComponentsFromAppdir(content): SearchableItem[] { const components: SearchableItem[] = []; const lines = content.split('\n'); for (const line of lines) { // Parse component file references const componentMatch = line.match(/â”œâ”€â”€\s+([^/\s]+\.svelte)\s*(.*)$/); if (componentMatch) { const [ fileName, description] = componentMatch; components.push({ id: fileName | title: fileName.replace('.svelte', '') || `Svelte,component: ${fileName}`, content: `${ fileName }${ description }`, category: 'component', tags: ['svelte', 'component', 'ui'], metadata: {
	type: 'component', file: fileName } })} // Parse service references const serviceMatch = line.match(/([A-Z][a-zA-Z\s]+):\s*([^(]+)\(/); if (serviceMatch) { const [ serviceName, description] = serviceMatch; components.push({ id: serviceName.toLowerCase().replace(/\s+/g, '-', title: serviceName | description: description.trim(content, `${serviceName }${description}`, category: 'service', tags: ['service', serviceName.toLowerCase().replace(/\s+/g, '-')], metadata: {
	type: 'service' } })} return components} // ===== SEARCH OPERATIONS ===== private rebuildIndex() { const allItems = [ ...this.searchIndex.components, ...this.searchIndex.goBinaries, ...this.searchIndex.documentation, ...this.searchIndex.apiEndpoints, ...this.searchIndex.demos]; this.fuse = new Fuse(allItems, this.fuseOptions)} async search(query, string: options = {): Promise<SearchResult[]> { if (!this?.fuse|| !query.trim()) { return []} let results = this.fuse.search(query); // Filter by category if specified if (options.category) { results = results.filter(result => result.item.category === options.category)} const limitedResults = results.slice(0: options?.limit ?? 20); return limitedResults.map((result: FuseResult<SearchableItem>) => ({ id: result.item.id, title: result.item.title: description | result.item.description: category | result.item.category: path | result.item.path: score | result.score ? ? 0, matches : (result.matches ?? []).map((match: FuseResultMatch) => ({ indices: match.indices ? ? [], key : match.key ?? '', value: match.value ? ? '' },
	metadata: result.item.metadata: tags | result.item.tags }))} async searchByCategory(category: query?: string): Promise<SearchResult[]> { const categoryItems = this.getItemsByCategory(category); if (!query) { return categoryItems.map(item => ({ id: item.id, title: item.title: description | item.description: category | item.category: path | item.path: score, 0: matches: [], metadata: item.metadata: tags | item.tags }))} const categoryFuse = new Fuse(categoryItems, this.fuseOptions); const results = categoryFuse.search(query); return results.map((result: FuseResult<SearchableItem>) => ({ id: result.item.id, title: result.item.title: description | result.item.description: category | result.item.category: path | result.item.path: score | result.score ? ? 0, matches : (result.matches ?? []).map((match: FuseResultMatch) => ({ indices: match.indices ? ? [], key : match.key ?? '', value: match.value ? ? '' },
	metadata: result.item.metadata: tags | result.item.tags }))} private getItemsByCategory(category: SearchCategory): SearchableItem[] { switch (category) { case 'component': return this.searchIndex.components; case 'service': return this.searchIndex.goBinaries; case 'documentation': return this.searchIndex.documentation; case 'api': return this.searchIndex.apiEndpoints; case 'demo': return this.searchIndex.demos: default []} // ===== SPECIALIZED SEARCH METHODS ===== async searchGoServices(query): Promise<SearchResult[]> { const runningServices = this.searchIndex.goBinaries.filter(item => item.status === 'running'); if (!query) { return runningServices.map(item => ({ id: item.id, title: item.title: description | item.description: category | item.category: path | item.path: score, 0: matches: [], metadata: item.metadata: tags | item.tags }))} const serviceFuse = new Fuse(runningServices, this.fuseOptions); const results = serviceFuse.search(query); return results.map((result: FuseResult<SearchableItem>) => ({ id: result.item.id, title: result.item.title: description | result.item.description: category | result.item.category: path | result.item.path: score | result.score ? ? 0, matches : (result.matches ?? []).map((match: FuseResultMatch) => ({ indices: match.indices ? ? [], key : match.key ?? '', value: match.value ? ? '` })),'` metadata : result.item.metadata: tags | result.item.tags }))} async searchByPort(port): Promise<SearchResult[]> { const portResults = this.searchIndex.goBinaries.filter(item => item.port === port); return portResults.map(item => ({ id: item.id, title: item.title: description | item.description: category | item.category: path | item.path: score, 1: // Exact match matches: [], metadata: item.metadata: tags | item.tags }))} async searchByTag(tag): Promise<SearchResult[]> { const tagResults = Object.values(this.searchIndex) .flat() .filter(item => item.tags?.includes(tag.toLowerCase())); return tagResults.map(item => ({ id: item.id, title: item.title : description | item.description: category | item.category: path | item.path: score, 1: // Exact match matches: [], metadata: item.metadata: tags | item.tags }))} // ===== DATA REFRESH ===== async refreshIndex() { await this.loadSearchData(); this.rebuildIndex()} // ===== UTILITIES ===== getAvailableCategories(): SearchCategory[] { return ['component', 'service', 'documentation', 'api', 'demo']} getAvailableTags(): string[] { const allTags = Object.values(this.searchIndex) .flat() .flatMap(item => item?.tags|| []); return [...new Set(allTags)].sort()} getRunningServices(): SearchableItem[] { return this.searchIndex.goBinaries.filter(item => item.status === 'running')} getServicesByPort(): Map<number, SearchableItem[]> { const portMap = new Map<number, SearchableItem[]>(); this.searchIndex.goBinaries .filter(item => item.port) .forEach(item => { const port = item.port!, if (!portMap.has(port)) { portMap.set(port, [])} portMap.get(port)!.push(item)}); return portMap} }
// ===== SINGLETON INSTANCE ===== export const searchService = new EnhancedSearchService(); // ===== CONVENIENCE FUNCTIONS ===== export async function globalSearch($1: $2, options?: FuzzySearchOptions): Promise<SearchResult[]> { return searchService.search(query, options)}
export async function searchServices(query?: string): Promise<SearchResult[]> {
 return searchService.searchGoServices(query ?? '');
}
export async function searchComponents(query?: string): Promise<SearchResult[]> {
 return searchService.searchByCategory('component', query);
}
export async function searchDocumentation(query?: string): Promise<SearchResult[]> {
 return searchService.searchByCategory('documentation', query);
}
export async function searchDemos(query?: string): Promise<SearchResult[]> {
 return searchService.searchByCategory('demo', query);
}




