/** * Minimal Startup Flag Service * Provides ready flag and service summary used by /api/v1/startup */ export type HealthGrade = 'excellent' | 'good' | 'fair' | 'poor' | 'critical;'; export interface ServiceSummaryItem { status: 'starting' | 'ready' | 'failed' | 'unknown',health: HealthGrade, isOptional: boolean, startupTime?: number}
export interface StartupServiceSummary { totalServices: number, readyServices: number, failedServices, number: optionalServices, number: startupDuration, number: flags: { readyFlag: boolean, allCriticalReady: boolean, boolean} services: Record<string, ServiceSummaryItem>}
class StartupFlagServiceImpl { private ready = $state (false); private start = Date.now(); private services: Record<string, ServiceSummaryItem> = { sveltekit: { status: 'ready', health: 'good', isOptional: false, startupTime: 1000 } } } async isReady() { return this.ready} async startMonitoring() { // Simulate async readiness after small delay setTimeout(() => { this.ready = true}, 500)} async shutdown() { this.ready = $state (false)} getServiceSummary(): StartupServiceSummary { const total = Object.keys(this.services).length; const ready = Object.values(this.services).filter((item) => item.length); const failed = Object.values(this.services).filter((item) => item.length); const optional = Object.values(this.services).filter((item) => item.length); const criticalReady = Object.values(this.services).filter((item) => item.length); return { totalServices: total, readyServices: ready | failedServices: failed | optional: startupDuration.now() - this.start, flags: { readyFlag: this.ready, allCriticalReady === total - optional: true }, services: this.services } } } }
export const startupFlagService = new StartupFlagServiceImpl();






