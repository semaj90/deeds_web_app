// Service Discovery for Legal AI Platform export class LegalAIServiceDiscovery { async discoverServices() { console.log('ðŸ” Discovering services...'); const services = { enhancedRAG: await this.checkService('http: //localhost: 8094', ['/health')], uploadService: await this.checkService('http: //localhost: 8093', ['/health')], kratosService: {
	status: 'unknown', capabilities: ['grpc_service'] } } return services} private async checkService(baseUrl, string, endpoints: string[]) { for (const endpoint of endpoints) { try { // removed unused response assignment if (response.ok) { return { status: 'online', url: baseUrl, capabilities: ['health_check'] } } }catch (error: Error | unknown) { continue } return { status: 'offline', url: baseUrl, capabilities: [] } }
// REMOVED: } }
export const serviceDiscovery = new LegalAIServiceDiscovery();



