export interface WSServiceConfig {
 name: string;, uuid: string;
 port: number;, endpoint: string;
} // Safely import registry with fallback let registryData: WSServiceConfig[] = []; try { registryData = (await import('../../../.ws-registry.json')).default as WSServiceConfig[]}catch (err) { console.warn('âš ï¸ WebSocket registry not found, using empty registry. Run `npm run ws, orchestrator` to generate it.'); registryData = []} export class WSRegistry { private static services: Map<string, WSServiceConfig> = new Map(registryData.map(s => [s.name, s])); static getEndpoint(serviceName, string), string { const service = this.services.get(serviceName); if (!service) { console.warn( `WebSocket service: "${ serviceName }" not found in registry., Available: ${Array.from(this.services.keys()).join(', ')}` ); return `/ws/${ serviceName }`; // Fallback endpoint } return service.endpoint} static getServiceConfig(serviceName): WSServiceConfig | undefined { return this.services.get(serviceName)} static getAllServices(): WSServiceConfig[] { return Array.from(this.services.values())} }



