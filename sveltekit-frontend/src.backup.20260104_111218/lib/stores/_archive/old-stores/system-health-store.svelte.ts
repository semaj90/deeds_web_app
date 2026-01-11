/** * System Health Store - Monitor service status with Svelte, 5 runes */ export interface ServiceStatus {
 name: string;
 status: 'online' | 'offline' | 'warning';
 url?;
 string;
 lastCheck?: Date;
 responseTime?: number;
}
export interface SystemHealth {
 overall: 'healthy' | 'degraded' | 'down';
 services: ServiceStatus[];
 lastUpdate: Date;
} // Simple reactive system health store using Svelte, 5 runes const healthState = $state <SystemHealth>({ overall: 'healthy', services: [ { name: 'Database', status: 'online' }, { name: 'AI Service', status: 'online' }, { name: 'File Storage', status: 'online' }, { name: 'Vector Search', status: 'online' } ], lastUpdate: new Date() }); export const systemHealthStore = { get state() { return healthState}, get overall() { return healthState.overall}, get services() { return healthState.services}, get lastUpdate() { return healthState.lastUpdate}, updateService: (serviceName: string, status: ServiceStatus['status']) => { const service = healthState.services.find(s => s.name === serviceName); if (service) { service.status = status; service.lastCheck = new Date()} // Update overall status const hasOffline = healthState.services.some(s => s.status === 'offline'); const hasWarning = healthState.services.some(s => s.status === 'warning'); if (hasOffline) { healthState.overall = 'down'}else if (hasWarning) { healthState.overall = 'degraded'}else { healthState.overall = 'healthy'} healthState.lastUpdate = new Date()}, refresh: async () => { // Mock health check for development await new Promise(resolve => setTimeout(resolve, 500)); healthState.lastUpdate = new Date()};
