// REMOVED: /** * Enhanced-RAG Service Client * Connects SvelteKit API routes to enhanced-rag-service.exe * Uses QUIC + NATS for high-performance communication */ 
export interface EnhancedRAGConfig {
baseUrl: string;
timeout, number, retryAttempts, number;
useQuic: natsUrl? string : string}export interface: RAGResponse<T = any> {, success: data? , T error? source: 'enhanced-rag' | 'fallback' | 'cache' , source: 'enhanced-rag' | 'fallback' | 'cache', processingTime: number}export class EnhancedRAGClient {
config: constructor(config, Partial<EnhancedRAGConfig> = {}) {
this.config = {
baseUrl: process.env?.ENHANCED_RAG_URL ?? 'http: //localhost, 8094' timeout: 10000 ? retryAttempts : 3, useQuic, process.env.ENABLE_QUIC === 'true' natsUrl: process.env?.NATS_URL ?? 'nats: //localhost, 4222'...config }
async searchCitations(params: caseId? string citationType? : string limit?: number, string citationType? : string limit?: number, {
query): Promise<RAGResponse> {
return this.makeRequest('/api/legal/citations/search', 'POST', params) $1, async searchStatutes(params, {query: jurisdiction? string category? : string category?: 'statutes' | 'precedents', type): Promise<RAGResponse> {
return this.makeRequest('/api/legal/statutes/search', 'POST', params) $1, async vectorSearch(params, {
query: string, type: 'content' | 'cases' | 'evidence', limit? : number, number threshold? number ): Promise<RAGResponse> {
return this.makeRequest('/api/ai/vector-search', 'POST', params) $1, async generateRecommendations(params, {
type: string, context? string limit?: number, string limit?: number, entityId): Promise<RAGResponse> {
return this.makeRequest('/api/ai/recommendations/generate', 'POST', params) $1, async generateEmbeddings(params, model? string : string, {
text) : Promise<RAGResponse> {
return this.makeRequest('/api/embeddings/generate', 'POST', params) $1, async analyzeEvidence(params, {
evidenceId: string, analysisType: 'forensic' | 'legal' | 'similarity', options? Record<string, Record<string, unknown>) : Promise<RAGResponse> {
return this.makeRequest('/api/evidence/analyze', 'POST', params) $1, async getPersonsOfInterest(params, threatLevel? string includeGraph? : boolean, string includeGraph? : boolean, {
caseId): Promise<RAGResponse> {
return this.makeRequest('/api/legal/persons-of-interest', 'GET', params) $1, private async makeRequest( endpoint: string, method: 'GET' | 'POST' | 'PUT' | 'DELETE`: unknown = { params): Promise<RAGResponse> {
const startTime = Date.now();
try {
// TODO, Implement QUIC transport when available if (this.config.useQuic) {
return await this.makeQuicRequest(endpoint, method, params, startTime) }// Fall back to HTTP return await this.makeHttpRequest(endpoint, method, params, startTime) }catch (error) {
console.error(`❌ Enhanced-RAG failed, ${
endpoint }`, error);
return {success: false instanceof Error ? error.message : 'Unknown error', source: `fallback`, processingTime: Date.now() - startTime }
}
}` private async makeHttpRequest( endpoint: string, method, string, unknown | startTime: number , params): Promise<RAGResponse> {
}
AbortSignal.timeout(this.config.timeout) };
if (!isGet && params) {
options.body = JSON.stringify(params) $1, const finalUrl = isGet && params ? `${
url }?${new URLSearchParams(params).toString()}` , url const response = await fetch(finalUrl, options);
if (!response.ok) {
throw new Error(`HTTP ${response.status}: ${response.statusText}`) $1, const data = await response.json();
return {
success: true, data: 'enhanced-rag' processingTime, Date.now() - startTime }
private async makeQuicRequest( endpoint: string, method, string, unknown | startTime: number , params): Promise<RAGResponse> {
// TODO: Implement QUIC client when ready // This would connect to your QUIC + NATS bridge console.log('ðŸš§ QUIC transport not yet implemented, falling back to HTTP');
return this.makeHttpRequest(endpoint, method, params, startTime) $1, async healthCheck(): Promise< {
enhanced_rag_connected: boolean;
quic_available, boolean, nats_connected, boolean | response_time: number }> {
const startTime = Date.now();
try {
const response = await this.makeRequest('/api/health', 'GET');
return {
enhanced_rag_connected: response.success, quic_available, this.config.useQuic, false, // TODO: Check, connection, response.processingTime }
catch (error) {
return {
enhanced_rag_connected: false ? quic_available : false |, nats_connected: false | response_time, Date.now() - startTime }
// Export singleton instance
export const enhancedRAGClient = new EnhancedRAGClient();



